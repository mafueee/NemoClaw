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

    // Gateway
    getGatewayStatus: () => request<GatewayStatus>('/gateway/status'),
    startGateway: () => request<{ ok: boolean; healthy: boolean; output: string }>('/gateway/start', { method: 'POST' }),
    stopGateway: () => request<{ ok: boolean; output: string }>('/gateway/stop', { method: 'POST' }),

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

    // Policies
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
};

export interface InferenceConfigData {
    endpointType?: string;
    endpointUrl?: string;
    model?: string;
    credentialEnv?: string;
    provider?: string;
    providerLabel?: string;
    onboardedAt?: string;
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
