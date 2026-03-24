// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardWizard } from './OnboardWizard';
import { PROVIDERS } from '../../data/providers';

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
        expect(screen.getAllByText('Deploy').length).toBeGreaterThan(0);
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
        await user.click(screen.getAllByText('Continue \u2192')[0]);
        expect(screen.getByText('Gateway Configuration')).toBeInTheDocument();
    });

    it('shows Deploy Sandbox button on policy step instead of CLI command', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => expect(screen.getAllByText('Docker').length).toBeGreaterThan(0));
        await user.click(screen.getAllByTestId('continue-preflight')[0]);
        await user.click(screen.getAllByTestId('continue-gateway')[0]);
        await user.click(screen.getAllByTestId('continue-sandbox')[0]);
        await user.click(screen.getAllByTestId('continue-inference')[0]);
        expect(screen.getByText('Deploy Sandbox \u2192')).toBeInTheDocument();
        expect(screen.queryByText('nemoclaw onboard')).toBeNull();
    });

    it('shows Deploy button on final step', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => expect(screen.getAllByText('Docker').length).toBeGreaterThan(0));
        await user.click(screen.getAllByTestId('continue-preflight')[0]);
        await user.click(screen.getAllByTestId('continue-gateway')[0]);
        await user.click(screen.getAllByTestId('continue-sandbox')[0]);
        await user.click(screen.getAllByTestId('continue-inference')[0]);
        await user.click(screen.getAllByTestId('continue-policy')[0]);
        expect(screen.getAllByTestId('deploy-btn').length).toBeGreaterThan(0);
        expect(screen.getAllByText('🚀 Deploy Sandbox').length).toBeGreaterThan(0);
    });

    it('shows all providers including OpenRouter and Ollama on inference step', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => expect(screen.getAllByText('Docker').length).toBeGreaterThan(0));
        await user.click(screen.getAllByTestId('continue-preflight')[0]);
        await user.click(screen.getAllByTestId('continue-gateway')[0]);
        await user.click(screen.getAllByTestId('continue-sandbox')[0]);
        await waitFor(() => expect(screen.queryByText('Inference Provider')).toBeTruthy());
        expect(screen.getAllByText('NVIDIA Cloud API').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Ollama').length).toBeGreaterThan(0);
        expect(screen.getAllByText('OpenRouter').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Google Gemini').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Local vLLM').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Local GPU (NIM)').length).toBeGreaterThan(0);
    });

    it('shared PROVIDERS includes OpenRouter with correct config', () => {
        const openrouter = PROVIDERS.find(p => p.key === 'openrouter');
        expect(openrouter).toBeDefined();
        expect(openrouter!.title).toBe('OpenRouter');
        expect(openrouter!.defaultEndpoint).toBe('https://openrouter.ai/api/v1');
        expect(openrouter!.apiKeyPlaceholder).toBe('sk-or-v1-...');
        expect(openrouter!.models.length).toBeGreaterThan(0);
    });

    it('shared PROVIDERS includes Ollama with editable endpoint', () => {
        const ollama = PROVIDERS.find(p => p.key === 'ollama');
        expect(ollama).toBeDefined();
        expect(ollama!.title).toBe('Ollama');
        expect(ollama!.desc).toContain('remote');
        expect(ollama!.endpointEditable).toBe(true);
        expect(ollama!.defaultEndpoint).toBe('http://localhost:11434/v1');
    });
});
