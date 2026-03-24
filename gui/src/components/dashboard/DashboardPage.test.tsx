// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';

vi.mock('../../api/client', async () => {
    const listSandboxes = vi.fn().mockResolvedValue({ sandboxes: [], raw: '' });
    const getGatewayStatus = vi.fn().mockResolvedValue({ healthy: true, ok: true, output: '' });
    const stopSandbox = vi.fn().mockResolvedValue({ ok: true });
    return {
        api: { listSandboxes, getGatewayStatus, stopSandbox },
        createWebSocket: () => ({ close: () => { }, onmessage: null, onerror: null }),
    };
});

const { api } = await import('../../api/client');

describe('DashboardPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.listSandboxes).mockResolvedValue({ sandboxes: [], raw: '' });
        vi.mocked(api.getGatewayStatus).mockResolvedValue({ healthy: true, ok: true, output: '' });
    });

    it('renders the page header', () => {
        render(<DashboardPage />);
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Dashboard');
    });

    it('shows empty state when no sandboxes', async () => {
        render(<DashboardPage />);
        await waitFor(() => {
            expect(screen.getAllByText('No Sandboxes Yet').length).toBeGreaterThan(0);
        });
    });

    it('displays sandbox cards when sandboxes exist', async () => {
        vi.mocked(api.listSandboxes).mockResolvedValue({
            sandboxes: [
                { name: 'test-sandbox', image: 'nemoclaw:latest', status: 'Ready', created: '2026-01-01' },
            ],
            raw: '',
        });
        render(<DashboardPage />);
        await waitFor(() => {
            expect(screen.getAllByText('test-sandbox').length).toBeGreaterThan(0);
        });
    });

    it('shows quick action buttons', async () => {
        render(<DashboardPage />);
        await waitFor(() => {
            expect(screen.getAllByText('🚀 New Sandbox').length).toBeGreaterThan(0);
        });
        expect(screen.getAllByText('🔄 Refresh').length).toBeGreaterThan(0);
    });

    it('shows error when API fails', async () => {
        vi.mocked(api.listSandboxes).mockRejectedValue(new Error('Network error'));
        vi.mocked(api.getGatewayStatus).mockRejectedValue(new Error('Network error'));
        render(<DashboardPage />);
        await waitFor(() => {
            expect(screen.getAllByText(/Network error/).length).toBeGreaterThan(0);
        });
    });

    it('renders stat cards', async () => {
        render(<DashboardPage />);
        await waitFor(() => {
            expect(screen.getAllByText('Total Sandboxes').length).toBeGreaterThan(0);
        });
        expect(screen.getAllByText('Gateway').length).toBeGreaterThan(0);
    });
});
