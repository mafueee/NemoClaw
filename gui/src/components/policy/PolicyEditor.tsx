import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { Sandbox, PolicyPreset } from '../../api/client';

export function PolicyEditor() {
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [selectedSandbox, setSelectedSandbox] = useState('');
    const [presets, setPresets] = useState<PolicyPreset[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Load sandboxes on mount
    useEffect(() => {
        api.listSandboxes().then(data => {
            setSandboxes(data.sandboxes);
            if (data.sandboxes.length > 0) {
                setSelectedSandbox(data.sandboxes[0].name);
            }
        }).catch(() => { });
    }, []);

    // Load presets when sandbox changes
    useEffect(() => {
        if (!selectedSandbox) {
            setLoading(false);
            return;
        }
        setLoading(true);
        api.getPresetsWithStatus(selectedSandbox).then(data => {
            setPresets(data.presets || []);
            setLoading(false);
        }).catch(() => {
            setPresets([]);
            setLoading(false);
        });
    }, [selectedSandbox]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleTogglePolicy = async (presetName: string, isApplied: boolean) => {
        setActionLoading(presetName);
        try {
            if (isApplied) {
                const result = await api.removePolicy(selectedSandbox, presetName);
                showToast(result.message || `Removed '${presetName}'`, result.ok ? 'success' : 'error');
            } else {
                const result = await api.applyPolicy(selectedSandbox, presetName);
                showToast(result.message || `Applied '${presetName}'`, result.ok ? 'success' : 'error');
            }
            // Refresh presets
            const data = await api.getPresetsWithStatus(selectedSandbox);
            setPresets(data.presets || []);
        } catch (err) {
            showToast(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
        setActionLoading(null);
    };

    return (
        <>
            <div className="page-header">
                <h2>🛡️ Security Policies</h2>
                <p>Manage network security policies for your sandboxes</p>
            </div>
            <div className="page-body">
                {/* Toast notification */}
                {toast && (
                    <div className="card fade-in" style={{
                        marginBottom: 'var(--nc-spacing-md)',
                        borderColor: toast.type === 'success' ? 'var(--nc-green)' : 'var(--nc-red)',
                        padding: 'var(--nc-spacing-sm) var(--nc-spacing-md)',
                    }}>
                        <span style={{ color: toast.type === 'success' ? 'var(--nc-green)' : 'var(--nc-red)' }}>
                            {toast.type === 'success' ? '✓' : '✗'} {toast.message}
                        </span>
                    </div>
                )}

                {/* Sandbox selector */}
                <div className="card fade-in" style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                    <h4 style={{ marginBottom: 'var(--nc-spacing-md)' }}>Target Sandbox</h4>
                    {sandboxes.length === 0 ? (
                        <p style={{ color: 'var(--nc-text-secondary)' }}>
                            No sandboxes found. <a href="/onboard" style={{ color: 'var(--nc-green)' }}>Create one first</a>.
                        </p>
                    ) : (
                        <select
                            className="input"
                            value={selectedSandbox}
                            onChange={(e) => setSelectedSandbox(e.target.value)}
                            data-testid="sandbox-selector"
                        >
                            {sandboxes.map(sb => (
                                <option key={sb.name} value={sb.name}>{sb.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--nc-spacing-2xl)' }}>
                        <div className="loading-spinner"></div>
                    </div>
                ) : (
                    <>
                        <h4 style={{ marginBottom: 'var(--nc-spacing-md)' }}>Policy Presets</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nc-spacing-sm)' }}>
                            {presets.map((preset, idx) => (
                                <div key={preset.name} className="card fade-in" style={{
                                    animationDelay: `${idx * 0.08}s`,
                                    borderColor: preset.applied ? 'var(--nc-border-active)' : undefined,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)', marginBottom: '2px' }}>
                                                <span className={`status-dot ${preset.applied ? 'ready' : ''}`}></span>
                                                <span style={{ fontWeight: 600 }}>{preset.name}</span>
                                                {preset.applied && (
                                                    <span className="status-badge ready">Active</span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--nc-text-secondary)', paddingLeft: 'var(--nc-spacing-lg)' }}>
                                                {preset.description || 'Custom preset'}
                                            </div>
                                        </div>
                                        {selectedSandbox && (
                                            <button
                                                className={`btn btn-sm ${preset.applied ? 'btn-danger' : 'btn-primary'}`}
                                                onClick={() => handleTogglePolicy(preset.name, preset.applied)}
                                                disabled={actionLoading === preset.name}
                                                data-testid={`policy-toggle-${preset.name}`}
                                            >
                                                {actionLoading === preset.name ? (
                                                    <span className="loading-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></span>
                                                ) : preset.applied ? '✗ Remove' : '✓ Apply'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {presets.length === 0 && (
                                <div className="card" style={{ textAlign: 'center', padding: 'var(--nc-spacing-xl)' }}>
                                    <p style={{ color: 'var(--nc-text-secondary)' }}>No policy presets available</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
