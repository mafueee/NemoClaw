// API Client for NemoClaw Dashboard

const BASE_URL = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

// Types
export interface Sandbox {
    name: string;
    image: string;
    created: string;
    status: string;
}

export interface PortStatus {
    name: string;
    port: number;
    available: boolean;
    reason?: string;
}

export interface PortSource {
    name: string;
    port: number;
    source: 'env' | 'config' | 'default';
}

export interface PreflightCheck {
    name: string;
    ok: boolean;
    detail: string;
    warning?: boolean;
}

export interface GatewayStatus {
    healthy: boolean;
    ok: boolean;
    output: string;
}

export interface GatewayStatusDetailed {
    healthy: boolean;
    running: boolean;
    version: string;
    method: string;
    endpoint: string;
    containerState: string;
    containerName: string;
    containerId?: string;
    image: string;
    configured: boolean;
    source: string;
    error?: string;
}

// Policy preset with status
export interface PolicyPreset {
    name: string;
    file: string;
    description: string;
    applied: boolean;
}

// API Methods
export const api = {
    health: () => request<{ status: string; version: string }>('/health'),

    // Sandboxes
    listSandboxes: () => request<{ sandboxes: Sandbox[]; raw: string }>('/sandboxes'),
    getSandboxStatus: (name: string) => request<{ name: string; ok: boolean; output: string }>(`/sandboxes/${name}/status`),
    startSandbox: (name: string) => request<{ ok: boolean }>(`/sandboxes/${name}/start`, { method: 'POST' }),
    stopSandbox: (name: string) => request<{ ok: boolean }>(`/sandboxes/${name}/stop`, { method: 'POST' }),
    destroySandbox: (name: string) => request<{ ok: boolean; message: string }>(`/sandboxes/${name}/destroy`, { method: 'POST' }),

    // Gateway (Docker API lifecycle)
    getGatewayStatus: () => request<GatewayStatus>('/gateway/status'),
    startGateway: () => request<{ ok: boolean; healthy: boolean; message: string }>('/gateway/start', { method: 'POST' }),
    stopGateway: () => request<{ ok: boolean; message: string }>('/gateway/stop', { method: 'POST' }),

    // Ports
    getPorts: () => request<{ ports: Record<string, number>; status: PortStatus[]; sources: PortSource[] }>('/ports'),
    updatePorts: (overrides: Record<string, number>) =>
        request<{ ok: boolean; ports: Record<string, number>; sources: PortSource[] }>('/ports', {
            method: 'PUT',
            body: JSON.stringify(overrides),
        }),
    resetPorts: () =>
        request<{ ok: boolean; ports: Record<string, number>; sources: PortSource[] }>('/ports/reset', {
            method: 'POST',
        }),
    autoResolvePorts: () =>
        request<{ ok: boolean; ports: Record<string, number>; status: PortStatus[]; sources: PortSource[] }>('/ports/auto-resolve', {
            method: 'POST',
        }),

    // Policies (presets)
    getPolicies: () => request<{ presets: string[] }>('/policies'),
    getPresetsWithStatus: (sandboxName?: string) =>
        request<{ ok: boolean; presets: PolicyPreset[] }>(`/policies/presets${sandboxName ? `?sandboxName=${encodeURIComponent(sandboxName)}` : ''}`),
    applyPolicy: (sandboxName: string, presetName: string) =>
        request<{ ok: boolean; message: string }>('/policies/apply', {
            method: 'POST',
            body: JSON.stringify({ sandboxName, presetName }),
        }),
    removePolicy: (sandboxName: string, presetName: string) =>
        request<{ ok: boolean; message: string }>('/policies/remove', {
            method: 'POST',
            body: JSON.stringify({ sandboxName, presetName }),
        }),

    // Policy YAML editor
    getSandboxPolicyYaml: (sandbox: string) =>
        request<{ ok: boolean; yaml: string; version: number; policyHash: string; policySource: string }>(`/policies/${encodeURIComponent(sandbox)}/config`),
    saveSandboxPolicyYaml: (sandbox: string, yaml: string) =>
        request<{ ok: boolean; version: number; policyHash: string; warnings: string[]; errors?: string[] }>(`/policies/${encodeURIComponent(sandbox)}/config`, {
            method: 'PUT',
            body: JSON.stringify({ yaml }),
        }),
    validatePolicy: (yaml: string) =>
        request<{ valid: boolean; errors: string[]; warnings: string[] }>('/policies/validate', {
            method: 'POST',
            body: JSON.stringify({ yaml }),
        }),

    // Draft policy (denial dashboard)
    getDraftChunks: (sandbox: string, filter?: string) =>
        request<DraftChunksResponse>(`/policies/${encodeURIComponent(sandbox)}/drafts${filter ? `?status=${encodeURIComponent(filter)}` : ''}`),
    approveDraft: (sandboxName: string, chunkId: string) =>
        request<{ ok: boolean; policyVersion: number; policyHash: string }>('/policies/drafts/approve', {
            method: 'POST',
            body: JSON.stringify({ sandboxName, chunkId }),
        }),
    rejectDraft: (sandboxName: string, chunkId: string, reason?: string) =>
        request<{ ok: boolean }>('/policies/drafts/reject', {
            method: 'POST',
            body: JSON.stringify({ sandboxName, chunkId, reason }),
        }),
    getDraftHistory: (sandbox: string) =>
        request<{ ok: boolean; entries: DraftHistoryEntry[] }>(`/policies/${encodeURIComponent(sandbox)}/drafts/history`),

    // Onboarding
    getPreflightChecks: () => request<{ checks: PreflightCheck[] }>('/onboard/preflight'),

    // Chat
    sendChatMessage: (sandboxName: string, message: string, sessionId?: string) =>
        request<{ ok: boolean; response: string; error?: string }>('/chat/message', {
            method: 'POST',
            body: JSON.stringify({ sandboxName, message, sessionId }),
        }),

    // Inference
    getInferenceConfig: () => request<{ config: InferenceConfigData }>('/inference'),
    saveInferenceConfig: (data: Partial<InferenceConfigData>) =>
        request<{ ok: boolean; config: InferenceConfigData }>('/inference', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    testInferenceEndpoint: (endpoint: string, apiKey?: string) =>
        request<{ ok: boolean; status?: number; models?: string[]; error?: string }>('/inference/test', {
            method: 'POST',
            body: JSON.stringify({ endpoint, apiKey }),
        }),

    // Inference routing transparency
    getInferenceRoutes: () =>
        request<InferenceRoutesResponse>('/inference/routes'),

    // Custom images
    listImages: () => request<{ ok: boolean; images: ContainerImage[] }>('/images'),
    removeImage: (tag: string) =>
        request<{ ok: boolean; message: string }>(`/images/${encodeURIComponent(tag)}`, { method: 'DELETE' }),

    // Claws
    listClaws: () => request<{ ok: boolean; claws: ClawInstance[] }>('/claws'),
    getClaw: (id: string) => request<{ ok: boolean; claw: ClawInstance }>(`/claws/${id}`),
    getClawStatus: (id: string) => request<{ ok: boolean; id: string; status: string; sandboxStatus: string; lastConnected: string }>(`/claws/${id}/status`),
    reconnectClaw: (id: string) =>
        request<{ ok: boolean; claw: ClawInstance; connectCmd: string }>(`/claws/${id}/reconnect`, { method: 'POST' }),
    updateClawConfig: (id: string, config: Partial<ClawConfig>) =>
        request<{ ok: boolean; claw: ClawInstance }>(`/claws/${id}/config`, {
            method: 'PUT',
            body: JSON.stringify(config),
        }),
    destroyClaw: (id: string, preserveSandbox = false) =>
        request<{ ok: boolean; message: string }>(`/claws/${id}?preserveSandbox=${preserveSandbox}`, { method: 'DELETE' }),
    syncClaws: () =>
        request<{ ok: boolean; claws: ClawInstance[] }>('/claws/sync', { method: 'POST' }),
    getClawGateways: () =>
        request<{ ok: boolean; gateways: { name: string; active: boolean }[] }>('/claws/gateways'),
};

export interface ClawInstance {
    id: string;
    sandboxName: string;
    gatewayName: string;
    createdAt: string;
    lastConnected: string | null;
    config: ClawConfig;
    status: 'running' | 'stopped' | 'error' | 'creating' | 'unknown';
    sandboxStatus?: string;
    detail?: string;
    discovered?: boolean;
}

export interface ClawConfig {
    provider?: string;
    model?: string;
    endpointUrl?: string;
}

export interface CreateClawRequest {
    name: string;
    gatewayName?: string;
    provider?: string;
    model?: string;
    apiKey?: string;
    endpoint?: string;
}

export interface InferenceConfigData {
    endpointType?: string;
    endpointUrl?: string;
    model?: string;
    credentialEnv?: string;
    provider?: string;
    providerLabel?: string;
    onboardedAt?: string;
    apiKey?: string;
}

// Inference routing types
export interface ResolvedRoute {
    name: string;
    baseUrl: string;
    protocols: string[];
    hasCredential: boolean;
    credentialMasked: string;
    modelId: string;
    providerType: string;
}

export interface InferenceRoutesResponse {
    ok: boolean;
    routes: ResolvedRoute[];
    revision: string;
    generatedAt: string;
}

// Draft policy types
export interface PolicyChunkDto {
    id: string;
    status: string;
    ruleName: string;
    proposedRule: unknown;
    rationale: string;
    securityNotes: string;
    confidence: number;
    denialSummaryIds: string[];
    createdAt: string;
    decidedAt: string | null;
    stage: string;
    supersedesChunkId: string;
    hitCount: number;
    firstSeen: string;
    lastSeen: string;
    binary: string;
}

export interface DraftChunksResponse {
    ok: boolean;
    chunks: PolicyChunkDto[];
    rollingSummary: string;
    draftVersion: string;
    lastAnalyzedAt: string | null;
}

export interface DraftHistoryEntry {
    timestamp: string;
    eventType: string;
    description: string;
    chunkId: string;
}

// Container image types
export interface ContainerImage {
    id: string;
    tags: string[];
    size: number;
    sizeHuman: string;
    created: string;
}

// WebSocket connection
export function createWebSocket(onMessage: (data: unknown) => void): WebSocket {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            onMessage(data);
        } catch { /* ignore parse errors */ }
    };

    ws.onerror = () => {
        console.warn('WebSocket connection error');
    };

    return ws;
}

// SSE for log streaming
export function streamLogs(
    sandboxName: string,
    onLine: (line: string) => void,
    onError?: (err: string) => void
): () => void {
    const eventSource = new EventSource(`${BASE_URL}/sandboxes/${sandboxName}/logs`);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.line) onLine(data.line);
            if (data.error && onError) onError(data.error);
            if (data.done) eventSource.close();
        } catch { /* ignore */ }
    };

    eventSource.onerror = () => {
        eventSource.close();
        if (onError) onError('Log stream disconnected');
    };

    return () => eventSource.close();
}

// SSE for image build streaming
export function streamImageBuild(
    dockerfile: string,
    tag: string,
    buildArgs: Record<string, string>,
    onEvent: (data: { step: string; status: string; message: string; done?: boolean; success?: boolean }) => void,
    onError?: (err: string) => void
): () => void {
    const controller = new AbortController();

    fetch(`${BASE_URL}/images/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dockerfile, tag, buildArgs }),
        signal: controller.signal,
    }).then(async (response) => {
        const reader = response.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        onEvent(data);
                    } catch { /* ignore */ }
                }
            }
        }
    }).catch((err) => {
        if (err.name !== 'AbortError' && onError) {
            onError(err.message);
        }
    });

    return () => controller.abort();
}
