// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortManager } from './PortManager';

const mockGetPorts = vi.fn();
const mockUpdatePorts = vi.fn();
const mockResetPorts = vi.fn();
const mockAutoResolvePorts = vi.fn();

vi.mock('../../api/client', async () => {
    return {
        api: {
            getPorts: (...args: unknown[]) => mockGetPorts(...args),
            updatePorts: (...args: unknown[]) => mockUpdatePorts(...args),
            resetPorts: (...args: unknown[]) => mockResetPorts(...args),
            autoResolvePorts: (...args: unknown[]) => mockAutoResolvePorts(...args),
        },
    };
});

const DEFAULT_DATA = {
    ports: {
        GATEWAY_PORT: 8080,
        DASHBOARD_PORT: 18789,
        VLLM_PORT: 8000,
        OLLAMA_PORT: 11434,
        GUI_PORT: 3000,
    },
    status: [
        { name: 'GATEWAY_PORT', port: 8080, available: true },
        { name: 'DASHBOARD_PORT', port: 18789, available: true },
        { name: 'VLLM_PORT', port: 8000, available: false, reason: 'In use' },
        { name: 'OLLAMA_PORT', port: 11434, available: true },
        { name: 'GUI_PORT', port: 3000, available: true },
    ],
    sources: [
        { name: 'GATEWAY_PORT', port: 8080, source: 'default' },
        { name: 'DASHBOARD_PORT', port: 18789, source: 'default' },
        { name: 'VLLM_PORT', port: 8000, source: 'default' },
        { name: 'OLLAMA_PORT', port: 11434, source: 'default' },
        { name: 'GUI_PORT', port: 3000, source: 'config' },
    ],
};

describe('PortManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetPorts.mockResolvedValue(DEFAULT_DATA);
        mockUpdatePorts.mockResolvedValue({ ok: true, ports: DEFAULT_DATA.ports, sources: DEFAULT_DATA.sources });
        mockResetPorts.mockResolvedValue({ ok: true, ports: DEFAULT_DATA.ports, sources: DEFAULT_DATA.sources });
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

    it('shows port input fields', async () => {
        render(<PortManager />);
        await waitFor(() => {
            const inputs = screen.getAllByRole('spinbutton');
            expect(inputs.length).toBeGreaterThan(0);
        });
    });

    it('shows source badges', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('default').length).toBeGreaterThan(0);
            expect(screen.getAllByText('config').length).toBeGreaterThan(0);
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

    it('has save, reset and refresh buttons', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('💾 Save Ports').length).toBeGreaterThan(0);
            expect(screen.getAllByText('🔄 Reset to Defaults').length).toBeGreaterThan(0);
            expect(screen.getAllByText('🔃 Refresh').length).toBeGreaterThan(0);
        });
    });

    it('shows auto-resolve button when conflicts exist', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('⚡ Auto-Resolve Conflicts').length).toBeGreaterThan(0);
        });
    });

    it('marks dirty when a port is changed', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0);
        });
        const input = screen.getAllByRole('spinbutton')[0];
        fireEvent.change(input, { target: { value: '9090' } });
        await waitFor(() => {
            expect(screen.getByText('You have unsaved changes')).toBeDefined();
        });
    });

    it('calls updatePorts on save', async () => {
        const user = userEvent.setup();
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0);
        });
        // Change a port to make dirty
        const input = screen.getAllByRole('spinbutton')[0];
        fireEvent.change(input, { target: { value: '9090' } });
        // Click save
        const saveBtns = screen.getAllByText('💾 Save Ports');
        await user.click(saveBtns[0]);
        expect(mockUpdatePorts).toHaveBeenCalled();
    });

    it('calls resetPorts on reset', async () => {
        const user = userEvent.setup();
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('🔄 Reset to Defaults').length).toBeGreaterThan(0);
        });
        const resetBtns = screen.getAllByText('🔄 Reset to Defaults');
        await user.click(resetBtns[0]);
        expect(mockResetPorts).toHaveBeenCalled();
    });

    it('shows port priority help section', async () => {
        render(<PortManager />);
        await waitFor(() => {
            expect(screen.getAllByText('ℹ️ Port Priority').length).toBeGreaterThan(0);
        });
    });
});
