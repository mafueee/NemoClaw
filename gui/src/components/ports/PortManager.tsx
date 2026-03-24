import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { PortStatus, PortSource } from '../../api/client';

const LABELS: Record<string, string> = {
    GATEWAY_PORT: 'OpenShell Gateway',
    DASHBOARD_PORT: 'NemoClaw Dashboard',
    VLLM_PORT: 'vLLM Server',
    OLLAMA_PORT: 'Ollama Server',
    GUI_PORT: 'Web Dashboard',
};

const ENV_VAR_NAMES: Record<string, string> = {
    GATEWAY_PORT: 'NEMOCLAW_GATEWAY_PORT',
    DASHBOARD_PORT: 'NEMOCLAW_DASHBOARD_PORT',
    VLLM_PORT: 'NEMOCLAW_VLLM_PORT',
    OLLAMA_PORT: 'NEMOCLAW_OLLAMA_PORT',
    GUI_PORT: 'NEMOCLAW_GUI_PORT',
};

const ICONS: Record<string, string> = {
    GATEWAY_PORT: '🌐',
    DASHBOARD_PORT: '📊',
    VLLM_PORT: '🤖',
    OLLAMA_PORT: '🦙',
    GUI_PORT: '🖥️',
};

export function PortManager() {
    const [ports, setPorts] = useState<Record<string, number>>({});
    const [editPorts, setEditPorts] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<PortStatus[]>([]);
    const [sources, setSources] = useState<PortSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [justSaved, setJustSaved] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getPorts();
            setPorts(data.ports);
            setStatus(data.status);
            setSources(data.sources || []);
            // Initialize edit fields from live ports
            const edits: Record<string, string> = {};
            for (const [k, v] of Object.entries(data.ports)) {
                edits[k] = String(v);
            }
            setEditPorts(edits);
            setDirty(false);
            setErrors({});
        } catch {
            setBanner({ type: 'error', message: 'Failed to load port configuration' });
        }
        setLoading(false);
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    // Auto-dismiss banners
    useEffect(() => {
        if (banner) {
            const t = setTimeout(() => setBanner(null), 8000);
            return () => clearTimeout(t);
        }
    }, [banner]);

    const validate = (name: string, value: string): string | null => {
        if (!value.trim()) return 'Port is required';
        const num = parseInt(value, 10);
        if (isNaN(num)) return 'Must be a number';
        if (num < 1024) return 'Min: 1024';
        if (num > 65535) return 'Max: 65535';
        // Check for duplicates
        for (const [k, v] of Object.entries(editPorts)) {
            if (k !== name && parseInt(v, 10) === num) {
                return `Conflicts with ${LABELS[k] || k}`;
            }
        }
        return null;
    };

    const handleChange = (name: string, value: string) => {
        setEditPorts(prev => ({ ...prev, [name]: value }));
        setDirty(true);
        setJustSaved(false);
        // Validate
        const err = validate(name, value);
        setErrors(prev => {
            const next = { ...prev };
            if (err) next[name] = err;
            else delete next[name];
            return next;
        });
    };

    const handleSave = async () => {
        // Validate all
        const newErrors: Record<string, string> = {};
        for (const [k, v] of Object.entries(editPorts)) {
            const err = validate(k, v);
            if (err) newErrors[k] = err;
        }
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            setBanner({ type: 'error', message: 'Fix validation errors before saving' });
            return;
        }

        setSaving(true);
        try {
            const overrides: Record<string, number> = {};
            for (const [k, v] of Object.entries(editPorts)) {
                overrides[k] = parseInt(v, 10);
            }
            const result = await api.updatePorts(overrides);
            setPorts(result.ports);
            setSources(result.sources || []);
            setDirty(false);
            setJustSaved(true);
            setBanner({ type: 'success', message: 'Ports saved. Restart affected services for changes to take effect.' });
            // Re-fetch status
            const data = await api.getPorts();
            setStatus(data.status);
        } catch (err) {
            setBanner({ type: 'error', message: `Save failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
        }
        setSaving(false);
    };

    const handleReset = async () => {
        setSaving(true);
        try {
            const result = await api.resetPorts();
            setPorts(result.ports);
            setSources(result.sources || []);
            const edits: Record<string, string> = {};
            for (const [k, v] of Object.entries(result.ports)) {
                edits[k] = String(v);
            }
            setEditPorts(edits);
            setDirty(false);
            setErrors({});
            setJustSaved(false);
            setBanner({ type: 'info', message: 'All ports reset to defaults. Restart services if they were using custom ports.' });
            // Re-fetch status
            const data = await api.getPorts();
            setStatus(data.status);
        } catch (err) {
            setBanner({ type: 'error', message: `Reset failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
        }
        setSaving(false);
    };

    const handleAutoResolve = async () => {
        setSaving(true);
        try {
            const result = await api.autoResolvePorts();
            setPorts(result.ports);
            setStatus(result.status || []);
            setSources(result.sources || []);
            const edits: Record<string, string> = {};
            for (const [k, v] of Object.entries(result.ports)) {
                edits[k] = String(v);
            }
            setEditPorts(edits);
            setDirty(false);
            setErrors({});
            setJustSaved(true);
            setBanner({ type: 'success', message: 'Ports auto-resolved to free ports and saved.' });
        } catch (err) {
            setBanner({ type: 'error', message: `Auto-resolve failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
        }
        setSaving(false);
    };

    const getSource = (name: string): PortSource | undefined => sources.find(s => s.name === name);
    const getStatus = (name: string): PortStatus | undefined => status.find(s => s.name === name);
    const allOk = status.every(s => s.available);
    const hasConflicts = status.some(s => !s.available);
    const hasErrors = Object.keys(errors).length > 0;

    return (
        <>
            <div className="page-header">
                <h2>🔌 Port Configuration</h2>
                <p>Manage and monitor port assignments for NemoClaw, OpenShell, and claws</p>
            </div>
            <div className="page-body">
                {/* Banners */}
                {banner && (
                    <div
                        className={`port-banner port-banner-${banner.type} fade-in`}
                        style={{ marginBottom: 'var(--nc-spacing-lg)' }}
                    >
                        <span>{banner.type === 'success' ? '✅' : banner.type === 'error' ? '❌' : 'ℹ️'}</span>
                        <span>{banner.message}</span>
                        <button className="port-banner-close" onClick={() => setBanner(null)}>✕</button>
                    </div>
                )}

                {dirty && (
                    <div className="port-banner port-banner-warning fade-in" style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                        <span>⚠️</span>
                        <span>You have unsaved changes</span>
                    </div>
                )}

                {justSaved && !dirty && (
                    <div className="port-banner port-banner-info fade-in" style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                        <span>🔄</span>
                        <span>Restart affected services for the new ports to take effect</span>
                    </div>
                )}

                {/* Status Banner */}
                <div className="card fade-in" style={{
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

                {/* Port Table */}
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
                                        <th>Source</th>
                                        <th>Status</th>
                                        <th>Env Override</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.keys(ports).map((name) => {
                                        const ps = getStatus(name);
                                        const src = getSource(name);
                                        const isEnvLocked = src?.source === 'env';
                                        return (
                                            <tr key={name} className="fade-in">
                                                <td style={{ fontWeight: 500 }}>
                                                    <span style={{ marginRight: '6px' }}>{ICONS[name] || '⚡'}</span>
                                                    {LABELS[name] || name}
                                                </td>
                                                <td>
                                                    {isEnvLocked ? (
                                                        <span className="port-number" title="Locked by environment variable">
                                                            {ports[name]}
                                                            <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--nc-text-muted)' }}>🔒</span>
                                                        </span>
                                                    ) : (
                                                        <div className="port-input-wrapper">
                                                            <input
                                                                type="number"
                                                                className={`port-input ${errors[name] ? 'port-input-error' : ''}`}
                                                                value={editPorts[name] || ''}
                                                                onChange={(e) => handleChange(name, e.target.value)}
                                                                min={1024}
                                                                max={65535}
                                                                disabled={saving}
                                                                aria-label={`Port for ${LABELS[name]}`}
                                                            />
                                                            {errors[name] && (
                                                                <div className="port-error">{errors[name]}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`port-source-badge port-source-${src?.source || 'default'}`}>
                                                        {src?.source || 'default'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span className={`status-dot ${ps?.available ? 'ready' : 'error'}`}></span>
                                                        <span style={{ fontSize: '0.8rem', color: ps?.available ? 'var(--nc-green)' : 'var(--nc-red)' }}>
                                                            {ps?.available ? 'Available' : ps?.reason || 'In use'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <code style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)' }}>
                                                        {ENV_VAR_NAMES[name] || '—'}
                                                    </code>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="port-actions fade-in" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving || hasErrors || !dirty}
                    >
                        {saving ? '⏳ Saving…' : '💾 Save Ports'}
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={handleReset}
                        disabled={saving}
                    >
                        🔄 Reset to Defaults
                    </button>
                    {hasConflicts && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleAutoResolve}
                            disabled={saving}
                            style={{ borderColor: 'rgba(255, 165, 2, 0.4)' }}
                        >
                            ⚡ Auto-Resolve Conflicts
                        </button>
                    )}
                    <button
                        className="btn btn-ghost"
                        onClick={refresh}
                        disabled={saving}
                    >
                        🔃 Refresh
                    </button>
                </div>

                {/* Help */}
                <div className="card fade-in" style={{ marginTop: 'var(--nc-spacing-xl)' }}>
                    <h4 style={{ marginBottom: 'var(--nc-spacing-sm)' }}>ℹ️ Port Priority</h4>
                    <p style={{ color: 'var(--nc-text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                        Ports are resolved in this order: <strong>Environment Variable</strong> → <strong>Saved Config</strong> → <strong>Default</strong>.
                        Environment variables always take highest priority and cannot be changed from this page (shown with 🔒).
                        Saved config is stored in <code style={{ color: 'var(--nc-cyan)', fontSize: '0.8rem' }}>~/.config/nemoclaw/ports.json</code>.
                        After saving, restart the affected service for changes to take effect.
                    </p>
                </div>
            </div>
        </>
    );
}
