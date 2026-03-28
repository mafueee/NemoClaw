/**
 * ApprovalsList — Real-time exec approval/denial queue for the active claw.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './ApprovalsList.module.css';

interface Approval {
    id: string; type: string; description: string;
    command?: string; url?: string;
    status: 'pending' | 'approved' | 'denied'; createdAt?: string;
}

export function ApprovalsList({ clawId }: { clawId: string }) {
    const [approvals, setApprovals] = useState<Approval[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchApprovals = useCallback(async () => {
        try {
            const res = await fetch(`/api/sandbox/${clawId}/approvals`);
            const data = await res.json();
            if (data.ok) { setApprovals(data.approvals || data.items || []); setError(null); }
        } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    }, [clawId]);

    useEffect(() => {
        fetchApprovals();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/api/sandbox/${clawId}/proxy`);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
            try { const msg = JSON.parse(ev.data); if (msg.type === 'event' && msg.event?.includes('approval')) fetchApprovals(); } catch {}
        };
        ws.onerror = () => setError('Gateway WebSocket error');
        pollRef.current = setInterval(fetchApprovals, 3000);
        return () => { ws.close(); if (pollRef.current) clearInterval(pollRef.current); };
    }, [clawId, fetchApprovals]);

    const act = async (id: string, action: 'approve' | 'deny') => {
        try { await fetch(`/api/sandbox/${clawId}/approvals/${id}/${action}`, { method: 'POST' }); fetchApprovals(); }
        catch (e: any) { setError(e.message); }
    };

    if (loading) return <div className={styles.loading}><div className={styles.spinner} />Loading approvals...</div>;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h2 className={styles.title}>
                    <span className={styles.icon}>🛡️</span> Exec Approvals
                    {approvals.filter(a => a.status === 'pending').length > 0 && (
                        <span className={styles.badge}>{approvals.filter(a => a.status === 'pending').length}</span>
                    )}
                </h2>
                <button className={styles.refresh} onClick={fetchApprovals}>↻</button>
            </header>
            {error && <div className={styles.error}>{error}</div>}
            {approvals.length === 0 ? (
                <div className={styles.empty}><span className={styles.emptyIcon}>✅</span><p>No pending approvals</p></div>
            ) : (
                <ul className={styles.list}>
                    {approvals.map(a => (
                        <li key={a.id} className={`${styles.item} ${styles[a.status]}`}>
                            <div className={styles.itemHeader}>
                                <span className={styles.type}>{a.type}</span>
                                <span className={`${styles.status} ${styles[`status_${a.status}`]}`}>{a.status}</span>
                            </div>
                            <p className={styles.description}>{a.description}</p>
                            {a.command && <code className={styles.code}>{a.command}</code>}
                            {a.url && <code className={styles.code}>{a.url}</code>}
                            {a.status === 'pending' && (
                                <div className={styles.actions}>
                                    <button className={styles.approveBtn} onClick={() => act(a.id, 'approve')}>✓ Approve</button>
                                    <button className={styles.denyBtn} onClick={() => act(a.id, 'deny')}>✗ Deny</button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
