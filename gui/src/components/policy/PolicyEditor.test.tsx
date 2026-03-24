// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PolicyEditor } from './PolicyEditor';

vi.mock('../../api/client', async () => {
    const getPolicies = vi.fn().mockResolvedValue({ presets: ['openclaw-sandbox'] });
    return { api: { getPolicies } };
});

const { api } = await import('../../api/client');

describe('PolicyEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getPolicies).mockResolvedValue({ presets: ['openclaw-sandbox'] });
    });

    it('renders the page header', () => {
        render(<PolicyEditor />);
        expect(screen.getAllByText('🛡️ Security Policies').length).toBeGreaterThan(0);
    });

    it('shows active policy badge', async () => {
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
        });
    });

    it('shows built-in policy presets', async () => {
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getAllByText('openclaw-sandbox').length).toBeGreaterThan(0);
            expect(screen.getAllByText('allow-github').length).toBeGreaterThan(0);
            expect(screen.getAllByText('allow-npm').length).toBeGreaterThan(0);
        });
    });

    it('shows CLI usage instructions', async () => {
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getAllByText('Apply via CLI').length).toBeGreaterThan(0);
        });
    });
});
