import { useState, useEffect } from 'react';
import { api } from '../../api/client';

export function PolicyEditor() {
    const [presets, setPresets] = useState<string[]>([]);
    const [selectedPreset, setSelectedPreset] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getPolicies().then(data => {
            setPresets(data.presets);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const policyDescriptions: Record<string, string> = {
        'openclaw-sandbox': 'Base sandbox policy — blocks all outgoing traffic except through proxy',
        'allow-github': 'Allow outbound HTTPS to github.com and api.github.com',
        'allow-npm': 'Allow outbound HTTPS to registry.npmjs.org',
        'allow-pypi': 'Allow outbound HTTPS to pypi.org and files.pythonhosted.org',
        'allow-web-search': 'Allow outbound HTTPS to search engines (Google, DuckDuckGo, Bing)',
    };

    return (
        <>
            <div className="page-header">
                <h2>🛡️ Security Policies</h2>
                <p>Manage network security policies for your sandboxes</p>
            </div>
            <div className="page-body">
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--nc-spacing-2xl)' }}>
                        <div className="loading-spinner"></div>
                    </div>
                ) : (
                    <>
                        <div className="card fade-in" style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                            <h4 style={{ marginBottom: 'var(--nc-spacing-md)' }}>Active Policy</h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)' }}>
                                <span className="status-dot ready"></span>
                                <span style={{ fontWeight: 600 }}>openclaw-sandbox</span>
                                <span className="status-badge ready">Active</span>
                            </div>
                            <p style={{ color: 'var(--nc-text-secondary)', fontSize: '0.8rem', marginTop: 'var(--nc-spacing-sm)' }}>
                                {policyDescriptions['openclaw-sandbox']}
                            </p>
                        </div>

                        <h4 style={{ marginBottom: 'var(--nc-spacing-md)' }}>Available Presets</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nc-spacing-sm)' }}>
                            {Object.entries(policyDescriptions).map(([name, desc], idx) => (
                                <div key={name} className="card fade-in" style={{
                                    animationDelay: `${idx * 0.1}s`,
                                    cursor: 'pointer',
                                    borderColor: selectedPreset === name ? 'var(--nc-border-active)' : undefined,
                                }}
                                    onClick={() => setSelectedPreset(name)}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, marginBottom: '2px' }}>{name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--nc-text-secondary)' }}>{desc}</div>
                                        </div>
                                        {name === 'openclaw-sandbox' && (
                                            <span className="status-badge ready">Active</span>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {presets.filter(p => !policyDescriptions[p]).map((name, idx) => (
                                <div key={name} className="card fade-in" style={{ animationDelay: `${(idx + 5) * 0.1}s` }}>
                                    <div style={{ fontWeight: 600 }}>{name}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--nc-text-secondary)' }}>Custom preset</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 'var(--nc-spacing-xl)' }}>
                            <h4 style={{ marginBottom: 'var(--nc-spacing-sm)' }}>Apply via CLI</h4>
                            <div className="log-viewer" style={{ maxHeight: '120px' }}>
                                <div className="log-line">
                                    <span style={{ color: 'var(--nc-green)' }}>$</span> nemoclaw &lt;sandbox-name&gt; policy-add
                                </div>
                                <div className="log-line">
                                    <span style={{ color: 'var(--nc-green)' }}>$</span> nemoclaw &lt;sandbox-name&gt; policy-list
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
