import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { PortStatus } from '../../api/client';

export function PortManager() {
    const [ports, setPorts] = useState<Record<string, number>>({});
    const [status, setStatus] = useState<PortStatus[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        setLoading(true);
        try {
            const data = await api.getPorts();
            setPorts(data.ports);
            setStatus(data.status);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { refresh(); }, []);

    const envVarNames: Record<string, string> = {
        GATEWAY_PORT: 'NEMOCLAW_GATEWAY_PORT',
        DASHBOARD_PORT: 'NEMOCLAW_DASHBOARD_PORT',
        VLLM_PORT: 'NEMOCLAW_VLLM_PORT',
        OLLAMA_PORT: 'NEMOCLAW_OLLAMA_PORT',
        GUI_PORT: 'NEMOCLAW_GUI_PORT',
    };

    const labels: Record<string, string> = {
        GATEWAY_PORT: 'OpenShell Gateway',
        DASHBOARD_PORT: 'NemoClaw Dashboard',
        VLLM_PORT: 'vLLM Server',
        OLLAMA_PORT: 'Ollama Server',
        GUI_PORT: 'Web Dashboard',
    };

    const allOk = status.every(s => s.available);

    return (
        <>
            <div className="page-header">
                <h2>🔌 Port Configuration</h2>
                <p>Manage and monitor port assignments to avoid conflicts</p>
            </div>
            <div className="page-body">
                <div className={`card fade-in`} style={{
                    marginBottom: 'var(--nc-spacing-lg)',
                    borderColor: allOk ? 'rgba(118, 185, 0, 0.3)' : 'rgba(255, 165, 2, 0.3)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)' }}>
                        <span className={`status-dot ${allOk ? 'ready' : 'warning'}`}></span>
                        <span style={{ fontWeight: 600 }}>
                            {allOk ? 'All ports available — no conflicts detected' : 'Port conflicts detected'}
                        </span>
                    </div>
                </div>

                <div className="card fade-in">
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--nc-spacing-lg)' }}>
                            <div className="loading-spinner"></div>
                        </div>
                    ) : (
                        <div className="port-table-wrapper">
                            <table className="port-table">
                                <thead>
                                    <tr>
                                        <th>Service</th>
                                        <th>Port</th>
                                        <th>Status</th>
                                        <th>Environment Variable</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {status.map((ps) => (
                                        <tr key={ps.name} className="fade-in">
                                            <td style={{ fontWeight: 500 }}>{labels[ps.name] || ps.name}</td>
                                            <td><span className="port-number">{ps.port}</span></td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span className={`status-dot ${ps.available ? 'ready' : 'error'}`}></span>
                                                    <span style={{ fontSize: '0.8rem', color: ps.available ? 'var(--nc-green)' : 'var(--nc-red)' }}>
                                                        {ps.available ? 'Available' : ps.reason || 'In use'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <code style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)' }}>
                                                    {envVarNames[ps.name] || '—'}
                                                </code>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="card fade-in" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                    <h4 style={{ marginBottom: 'var(--nc-spacing-sm)' }}>Override Ports</h4>
                    <p style={{ color: 'var(--nc-text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--nc-spacing-md)' }}>
                        Set environment variables to override default port assignments:
                    </p>
                    <div className="log-viewer" style={{ maxHeight: '200px' }}>
                        {Object.entries(envVarNames).map(([key, envVar]) => (
                            <div key={key} className="log-line">
                                <span style={{ color: 'var(--nc-green)' }}>export</span>{' '}
                                <span style={{ color: 'var(--nc-cyan)' }}>{envVar}</span>=
                                <span style={{ color: 'var(--nc-amber)' }}>{ports[key] || 'PORT'}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ marginTop: 'var(--nc-spacing-md)' }}>
                    <button className="btn btn-secondary" onClick={refresh}>🔄 Refresh</button>
                </div>
            </div>
        </>
    );
}
