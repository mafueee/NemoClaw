import { useState, useEffect, useCallback } from 'react';

interface Extension {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    policyPreset: string;
    credentialKey: string | null;
    credentialLabel: string | null;
    installCommands: string[];
    docs: string;
    installed: boolean;
    presetAvailable: boolean;
}

interface InstallStep {
    step: string;
    status: string;
    message: string;
    output?: string;
}

interface Sandbox {
    name: string;
    id: string;
    status: string;
}

const CATEGORY_LABELS: Record<string, string> = {
    messaging: '💬 Messaging',
    devtools: '🔧 Dev Tools',
    registry: '📦 Registries',
    productivity: '📊 Productivity',
};

const CATEGORY_COLORS: Record<string, string> = {
    messaging: '#7c3aed',
    devtools: '#0891b2',
    registry: '#16a34a',
    productivity: '#ea580c',
};

export function ExtensionCatalog() {
    const [extensions, setExtensions] = useState<Extension[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [selectedSandbox, setSelectedSandbox] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [installing, setInstalling] = useState<string | null>(null);
    const [installResult, setInstallResult] = useState<{
        extensionId: string;
        steps: InstallStep[];
        ok: boolean;
        message: string;
    } | null>(null);
    const [credentialModal, setCredentialModal] = useState<{
        ext: Extension;
        credential: string;
    } | null>(null);

    const fetchExtensions = useCallback(async () => {
        try {
            const params = selectedSandbox ? `?sandboxName=${encodeURIComponent(selectedSandbox)}` : '';
            const resp = await fetch(`/api/extensions${params}`);
            const data = await resp.json();
            if (data.ok) {
                setExtensions(data.extensions || []);
                setCategories(data.categories || []);
                setError(null);
            } else {
                setError(data.error || 'Failed to load extensions');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setLoading(false);
        }
    }, [selectedSandbox]);

    const fetchSandboxes = useCallback(async () => {
        try {
            const resp = await fetch('/api/sandboxes');
            const data = await resp.json();
            const sbs = (data.sandboxes || []).filter((s: Sandbox) => s.status === 'running');
            setSandboxes(sbs);
            if (sbs.length > 0 && !selectedSandbox) {
                setSelectedSandbox(sbs[0].name);
            }
        } catch { /* ignore */ }
    }, [selectedSandbox]);

    useEffect(() => {
        fetchSandboxes();
    }, []);

    useEffect(() => {
        if (selectedSandbox) {
            setLoading(true);
            fetchExtensions();
        }
    }, [selectedSandbox, fetchExtensions]);

    const handleInstall = async (ext: Extension) => {
        if (!selectedSandbox) return;

        // If extension needs a credential, show modal first
        if (ext.credentialKey && !ext.installed) {
            setCredentialModal({ ext, credential: '' });
            return;
        }

        await doInstall(ext.id, '');
    };

    const doInstall = async (extensionId: string, credential: string) => {
        if (!selectedSandbox) return;

        setInstalling(extensionId);
        setInstallResult(null);
        setCredentialModal(null);

        try {
            const resp = await fetch('/api/extensions/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extensionId, sandboxName: selectedSandbox, credential }),
            });
            const data = await resp.json();
            setInstallResult({
                extensionId,
                steps: data.steps || [],
                ok: data.ok,
                message: data.message || '',
            });
            // Refresh extension list
            await fetchExtensions();
        } catch (err) {
            setInstallResult({
                extensionId,
                steps: [{ step: 'install', status: 'error', message: err instanceof Error ? err.message : 'Install failed' }],
                ok: false,
                message: 'Installation failed',
            });
        } finally {
            setInstalling(null);
        }
    };

    const handleUninstall = async (ext: Extension) => {
        if (!selectedSandbox) return;

        setInstalling(ext.id);
        setInstallResult(null);

        try {
            const resp = await fetch('/api/extensions/uninstall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extensionId: ext.id, sandboxName: selectedSandbox }),
            });
            const data = await resp.json();
            setInstallResult({
                extensionId: ext.id,
                steps: [{ step: 'uninstall', status: data.ok ? 'complete' : 'error', message: data.message || data.error }],
                ok: data.ok,
                message: data.message || data.error || '',
            });
            await fetchExtensions();
        } catch (err) {
            setInstallResult({
                extensionId: ext.id,
                steps: [{ step: 'uninstall', status: 'error', message: err instanceof Error ? err.message : 'Uninstall failed' }],
                ok: false,
                message: 'Uninstall failed',
            });
        } finally {
            setInstalling(null);
        }
    };

    const filtered = activeCategory === 'all'
        ? extensions
        : extensions.filter(e => e.category === activeCategory);

    return (
        <div className="ext-catalog">
            <div className="page-header">
                <h1 className="page-title">🧩 Extensions</h1>
                <p className="page-subtitle">
                    Browse and install integrations for your sandboxes — messaging, dev tools, package registries, and more.
                </p>
            </div>

            {/* Sandbox selector */}
            <div className="ext-toolbar">
                <div className="ext-sandbox-selector">
                    <label htmlFor="ext-sandbox-select">Target Sandbox:</label>
                    <select
                        id="ext-sandbox-select"
                        value={selectedSandbox}
                        onChange={(e) => setSelectedSandbox(e.target.value)}
                        className="ext-select"
                    >
                        {sandboxes.length === 0 && (
                            <option value="">No running sandboxes</option>
                        )}
                        {sandboxes.map(sb => (
                            <option key={sb.name} value={sb.name}>{sb.name}</option>
                        ))}
                    </select>
                </div>

                {/* Category filter tabs */}
                <div className="ext-category-tabs">
                    <button
                        className={`ext-tab ${activeCategory === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveCategory('all')}
                    >
                        All ({extensions.length})
                    </button>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            className={`ext-tab ${activeCategory === cat ? 'active' : ''}`}
                            onClick={() => setActiveCategory(cat)}
                            style={{ '--tab-color': CATEGORY_COLORS[cat] || '#666' } as React.CSSProperties}
                        >
                            {CATEGORY_LABELS[cat] || cat}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="ext-error">
                    <span>⚠️ {error}</span>
                    <button onClick={fetchExtensions} className="ext-retry-btn">Retry</button>
                </div>
            )}

            {/* Install result banner */}
            {installResult && (
                <div className={`ext-result-banner ${installResult.ok ? 'success' : 'error'}`}>
                    <div className="ext-result-header">
                        <span>{installResult.ok ? '✅' : '❌'} {installResult.message}</span>
                        <button
                            className="ext-result-close"
                            onClick={() => setInstallResult(null)}
                        >
                            ✕
                        </button>
                    </div>
                    {installResult.steps.length > 0 && (
                        <div className="ext-result-steps">
                            {installResult.steps.map((step, i) => (
                                <div key={i} className={`ext-step ${step.status}`}>
                                    <span className="ext-step-icon">
                                        {step.status === 'complete' ? '✓' : step.status === 'error' ? '✗' : step.status === 'skipped' ? '–' : '⋯'}
                                    </span>
                                    <span className="ext-step-label">{step.step}</span>
                                    <span className="ext-step-msg">{step.message}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {loading ? (
                <div className="ext-loading">
                    <div className="spinner" />
                    <span>Loading extensions...</span>
                </div>
            ) : (
                <div className="ext-grid">
                    {filtered.map(ext => (
                        <div
                            key={ext.id}
                            className={`ext-card ${ext.installed ? 'installed' : ''}`}
                        >
                            <div className="ext-card-header">
                                <span className="ext-icon">{ext.icon}</span>
                                <div className="ext-card-meta">
                                    <h3 className="ext-name">{ext.name}</h3>
                                    <span
                                        className="ext-category-badge"
                                        style={{ background: CATEGORY_COLORS[ext.category] || '#666' }}
                                    >
                                        {CATEGORY_LABELS[ext.category]?.split(' ')[1] || ext.category}
                                    </span>
                                </div>
                                {ext.installed && (
                                    <span className="ext-installed-badge">✓ Installed</span>
                                )}
                            </div>

                            <p className="ext-description">{ext.description}</p>

                            <div className="ext-card-details">
                                {ext.credentialKey && (
                                    <span className="ext-detail">
                                        🔑 {ext.credentialLabel || 'API Key required'}
                                    </span>
                                )}
                                {ext.installCommands.length > 0 && (
                                    <span className="ext-detail">
                                        📥 Installs packages
                                    </span>
                                )}
                            </div>

                            <div className="ext-card-actions">
                                {ext.installed ? (
                                    <button
                                        className="ext-btn ext-btn-uninstall"
                                        onClick={() => handleUninstall(ext)}
                                        disabled={installing === ext.id || !selectedSandbox}
                                    >
                                        {installing === ext.id ? 'Removing...' : 'Uninstall'}
                                    </button>
                                ) : (
                                    <button
                                        className="ext-btn ext-btn-install"
                                        onClick={() => handleInstall(ext)}
                                        disabled={installing === ext.id || !selectedSandbox}
                                    >
                                        {installing === ext.id ? 'Installing...' : 'Install'}
                                    </button>
                                )}
                                {ext.docs && (
                                    <a href={ext.docs} target="_blank" rel="noopener noreferrer" className="ext-btn ext-btn-docs">
                                        Docs ↗
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {filtered.length === 0 && !loading && (
                <div className="ext-empty">
                    <span className="ext-empty-icon">🧩</span>
                    <p>No extensions found in this category.</p>
                </div>
            )}

            {/* Credential modal */}
            {credentialModal && (
                <div className="ext-modal-backdrop" onClick={() => setCredentialModal(null)}>
                    <div className="ext-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ext-modal-header">
                            <h3>{credentialModal.ext.icon} Install {credentialModal.ext.name}</h3>
                            <button className="ext-modal-close" onClick={() => setCredentialModal(null)}>✕</button>
                        </div>
                        <div className="ext-modal-body">
                            <p>
                                This extension requires a <strong>{credentialModal.ext.credentialLabel}</strong> to function.
                                You can skip this step and add it later.
                            </p>
                            <label className="ext-modal-label">
                                {credentialModal.ext.credentialLabel || 'API Token'}
                            </label>
                            <input
                                type="password"
                                className="ext-modal-input"
                                placeholder={`Enter your ${credentialModal.ext.credentialLabel || 'token'}...`}
                                value={credentialModal.credential}
                                onChange={(e) => setCredentialModal({
                                    ...credentialModal,
                                    credential: e.target.value,
                                })}
                                autoFocus
                            />
                        </div>
                        <div className="ext-modal-actions">
                            <button
                                className="ext-btn ext-btn-secondary"
                                onClick={() => doInstall(credentialModal.ext.id, '')}
                            >
                                Skip & Install
                            </button>
                            <button
                                className="ext-btn ext-btn-install"
                                onClick={() => doInstall(credentialModal.ext.id, credentialModal.credential)}
                            >
                                Install with Token
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
