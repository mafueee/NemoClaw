// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PortManager } from './PortManager';

vi.mock('../../api/client', async () => {
    const getPorts = vi.fn().mockResolvedValue({
        ports: { GATEWAY_PORT: 8080, DASHBOARD_PORT: 18789, GUI_PORT: 3000 },
        status: [
            { name: 'GATEWAY_PORT', port: 8080, available: true },
            { name: 'DASHBOARD_PORT', port: 18789, available: true },
            { name: 'VLLM_PORT', port: 8000, available: false, reason: 'In use' },
            { name: 'OLLAMA_PORT', port: 11434, available: true },
            { name: 'GUI_PORT', port: 3000, available: true },
        ],
    });
    return { api: { getPorts } };
});

const { api } = await import('../../api/client');

describe('PortManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getPorts).mockResolvedValue({
            ports: { GATEWAY_PORT: 8080, DASHBOARD_PORT: 18789, GUI_PORT: 3000 },
            status: [
                { name: 'GATEWAY_PORT', port: 8080, available: true },
                { name: 'DASHBOARD_PORT', port: 18789, available: true },
                { name: 'VLLM_PORT', port: 8000, available: false, reason: 'In use' },
                { name: 'OLLAMA_PORT', port: 11434, available: true },
                { name: 'GUI_PORT', port: 3000, available: true },
            ],
        });
    });

    it('renders the page header', () => {
        render(<PortManager />);
        expect(screen.getAllByText('🔌 Port Configuration').length).toBeGreaterThan(0);
    });

    it('renders the port table when loaded', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('Service').length).toBeGreaterThan(0);
        });
    });

    it('shows port numbers', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('8080').length).toBeGreaterThan(0);
            expect(screen.getAllByText('18789').length).toBeGreaterThan(0);
        });
    });

    it('shows port conflict status', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('Port conflicts detected').length).toBeGreaterThan(0);
        });
    });

    it('shows environment variable names', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('NEMOCLAW_GATEWAY_PORT').length).toBeGreaterThan(0);
        });
    });

    it('shows override instructions', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('Override Ports').length).toBeGreaterThan(0);
        });
    });

    it('has refresh button', () => {
        render(<PortManager />);
        expect(screen.getAllByText('🔄 Refresh').length).toBeGreaterThan(0);
    });
});
