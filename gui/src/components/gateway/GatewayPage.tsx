// NemoClaw — Gateway Management Page
//
// Full-page gateway lifecycle management with container details,
// health status, and start/stop/restart controls.

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { GatewayStatusDetailed } from '../../api/client';

export function GatewayPage() {
    const [status, setStatus] = useState<GatewayStatusDetailed | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const fetchStatus = useCallback(async () => {
        try {
            const data = await api.getGatewayStatus();
            setStatus(data as GatewayStatusDetailed);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch gateway status');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const handleAction = async (actionName: string, actionFn: () => Promise<{ ok: boolean; message?: string }>) => {
        setActionLoading(actionName);
        setMessage('');
        try {
            const result = await actionFn();
            setMessage(result.ok ? `Gateway ${actionName} successful` : (result.message || `Failed to ${actionName} gateway`));
            // Refresh status after action
            setTimeout(fetchStatus, 1000);
        } catch (err) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setActionLoading(null);
            setTimeout(() => setMessage(''), 5000);
        }
    };

    const handleStart = () => handleAction('start', api.startGateway);
    const handleStop = () => handleAction('stop', api.stopGateway);
    const handleRestart = async () => {
        setActionLoading('restart');
        setMessage('');
        try {
            await api.stopGateway();
            await new Promise(r => setTimeout(r, 2000));
            const result = await api.startGateway();
            setMessage(result.ok ? 'Gateway restarted successfully' : (result.message || 'Failed to restart gateway'));
            setTimeout(fetchStatus, 1000);
        } catch (err) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setActionLoading(null);
            setTimeout(() => setMessage(''), 5000);
        }
    };

    const isRunning = status?.running === true;
    const isHealthy = status?.healthy === true;

    return (
        <>
            <div className="page-header">
                <div>
                    <h2>⚡ Gateway Management</h2>
                    <p>OpenShell gateway lifecycle and health monitoring</p>
                </div>
            </div>
            <div className="page-body">
                {/* Status Banner */}
                <div className={`card fade-in gateway-status-card ${isHealthy ? 'gateway-healthy' : isRunning ? 'gateway-unhealthy' : 'gateway-stopped'}`}
                     style={{ marginBottom: 'var(--nc-spacing-xl)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-lg)', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '3rem', lineHeight: 1 }}>
                            {loading ? (
                                <div className="loading-spinner" style={{ width: '48px', height: '48px' }}></div>
                            ) : isHealthy ? '🟢' : isRunning ? '🟡' : '🔴'}
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--nc-spacing-xs)' }}>
                                {loading ? 'Checking...' :
                                 isHealthy ? 'Gateway Online' :
                                 isRunning ? 'Running (Unhealthy)' :
                                 status?.containerState === 'not-found' ? 'Not Installed' :
                                 'Gateway Offline'}
                            </h3>
                            <div style={{ color: 'var(--nc-text-secondary)', fontSize: '0.85rem' }}>
                                {isHealthy && status?.version && `Version ${status.version}`}
                                {isHealthy && status?.endpoint && ` · ${status.endpoint}`}
                                {!isHealthy && !isRunning && status?.containerState !== 'not-found' && 'Container exists but is stopped. Click Start to bring it up.'}
                                {status?.containerState === 'not-found' && 'No OpenShell container found. Run the installer first.'}
                            </div>
                        </div>
                        <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                            {!isRunning && status?.containerState !== 'not-found' && (
                                <button className="btn btn-primary"
                                    onClick={handleStart}
                                    disabled={!!actionLoading}
                                    data-testid="gw-start-btn">
                                    {actionLoading === 'start' ? '⏳ Starting...' : '▶ Start'}
                                </button>
                            )}
                            {isRunning && (
                                <>
                                    <button className="btn btn-danger"
                                        onClick={handleStop}
                                        disabled={!!actionLoading}
                                        data-testid="gw-stop-btn">
                                        {actionLoading === 'stop' ? '⏳ Stopping...' : '⏹ Stop'}
                                    </button>
                                    <button className="btn btn-secondary"
                                        onClick={handleRestart}
                                        disabled={!!actionLoading}
                                        data-testid="gw-restart-btn">
                                        {actionLoading === 'restart' ? '⏳ Restarting...' : '🔄 Restart'}
                                    </button>
                                </>
                            )}
                            <button className="btn btn-ghost" onClick={fetchStatus} disabled={loading}>
                                🔄 Refresh
                            </button>
                        </div>
                    </div>
                </div>

                {/* Message */}
                {message && (
                    <div className={`card fade-in`} style={{
                        marginBottom: 'var(--nc-spacing-md)',
                        padding: 'var(--nc-spacing-sm) var(--nc-spacing-md)',
                        borderColor: message.includes('Error') || message.includes('Failed') ? 'var(--nc-red)' : 'var(--nc-green)',
                    }}>
                        <span style={{
                            color: message.includes('Error') || message.includes('Failed') ? 'var(--nc-red)' : 'var(--nc-green)',
                            fontSize: '0.85rem',
                        }}>
                            {message}
                        </span>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="alert alert-danger fade-in" style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                        ⚠ {error}
                    </div>
                )}

                {/* Container Details */}
                {status && !loading && (
                    <div className="card-grid">
                        <div className="card fade-in">
                            <h4 style={{ fontSize: '0.85rem', color: 'var(--nc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--nc-spacing-md)' }}>
                                Container Info
                            </h4>
                            <div className="gateway-detail-grid">
                                <div className="gateway-detail-row">
                                    <span className="gateway-detail-label">State</span>
                                    <span className={`status-badge ${isRunning ? 'ready' : 'error'}`} data-testid="gw-state">
                                        <span className={`status-dot ${isRunning ? 'ready' : 'error'}`}></span>
                                        {status.containerState || 'unknown'}
                                    </span>
                                </div>
                                {status.containerName && (
                                    <div className="gateway-detail-row">
                                        <span className="gateway-detail-label">Name</span>
                                        <span className="gateway-detail-value" data-testid="gw-name">{status.containerName}</span>
                                    </div>
                                )}
                                {status.image && (
                                    <div className="gateway-detail-row">
                                        <span className="gateway-detail-label">Image</span>
                                        <code className="gateway-detail-value" style={{ fontSize: '0.8rem' }} data-testid="gw-image">{status.image}</code>
                                    </div>
                                )}
                                {status.containerId && (
                                    <div className="gateway-detail-row">
                                        <span className="gateway-detail-label">ID</span>
                                        <code className="gateway-detail-value" style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)' }}>
                                            {status.containerId?.slice(0, 12)}
                                        </code>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
                            <h4 style={{ fontSize: '0.85rem', color: 'var(--nc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--nc-spacing-md)' }}>
                                Health Check
                            </h4>
                            <div className="gateway-detail-grid">
                                <div className="gateway-detail-row">
                                    <span className="gateway-detail-label">Healthy</span>
                                    <span className={`status-badge ${isHealthy ? 'ready' : 'error'}`} data-testid="gw-health">
                                        <span className={`status-dot ${isHealthy ? 'ready' : 'error'}`}></span>
                                        {isHealthy ? 'Yes' : 'No'}
                                    </span>
                                </div>
                                {status.method && (
                                    <div className="gateway-detail-row">
                                        <span className="gateway-detail-label">Method</span>
                                        <span className="gateway-detail-value">{status.method}</span>
                                    </div>
                                )}
                                {status.endpoint && (
                                    <div className="gateway-detail-row">
                                        <span className="gateway-detail-label">Endpoint</span>
                                        <code className="gateway-detail-value" style={{ fontSize: '0.8rem' }}>{status.endpoint}</code>
                                    </div>
                                )}
                                {status.version && (
                                    <div className="gateway-detail-row">
                                        <span className="gateway-detail-label">Version</span>
                                        <span className="gateway-detail-value">{status.version}</span>
                                    </div>
                                )}
                                <div className="gateway-detail-row">
                                    <span className="gateway-detail-label">Source</span>
                                    <span className="gateway-detail-value">{status.source || 'docker'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
