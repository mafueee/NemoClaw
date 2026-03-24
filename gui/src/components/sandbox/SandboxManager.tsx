import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { Sandbox } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export function SandboxManager() {
    const { sandboxes: wsSandboxes, connected } = useWebSocket();
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSandbox, setSelectedSandbox] = useState<string | null>(null);
    const [sandboxDetail, setSandboxDetail] = useState<string>('');

    useEffect(() => {
        if (wsSandboxes.length > 0) {
            setSandboxes(wsSandboxes);
            setLoading(false);
        }
    }, [wsSandboxes]);

    const refresh = async () => {
        setLoading(true);
        try {
            const data = await api.listSandboxes();
            setSandboxes(data.sandboxes);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { refresh(); }, []);

    const showDetail = async (name: string) => {
        setSelectedSandbox(name);
        try {
            const data = await api.getSandboxStatus(name);
            setSandboxDetail(data.output || 'No details available');
        } catch {
            setSandboxDetail('Failed to fetch sandbox details');
        }
    };

    return (
        <>
            <div className="page-header">
                <h2>📦 Sandboxes</h2>
                <p>Manage your NemoClaw sandboxes</p>
            </div>
            <div className="page-body">
                <div className="btn-group" style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                    <a href="/onboard" className="btn btn-primary">+ New Sandbox</a>
                    <button className="btn btn-secondary" onClick={refresh}>🔄 Refresh</button>
                    {connected && (
                        <span className="status-badge ready" style={{ alignSelf: 'center' }}>
                            <span className="status-dot ready"></span>
                            Live
                        </span>
                    )}
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--nc-spacing-2xl)' }}>
                        <div className="loading-spinner"></div>
                    </div>
                ) : sandboxes.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: 'var(--nc-spacing-2xl)' }}>
                        <p style={{ color: 'var(--nc-text-secondary)' }}>No sandboxes found. Create one with the onboard wizard.</p>
                    </div>
                ) : (
                    <div className="sandbox-detail-layout">
                        <div className="sandbox-list-col">
                            {sandboxes.map((sb, idx) => (
                                <div key={sb.name}
                                    className={`card fade-in`}
                                    style={{
                                        marginBottom: 'var(--nc-spacing-sm)',
                                        cursor: 'pointer',
                                        borderColor: selectedSandbox === sb.name ? 'var(--nc-border-active)' : undefined,
                                        animationDelay: `${idx * 0.05}s`,
                                    }}
                                    onClick={() => showDetail(sb.name)}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)' }}>
                                            <span className={`status-dot ${sb.status === 'Ready' ? 'ready' : 'warning'}`}></span>
                                            <span style={{ fontWeight: 600 }}>{sb.name}</span>
                                        </div>
                                        <span className={`status-badge ${sb.status === 'Ready' ? 'ready' : 'starting'}`}>
                                            {sb.status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--nc-text-secondary)', marginTop: 'var(--nc-spacing-xs)' }}>
                                        {sb.image}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {selectedSandbox && (
                            <div className="sandbox-detail-col fade-in">
                                <div className="card">
                                    <h3 style={{ marginBottom: 'var(--nc-spacing-md)' }}>{selectedSandbox}</h3>
                                    <div className="btn-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}>
                                        <a href="/chat" className="btn btn-primary btn-sm">💬 Chat</a>
                                        <a href="/logs" className="btn btn-secondary btn-sm">📋 Logs</a>
                                        <button className="btn btn-danger btn-sm" onClick={async () => {
                                            if (confirm(`Stop sandbox '${selectedSandbox}'?`)) {
                                                await api.stopSandbox(selectedSandbox);
                                                refresh();
                                            }
                                        }}>⏹ Stop</button>
                                    </div>
                                    <div className="log-viewer">
                                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{sandboxDetail}</pre>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
