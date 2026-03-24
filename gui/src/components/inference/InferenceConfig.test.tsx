// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InferenceConfig } from './InferenceConfig';

describe('InferenceConfig', () => {
    it('renders the page header', () => {
        render(<InferenceConfig />);
        expect(screen.getAllByText('🧠 Inference Configuration').length).toBeGreaterThan(0);
    });

    it('renders all provider cards', () => {
        render(<InferenceConfig />);
        expect(screen.getAllByText('NVIDIA Cloud API').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Local Ollama').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Local vLLM').length).toBeGreaterThan(0);
    });

    it('shows model dropdown', () => {
        render(<InferenceConfig />);
        const selects = screen.getAllByRole('combobox');
        expect(selects.length).toBeGreaterThan(0);
    });

    it('shows API key input for cloud provider', () => {
        render(<InferenceConfig />);
        const inputs = screen.getAllByPlaceholderText('nvapi-...');
        expect(inputs.length).toBeGreaterThan(0);
    });

    it('switches provider on click', async () => {
        const user = userEvent.setup();
        render(<InferenceConfig />);
        await user.click(screen.getAllByText('Local Ollama')[0]);
        expect(screen.getAllByText('Ollama Host').length).toBeGreaterThan(0);
    });

    it('shows CLI apply section', () => {
        render(<InferenceConfig />);
        expect(screen.getAllByText('Apply via CLI').length).toBeGreaterThan(0);
    });
});
