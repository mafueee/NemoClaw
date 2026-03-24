// useWebSocket — Auto-reconnecting WebSocket hook for NemoClaw live updates
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Sandbox, GatewayStatus, ClawInstance } from '../api/client';

// ── Message Types ─────────────────────────────────────────────
export interface WsConnectedMessage { type: 'connected'; }
export interface WsStatusMessage { type: 'status'; gateway: { healthy: boolean }; sandboxes: Sandbox[]; claws?: ClawInstance[]; timestamp: string; }
export interface WsSandboxListMessage { type: 'sandbox:list'; sandboxes: Sandbox[]; }
export interface WsClawListMessage { type: 'claw:list'; claws: ClawInstance[]; }
export type WsMessage = WsConnectedMessage | WsStatusMessage | WsSandboxListMessage | WsClawListMessage;

// ── Hook State ──────────────────────────────────────────────
export interface UseWebSocketState {
    connected: boolean;
    sandboxes: Sandbox[];
    claws: ClawInstance[];
    gateway: GatewayStatus | null;
    send: (msg: Record<string, unknown>) => void;
}

// ── Hook ──────────────────────────────────────────────────
const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

export function useWebSocket(): UseWebSocketState {
    const [connected, setConnected] = useState(false);
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [claws, setClaws] = useState<ClawInstance[]>([]);
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
                        if (data.sandboxes) setSandboxes(data.sandboxes);
                        if (data.claws) setClaws(data.claws);
                        break;
                    case 'sandbox:list':
                        setSandboxes(data.sandboxes);
                        break;
                    case 'claw:list':
                        setClaws(data.claws);
                        break;
                    case 'connected':
                        break;
                }
            } catch { /* ignore parse errors */ }
        };

        ws.onclose = () => {
            if (!mountedRef.current) return;
            setConnected(false);
            reconnectTimer.current = setTimeout(() => {
                backoff.current = Math.min(backoff.current * 2, MAX_RECONNECT_MS);
                connect();
            }, backoff.current);
        };

        ws.onerror = () => {};
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        connect();

        return () => {
            mountedRef.current = false;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, [connect]);

    return { connected, sandboxes, claws, gateway, send };
}
