// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LogViewer } from './LogViewer';

vi.mock('../../api/client', async () => {
    const listSandboxes = vi.fn().mockResolvedValue({
        sandboxes: [{ name: 'my-sandbox', image: 'img', status: 'Ready', created: '' }],
        raw: '',
    });
    return {
        api: { listSandboxes },
        streamLogs: () => () => {},
    };
});

describe('LogViewer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the page header', () => {
        render(<LogViewer />);
        expect(screen.getAllByText('📋 Log Viewer').length).toBeGreaterThan(0);
    });

    it('shows the Stream Logs button', () => {
        render(<LogViewer />);
        expect(screen.getAllByText('▶ Stream Logs').length).toBeGreaterThan(0);
    });

    it('shows clear button', () => {
        render(<LogViewer />);
        expect(screen.getAllByText('🗑 Clear').length).toBeGreaterThan(0);
    });

    it('shows filter input', () => {
        render(<LogViewer />);
        expect(screen.getAllByPlaceholderText('🔍 Filter logs...').length).toBeGreaterThan(0);
    });

    it('shows sandbox selector', () => {
        render(<LogViewer />);
        expect(screen.getAllByText('Select sandbox...').length).toBeGreaterThan(0);
    });
});
