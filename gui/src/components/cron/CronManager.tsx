/**
 * CronManager — Schedule and manage recurring agent tasks.
 */
import { useState, useEffect } from 'react';
import styles from './CronManager.module.css';

interface CronJob { id: string; schedule: string; command: string; description?: string; lastRun?: string; nextRun?: string; }

export function CronManager({ clawId }: { clawId: string }) {
    const [jobs, setJobs] = useState<CronJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({ schedule: '', command: '', description: '' });
    const [creating, setCreating] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const load = async () => {
        setLoading(true);
        try { const d = await (await fetch(`/api/sandbox/${clawId}/cron`)).json(); setJobs(d.jobs || d.items || []); setError(null); }
        catch (e: any) { setError(e.message); } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [clawId]);

    const create = async () => {
        if (!form.schedule.trim() || !form.command.trim()) return;
        setCreating(true);
        try {
            const d = await (await fetch(`/api/sandbox/${clawId}/cron`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })).json();
            if (!d.ok) throw new Error(d.error || 'Failed');
            setForm({ schedule: '', command: '', description: '' }); setShowForm(false); load();
        } catch (e: any) { setError(e.message); } finally { setCreating(false); }
    };
    const remove = async (id: string) => {
        if (!confirm('Delete this cron job?')) return;
        await fetch(`/api/sandbox/${clawId}/cron/${id}`, { method: 'DELETE' }); load();
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>⏰ Cron Scheduler</h2>
                <button className={styles.addBtn} onClick={() => setShowForm(s => !s)}>{showForm ? '✕ Cancel' : '+ New Job'}</button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            {showForm && (
                <div className={styles.form}>
                    <input className={styles.input} placeholder="Schedule (e.g. 0 * * * *)" value={form.schedule} onChange={e => setForm(f => ({...f, schedule: e.target.value}))} />
                    <input className={styles.input} placeholder="Command / prompt" value={form.command} onChange={e => setForm(f => ({...f, command: e.target.value}))} />
                    <input className={styles.input} placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
                    <button className={styles.createBtn} onClick={create} disabled={creating}>{creating ? 'Saving...' : 'Save Job'}</button>
                </div>
            )}
            {loading ? <div className={styles.loading}><div className={styles.spinner}/>Loading...</div> : jobs.length === 0 ? <div className={styles.empty}>No cron jobs scheduled</div> : (
                <table className={styles.table}>
                    <thead><tr><th>Schedule</th><th>Command</th><th>Next Run</th><th>Last Run</th><th></th></tr></thead>
                    <tbody>{jobs.map(j => (
                        <tr key={j.id}>
                            <td><code className={styles.code}>{j.schedule}</code></td>
                            <td className={styles.cmd}>{j.command}</td>
                            <td className={styles.ts}>{j.nextRun || '—'}</td>
                            <td className={styles.ts}>{j.lastRun || '—'}</td>
                            <td><button className={styles.delBtn} onClick={() => remove(j.id)}>✕</button></td>
                        </tr>
                    ))}</tbody>
                </table>
            )}
        </div>
    );
}
