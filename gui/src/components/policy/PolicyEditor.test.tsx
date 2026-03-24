// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PolicyEditor } from './PolicyEditor';

vi.mock('../../api/client', async () => {
    const getPolicies = vi.fn().mockResolvedValue({ presets: ['openclaw-sandbox'] });
    const listSandboxes = vi.fn().mockResolvedValue({ sandboxes: [{ name: 'my-sandbox', status: 'Ready' }], raw: '' });
    const getPresetsWithStatus = vi.fn().mockResolvedValue({
        ok: true,
        presets: [
            { name: 'discord', file: 'discord.yaml', description: 'Allow Discord webhooks', applied: false },
            { name: 'npm', file: 'npm.yaml', description: 'Allow npm registry', applied: true },
        ],
    });
    const applyPolicy = vi.fn().mockResolvedValue({ ok: true, message: 'Applied' });
    const removePolicy = vi.fn().mockResolvedValue({ ok: true, message: 'Removed' });
    return { api: { getPolicies, listSandboxes, getPresetsWithStatus, applyPolicy, removePolicy } };
});

const { api } = await import('../../api/client');

describe('PolicyEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.listSandboxes).mockResolvedValue({ sandboxes: [{ name: 'my-sandbox', status: 'Ready', image: '', created: '' }], raw: '' });
        vi.mocked(api.getPresetsWithStatus).mockResolvedValue({
            ok: true,
            presets: [
                { name: 'discord', file: 'discord.yaml', description: 'Allow Discord webhooks', applied: false },
                { name: 'npm', file: 'npm.yaml', description: 'Allow npm registry', applied: true },
            ],
        });
    });

    it('renders the page header', () => {
        render(<PolicyEditor />);
        expect(screen.getAllByText('🛡️ Security Policies').length).toBeGreaterThan(0);
    });

    it('shows sandbox selector', async () => {
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getByTestId('sandbox-selector')).toBeInTheDocument();
        });
    });

    it('shows preset cards with Apply/Remove buttons', async () => {
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getAllByText('discord').length).toBeGreaterThan(0);
            expect(screen.getAllByText('npm').length).toBeGreaterThan(0);
        });
        expect(screen.getAllByText('✗ Remove').length).toBeGreaterThan(0);
        expect(screen.getAllByText('✓ Apply').length).toBeGreaterThan(0);
    });

    it('shows Active badge for applied presets', async () => {
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
        });
    });

    it('does NOT show CLI instructions', async () => {
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getAllByText('discord').length).toBeGreaterThan(0);
        });
        expect(screen.queryByText('Apply via CLI')).toBeNull();
        expect(screen.queryByText('nemoclaw')).toBeNull();
    });

    it('calls applyPolicy when Apply button is clicked', async () => {
        const user = userEvent.setup();
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getAllByText('✓ Apply').length).toBeGreaterThan(0);
        });
        await user.click(screen.getAllByText('✓ Apply')[0]);
        expect(api.applyPolicy).toHaveBeenCalledWith('my-sandbox', 'discord');
    });

    it('calls removePolicy when Remove button is clicked', async () => {
        const user = userEvent.setup();
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getAllByText('✗ Remove').length).toBeGreaterThan(0);
        });
        await user.click(screen.getAllByText('✗ Remove')[0]);
        expect(api.removePolicy).toHaveBeenCalledWith('my-sandbox', 'npm');
    });
});
