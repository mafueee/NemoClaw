// NemoClaw — Gateway Lifecycle via Docker Engine API
//
// Communicates with the Docker daemon over the Unix socket to start, stop,
// and inspect the OpenShell gateway container. This replaces CLI-based
// gateway management with a direct API approach.

import { createConnection } from 'net';
import * as gatewayHealth from '../lib/gatewayHealth.js';

const DOCKER_SOCKET = process.env.DOCKER_HOST || '/var/run/docker.sock';
const GATEWAY_CONTAINER_FILTER = process.env.GATEWAY_CONTAINER_NAME || 'openshell';

// ── Docker Engine HTTP-over-Unix-socket ────────────────────────

/**
 * Send a raw HTTP request to the Docker Engine socket.
 * Returns { statusCode, headers, body }.
 */
function dockerRequest(method, path, body = null, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const socket = createConnection(DOCKER_SOCKET);
        let responseData = '';
        let resolved = false;

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                socket.destroy();
                reject(new Error('Docker API request timed out'));
            }
        }, timeoutMs);

        socket.on('connect', () => {
            const headers = [
                `${method} ${path} HTTP/1.1`,
                'Host: localhost',
                'Accept: application/json',
                'Connection: close',
            ];

            if (body) {
                const payload = typeof body === 'string' ? body : JSON.stringify(body);
                headers.push('Content-Type: application/json');
                headers.push(`Content-Length: ${Buffer.byteLength(payload)}`);
                headers.push('');
                headers.push(payload);
            } else {
                headers.push('');
                headers.push('');
            }

            socket.write(headers.join('\r\n'));
        });

        socket.on('data', (chunk) => {
            responseData += chunk.toString();
        });

        socket.on('end', () => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);

            // Parse HTTP response
            const headerEnd = responseData.indexOf('\r\n\r\n');
            if (headerEnd === -1) {
                return reject(new Error('Invalid Docker API response'));
            }

            const headerPart = responseData.slice(0, headerEnd);
            let bodyPart = responseData.slice(headerEnd + 4);

            // Handle chunked transfer encoding
            if (headerPart.toLowerCase().includes('transfer-encoding: chunked')) {
                bodyPart = decodeChunked(bodyPart);
            }

            const statusLine = headerPart.split('\r\n')[0];
            const statusCode = parseInt(statusLine.split(' ')[1], 10);

            let parsed = bodyPart;
            try {
                parsed = JSON.parse(bodyPart);
            } catch { /* keep as string */ }

            resolve({ statusCode, body: parsed });
        });

        socket.on('error', (err) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);
            reject(new Error(`Docker socket error: ${err.message}`));
        });
    });
}

/** Decode HTTP chunked transfer encoding. */
function decodeChunked(raw) {
    let result = '';
    let remaining = raw;
    while (remaining.length > 0) {
        const lineEnd = remaining.indexOf('\r\n');
        if (lineEnd === -1) break;
        const size = parseInt(remaining.slice(0, lineEnd), 16);
        if (isNaN(size) || size === 0) break;
        result += remaining.slice(lineEnd + 2, lineEnd + 2 + size);
        remaining = remaining.slice(lineEnd + 2 + size + 2);
    }
    return result;
}

// ── Container Discovery ────────────────────────────────────────

/**
 * Find the gateway container by name filter.
 * Returns container info or null.
 */
export async function findGatewayContainer() {
    try {
        const filters = JSON.stringify({ name: [GATEWAY_CONTAINER_FILTER] });
        const resp = await dockerRequest(
            'GET',
            `/v1.47/containers/json?all=true&filters=${encodeURIComponent(filters)}`
        );

        if (resp.statusCode !== 200 || !Array.isArray(resp.body)) {
            return null;
        }

        // Find the best match — prefer exact name match
        const containers = resp.body;
        if (containers.length === 0) return null;

        const exact = containers.find(c =>
            (c.Names || []).some(n => n === `/${GATEWAY_CONTAINER_FILTER}` || n === GATEWAY_CONTAINER_FILTER)
        );

        return exact || containers[0];
    } catch {
        return null;
    }
}

// ── Lifecycle Operations ───────────────────────────────────────

/**
 * Start the gateway container.
 * Returns { ok, message, containerId }.
 */
export async function startGateway() {
    const container = await findGatewayContainer();
    if (!container) {
        return {
            ok: false,
            healthy: false,
            message: `No gateway container matching '${GATEWAY_CONTAINER_FILTER}' found. Ensure the OpenShell gateway is installed.`,
        };
    }

    const state = (container.State || '').toLowerCase();
    if (state === 'running') {
        // Already running — verify health
        const health = await gatewayHealth.checkHealth();
        return {
            ok: true,
            healthy: health.healthy,
            message: 'Gateway container is already running',
            containerId: container.Id,
        };
    }

    // Start the container
    try {
        const resp = await dockerRequest('POST', `/v1.47/containers/${container.Id}/start`, null, 30000);
        if (resp.statusCode === 204 || resp.statusCode === 304) {
            // Wait a moment for the service to initialize
            await new Promise(r => setTimeout(r, 2000));
            const health = await gatewayHealth.checkHealth();
            return {
                ok: true,
                healthy: health.healthy,
                message: 'Gateway started successfully',
                containerId: container.Id,
            };
        }
        return {
            ok: false,
            healthy: false,
            message: `Failed to start gateway: HTTP ${resp.statusCode}`,
            containerId: container.Id,
        };
    } catch (err) {
        return {
            ok: false,
            healthy: false,
            message: `Start failed: ${err.message}`,
        };
    }
}

/**
 * Stop the gateway container.
 * Returns { ok, message, containerId }.
 */
export async function stopGateway() {
    const container = await findGatewayContainer();
    if (!container) {
        return {
            ok: false,
            message: `No gateway container matching '${GATEWAY_CONTAINER_FILTER}' found.`,
        };
    }

    const state = (container.State || '').toLowerCase();
    if (state !== 'running') {
        return {
            ok: true,
            message: 'Gateway container is already stopped',
            containerId: container.Id,
        };
    }

    try {
        const resp = await dockerRequest('POST', `/v1.47/containers/${container.Id}/stop?t=10`, null, 30000);
        if (resp.statusCode === 204 || resp.statusCode === 304) {
            return {
                ok: true,
                message: 'Gateway stopped successfully',
                containerId: container.Id,
            };
        }
        return {
            ok: false,
            message: `Failed to stop gateway: HTTP ${resp.statusCode}`,
            containerId: container.Id,
        };
    } catch (err) {
        return {
            ok: false,
            message: `Stop failed: ${err.message}`,
        };
    }
}

/**
 * Get comprehensive gateway status combining Docker state + gRPC health.
 * Returns { running, healthy, containerId, containerState, version, method, endpoint }.
 */
export async function getGatewayStatus() {
    const container = await findGatewayContainer();
    const containerState = container ? (container.State || 'unknown') : 'not-found';
    const running = containerState.toLowerCase() === 'running';

    let health = { healthy: false, version: '', method: '', endpoint: '' };
    if (running) {
        try {
            health = await gatewayHealth.checkHealth();
        } catch { /* container running but health check failed */ }
    }

    return {
        running,
        healthy: health.healthy,
        containerId: container?.Id || '',
        containerState,
        containerName: container?.Names?.[0]?.replace(/^\//, '') || '',
        image: container?.Image || '',
        version: health.version || '',
        method: health.method || '',
        endpoint: health.endpoint || '',
    };
}
