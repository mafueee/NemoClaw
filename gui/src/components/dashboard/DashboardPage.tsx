import { useState, useEffect, useCallback } from 'react';
import { api, createWebSocket } from '../../api/client';
import type { Sandbox, GatewayStatus } from '../../api/client';

export function DashboardPage() {
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [gateway, setGateway] = useState<GatewayStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const [sbData, gwData] = await Promise.all([
                api.listSandboxes(),
                api.getGatewayStatus(),
            ]);
            setSandboxes(sbData.sandboxes);
            setGateway(gwData);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();

        // WebSocket for real-time updates
        const ws = createWebSocket((data: any) => {
            if (data.type === 'status' && data.gateway) {
                setGateway((prev) => prev ? { ...prev, healthy: data.gateway.healthy } : prev);
            }
        });

        return () => ws.close();
    }, [refresh]);

    const readySandboxes = sandboxes.filter(s => s.status === 'Ready');
    const notReadySandboxes = sandboxes.filter(s => s.status !== 'Ready');

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
                    <div className="stat-card">
                        <div className="stat-value" style={{ color: gateway?.healthy ? 'var(--nc-green)' : 'var(--nc-red)' }}>
                            {gateway?.healthy ? '●' : '○'}
                        </div>
                        <div className="stat-label">Gateway</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{ color: 'var(--nc-cyan)' }}>
                            {loading ? '...' : '✓'}
                        </div>
                        <div className="stat-label">API Server</div>
                    </div>
                </div>

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
                            <div key={sb.name} className="card fade-in" style={{ animationDelay: `${idx * 0.1}s` }}>
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
