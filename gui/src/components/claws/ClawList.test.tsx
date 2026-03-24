// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClawList } from './ClawList';

vi.mock('../../api/client', async () => {
    const listClaws = vi.fn().mockResolvedValue({ ok: true, claws: [] });
    const syncClaws = vi.fn().mockResolvedValue({ ok: true, claws: [] });
    const destroyClaw = vi.fn().mockResolvedValue({ ok: true, message: 'Destroyed' });
    const reconnectClaw = vi.fn().mockResolvedValue({ ok: true, connectCmd: 'openshell sandbox connect test' });
    return { api: { listClaws, syncClaws, destroyClaw, reconnectClaw } };
});

vi.mock('../../hooks/useWebSocket', () => ({
    useWebSocket: () => ({
        connected: true, sandboxes: [], claws: [], gateway: null, send: vi.fn(),
    }),
}));

const { api } = await import('../../api/client');

describe('ClawList', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.listClaws).mockResolvedValue({ ok: true, claws: [] }); });

    it('renders the page header', () => { render(<ClawList />); expect(screen.getAllByText('🐾 Claws').length).toBeGreaterThan(0); });
    it('shows empty state when no claws exist', async () => { render(<ClawList />); await waitFor(() => { expect(screen.getAllByText(/No claws found/).length).toBeGreaterThan(0); }); });
    it('shows filter buttons and action buttons', () => { render(<ClawList />); expect(screen.getAllByText(/All/).length).toBeGreaterThan(0); expect(screen.getAllByText(/Running/).length).toBeGreaterThan(0); expect(screen.getAllByText('+ New Claw').length).toBeGreaterThan(0); });
    it('renders claw cards when claws exist', async () => {
        vi.mocked(api.listClaws).mockResolvedValue({ ok: true, claws: [
            { id: 'my-claw', sandboxName: 'my-claw', gatewayName: 'nemoclaw', createdAt: '2026-01-01T00:00:00Z', lastConnected: null, config: { provider: 'cloud', model: 'test-model' }, status: 'running', sandboxStatus: 'Ready' },
            { id: 'test-claw', sandboxName: 'test-claw', gatewayName: 'nemoclaw', createdAt: '2026-01-02T00:00:00Z', lastConnected: null, config: { provider: 'ollama' }, status: 'stopped', sandboxStatus: 'not-found' },
        ] });
        render(<ClawList />);
        await waitFor(() => { expect(screen.getAllByText('my-claw').length).toBeGreaterThan(0); expect(screen.getAllByText('test-claw').length).toBeGreaterThan(0); });
    });
    it('shows Live badge when connected', () => { render(<ClawList />); expect(screen.getAllByText('Live').length).toBeGreaterThan(0); });
    it('shows destroy confirmation when clicking destroy button', async () => {
        const user = userEvent.setup();
        vi.mocked(api.listClaws).mockResolvedValue({ ok: true, claws: [{ id: 'my-claw', sandboxName: 'my-claw', gatewayName: 'nemoclaw', createdAt: '2026-01-01T00:00:00Z', lastConnected: null, config: { provider: 'cloud' }, status: 'running', sandboxStatus: 'Ready' }] });
        render(<ClawList />);
        await waitFor(() => { expect(screen.getAllByText('my-claw').length).toBeGreaterThan(0); });
        await user.click(screen.getAllByTestId('destroy-claw-my-claw')[0]);
        expect(screen.getAllByTestId('confirm-destroy-claw').length).toBeGreaterThan(0);
        expect(screen.getAllByTestId('cancel-destroy-claw').length).toBeGreaterThan(0);
    });
    it('calls destroyClaw API when confirmed', async () => {
        const user = userEvent.setup();
        vi.mocked(api.listClaws).mockResolvedValue({ ok: true, claws: [{ id: 'my-claw', sandboxName: 'my-claw', gatewayName: 'nemoclaw', createdAt: '2026-01-01T00:00:00Z', lastConnected: null, config: { provider: 'cloud' }, status: 'running', sandboxStatus: 'Ready' }] });
        render(<ClawList />);
        await waitFor(() => { expect(screen.getAllByText('my-claw').length).toBeGreaterThan(0); });
        await user.click(screen.getAllByTestId('destroy-claw-my-claw')[0]);
        await user.click(screen.getAllByTestId('confirm-destroy-claw')[0]);
        expect(api.destroyClaw).toHaveBeenCalledWith('my-claw');
    });
    it('calls sync when sync button clicked', async () => {
        const user = userEvent.setup();
        render(<ClawList />);
        const syncBtn = screen.getAllByText(/Sync/).find(el => el.tagName === 'BUTTON');
        if (syncBtn) await user.click(syncBtn);
        expect(api.syncClaws).toHaveBeenCalled();
    });
});
