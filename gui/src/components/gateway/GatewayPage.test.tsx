// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GatewayPage } from './GatewayPage';

vi.mock('../../api/client', async () => {
    const getGatewayStatus = vi.fn().mockResolvedValue({
        healthy: true,
        running: true,
        version: '1.2.3',
        method: 'grpc',
        endpoint: 'localhost:50051',
        containerState: 'running',
        containerName: 'openshell',
        containerId: 'abc123def456',
        image: 'nvcr.io/nvidia/openshell:latest',
        configured: true,
        source: 'docker',
    });
    const startGateway = vi.fn().mockResolvedValue({ ok: true, healthy: true, message: 'Started' });
    const stopGateway = vi.fn().mockResolvedValue({ ok: true, message: 'Stopped' });
    return { api: { getGatewayStatus, startGateway, stopGateway } };
});

const { api } = await import('../../api/client');

describe('GatewayPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('renders the page title', () => {
        render(<GatewayPage />);
        expect(screen.getByText(/Gateway Management/)).toBeInTheDocument();
    });

    it('fetches and displays gateway status', async () => {
        render(<GatewayPage />);
        await waitFor(() => {
            expect(screen.getByText('Gateway Online')).toBeInTheDocument();
        });
        expect(api.getGatewayStatus).toHaveBeenCalled();
    });

    it('shows container details when running', async () => {
        render(<GatewayPage />);
        await waitFor(() => {
            expect(screen.getByTestId('gw-name')).toHaveTextContent('openshell');
        });
        expect(screen.getByTestId('gw-health')).toHaveTextContent('Yes');
    });

    it('shows Stop and Restart buttons when running', async () => {
        render(<GatewayPage />);
        await waitFor(() => {
            expect(screen.getByTestId('gw-stop-btn')).toBeInTheDocument();
        });
        expect(screen.getByTestId('gw-restart-btn')).toBeInTheDocument();
    });

    it('calls stopGateway when Stop is clicked', async () => {
        const user = userEvent.setup();
        render(<GatewayPage />);
        await waitFor(() => {
            expect(screen.getByTestId('gw-stop-btn')).toBeInTheDocument();
        });
        await user.click(screen.getByTestId('gw-stop-btn'));
        expect(api.stopGateway).toHaveBeenCalled();
    });

    it('shows Start button when gateway is stopped', async () => {
        vi.mocked(api.getGatewayStatus).mockResolvedValueOnce({
            healthy: false,
            running: false,
            version: '',
            method: '',
            endpoint: '',
            containerState: 'exited',
            containerName: 'openshell',
            containerId: 'abc123',
            image: 'nvcr.io/nvidia/openshell:latest',
            configured: true,
            source: 'docker',
        } as any);

        render(<GatewayPage />);
        await waitFor(() => {
            expect(screen.getByTestId('gw-start-btn')).toBeInTheDocument();
        });
    });

    it('shows Gateway Offline when stopped', async () => {
        vi.mocked(api.getGatewayStatus).mockResolvedValueOnce({
            healthy: false,
            running: false,
            containerState: 'exited',
            containerName: 'openshell',
            image: 'nvcr.io/nvidia/openshell:latest',
            configured: true,
            source: 'docker',
        } as any);

        render(<GatewayPage />);
        await waitFor(() => {
            expect(screen.getByText('Gateway Offline')).toBeInTheDocument();
        });
    });
});
