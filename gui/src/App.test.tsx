// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./api/client', () => ({
    api: {
        health: () => Promise.resolve({ status: 'ok', version: '1.0.0' }),
        listSandboxes: () => Promise.resolve({ sandboxes: [], raw: '' }),
        getGatewayStatus: () => Promise.resolve({ healthy: true, ok: true, output: '' }),
        getPorts: () => Promise.resolve({ ports: {}, status: [] }),
        getPolicies: () => Promise.resolve({ presets: [] }),
        getPreflightChecks: () => Promise.resolve({ checks: [] }),
        getSandboxStatus: () => Promise.resolve({ name: 'test', ok: true, output: '' }),
        startSandbox: () => Promise.resolve({ ok: true }),
        stopSandbox: () => Promise.resolve({ ok: true }),
    },
    createWebSocket: () => ({ close: () => { }, onmessage: null, onerror: null }),
    streamLogs: () => () => { },
}));

vi.mock('./hooks/useWebSocket', () => ({
    useWebSocket: () => ({
        connected: false,
        sandboxes: [],
        gateway: null,
        send: vi.fn(),
    }),
}));

describe('App', () => {
    it('renders the sidebar brand', () => {
        render(<App />);
        expect(screen.getAllByText('⚡ NemoClaw').length).toBeGreaterThan(0);
    });

    it('renders navigation links', () => {
        render(<App />);
        expect(screen.getAllByText('📊 Dashboard').length).toBeGreaterThan(0);
        expect(screen.getAllByText('🚀 Onboard').length).toBeGreaterThan(0);
        expect(screen.getAllByText('📦 Sandboxes').length).toBeGreaterThan(0);
        expect(screen.getAllByText('📋 Logs').length).toBeGreaterThan(0);
        expect(screen.getAllByText('💬 Agent Chat').length).toBeGreaterThan(0);
        expect(screen.getAllByText('🧠 Inference').length).toBeGreaterThan(0);
        expect(screen.getAllByText('🛡️ Policies').length).toBeGreaterThan(0);
        expect(screen.getAllByText('🔌 Ports').length).toBeGreaterThan(0);
    });

    it('renders the footer', () => {
        render(<App />);
        expect(screen.getAllByText('Powered by NVIDIA OpenShell').length).toBeGreaterThan(0);
    });
});
