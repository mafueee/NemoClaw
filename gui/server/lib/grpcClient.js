// NemoClaw — OpenShell Gateway gRPC Client
//
// Provides typed access to the OpenShell gateway's gRPC API, replacing
// CLI-scraping (execSync + ANSI parsing) with native protobuf calls.
//
// The gateway exposes two gRPC services on a single multiplexed port:
//   - openshell.v1.OpenShell   — sandbox, provider, policy, watch, logs
//   - openshell.inference.v1.Inference — cluster inference config + bundles
//
// Connection uses the same mTLS credentials that the CLI stores in
// ~/.config/openshell/clusters/<name>/mtls/.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

// ── Proto Loading ───────────────────────────────────────────────

const PROTO_DIR = new URL('../proto/', import.meta.url).pathname;

const packageDefinition = protoLoader.loadSync(
    [
        join(PROTO_DIR, 'openshell.proto'),
        join(PROTO_DIR, 'inference.proto'),
    ],
    {
        keepCase: false,        // camelCase field names
        longs: String,          // int64 as string (safe for JS)
        enums: String,          // enum values as string names
        defaults: true,         // include default-valued fields
        oneofs: true,           // include virtual oneof fields
        includeDirs: [PROTO_DIR],
    }
);

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const OpenShellService = protoDescriptor.openshell.v1.OpenShell;
const InferenceService = protoDescriptor.openshell.inference.v1.Inference;

// ── mTLS Credential Resolution ─────────────────────────────────

const OPENSHELL_CONFIG_DIR = join(homedir(), '.config', 'openshell');
const ACTIVE_CLUSTER_FILE = join(OPENSHELL_CONFIG_DIR, 'active_cluster');

function resolveActiveCluster() {
    if (process.env.OPENSHELL_GATEWAY) {
        return process.env.OPENSHELL_GATEWAY;
    }
    try {
        return readFileSync(ACTIVE_CLUSTER_FILE, 'utf-8').trim();
    } catch {
        return null;
    }
}

function loadClusterMetadata(clusterName) {
    const metaPath = join(OPENSHELL_CONFIG_DIR, `${clusterName}_metadata.json`);
    try {
        return JSON.parse(readFileSync(metaPath, 'utf-8'));
    } catch {
        return null;
    }
}

function loadMtlsCerts(clusterName) {
    const mtlsDir = join(OPENSHELL_CONFIG_DIR, 'clusters', clusterName, 'mtls');
    const caPath = join(mtlsDir, 'ca.crt');
    const certPath = join(mtlsDir, 'tls.crt');
    const keyPath = join(mtlsDir, 'tls.key');

    if (!existsSync(caPath) || !existsSync(certPath) || !existsSync(keyPath)) {
        return null;
    }

    return {
        rootCert: readFileSync(caPath),
        clientCert: readFileSync(certPath),
        clientKey: readFileSync(keyPath),
    };
}

// ── gRPC Channel Management ────────────────────────────────────

let _openShellClient = null;
let _inferenceClient = null;
let _gatewayEndpoint = null;
let _clusterName = null;

export function getGrpcClients() {
    if (_openShellClient && _inferenceClient) {
        return {
            openShell: _openShellClient,
            inference: _inferenceClient,
            endpoint: _gatewayEndpoint,
            clusterName: _clusterName,
        };
    }

    const clusterName = resolveActiveCluster();
    if (!clusterName) return null;

    const meta = loadClusterMetadata(clusterName);
    if (!meta || !meta.gateway_endpoint) return null;

    let endpoint = meta.gateway_endpoint;
    const isTls = !endpoint.startsWith('http://');
    endpoint = endpoint.replace(/^https?:\/\//, '');

    let credentials;
    if (isTls) {
        const certs = loadMtlsCerts(clusterName);
        if (certs) {
            credentials = grpc.credentials.createSsl(
                certs.rootCert, certs.clientKey, certs.clientCert
            );
        } else {
            credentials = grpc.credentials.createSsl();
        }
    } else {
        credentials = grpc.credentials.createInsecure();
    }

    const options = {
        'grpc.keepalive_time_ms': 30000,
        'grpc.keepalive_timeout_ms': 10000,
        'grpc.keepalive_permit_without_calls': 1,
        'grpc.max_receive_message_length': 16 * 1024 * 1024,
    };

    _openShellClient = new OpenShellService(endpoint, credentials, options);
    _inferenceClient = new InferenceService(endpoint, credentials, options);
    _gatewayEndpoint = endpoint;
    _clusterName = clusterName;

    return {
        openShell: _openShellClient,
        inference: _inferenceClient,
        endpoint: _gatewayEndpoint,
        clusterName: _clusterName,
    };
}

export function resetGrpcClients() {
    if (_openShellClient) { _openShellClient.close(); _openShellClient = null; }
    if (_inferenceClient) { _inferenceClient.close(); _inferenceClient = null; }
    _gatewayEndpoint = null;
    _clusterName = null;
}

// ── Promise Wrappers ────────────────────────────────────────────

function unary(client, method, request = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const deadline = new Date(Date.now() + timeoutMs);
        client[method](request, { deadline }, (err, response) => {
            if (err) reject(err); else resolve(response);
        });
    });
}

