// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SandboxManager } from './SandboxManager';

vi.mock('../../api/client', async () => {
    const listSandboxes = vi.fn().mockResolvedValue({ sandboxes: [], raw: '' });
    const getSandboxStatus = vi.fn().mockResolvedValue({ name: 'test', ok: true, output: '' });
    const stopSandbox = vi.fn().mockResolvedValue({ ok: true });
    return { api: { listSandboxes, getSandboxStatus, stopSandbox } };
});

vi.mock('../../hooks/useWebSocket', () => ({
    useWebSocket: () => ({
        connected: true,
        sandboxes: [],
        gateway: null,
        send: vi.fn(),
    }),
}));

const { api } = await import('../../api/client');

describe('SandboxManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.listSandboxes).mockResolvedValue({ sandboxes: [], raw: '' });
    });

    it('renders the page header', () => {
        render(<SandboxManager />);
        expect(screen.getAllByText('📦 Sandboxes').length).toBeGreaterThan(0);
    });

    it('shows empty state when no sandboxes', async () => {
        render(<SandboxManager />);
        await waitFor(() => {
            expect(screen.getAllByText(/No sandboxes found/).length).toBeGreaterThan(0);
        });
    });

    it('shows action buttons', () => {
        render(<SandboxManager />);
        expect(screen.getAllByText('+ New Sandbox').length).toBeGreaterThan(0);
        expect(screen.getAllByText('🔄 Refresh').length).toBeGreaterThan(0);
    });

    it('renders sandbox list when sandboxes exist', async () => {
        vi.mocked(api.listSandboxes).mockResolvedValue({
            sandboxes: [
                { name: 'my-sandbox', image: 'img:v1', status: 'Ready', created: '2026-01-01' },
                { name: 'test-box', image: 'img:v2', status: 'NotReady', created: '2026-01-02' },
            ],
            raw: '',
        });
        render(<SandboxManager />);
        await waitFor(() => {
            expect(screen.getAllByText('my-sandbox').length).toBeGreaterThan(0);
            expect(screen.getAllByText('test-box').length).toBeGreaterThan(0);
        });
    });

    it('shows Live badge when connected', () => {
        render(<SandboxManager />);
        expect(screen.getAllByText('Live').length).toBeGreaterThan(0);
    });
});
