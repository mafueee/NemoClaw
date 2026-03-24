// ClawMonitor — Per-claw real-time monitoring panel with status, connection, and metrics
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

interface Props {
    clawId: string;
}

export function ClawMonitor({ clawId }: Props) {
    const [status, setStatus] = useState<{
        id: string;
        status: string;
        sandboxStatus: string;
        lastConnected: string;
        gatewayName?: string;
    } | null>(null);
    const [refreshCount, setRefreshCount] = useState(0);
    const ws = useWebSocket();

    const refresh = useCallback(async () => {
        try {
            const data = await api.getClawStatus(clawId);
            if (data.ok) setStatus(data);
        } catch { /* best effort */ }
    }, [clawId]);

    useEffect(() => { refresh(); }, [refresh, refreshCount]);

    // Auto-refresh every 5 seconds
    useEffect(() => {
        const timer = setInterval(() => setRefreshCount(c => c + 1), 5000);
        return () => clearInterval(timer);
    }, []);

    // Also update from WebSocket claw data
    useEffect(() => {
        const match = ws.claws.find(c => c.id === clawId);
        if (match) {
            setStatus(prev => ({
                ...prev,
                id: match.id,
                status: match.status,
                sandboxStatus: match.sandboxStatus || '',
                lastConnected: match.lastConnected || '',
                gatewayName: match.gatewayName,
            }));
        }
    }, [ws.claws, clawId]);

    const statusColor = (s: string) => {
        if (s === 'running') return '#4caf50';
        if (s === 'error') return '#f44336';
        if (s === 'creating') return '#ff9800';
        return '#888';
    };

    const uptime = status?.lastConnected
        ? `${Math.round((Date.now() - new Date(status.lastConnected).getTime()) / 60000)} min ago`
        : 'N/A';

    return (
        <div className="claw-monitor">
            <div className="monitor-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 'var(--nc-spacing-md)',
                marginBottom: 'var(--nc-spacing-lg)',
            }}>
                <div className="card monitor-tile" data-testid="monitor-status">
                    <div style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Status</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: statusColor(status?.status || 'unknown') }}>
                        {status?.status === 'running' ? '🟢' : status?.status === 'error' ? '🔴' : '⚪'}{' '}
                        {status?.status || 'Loading...'}
                    </div>
                </div>
                <div className="card monitor-tile" data-testid="monitor-sandbox">
                    <div style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Sandbox</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{status?.sandboxStatus || '—'}</div>
                </div>
                <div className="card monitor-tile" data-testid="monitor-gateway">
                    <div style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Gateway</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {ws.gateway?.healthy ? '🟢' : '🔴'} {status?.gatewayName || '—'}
                    </div>
                </div>
                <div className="card monitor-tile" data-testid="monitor-lastseen">
                    <div style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Last Connected</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{uptime}</div>
                </div>
            </div>
            <div className="card" style={{ marginBottom: 'var(--nc-spacing-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>Connection Health</h3>
                    <div style={{ display: 'flex', gap: 'var(--nc-spacing-sm)', alignItems: 'center' }}>
                        {ws.connected && <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>WS Connected</span>}
                        <span style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            backgroundColor: statusColor(status?.status || ''),
                            display: 'inline-block',
                            animation: status?.status === 'running' ? 'pulse 2s infinite' : 'none',
                        }} />
                    </div>
                </div>
                <div style={{ marginTop: 'var(--nc-spacing-sm)', fontSize: '0.8rem', color: 'var(--nc-text-secondary)' }}>
                    <div>🔗 WebSocket: {ws.connected ? 'Connected' : 'Disconnected'}</div>
                    <div>📡 Gateway health: {ws.gateway?.healthy ? 'Healthy' : 'Unhealthy'}</div>
                    <div>⏱️ Auto-refresh: Every 5 seconds</div>
                </div>
            </div>
        </div>
    );
}
