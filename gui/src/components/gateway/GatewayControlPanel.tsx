// NemoClaw — Gateway Control Panel (Global Banner)
//
// Renders a prominent full-width alert banner above all page content
// when the OpenShell gateway is not running. Provides one-click
// Start/Stop actions and auto-hides when the gateway becomes healthy.

import { useState, useCallback } from 'react';
import { api } from '../../api/client';
import type { GatewayStatus } from '../../api/client';

export interface GatewayControlPanelProps {
    gateway: GatewayStatus | null;
    onStatusChange?: () => void;
}

export function GatewayControlPanel({ gateway, onStatusChange }: GatewayControlPanelProps) {
    const [loading, setLoading] = useState(false);
    const [action, setAction] = useState<'starting' | 'stopping' | null>(null);
    const [message, setMessage] = useState('');

    const handleStart = useCallback(async () => {
        setLoading(true);
        setAction('starting');
        setMessage('');
        try {
            const result = await api.startGateway();
            setMessage(result.ok ? 'Gateway started successfully' : (result.message || 'Failed to start gateway'));
            if (result.ok) {
                onStatusChange?.();
            }
        } catch (err) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
            setAction(null);
            setTimeout(() => setMessage(''), 5000);
        }
    }, [onStatusChange]);

    const handleStop = useCallback(async () => {
        setLoading(true);
        setAction('stopping');
        setMessage('');
        try {
            const result = await api.stopGateway();
            setMessage(result.ok ? 'Gateway stopped' : (result.message || 'Failed to stop gateway'));
            onStatusChange?.();
        } catch (err) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
            setAction(null);
            setTimeout(() => setMessage(''), 5000);
        }
    }, [onStatusChange]);

    // Don't show the banner if gateway is healthy
    if (gateway?.healthy) return null;

    const isRunningButUnhealthy = gateway && !gateway.healthy && gateway.ok;

    return (
        <div className="gateway-banner fade-in" data-testid="gateway-banner">
            <div className="gateway-banner-content">
                <div className="gateway-banner-icon">
                    {loading ? (
                        <div className="loading-spinner" style={{ width: '28px', height: '28px' }}></div>
                    ) : (
                        <span className="gateway-banner-pulse">⚡</span>
                    )}
                </div>
                <div className="gateway-banner-text">
                    <strong>
                        {action === 'starting' ? 'Starting Gateway...' :
                         action === 'stopping' ? 'Stopping Gateway...' :
                         isRunningButUnhealthy ? 'Gateway Unhealthy' :
                         'OpenShell Gateway Offline'}
                    </strong>
                    <span className="gateway-banner-detail">
                        {action === 'starting' ? 'Waiting for the container to initialize...' :
                         action === 'stopping' ? 'Shutting down the gateway container...' :
                         isRunningButUnhealthy ? 'The gateway container is running but not responding to health checks.' :
                         'The gateway must be running to manage sandboxes, policies, and inference.'}
                    </span>
                    {message && (
                        <span className={`gateway-banner-message ${message.includes('Error') || message.includes('Failed') ? 'error' : 'success'}`}>
                            {message}
                        </span>
                    )}
                </div>
                <div className="gateway-banner-actions">
                    {!gateway?.healthy && (
                        <button
                            className="btn btn-primary"
                            onClick={handleStart}
                            disabled={loading}
                            data-testid="gateway-start-btn"
                        >
                            {action === 'starting' ? '⏳ Starting...' : '▶ Start Gateway'}
                        </button>
                    )}
                    {isRunningButUnhealthy && (
                        <button
                            className="btn btn-danger btn-sm"
                            onClick={handleStop}
                            disabled={loading}
                            data-testid="gateway-stop-btn"
                        >
                            ⏹ Stop
                        </button>
                    )}
                    <a href="/gateway" className="btn btn-secondary btn-sm" data-testid="gateway-details-link">
                        ⚙ Details
                    </a>
                </div>
            </div>
        </div>
    );
}
