// @vitest-environment jsdom
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
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

/** Helper: click the visible "Continue →" button (always the last match) */
async function clickContinue(user: ReturnType<typeof userEvent.setup>) {
    const btns = screen.getAllByText('Continue →');
    await user.click(btns[btns.length - 1]);
}

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

    it('shows preflight checks on first render', async () => {
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

    it('can navigate to step 1 (Gateway) after preflight passes', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => {
            expect(screen.getAllByText('Docker').length).toBeGreaterThan(0);
        });
        await clickContinue(user);
        expect(screen.getByText('Gateway Configuration')).toBeInTheDocument();
    });

    it('shows CLI command on gateway step', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => expect(screen.getAllByText('Docker').length).toBeGreaterThan(0));
        await clickContinue(user); // → Gateway
        expect(screen.getAllByText('openshell gateway start --name nemoclaw').length).toBeGreaterThan(0);
    });

    it('shows sandbox name input with validation on step 2', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => expect(screen.getAllByText('Docker').length).toBeGreaterThan(0));
        await clickContinue(user); // → Gateway
        await clickContinue(user); // → Sandbox
        expect(screen.getByText('Sandbox Configuration')).toBeInTheDocument();
        expect(screen.getByDisplayValue('my-assistant')).toBeInTheDocument();
    });

    it('shows 3 inference providers on step 3', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => expect(screen.getAllByText('Docker').length).toBeGreaterThan(0));
        await clickContinue(user); // → Gateway
        await clickContinue(user); // → Sandbox
        await clickContinue(user); // → Inference
        expect(screen.getByText('Inference Provider')).toBeInTheDocument();
        expect(screen.getByText('NVIDIA Cloud API')).toBeInTheDocument();
        expect(screen.getByText('Local Ollama')).toBeInTheDocument();
        expect(screen.getByText('Local vLLM')).toBeInTheDocument();
    });

    it('shows CLI command on completion step', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => expect(screen.getAllByText('Docker').length).toBeGreaterThan(0));
        await clickContinue(user); // → Gateway
        await clickContinue(user); // → Sandbox
        await clickContinue(user); // → Inference
        await clickContinue(user); // → Policy
        const completeBtn = screen.getByRole('button', { name: 'Complete Setup →' });
        await user.click(completeBtn);
        expect(screen.getByText('Setup Complete!')).toBeInTheDocument();
        expect(screen.getByText('nemoclaw onboard')).toBeInTheDocument();
    });
});
