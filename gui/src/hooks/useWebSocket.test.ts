// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

// ── Mock WebSocket ──────────────────────────────────────────────
class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = MockWebSocket.OPEN;
    onopen: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    sent: string[] = [];

    constructor(public url: string) {
        // Simulate async open
        setTimeout(() => {
            this.onopen?.(new Event('open'));
        }, 0);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
        // Don't trigger onclose here to prevent reconnect loops in tests
    }

    // Test helpers
    simulateMessage(data: Record<string, unknown>) {
        this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
    }

    simulateClose() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({} as CloseEvent);
    }
}

let mockInstances: MockWebSocket[] = [];

describe('useWebSocket', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mockInstances = [];
        vi.stubGlobal('WebSocket', class extends MockWebSocket {
            constructor(url: string) {
                super(url);
                mockInstances.push(this);
            }
        });
        // Stub location
        vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:3000' });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('starts disconnected then connects', async () => {
        const { result } = renderHook(() => useWebSocket());
        expect(result.current.connected).toBe(false);

        // Flush the setTimeout in MockWebSocket constructor
        await act(async () => { vi.advanceTimersByTime(10); });

        expect(result.current.connected).toBe(true);
    });

    it('sends subscribe message on open', async () => {
        renderHook(() => useWebSocket());
        await act(async () => { vi.advanceTimersByTime(10); });

        expect(mockInstances.length).toBe(1);
        const sent = mockInstances[0].sent;
        expect(sent.length).toBeGreaterThanOrEqual(1);
        expect(JSON.parse(sent[0])).toEqual({ type: 'subscribe' });
    });

    it('updates sandboxes on sandbox:list message', async () => {
        const { result } = renderHook(() => useWebSocket());
        await act(async () => { vi.advanceTimersByTime(10); });

        const ws = mockInstances[0];
        act(() => {
            ws.simulateMessage({
                type: 'sandbox:list',
                sandboxes: [
                    { name: 'test-sb', image: 'img:v1', created: '2026-01-01', status: 'Ready' },
                ],
            });
        });

        expect(result.current.sandboxes).toHaveLength(1);
        expect(result.current.sandboxes[0].name).toBe('test-sb');
    });

    it('updates gateway on status message', async () => {
        const { result } = renderHook(() => useWebSocket());
        await act(async () => { vi.advanceTimersByTime(10); });

        const ws = mockInstances[0];
        act(() => {
            ws.simulateMessage({
                type: 'status',
                gateway: { healthy: true },
                sandboxes: [],
                timestamp: new Date().toISOString(),
            });
        });

        expect(result.current.gateway?.healthy).toBe(true);
    });

    it('sets connected to false on close', async () => {
        const { result } = renderHook(() => useWebSocket());
        await act(async () => { vi.advanceTimersByTime(10); });
        expect(result.current.connected).toBe(true);

        act(() => {
            mockInstances[0].simulateClose();
        });

        expect(result.current.connected).toBe(false);
    });

    it('attempts reconnect after close', async () => {
        renderHook(() => useWebSocket());
        await act(async () => { vi.advanceTimersByTime(10); });

        expect(mockInstances.length).toBe(1);

        act(() => {
            mockInstances[0].simulateClose();
        });

        // Advance past reconnect backoff (1000ms initial)
        await act(async () => { vi.advanceTimersByTime(1100); });

        expect(mockInstances.length).toBe(2);
    });

    it('cleans up on unmount', async () => {
        const { unmount } = renderHook(() => useWebSocket());
        await act(async () => { vi.advanceTimersByTime(10); });

        const ws = mockInstances[0];
        unmount();

        expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('exposes send function', async () => {
        const { result } = renderHook(() => useWebSocket());
        await act(async () => { vi.advanceTimersByTime(10); });

        act(() => {
            result.current.send({ type: 'test', data: 'hello' });
        });

        const ws = mockInstances[0];
        // First message is 'subscribe', second is our test message
        expect(ws.sent.length).toBe(2);
        expect(JSON.parse(ws.sent[1])).toEqual({ type: 'test', data: 'hello' });
    });
});
