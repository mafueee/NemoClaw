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

// API Methods
export const api = {
    health: () => request<{ status: string; version: string }>('/health'),

    // Sandboxes
    listSandboxes: () => request<{ sandboxes: Sandbox[]; raw: string }>('/sandboxes'),
    getSandboxStatus: (name: string) => request<{ name: string; ok: boolean; output: string }>(`/sandboxes/${name}/status`),
    startSandbox: (name: string) => request<{ ok: boolean }>(`/sandboxes/${name}/start`, { method: 'POST' }),
    stopSandbox: (name: string) => request<{ ok: boolean }>(`/sandboxes/${name}/stop`, { method: 'POST' }),

    // Gateway
    getGatewayStatus: () => request<GatewayStatus>('/gateway/status'),

    // Ports
    getPorts: () => request<{ ports: Record<string, number>; status: PortStatus[] }>('/ports'),

    // Policies
    getPolicies: () => request<{ presets: string[] }>('/policies'),

    // Onboarding
    getPreflightChecks: () => request<{ checks: PreflightCheck[] }>('/onboard/preflight'),
};

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
