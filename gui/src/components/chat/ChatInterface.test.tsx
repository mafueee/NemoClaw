// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatInterface } from './ChatInterface';

vi.mock('../../api/client', async () => {
    const listSandboxes = vi.fn().mockResolvedValue({
        sandboxes: [{ name: 'my-sandbox', status: 'Ready', image: '', created: '' }],
        raw: '',
    });
    const sendChatMessage = vi.fn().mockResolvedValue({ ok: true, response: 'Hello from agent!' });
    return { api: { listSandboxes, sendChatMessage } };
});

const { api } = await import('../../api/client');

describe('ChatInterface', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.listSandboxes).mockResolvedValue({
            sandboxes: [{ name: 'my-sandbox', status: 'Ready', image: '', created: '' }],
            raw: '',
        });
    });

    it('renders the page header', () => {
        render(<ChatInterface />);
        expect(screen.getByText('💬 Agent Chat')).toBeInTheDocument();
    });

    it('shows sandbox selector', async () => {
        render(<ChatInterface />);
        await waitFor(() => {
            expect(screen.getByTestId('chat-sandbox-selector')).toBeInTheDocument();
        });
    });

    it('renders welcome message', () => {
        render(<ChatInterface />);
        expect(screen.getAllByText(/Welcome to the OpenClaw Agent Chat/).length).toBeGreaterThan(0);
    });

    it('does NOT mention CLI commands in the welcome message', () => {
        render(<ChatInterface />);
        expect(screen.queryByText('nemoclaw')).toBeNull();
        expect(screen.queryByText('openclaw tui')).toBeNull();
    });

    it('renders send button', () => {
        render(<ChatInterface />);
        expect(screen.getAllByText('Send').length).toBeGreaterThan(0);
    });

    it('shows no sandboxes message when empty', async () => {
        vi.mocked(api.listSandboxes).mockResolvedValue({ sandboxes: [], raw: '' });
        render(<ChatInterface />);
        await waitFor(() => {
            expect(screen.getByText(/No sandboxes available/)).toBeInTheDocument();
        });
    });

    it('shows reconfigure link for API key errors', async () => {
        vi.mocked(api.sendChatMessage).mockResolvedValue({
            ok: false,
            response: 'Your inference API key appears to be corrupted',
            error: 'Corrupted API key',
        });
        render(<ChatInterface />);
        await waitFor(() => {
            expect(screen.getAllByTestId('chat-sandbox-selector').length).toBeGreaterThan(0);
        });
    });

    it('shows create sandbox link for missing OpenClaw', async () => {
        vi.mocked(api.sendChatMessage).mockResolvedValue({
            ok: false,
            response: 'OpenClaw is not installed in this sandbox.',
            error: 'openclaw not found',
        });
        render(<ChatInterface />);
        await waitFor(() => {
            expect(screen.getAllByTestId('chat-sandbox-selector').length).toBeGreaterThan(0);
        });
    });
});
