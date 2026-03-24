// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClawDetail } from './ClawDetail';

vi.mock('../../api/client', async () => {
    const getClaw = vi.fn().mockResolvedValue({ ok: true, claw: { id: 'test-claw', sandboxName: 'test-claw', gatewayName: 'nemoclaw', createdAt: '2026-01-01T00:00:00Z', lastConnected: null, config: { provider: 'cloud', model: 'test-model', endpointUrl: '' }, status: 'running', sandboxStatus: 'Ready', detail: 'Some detail' } });
    const getClawStatus = vi.fn().mockResolvedValue({ ok: true, id: 'test-claw', status: 'running', sandboxStatus: 'Ready', lastConnected: '' });
    const reconnectClaw = vi.fn().mockResolvedValue({ ok: true, claw: {}, connectCmd: 'openshell sandbox connect test-claw' });
    const updateClawConfig = vi.fn().mockResolvedValue({ ok: true, claw: {} });
    const streamLogs = vi.fn().mockReturnValue(() => {});
    return { api: { getClaw, getClawStatus, reconnectClaw, updateClawConfig }, streamLogs };
});

vi.mock('../../hooks/useWebSocket', () => ({
    useWebSocket: () => ({ connected: true, sandboxes: [], claws: [], gateway: { healthy: true, ok: true, output: '' }, send: vi.fn() }),
}));

const { api } = await import('../../api/client');

describe('ClawDetail', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renders claw name and status', async () => { render(<ClawDetail clawId="test-claw" />); await waitFor(() => { expect(screen.getAllByText(/test-claw/).length).toBeGreaterThan(0); expect(screen.getByText('running')).toBeInTheDocument(); }); });
    it('shows overview tab by default with instance details', async () => { render(<ClawDetail clawId="test-claw" />); await waitFor(() => { expect(screen.getByText('Instance Details')).toBeInTheDocument(); expect(screen.getByText('nemoclaw')).toBeInTheDocument(); }); });
    it('shows tab navigation', async () => { render(<ClawDetail clawId="test-claw" />); await waitFor(() => { expect(screen.getAllByTestId('tab-overview').length).toBeGreaterThan(0); expect(screen.getAllByTestId('tab-monitor').length).toBeGreaterThan(0); expect(screen.getAllByTestId('tab-logs').length).toBeGreaterThan(0); expect(screen.getAllByTestId('tab-config').length).toBeGreaterThan(0); expect(screen.getAllByTestId('tab-policy').length).toBeGreaterThan(0); }); });
    it('switches to config tab', async () => { const user = userEvent.setup(); render(<ClawDetail clawId="test-claw" />); await waitFor(() => { expect(screen.getAllByTestId('tab-config').length).toBeGreaterThan(0); }); await user.click(screen.getAllByTestId('tab-config')[0]); expect(screen.getAllByText('⚙️ Inference Configuration').length).toBeGreaterThan(0); });
    it('shows reconnect button', async () => { render(<ClawDetail clawId="test-claw" />); await waitFor(() => { expect(screen.getAllByText('🔗 Reconnect').length).toBeGreaterThan(0); }); });
    it('shows not found for missing claw', async () => { vi.mocked(api.getClaw).mockResolvedValue({ ok: false, claw: null as any }); render(<ClawDetail clawId="missing" />); await waitFor(() => { expect(screen.getByText('Claw not found.')).toBeInTheDocument(); }); });
});
