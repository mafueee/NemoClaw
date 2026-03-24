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

    it('shows all providers including OpenRouter and Ollama on inference step', async () => {
        const user = userEvent.setup();
        render(<OnboardWizard />);
        await waitFor(() => expect(screen.getAllByText('Docker').length).toBeGreaterThan(0));

        // Navigate step by step using unique testids
        await user.click(screen.getAllByTestId('continue-preflight')[0]);
        await user.click(screen.getAllByTestId('continue-gateway')[0]);
        await user.click(screen.getAllByTestId('continue-sandbox')[0]);

        // Verify we're on inference step with all 6 providers visible
        await waitFor(() => expect(screen.queryByText('Inference Provider')).toBeTruthy());
        expect(screen.getByText('NVIDIA Cloud API')).toBeInTheDocument();
        expect(screen.getByText('Ollama')).toBeInTheDocument();
        expect(screen.getByText('OpenRouter')).toBeInTheDocument();
        expect(screen.getByText('Google Gemini')).toBeInTheDocument();
        expect(screen.getByText('Local vLLM')).toBeInTheDocument();
        expect(screen.getByText('Local GPU (NIM)')).toBeInTheDocument();
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
