/**
 * PluginManager — Install, enable/disable, and remove OpenClaw plugins.
 */
import { useState, useEffect } from 'react';
import styles from './PluginManager.module.css';

interface Plugin { name: string; description?: string; version?: string; enabled: boolean; }

export function PluginManager({ clawId }: { clawId: string }) {
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [installPkg, setInstallPkg] = useState('');
    const [installing, setInstalling] = useState(false);

    const load = async () => {
        setLoading(true);
        try { const d = await (await fetch(`/api/sandbox/${clawId}/plugins`)).json(); setPlugins(d.plugins || d.items || []); setError(null); }
        catch (e: any) { setError(e.message); } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [clawId]);

    const toggle = async (name: string, enabled: boolean) => {
        await fetch(`/api/sandbox/${clawId}/plugins/${name}/${enabled ? 'disable' : 'enable'}`, { method: 'POST' }); load();
    };
    const remove = async (name: string) => {
        if (!confirm(`Remove plugin "${name}"?`)) return;
        await fetch(`/api/sandbox/${clawId}/plugins/${name}`, { method: 'DELETE' }); load();
    };
    const install = async () => {
        if (!installPkg.trim()) return;
        setInstalling(true);
        try {
            const d = await (await fetch(`/api/sandbox/${clawId}/plugins/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package: installPkg }) })).json();
            if (!d.ok) throw new Error(d.error || 'Install failed');
            setInstallPkg(''); load();
        } catch (e: any) { setError(e.message); } finally { setInstalling(false); }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>🧩 Plugin Manager</h2>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.installBar}>
                <input className={styles.input} type="text" placeholder="npm package or path" value={installPkg} onChange={e => setInstallPkg(e.target.value)} onKeyDown={e => e.key === 'Enter' && install()} />
                <button className={styles.installBtn} onClick={install} disabled={installing || !installPkg.trim()}>{installing ? '...' : '+ Install'}</button>
            </div>
            {loading ? <div className={styles.loading}><div className={styles.spinner}/>Loading...</div> : plugins.length === 0 ? <div className={styles.empty}>No plugins installed</div> : (
                <ul className={styles.list}>
                    {plugins.map(p => (
                        <li key={p.name} className={styles.item}>
                            <div className={styles.info}>
                                <span className={styles.name}>{p.name}</span>
                                {p.version && <span className={styles.version}>v{p.version}</span>}
                                {p.description && <span className={styles.desc}>{p.description}</span>}
                            </div>
                            <div className={styles.controls}>
                                <button className={`${styles.toggle} ${p.enabled ? styles.active : ''}`} onClick={() => toggle(p.name, p.enabled)}>{p.enabled ? '● On' : '○ Off'}</button>
                                <button className={styles.removeBtn} onClick={() => remove(p.name)}>✕</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
