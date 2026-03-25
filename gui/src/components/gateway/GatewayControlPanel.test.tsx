// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GatewayControlPanel } from './GatewayControlPanel';

vi.mock('../../api/client', async () => {
    const startGateway = vi.fn().mockResolvedValue({ ok: true, healthy: true, message: 'Started' });
    const stopGateway = vi.fn().mockResolvedValue({ ok: true, message: 'Stopped' });
    return { api: { startGateway, stopGateway } };
});

const { api } = await import('../../api/client');

describe('GatewayControlPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('renders nothing when gateway is healthy', () => {
        const { container } = render(
            <GatewayControlPanel gateway={{ healthy: true, ok: true, output: '' }} />
        );
        expect(container.innerHTML).toBe('');
    });

    it('renders the banner when gateway is not healthy', () => {
        render(
            <GatewayControlPanel gateway={{ healthy: false, ok: false, output: '' }} />
        );
        expect(screen.getByTestId('gateway-banner')).toBeInTheDocument();
        expect(screen.getByText('OpenShell Gateway Offline')).toBeInTheDocument();
    });

    it('renders the banner when gateway is null', () => {
        render(<GatewayControlPanel gateway={null} />);
        expect(screen.getByTestId('gateway-banner')).toBeInTheDocument();
    });

    it('shows Start Gateway button', () => {
        render(
            <GatewayControlPanel gateway={{ healthy: false, ok: false, output: '' }} />
        );
        const btn = screen.getByTestId('gateway-start-btn');
        expect(btn).toBeInTheDocument();
        expect(btn.textContent).toContain('Start Gateway');
    });

    it('calls startGateway when Start is clicked', async () => {
        const user = userEvent.setup();
        render(
            <GatewayControlPanel gateway={{ healthy: false, ok: false, output: '' }} />
        );
        await user.click(screen.getByTestId('gateway-start-btn'));
        expect(api.startGateway).toHaveBeenCalled();
    });

    it('shows Details link to /gateway', () => {
        render(
            <GatewayControlPanel gateway={{ healthy: false, ok: false, output: '' }} />
        );
        const link = screen.getByTestId('gateway-details-link');
        expect(link).toBeInTheDocument();
        expect(link.getAttribute('href')).toBe('/gateway');
    });

    it('shows explanatory text about why gateway matters', () => {
        render(
            <GatewayControlPanel gateway={{ healthy: false, ok: false, output: '' }} />
        );
        expect(screen.getByText(/gateway must be running/i)).toBeInTheDocument();
    });

    it('fires onStatusChange callback after successful start', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <GatewayControlPanel
                gateway={{ healthy: false, ok: false, output: '' }}
                onStatusChange={onChange}
            />
        );
        await user.click(screen.getByTestId('gateway-start-btn'));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
    });
});
