import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { Sandbox } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export function DashboardPage() {
    const { connected, sandboxes: wsSandboxes, gateway } = useWebSocket();
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatedNames, setUpdatedNames] = useState<Set<string>>(new Set());
    const [gatewayLoading, setGatewayLoading] = useState(false);
    const [gatewayMessage, setGatewayMessage] = useState('');

    // Sync WebSocket sandbox data into local state
    useEffect(() => {
        if (wsSandboxes.length > 0) {
            setSandboxes((prev) => {
                // Detect which sandboxes changed status
                const changed = new Set<string>();
                for (const sb of wsSandboxes) {
                    const old = prev.find((p) => p.name === sb.name);
                    if (old && old.status !== sb.status) {
                        changed.add(sb.name);
                    }
                }
                if (changed.size > 0) {
                    setUpdatedNames(changed);
                    setTimeout(() => setUpdatedNames(new Set()), 1500);
                }
                return wsSandboxes;
            });
            setLoading(false);
        }
    }, [wsSandboxes]);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const sbData = await api.listSandboxes();
            setSandboxes(sbData.sandboxes);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial REST load as fallback
    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleGatewayToggle = async () => {
        setGatewayLoading(true);
        setGatewayMessage('');
        try {
            if (gateway?.healthy) {
                const result = await api.stopGateway();
                setGatewayMessage(result.ok ? 'Gateway stopped' : 'Failed to stop gateway');
            } else {
                const result = await api.startGateway();
                setGatewayMessage(result.ok ? 'Gateway started' : 'Failed to start gateway');
            }
        } catch (err) {
            setGatewayMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
        setGatewayLoading(false);
        // Clear message after 3s
        setTimeout(() => setGatewayMessage(''), 3000);
    };

    const readySandboxes = sandboxes.filter(s => s.status === 'Ready');

    return (
        <>
            <div className="page-header">
                <h2>Dashboard</h2>
                <p>NemoClaw sandbox overview and system health</p>
            </div>
            <div className="page-body">
                {/* Stats Row */}
                <div className="stats-row fade-in">
                    <div className="stat-card">
                        <div className="stat-value">{sandboxes.length}</div>
                        <div className="stat-label">Total Sandboxes</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{ color: readySandboxes.length > 0 ? 'var(--nc-green)' : 'var(--nc-text-muted)' }}>
                            {readySandboxes.length}
                        </div>
                        <div className="stat-label">Ready</div>
                    </div>
                    <div className="stat-card" style={{ cursor: 'pointer' }} onClick={!gatewayLoading ? handleGatewayToggle : undefined}>
                        <div className="stat-value" style={{ color: gateway?.healthy ? 'var(--nc-green)' : 'var(--nc-red)' }}>
                            {gatewayLoading ? (
                                <div className="loading-spinner" style={{ width: '24px', height: '24px' }}></div>
                            ) : gateway?.healthy ? '●' : '○'}
                        </div>
                        <div className="stat-label">Gateway</div>
                        <button
                            className={`btn btn-sm ${gateway?.healthy ? 'btn-danger' : 'btn-primary'}`}
                            style={{ marginTop: 'var(--nc-spacing-xs)', fontSize: '0.7rem', padding: '2px 8px' }}
                            onClick={(e) => { e.stopPropagation(); handleGatewayToggle(); }}
                            disabled={gatewayLoading}
                            data-testid="gateway-toggle-btn"
                        >
                            {gatewayLoading ? '...' : gateway?.healthy ? 'Stop' : 'Start'}
                        </button>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{ color: connected ? 'var(--nc-cyan)' : 'var(--nc-text-muted)' }}>
                            {connected ? '🔔' : '○'}
                        </div>
                        <div className="stat-label">Live Updates</div>
                    </div>
                </div>

                {/* Gateway message */}
                {gatewayMessage && (
                    <div className="card fade-in" style={{
                        marginBottom: 'var(--nc-spacing-md)',
                        padding: 'var(--nc-spacing-sm) var(--nc-spacing-md)',
                        borderColor: gatewayMessage.includes('Error') || gatewayMessage.includes('Failed') ? 'var(--nc-red)' : 'var(--nc-green)',
                    }}>
                        <span style={{
                            color: gatewayMessage.includes('Error') || gatewayMessage.includes('Failed') ? 'var(--nc-red)' : 'var(--nc-green)',
                            fontSize: '0.85rem',
                        }}>
                            {gatewayMessage}
                        </span>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="card fade-in" style={{ borderColor: 'var(--nc-red)', marginBottom: 'var(--nc-spacing-lg)' }}>
                        <div style={{ color: 'var(--nc-red)' }}>⚠ {error}</div>
                    </div>
                )}

                {/* Quick Actions */}
                <div style={{ marginBottom: 'var(--nc-spacing-xl)' }}>
                    <h3 style={{ marginBottom: 'var(--nc-spacing-md)', fontSize: '1rem' }}>Quick Actions</h3>
                    <div className="btn-group">
                        <a href="/onboard" className="btn btn-primary">🚀 New Sandbox</a>
                        <button className="btn btn-secondary" onClick={refresh}>🔄 Refresh</button>
                        <a href="/ports" className="btn btn-secondary">🔌 Port Config</a>
                    </div>
                </div>

                {/* Sandbox Cards */}
                <h3 style={{ marginBottom: 'var(--nc-spacing-md)', fontSize: '1rem' }}>Sandboxes</h3>
                {sandboxes.length === 0 && !loading ? (
                    <div className="card fade-in" style={{ textAlign: 'center', padding: 'var(--nc-spacing-2xl)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 'var(--nc-spacing-md)' }}>📦</div>
                        <h3 style={{ marginBottom: 'var(--nc-spacing-sm)' }}>No Sandboxes Yet</h3>
                        <p style={{ color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-lg)' }}>
                            Get started by onboarding your first sandbox
                        </p>
                        <a href="/onboard" className="btn btn-primary">🚀 Onboard Now</a>
                    </div>
                ) : (
                    <div className="card-grid">
                        {sandboxes.map((sb, idx) => (
                            <div key={sb.name}
                                className={`card fade-in ${updatedNames.has(sb.name) ? 'status-updated' : ''}`}
                                style={{ animationDelay: `${idx * 0.1}s` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--nc-spacing-md)' }}>
                                    <div>
                                        <div className="card-title">{sb.name}</div>
                                        <div className="card-subtitle">{sb.image}</div>
                                    </div>
                                    <span className={`status-badge ${sb.status === 'Ready' ? 'ready' : sb.status === 'NotReady' ? 'starting' : 'error'}`}>
                                        <span className={`status-dot ${sb.status === 'Ready' ? 'ready' : sb.status === 'NotReady' ? 'warning' : 'error'}`}></span>
                                        {sb.status}
                                    </span>
                                </div>

                                <div style={{ fontSize: '0.8rem', color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-md)' }}>
                                    Created: {sb.created || 'unknown'}
                                </div>

                                <div className="btn-group">
                                    <a href={`/chat`} className="btn btn-primary btn-sm">💬 Chat</a>
                                    <a href={`/logs`} className="btn btn-secondary btn-sm">📋 Logs</a>
                                    <button className="btn btn-ghost btn-sm"
                                        onClick={async () => {
                                            await api.stopSandbox(sb.name);
                                            refresh();
                                        }}>
                                        ⏹ Stop
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--nc-spacing-2xl)' }}>
                        <div className="loading-spinner"></div>
                    </div>
                )}
            </div>
        </>
    );
}
