// ClawDetail — Single claw detail view with tabs for overview, monitor, logs, config, and policy
import { useState, useEffect, useCallback } from 'react';
import { api, streamLogs } from '../../api/client';
import type { ClawInstance } from '../../api/client';
import { ClawMonitor } from './ClawMonitor';

interface Props { clawId: string; onNavigate?: (path: string) => void; }
type TabId = 'overview' | 'monitor' | 'logs' | 'config' | 'policy';

export function ClawDetail({ clawId, onNavigate }: Props) {
    const [claw, setClaw] = useState<ClawInstance | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [logLines, setLogLines] = useState<string[]>([]);
    const [logActive, setLogActive] = useState(false);
    const [configForm, setConfigForm] = useState({ provider: '', model: '', endpointUrl: '' });
    const [configSaving, setConfigSaving] = useState(false);
    const [connectCmd, setConnectCmd] = useState('');

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getClaw(clawId);
            if (data.ok && data.claw) { setClaw(data.claw); setConfigForm({ provider: data.claw.config?.provider || '', model: data.claw.config?.model || '', endpointUrl: data.claw.config?.endpointUrl || '' }); }
            else { setError('Claw not found'); }
        } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load claw'); }
        setLoading(false);
    }, [clawId]);

    useEffect(() => { refresh(); }, [refresh]);
    useEffect(() => {
        if (activeTab !== 'logs' || !claw) return;
        setLogActive(true);
        const stop = streamLogs(claw.sandboxName, (line) => setLogLines(prev => [...prev.slice(-500), line]), () => setLogActive(false));
        return () => { stop(); setLogActive(false); };
    }, [activeTab, claw]);

    const handleReconnect = async () => { try { const data = await api.reconnectClaw(clawId); if (data.ok) { setConnectCmd(data.connectCmd); refresh(); } } catch (err) { setError(err instanceof Error ? err.message : 'Reconnect failed'); } };
    const handleSaveConfig = async () => { setConfigSaving(true); try { await api.updateClawConfig(clawId, configForm); refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save config'); } setConfigSaving(false); };
    const statusColor = (s: string) => { if (s === 'running') return 'var(--nc-success, #4caf50)'; if (s === 'error') return 'var(--nc-danger, #f44336)'; if (s === 'creating') return 'var(--nc-warning, #ff9800)'; return 'var(--nc-text-muted, #888)'; };

    if (loading) return <div className="page-container"><p>Loading claw details...</p></div>;
    if (!claw) return <div className="page-container"><p>Claw not found.</p></div>;

    const tabs: { id: TabId; label: string; icon: string }[] = [
        { id: 'overview', label: 'Overview', icon: '📋' }, { id: 'monitor', label: 'Monitor', icon: '📊' },
        { id: 'logs', label: 'Logs', icon: '📜' }, { id: 'config', label: 'Config', icon: '⚙️' },
        { id: 'policy', label: 'Policy', icon: '🛡️' },
    ];

    return (
        <div className="page-container">
            <div className="page-header" style={{ marginBottom: 'var(--nc-spacing-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)' }}>
                    <button className="btn btn-sm" onClick={() => onNavigate?.('/claws')}>← Back</button>
                    <h2 style={{ margin: 0 }}>🐾 {claw.id}</h2>
                    <span className="badge" style={{ backgroundColor: statusColor(claw.status), color: '#fff', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem' }}>{claw.status}</span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--nc-spacing-sm)' }}>
                    <button className="btn btn-sm btn-primary" onClick={handleReconnect} disabled={claw.status !== 'running'}>🔗 Reconnect</button>
                    <button className="btn btn-sm" onClick={refresh}>🔄 Refresh</button>
                </div>
            </div>
            {error && <div className="alert alert-danger" style={{ marginBottom: 'var(--nc-spacing-md)' }}>{error}<button className="btn btn-sm" onClick={() => setError('')} style={{ marginLeft: 'auto' }}>✕</button></div>}
            {connectCmd && <div className="alert alert-info" style={{ marginBottom: 'var(--nc-spacing-md)' }}><strong>Connect command:</strong><code style={{ display: 'block', marginTop: '4px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>{connectCmd}</code></div>}
            <div style={{ display: 'flex', gap: '2px', marginBottom: 'var(--nc-spacing-lg)', borderBottom: '2px solid var(--nc-border, #333)' }}>
                {tabs.map(tab => <button key={tab.id} className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : ''}`} onClick={() => setActiveTab(tab.id)} data-testid={`tab-${tab.id}`} style={{ borderRadius: '8px 8px 0 0', borderBottom: activeTab === tab.id ? '2px solid var(--nc-primary, #76B900)' : 'none' }}>{tab.icon} {tab.label}</button>)}
            </div>
            {activeTab === 'overview' && (
                <div><div className="card" style={{ marginBottom: 'var(--nc-spacing-md)' }}><h3 style={{ marginTop: 0 }}>Instance Details</h3><table style={{ width: '100%', fontSize: '0.85rem' }}><tbody>
                    <tr><td style={{ fontWeight: 600, padding: '6px 12px 6px 0' }}>ID</td><td>{claw.id}</td></tr>
                    <tr><td style={{ fontWeight: 600, padding: '6px 12px 6px 0' }}>Sandbox</td><td>{claw.sandboxName}</td></tr>
                    <tr><td style={{ fontWeight: 600, padding: '6px 12px 6px 0' }}>Gateway</td><td>{claw.gatewayName}</td></tr>
                    <tr><td style={{ fontWeight: 600, padding: '6px 12px 6px 0' }}>Status</td><td>{claw.status} {claw.sandboxStatus ? `(${claw.sandboxStatus})` : ''}</td></tr>
                    <tr><td style={{ fontWeight: 600, padding: '6px 12px 6px 0' }}>Provider</td><td>{claw.config?.provider || '—'}</td></tr>
                    <tr><td style={{ fontWeight: 600, padding: '6px 12px 6px 0' }}>Model</td><td>{claw.config?.model || '—'}</td></tr>
                    <tr><td style={{ fontWeight: 600, padding: '6px 12px 6px 0' }}>Created</td><td>{new Date(claw.createdAt).toLocaleString()}</td></tr>
                    <tr><td style={{ fontWeight: 600, padding: '6px 12px 6px 0' }}>Last Connected</td><td>{claw.lastConnected ? new Date(claw.lastConnected).toLocaleString() : 'Never'}</td></tr>
                </tbody></table></div>
                {claw.detail && <div className="card"><h3 style={{ marginTop: 0 }}>Sandbox Detail</h3><pre style={{ fontSize: '0.75rem', overflow: 'auto', maxHeight: '300px', whiteSpace: 'pre-wrap' }}>{claw.detail}</pre></div>}
                </div>
            )}
            {activeTab === 'monitor' && <ClawMonitor clawId={clawId} />}
            {activeTab === 'logs' && (
                <div className="card"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--nc-spacing-sm)' }}><h3 style={{ margin: 0 }}>📜 Live Logs</h3>{logActive && <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Streaming</span>}</div>
                <div style={{ maxHeight: '400px', overflow: 'auto', background: '#0a0a14', padding: 'var(--nc-spacing-sm)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {logLines.length === 0 ? <div style={{ color: 'var(--nc-text-muted)' }}>Waiting for log data...</div> : logLines.map((line, i) => <div key={i} style={{ color: '#e0e0e0', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{line}</div>)}
                </div></div>
            )}
            {activeTab === 'config' && (
                <div className="card"><h3 style={{ marginTop: 0 }}>⚙️ Inference Configuration</h3>
                <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}><label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>Provider</label><input className="form-input" value={configForm.provider} onChange={e => setConfigForm(p => ({ ...p, provider: e.target.value }))} placeholder="e.g. cloud, ollama, openrouter" /></div>
                <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}><label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>Model</label><input className="form-input" value={configForm.model} onChange={e => setConfigForm(p => ({ ...p, model: e.target.value }))} placeholder="e.g. nvidia/nemotron-3-super-120b-a12b" /></div>
                <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}><label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>Endpoint URL</label><input className="form-input" value={configForm.endpointUrl} onChange={e => setConfigForm(p => ({ ...p, endpointUrl: e.target.value }))} placeholder="e.g. http://localhost:11434/v1" /></div>
                <button className="btn btn-primary" onClick={handleSaveConfig} disabled={configSaving}>{configSaving ? 'Saving...' : '💾 Save Config'}</button></div>
            )}
            {activeTab === 'policy' && (
                <div className="card"><h3 style={{ marginTop: 0 }}>🛡️ Policy Management</h3><p style={{ color: 'var(--nc-text-muted)', fontSize: '0.85rem' }}>Use the <a href="/policies" style={{ color: 'var(--nc-primary, #76B900)' }}>Policy Editor</a> page to manage policies for sandbox <strong>{claw.sandboxName}</strong>.</p></div>
            )}
        </div>
    );
}
