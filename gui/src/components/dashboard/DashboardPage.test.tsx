// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from './DashboardPage';

vi.mock('../../api/client', async () => {
    const listSandboxes = vi.fn().mockResolvedValue({ sandboxes: [], raw: '' });
    const stopSandbox = vi.fn().mockResolvedValue({ ok: true });
    const startGateway = vi.fn().mockResolvedValue({ ok: true, healthy: true, output: 'Started' });
    const stopGateway = vi.fn().mockResolvedValue({ ok: true, output: 'Stopped' });
    const getGatewayStatus = vi.fn().mockResolvedValue({ healthy: false, ok: false, output: '' });
    return { api: { listSandboxes, stopSandbox, startGateway, stopGateway, getGatewayStatus } };
});

vi.mock('../../hooks/useWebSocket', () => ({
    useWebSocket: () => ({
        connected: true,
        sandboxes: [],
        gateway: { healthy: false },
        send: vi.fn(),
    }),
}));

const { api } = await import('../../api/client');

describe('DashboardPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.listSandboxes).mockResolvedValue({ sandboxes: [], raw: '' });
    });

    it('renders the page header', () => {
        render(<DashboardPage />);
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('shows quick action buttons', () => {
        render(<DashboardPage />);
        expect(screen.getAllByText('🚀 New Sandbox').length).toBeGreaterThan(0);
        expect(screen.getAllByText('🔄 Refresh').length).toBeGreaterThan(0);
    });

    it('shows gateway toggle button', () => {
        render(<DashboardPage />);
        expect(screen.getAllByTestId('gateway-toggle-btn').length).toBeGreaterThan(0);
    });

    it('shows Start button when gateway is not healthy', () => {
        render(<DashboardPage />);
        const btns = screen.getAllByTestId('gateway-toggle-btn');
        expect(btns[0].textContent).toBe('Start');
    });

    it('calls startGateway when Start is clicked', async () => {
        const user = userEvent.setup();
        render(<DashboardPage />);
        const btns = screen.getAllByTestId('gateway-toggle-btn');
        await user.click(btns[0]);
        expect(api.startGateway).toHaveBeenCalled();
    });

    it('shows empty state when no sandboxes', async () => {
        render(<DashboardPage />);
        await waitFor(() => {
            expect(screen.getAllByText('No Sandboxes Yet').length).toBeGreaterThan(0);
        });
    });

    it('shows stat cards', () => {
        render(<DashboardPage />);
        expect(screen.getAllByText('Total Sandboxes').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Gateway').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Live Updates').length).toBeGreaterThan(0);
    });
});
