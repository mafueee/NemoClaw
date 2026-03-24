// useWebSocket — Auto-reconnecting WebSocket hook for NemoClaw live updates
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Sandbox, GatewayStatus } from '../api/client';

// ── Message Types ───────────────────────────────────────────────
export interface WsConnectedMessage {
    type: 'connected';
}

export interface WsStatusMessage {
    type: 'status';
    gateway: { healthy: boolean };
    sandboxes: Sandbox[];
    timestamp: string;
}

export interface WsSandboxListMessage {
    type: 'sandbox:list';
    sandboxes: Sandbox[];
}

export type WsMessage = WsConnectedMessage | WsStatusMessage | WsSandboxListMessage;

// ── Hook State ──────────────────────────────────────────────────
export interface UseWebSocketState {
    connected: boolean;
    sandboxes: Sandbox[];
    gateway: GatewayStatus | null;
    send: (msg: Record<string, unknown>) => void;
}

// ── Hook ────────────────────────────────────────────────────────
const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

export function useWebSocket(): UseWebSocketState {
    const [connected, setConnected] = useState(false);
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [gateway, setGateway] = useState<GatewayStatus | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const backoff = useRef(MIN_RECONNECT_MS);
    const mountedRef = useRef(true);

    const send = useCallback((msg: Record<string, unknown>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    const connect = useCallback(() => {
        if (!mountedRef.current) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
            if (!mountedRef.current) { ws.close(); return; }
            setConnected(true);
            backoff.current = MIN_RECONNECT_MS;
            // Request immediate state
            ws.send(JSON.stringify({ type: 'subscribe' }));
        };

        ws.onmessage = (event) => {
            if (!mountedRef.current) return;
            try {
                const data = JSON.parse(event.data) as WsMessage;
                switch (data.type) {
                    case 'status':
                        if (data.gateway) {
                            setGateway((prev) => ({
                                healthy: data.gateway.healthy,
                                ok: data.gateway.healthy,
                                output: prev?.output ?? '',
                            }));
                        }
                        if (data.sandboxes) {
                            setSandboxes(data.sandboxes);
                        }
                        break;
                    case 'sandbox:list':
                        setSandboxes(data.sandboxes);
                        break;
                    case 'connected':
                        // noop — handled by onopen
                        break;
                }
            } catch { /* ignore parse errors */ }
        };

        ws.onclose = () => {
            if (!mountedRef.current) return;
            setConnected(false);
            // Schedule reconnect with exponential backoff
            reconnectTimer.current = setTimeout(() => {
                backoff.current = Math.min(backoff.current * 2, MAX_RECONNECT_MS);
                connect();
            }, backoff.current);
        };

        ws.onerror = () => {
            // onclose will fire after onerror, which handles reconnect
        };
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        connect();

        return () => {
            mountedRef.current = false;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect on intentional close
                wsRef.current.close();
            }
        };
    }, [connect]);

    return { connected, sandboxes, gateway, send };
}