// ── OpenShell Service Methods ───────────────────────────────────

export async function health() {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'health', {});
}

export async function listSandboxes(limit = 100, offset = 0) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'listSandboxes', { limit, offset });
}

export async function getSandbox(name) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'getSandbox', { name });
}

export async function deleteSandbox(name) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'deleteSandbox', { name }, 30000);
}

export async function createSandbox(spec, name = '') {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'createSandbox', { spec, name }, 60000);
}

export function watchSandbox(sandboxId, options = {}) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return clients.openShell.watchSandbox({
        id: sandboxId,
        followStatus: options.followStatus ?? true,
        followLogs: options.followLogs ?? false,
        followEvents: options.followEvents ?? false,
        logTailLines: options.logTailLines ?? 0,
        eventTail: options.eventTail ?? 0,
        stopOnTerminal: options.stopOnTerminal ?? false,
        logSinceMs: options.logSinceMs ?? '0',
        logSources: options.logSources ?? [],
        logMinLevel: options.logMinLevel ?? '',
    });
}

export function execSandbox(sandboxId, command, options = {}) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return clients.openShell.execSandbox({
        sandboxId,
        command: Array.isArray(command) ? command : [command],
        workdir: options.workdir ?? '',
        environment: options.environment ?? {},
        timeoutSeconds: options.timeoutSeconds ?? 0,
        stdin: options.stdin ?? Buffer.alloc(0),
    });
}

export async function getSandboxLogs(sandboxId, options = {}) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'getSandboxLogs', {
        sandboxId, lines: options.lines ?? 200,
        sinceMs: options.sinceMs ?? '0', sources: options.sources ?? [],
        minLevel: options.minLevel ?? '',
    });
}

// ── Provider Methods ────────────────────────────────────────────

export async function listProviders(limit = 100, offset = 0) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'listProviders', { limit, offset });
}

export async function getProvider(name) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'getProvider', { name });
}

export async function createProvider(provider) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'createProvider', { provider });
}

export async function deleteProvider(name) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'deleteProvider', { name });
}

// ── Inference Methods ───────────────────────────────────────────

export async function getClusterInference(routeName = '') {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.inference, 'getClusterInference', { routeName });
}

export async function setClusterInference(providerName, modelId, routeName = '') {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.inference, 'setClusterInference', { providerName, modelId, routeName }, 30000);
}

export async function getInferenceBundle() {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.inference, 'getInferenceBundle', {});
}

// ── Policy Methods ──────────────────────────────────────────────

export async function getSandboxConfig(sandboxId) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'getSandboxConfig', { sandboxId });
}

export async function getDraftPolicy(name, statusFilter = '') {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'getDraftPolicy', { name, statusFilter });
}

export async function approveDraftChunk(name, chunkId) {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'approveDraftChunk', { name, chunkId });
}

export async function rejectDraftChunk(name, chunkId, reason = '') {
    const clients = getGrpcClients();
    if (!clients) throw new Error('No gateway connection available');
    return unary(clients.openShell, 'rejectDraftChunk', { name, chunkId, reason });
}

// ── Helpers ─────────────────────────────────────────────────────

export function mapPhaseToStatus(phase) {
    const mapping = {
        'SANDBOX_PHASE_UNSPECIFIED': 'unknown',
        'SANDBOX_PHASE_PROVISIONING': 'creating',
        'SANDBOX_PHASE_READY': 'running',
        'SANDBOX_PHASE_ERROR': 'error',
        'SANDBOX_PHASE_DELETING': 'stopped',
        'SANDBOX_PHASE_UNKNOWN': 'unknown',
    };
    return mapping[phase] || 'unknown';
}

export function sandboxToDto(sandbox) {
    return {
        name: sandbox.name || '',
        id: sandbox.id || '',
        phase: sandbox.phase || 'SANDBOX_PHASE_UNSPECIFIED',
        status: mapPhaseToStatus(sandbox.phase),
        image: sandbox.spec?.template?.image || '',
        createdAt: sandbox.createdAtMs
            ? new Date(parseInt(sandbox.createdAtMs, 10)).toISOString()
            : '',
        namespace: sandbox.namespace || '',
        policyVersion: sandbox.currentPolicyVersion || 0,
        providers: sandbox.spec?.providers || [],
        conditions: sandbox.status?.conditions || [],
    };
}

export async function checkConnection() {
    try {
        const clients = getGrpcClients();
        if (!clients) {
            return { connected: false, error: 'No active OpenShell cluster configured' };
        }
        const resp = await health();
        return {
            connected: resp.status === 'SERVICE_STATUS_HEALTHY',
            endpoint: clients.endpoint,
            clusterName: clients.clusterName,
            version: resp.version,
            status: resp.status,
        };
    } catch (err) {
        return {
            connected: false,
            endpoint: _gatewayEndpoint,
            clusterName: _clusterName,
            error: err.message || 'Connection failed',
        };
    }
}
