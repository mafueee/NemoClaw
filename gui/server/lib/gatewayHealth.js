// NemoClaw — Gateway Health Monitor
//
// Checks gateway health via HTTP endpoint and gRPC Health RPC,
// replacing the fragile `execSync('openshell status') + string matching` approach.
//
// The gateway exposes:
//   GET /readyz  → { status: "healthy", version: "<version>" }
//   GET /healthz → 200 (liveness)
//
// This module also discovers the gateway HTTP endpoint from
// ~/.config/openshell/ metadata files.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as grpcClient from './grpcClient.js';

const OPENSHELL_CONFIG_DIR = join(homedir(), '.config', 'openshell');

/**
 * Resolve the HTTP endpoint for gateway health checks.
 *
 * The gateway's gRPC and HTTP services live on the same port.
 * We read the endpoint from cluster metadata and construct the health URL.
 *
 * Returns the base URL (e.g., "https://127.0.0.1:30051") or null.
 */
export function resolveGatewayHttpEndpoint() {
    const activeFile = join(OPENSHELL_CONFIG_DIR, 'active_gateway');
    let clusterName;
    try {
        clusterName = readFileSync(activeFile, 'utf-8').trim();
    } catch {
        return null;
    }
    if (!clusterName) return null;

    const metaPath = join(OPENSHELL_CONFIG_DIR, 'gateways', clusterName, 'metadata.json');
    try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
        return meta.gateway_endpoint || null;
    } catch {
        return null;
    }
}

/**
 * Check gateway health via HTTP /readyz endpoint.
 *
 * Returns:
 *   { healthy: true,  version, endpoint }
 *   { healthy: false, error, endpoint? }
 */
export async function checkHealthHttp() {
    const endpoint = resolveGatewayHttpEndpoint();
    if (!endpoint) {
        return { healthy: false, error: 'No gateway endpoint configured' };
    }

    const url = `${endpoint}/readyz`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const resp = await fetch(url, {
            signal: controller.signal,
            // For self-signed certs used by OpenShell's internal PKI,
            // Node.js needs the CA or TLS verification disabled.
            // In production usage the mTLS CA should be configured;
            // for now we use the NODE_TLS_REJECT_UNAUTHORIZED escape hatch
            // which the user may have already set for the CLI to work.
        });
        clearTimeout(timeout);

        if (resp.ok) {
            const data = await resp.json();
            return {
                healthy: true,
                version: data.version || '',
                status: data.status || 'healthy',
                endpoint,
            };
        }
        return {
            healthy: false,
            error: `HTTP ${resp.status}`,
            endpoint,
        };
    } catch (err) {
        clearTimeout(timeout);
        return {
            healthy: false,
            error: err.name === 'AbortError' ? 'Timeout' : (err.message || 'Connection failed'),
            endpoint,
        };
    }
}

/**
 * Check gateway health via gRPC Health RPC.
 *
 * Returns:
 *   { healthy: true,  version, endpoint, clusterName }
 *   { healthy: false, error, endpoint?, clusterName? }
 */
export async function checkHealthGrpc() {
    try {
        const conn = await grpcClient.checkConnection();
        return {
            healthy: conn.connected,
            version: conn.version || '',
            endpoint: conn.endpoint || '',
            clusterName: conn.clusterName || '',
            error: conn.error || undefined,
        };
    } catch (err) {
        return {
            healthy: false,
            error: err.message || 'gRPC health check failed',
        };
    }
}

/**
 * Combined health check: tries gRPC first (more authoritative), falls back to HTTP.
 */
export async function checkHealth() {
    // Try gRPC first — it validates the full mTLS path
    const grpcResult = await checkHealthGrpc();
    if (grpcResult.healthy) {
        return { ...grpcResult, method: 'grpc' };
    }

    // Fall back to HTTP /readyz (works even without mTLS configured)
    const httpResult = await checkHealthHttp();
    return { ...httpResult, method: 'http', grpcError: grpcResult.error };
}

/**
 * Check if the gateway configuration exists at all.
 * Useful for determining if the user has completed initial setup.
 */
export function isGatewayConfigured() {
    const activeFile = join(OPENSHELL_CONFIG_DIR, 'active_gateway');
    if (!existsSync(activeFile)) return false;
    try {
        const name = readFileSync(activeFile, 'utf-8').trim();
        if (!name) return false;
        const metaPath = join(OPENSHELL_CONFIG_DIR, 'gateways', name, 'metadata.json');
        return existsSync(metaPath);
    } catch {
        return false;
    }
}
