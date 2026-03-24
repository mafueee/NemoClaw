// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardWizard } from './OnboardWizard';

vi.mock('../../api/client', async () => {
    const getPreflightChecks = vi.fn().mockResolvedValue({
        checks: [
            { name: 'Docker', ok: true, detail: 'Running' },
            { name: 'Node.js', ok: true, detail: 'v22.0.0' },
        ],
    });
    return { api: { getPreflightChecks } };
});

const { api } = await import('../../api/client');

describe('OnboardWizard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getPreflightChecks).mockResolvedValue({
            checks: [
                { name: 'Docker', ok: true, detail: 'Running' },
                { name: 'Node.js', ok: true, detail: 'v22.0.0' },
            ],
        });
    });

    it('renders the wizard header', () => {
        render(<OnboardWizard />);
        expect(screen.getByText('🚀 Onboard New Sandbox')).toBeInTheDocument();
    });

    it('renders wizard step indicators', () => {
        render(<OnboardWizard />);
        expect(screen.getAllByText('Preflight').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Gateway').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Done').length).toBeGreaterThan(0);
    });

    it('shows preflight checks', async () => {
        render(<OnboardWizard />);
        await waitFor(() => {
            expect(screen.getAllByText('Docker').length).toBeGreaterThan(0);
        });
    });

    it('shows Preflight Checks heading', async () => {
        render(<OnboardWizard />);
        await waitFor(() => {
            expect(screen.getAllByText('Preflight Checks').length).toBeGreaterThan(0);
        });
    });

    it('shows Re-check button after checks load', async () => {
        render(<OnboardWizard />);
        await waitFor(() => {
            expect(screen.getAllByText('🔄 Re-check').length).toBeGreaterThan(0);
        });
    });

    it('can navigate to step 2 (Gateway)', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => {
            expect(screen.getAllByText('Docker').length).toBeGreaterThan(0);
        });
        await user.click(screen.getAllByText('Continue →')[0]);
        expect(screen.getByText('Gateway Configuration')).toBeInTheDocument();
    });
});
