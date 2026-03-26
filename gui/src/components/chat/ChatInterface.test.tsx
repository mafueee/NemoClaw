// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInterface } from './ChatInterface';

vi.mock('../../api/client', async () => {
    const listClaws = vi.fn().mockResolvedValue({
        ok: true,
        claws: [{
            id: 'my-claw',
            sandboxName: 'my-sandbox',
            gatewayName: 'nemoclaw',
            status: 'running',
            createdAt: new Date().toISOString(),
            lastConnected: null,
            config: { provider: 'openrouter', model: 'gpt-4o', endpointUrl: '' },
        }],
    });
    const sendChatMessage = vi.fn().mockResolvedValue({
        ok: true,
        response: 'Hello from agent!',
        sandboxed: true,
    });
    return { api: { listClaws, sendChatMessage } };
});

const { api } = await import('../../api/client');

describe('ChatInterface', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.listClaws).mockResolvedValue({
            ok: true,
            claws: [{
                id: 'my-claw',
                sandboxName: 'my-sandbox',
                gatewayName: 'nemoclaw',
                status: 'running',
                createdAt: new Date().toISOString(),
                lastConnected: null,
                config: { provider: 'openrouter', model: 'gpt-4o', endpointUrl: '' },
            }],
        });
    });

    it('renders the page header', () => {
        render(<ChatInterface />);
        expect(screen.getByText('\ud83d\udcac Claw Agent Chat')).toBeInTheDocument();
    });

    it('shows claw selector', async () => {
        render(<ChatInterface />);
        await waitFor(() => {
            expect(screen.getByTestId('chat-claw-selector')).toBeInTheDocument();
        });
    });

    it('renders welcome message', () => {
        render(<ChatInterface />);
        expect(screen.getAllByText(/Welcome to the Claw Agent Chat/).length).toBeGreaterThan(0);
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

    it('shows no claws message when empty', async () => {
        vi.mocked(api.listClaws).mockResolvedValue({ ok: true, claws: [] });
        render(<ChatInterface />);
        await waitFor(() => {
            expect(screen.getByText(/No claws available/)).toBeInTheDocument();
        });
    });

    it('sends message through sandbox and shows sandboxed badge', async () => {
        const user = userEvent.setup();
        vi.mocked(api.sendChatMessage).mockResolvedValue({
            ok: true,
            response: 'Pineapple!',
            sandboxed: true,
        });

        render(<ChatInterface />);
        await waitFor(() => {
            expect(screen.getByTestId('chat-claw-selector')).toBeInTheDocument();
        });

        const textarea = screen.getByPlaceholderText(/Type a message/);
        await user.type(textarea, 'say pineapple');
        await user.click(screen.getByText('Send'));

        await waitFor(() => {
            expect(screen.getByText('Pineapple!')).toBeInTheDocument();
            expect(screen.getByTestId('badge-sandboxed')).toBeInTheDocument();
            expect(screen.getByTestId('badge-sandboxed')).toHaveTextContent('Sandboxed');
        });

        // Verify the API was called with the claw's sandbox name
        expect(api.sendChatMessage).toHaveBeenCalledWith('my-sandbox', 'say pineapple', expect.any(String));
    });

    it('shows bypassed badge when sandbox is bypassed', async () => {
        const user = userEvent.setup();
        vi.mocked(api.sendChatMessage).mockResolvedValue({
            ok: true,
            response: 'Hello via fallback',
            sandboxed: false,
            warning: 'Could not reach sandbox',
        });

        render(<ChatInterface />);
        await waitFor(() => {
            expect(screen.getByTestId('chat-claw-selector')).toBeInTheDocument();
        });

        const textarea = screen.getByPlaceholderText(/Type a message/);
        await user.type(textarea, 'hello');
        await user.click(screen.getByText('Send'));

        await waitFor(() => {
            expect(screen.getByTestId('badge-bypassed')).toBeInTheDocument();
            expect(screen.getByText(/Bypassed/)).toBeInTheDocument();
        });
    });

    it('hides page header when embedded', () => {
        render(<ChatInterface clawId="my-claw" embedded />);
        expect(screen.queryByText('\ud83d\udcac Claw Agent Chat')).toBeNull();
    });

    it('shows error for provider issues', async () => {
        vi.mocked(api.sendChatMessage).mockResolvedValue({
            ok: false,
            response: 'LLM provider returned HTTP 401: Invalid API key',
            error: 'HTTP 401',
        });
        render(<ChatInterface />);
        await waitFor(() => {
            expect(screen.getAllByTestId('chat-claw-selector').length).toBeGreaterThan(0);
        });
    });
});
