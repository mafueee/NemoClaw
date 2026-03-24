// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClawCreate } from './ClawCreate';

vi.mock('../../api/client', async () => {
    const getClawGateways = vi.fn().mockResolvedValue({ ok: true, gateways: [{ name: 'nemoclaw', active: true }] });
    return { api: { getClawGateways } };
});

vi.mock('../../data/providers', () => ({
    PROVIDERS: [
        { key: 'cloud', icon: '☁️', title: 'NVIDIA Cloud API', desc: 'Test', models: [], endpointEditable: false, defaultEndpoint: '', apiKeyEnv: 'NVIDIA_API_KEY', apiKeyPlaceholder: '' },
        { key: 'ollama', icon: '🦙', title: 'Ollama', desc: 'Test', models: [], endpointEditable: true, defaultEndpoint: '', apiKeyEnv: '', apiKeyPlaceholder: '' },
    ],
}));

vi.mock('../../hooks/useWebSocket', () => ({
    useWebSocket: () => ({ connected: true, sandboxes: [], claws: [], gateway: null, send: vi.fn() }),
}));

describe('ClawCreate', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renders the create form header', () => { render(<ClawCreate />); expect(screen.getAllByText('🐾 New Claw').length).toBeGreaterThan(0); });
    it('shows name input field', () => { render(<ClawCreate />); expect(screen.getAllByTestId('claw-name-input').length).toBeGreaterThan(0); });
    it('shows provider selection buttons', async () => { render(<ClawCreate />); await waitFor(() => { expect(screen.getAllByTestId('provider-cloud').length).toBeGreaterThan(0); expect(screen.getAllByTestId('provider-ollama').length).toBeGreaterThan(0); }); });
    it('shows deploy button disabled when name is empty', () => { render(<ClawCreate />); const btns = screen.getAllByTestId('deploy-claw-btn'); expect(btns[0]).toBeDisabled(); });
    it('enables deploy button when valid name is entered', async () => { const user = userEvent.setup(); render(<ClawCreate />); const inputs = screen.getAllByTestId('claw-name-input'); await user.type(inputs[0], 'my-claw'); const btns = screen.getAllByTestId('deploy-claw-btn'); expect(btns[0]).not.toBeDisabled(); });
    it('validates name format - rejects invalid chars', async () => { const user = userEvent.setup(); render(<ClawCreate />); const inputs = screen.getAllByTestId('claw-name-input'); await user.clear(inputs[0]); await user.type(inputs[0], 'MY_CLAW'); const val = (inputs[0] as HTMLInputElement).value; expect(val).not.toContain('_'); expect(val).not.toContain('M'); expect(/^[a-z0-9-]*$/.test(val)).toBe(true); });
    it('shows endpoint field for Ollama provider', async () => { const user = userEvent.setup(); render(<ClawCreate />); await waitFor(() => { expect(screen.getAllByTestId('provider-ollama').length).toBeGreaterThan(0); }); await user.click(screen.getAllByTestId('provider-ollama')[0]); expect(screen.getAllByPlaceholderText(/localhost:11434/).length).toBeGreaterThan(0); });
    it('shows back button', () => { render(<ClawCreate />); expect(screen.getAllByText('← Back').length).toBeGreaterThan(0); });
});
