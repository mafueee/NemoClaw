// ClawList — Overview of all claw instances with status badges and quick actions
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { ClawInstance } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export function ClawList({ onNavigate }: { onNavigate?: (path: string) => void }) {
    const [claws, setClaws] = useState<ClawInstance[]>([]);
    const [filter, setFilter] = useState<string>('all');
    const [syncing, setSyncing] = useState(false);
    const [confirmDestroy, setConfirmDestroy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const ws = useWebSocket();

    const refresh = useCallback(async () => {
        try {
            const data = await api.listClaws();
            if (data.ok) setClaws(data.claws);
        } catch { /* best effort */ }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);
    useEffect(() => { if (ws.claws.length > 0) setClaws(ws.claws); }, [ws.claws]);

    const handleSync = async () => { setSyncing(true); try { const data = await api.syncClaws(); if (data.ok) setClaws(data.claws); } catch {} setSyncing(false); };
    const handleDestroy = async (id: string) => { try { await api.destroyClaw(id); setConfirmDestroy(null); refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); } };
    const handleReconnect = async (id: string) => { try { const data = await api.reconnectClaw(id); if (data.ok && data.connectCmd) { setError(''); alert(`Run:\n\n${data.connectCmd}`); } } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); } };

    const filtered = filter === 'all' ? claws : claws.filter(c => c.status === filter);
    const statusColor = (s: string) => { switch (s) { case 'running': return 'var(--nc-success, #4caf50)'; case 'creating': return 'var(--nc-warning, #ff9800)'; case 'error': return 'var(--nc-danger, #f44336)'; default: return 'var(--nc-text-muted, #888)'; } };
    const statusEmoji = (s: string) => { switch (s) { case 'running': return '🟢'; case 'creating': return '🟡'; case 'error': return '🔴'; case 'stopped': return '⚫'; default: return '⚪'; } };
    const counts = { all: claws.length, running: claws.filter(c => c.status === 'running').length, stopped: claws.filter(c => c.status === 'stopped').length, error: claws.filter(c => c.status === 'error').length };

    return (
        <div className="page-container">
            <div className="page-header">
                <h2>🐾 Claws</h2>
                <div style={{ display: 'flex', gap: 'var(--nc-spacing-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                    {ws.connected && <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Live</span>}
                    <button className="btn btn-sm" onClick={handleSync} disabled={syncing}>{syncing ? '⏳ Syncing...' : '🔄 Sync'}</button>
                    <button className="btn btn-sm" onClick={refresh}>🔄 Refresh</button>
                    <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('/claws/new')}>+ New Claw</button>
                </div>
            </div>
            {error && <div className="alert alert-danger" style={{ marginBottom: 'var(--nc-spacing-md)' }}>{error}<button className="btn btn-sm" onClick={() => setError('')} style={{ marginLeft: 'auto' }}>✕</button></div>}
            <div style={{ display: 'flex', gap: 'var(--nc-spacing-sm)', marginBottom: 'var(--nc-spacing-lg)', flexWrap: 'wrap' }}>
                {(['all', 'running', 'stopped', 'error'] as const).map(f => <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>{f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})</button>)}
            </div>
            {filtered.length === 0 ? (
                <div className="empty-state"><div style={{ fontSize: '3rem', marginBottom: 'var(--nc-spacing-md)' }}>🐾</div><p>No claws found{filter !== 'all' ? ` with status "${filter}"` : ''}.</p><p style={{ color: 'var(--nc-text-muted)' }}>Click "New Claw" to create one, or "Sync" to discover existing sandboxes.</p></div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--nc-spacing-md)' }}>
                    {filtered.map(claw => (
                        <div key={claw.id} className="card claw-card" style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }} onClick={() => onNavigate?.(`/claws/${claw.id}`)} data-testid={`claw-card-${claw.id}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--nc-spacing-sm)' }}>
                                <div><h3 style={{ margin: 0, fontSize: '1.1rem' }}>{claw.id}</h3><div style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)', marginTop: '2px' }}>Gateway: {claw.gatewayName}</div></div>
                                <span className="badge" style={{ backgroundColor: statusColor(claw.status), color: '#fff', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px' }}>{statusEmoji(claw.status)} {claw.status}</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-sm)' }}>
                                {claw.config?.provider && <div>🧠 {claw.config.provider}{claw.config.model ? ` / ${claw.config.model}` : ''}</div>}
                                <div>📅 Created: {new Date(claw.createdAt).toLocaleDateString()}</div>
                                {claw.lastConnected && <div>🔗 Last connected: {new Date(claw.lastConnected).toLocaleString()}</div>}
                                {claw.discovered && <div style={{ color: 'var(--nc-warning, #ff9800)' }}>⚡ Auto-discovered</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--nc-spacing-xs)', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                                <button className="btn btn-sm" onClick={() => handleReconnect(claw.id)} disabled={claw.status !== 'running'}>🔗 Connect</button>
                                <button className="btn btn-sm" onClick={() => onNavigate?.(`/claws/${claw.id}`)}>👁️ View</button>
                                {confirmDestroy === claw.id ? (
                                    <><button className="btn btn-sm btn-danger" data-testid="confirm-destroy-claw" onClick={() => handleDestroy(claw.id)}>Confirm</button><button className="btn btn-sm" data-testid="cancel-destroy-claw" onClick={() => setConfirmDestroy(null)}>Cancel</button></>
                                ) : (
                                    <button className="btn btn-sm btn-danger" data-testid={`destroy-claw-${claw.id}`} onClick={() => setConfirmDestroy(claw.id)}>🗑️ Destroy</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
