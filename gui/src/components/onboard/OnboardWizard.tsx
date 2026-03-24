import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { PreflightCheck } from '../../api/client';
import { PROVIDERS } from '../../data/providers';

const WIZARD_STEPS = [
    { id: 'preflight', title: 'Preflight' },
    { id: 'gateway', title: 'Gateway' },
    { id: 'sandbox', title: 'Sandbox' },
    { id: 'inference', title: 'Inference' },
    { id: 'policy', title: 'Policy' },
    { id: 'complete', title: 'Done' },
];

export function OnboardWizard() {
    const [currentStep, setCurrentStep] = useState(0);
    const [checks, setChecks] = useState<PreflightCheck[]>([]);
    const [loading, setLoading] = useState(false);
    const [sandboxName, setSandboxName] = useState('my-assistant');
    const [provider, setProvider] = useState('cloud');
    const [apiKey, setApiKey] = useState('');
    const [endpoint, setEndpoint] = useState(PROVIDERS[0].defaultEndpoint);
    const [model, setModel] = useState(PROVIDERS[0].models[0]);

    const currentProvider = PROVIDERS.find(p => p.key === provider)!;

    const switchProvider = (key: string) => {
        const p = PROVIDERS.find(pr => pr.key === key)!;
        setProvider(key);
        setModel(p.models[0]);
        setEndpoint(p.defaultEndpoint);
        setApiKey('');
    };

    const runPreflight = async () => {
        setLoading(true);
        try {
            const data = await api.getPreflightChecks();
            setChecks(data.checks);
        } catch (err) {
            setChecks([{ name: 'API Server', ok: false, detail: 'Could not reach NemoClaw API server' }]);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (currentStep === 0) {
            runPreflight();
        }
    }, [currentStep]);

    const allPassed = checks.length > 0 && checks.every(c => c.ok || c.warning);

    // Determine which fields to show for the selected provider
    const showApiKey = ['cloud', 'openrouter', 'gemini', 'ollama'].includes(provider);
    const showEndpoint = currentProvider.endpointEditable;

    return (
        <>
            <div className="page-header">
                <h2>🚀 Onboard New Sandbox</h2>
                <p>Set up your NemoClaw sandbox in a few steps</p>
            </div>
            <div className="page-body">
                {/* Step Indicators */}
                <div className="wizard-steps">
                    {WIZARD_STEPS.map((step, idx) => (
                        <div key={step.id} className={`wizard-step ${idx === currentStep ? 'active' : idx < currentStep ? 'complete' : ''}`}>
                            <span className="wizard-step-number">
                                {idx < currentStep ? '✓' : idx + 1}
                            </span>
                            {step.title}
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className="card fade-in" style={{ maxWidth: '700px' }}>
                    {/* Step 0: Preflight */}
                    {currentStep === 0 && (
                        <div>
                            <h3 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>Preflight Checks</h3>
                            {loading ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)' }}>
                                    <div className="loading-spinner"></div>
                                    <span>Running checks...</span>
                                </div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nc-spacing-sm)' }}>
                                        {checks.map((check) => (
                                            <div key={check.name} className="fade-in" style={{
                                                display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)',
                                                padding: 'var(--nc-spacing-sm) var(--nc-spacing-md)',
                                                background: 'var(--nc-bg-secondary)', borderRadius: 'var(--nc-radius-sm)'
                                            }}>
                                                <span className={`status-dot ${check.ok ? 'ready' : check.warning ? 'warning' : 'error'}`}></span>
                                                <span style={{ flex: 1, fontWeight: 500 }}>{check.name}</span>
                                                <span style={{ fontSize: '0.8rem', color: check.ok ? 'var(--nc-green)' : check.warning ? 'var(--nc-amber)' : 'var(--nc-red)' }}>
                                                    {check.detail}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="btn-group" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                                        <button className="btn btn-secondary" onClick={runPreflight}>🔄 Re-check</button>
                                        <button className="btn btn-primary" disabled={!allPassed} onClick={() => setCurrentStep(1)}
                                            data-testid="continue-preflight">
                                            Continue →
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Step 1: Gateway */}
                    {currentStep === 1 && (
                        <div>
                            <h3 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>Gateway Configuration</h3>
                            <p style={{ color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-lg)' }}>
                                The OpenShell gateway manages sandbox isolation and network policies.
                                It will be started automatically with the NemoClaw configuration.
                            </p>
                            <div className="card" style={{ background: 'var(--nc-bg-secondary)' }}>
                                <code style={{ color: 'var(--nc-green)' }}>openshell gateway start --name nemoclaw</code>
                            </div>
                            <div className="btn-group" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                                <button className="btn btn-secondary" onClick={() => setCurrentStep(0)}>← Back</button>
                                <button className="btn btn-primary" onClick={() => setCurrentStep(2)}
                                    data-testid="continue-gateway">Continue →</button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Sandbox Name */}
                    {currentStep === 2 && (
                        <div>
                            <h3 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>Sandbox Configuration</h3>
                            <div className="form-group">
                                <label className="form-label">Sandbox Name</label>
                                <input
                                    className="input"
                                    value={sandboxName}
                                    onChange={(e) => setSandboxName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    placeholder="my-assistant"
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)', marginTop: 'var(--nc-spacing-xs)' }}>
                                    Lowercase letters, numbers, and hyphens only
                                </p>
                            </div>
                            <div className="btn-group" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                                <button className="btn btn-secondary" onClick={() => setCurrentStep(1)}>← Back</button>
                                <button className="btn btn-primary" disabled={!sandboxName || sandboxName.length < 2}
                                    onClick={() => setCurrentStep(3)}
                                    data-testid="continue-sandbox">Continue →</button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Inference Provider */}
                    {currentStep === 3 && (
                        <div>
                            <h3 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>Inference Provider</h3>

                            {/* Provider Cards */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nc-spacing-sm)' }}>
                                {PROVIDERS.map(opt => (
                                    <div key={opt.key}
                                        onClick={() => switchProvider(opt.key)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-md)',
                                            padding: 'var(--nc-spacing-md)',
                                            background: provider === opt.key ? 'var(--nc-green-glow)' : 'var(--nc-bg-secondary)',
                                            border: `1px solid ${provider === opt.key ? 'var(--nc-border-active)' : 'var(--nc-border)'}`,
                                            borderRadius: 'var(--nc-radius-md)', cursor: 'pointer',
                                            transition: 'all var(--nc-transition-fast)',
                                        }}>
                                        <span style={{ fontSize: '1.5rem' }}>{opt.icon}</span>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{opt.title}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--nc-text-secondary)' }}>{opt.desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* API Key input (shown for cloud, openrouter, gemini, ollama) */}
                            {showApiKey && (
                                <div className="form-group" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                                    <label className="form-label">
                                        {currentProvider.apiKeyEnv.replace(/_/g, ' ')}
                                    </label>
                                    <input
                                        className="input"
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder={currentProvider.apiKeyPlaceholder}
                                    />
                                    {currentProvider.apiKeyHelp && (
                                        <p style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)', marginTop: 'var(--nc-spacing-xs)' }}>
                                            {currentProvider.apiKeyHelp}{' '}
                                            {currentProvider.apiKeyHelpUrl && (
                                                <a href={currentProvider.apiKeyHelpUrl} target="_blank" rel="noopener">
                                                    {currentProvider.apiKeyHelpUrl}
                                                </a>
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Endpoint URL input (shown for editable-endpoint providers) */}
                            {showEndpoint && (
                                <div className="form-group" style={{ marginTop: 'var(--nc-spacing-md)' }}>
                                    <label className="form-label">Endpoint URL</label>
                                    <input
                                        className="input"
                                        type="url"
                                        value={endpoint}
                                        onChange={(e) => setEndpoint(e.target.value)}
                                        placeholder={currentProvider.defaultEndpoint}
                                    />
                                </div>
                            )}

                            {/* Model selector */}
                            <div className="form-group" style={{ marginTop: 'var(--nc-spacing-md)' }}>
                                <label className="form-label">Model</label>
                                <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                                    {currentProvider.models.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="btn-group" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                                <button className="btn btn-secondary" onClick={() => setCurrentStep(2)}>← Back</button>
                                <button className="btn btn-primary" onClick={() => setCurrentStep(4)}
                                    data-testid="continue-inference">Continue →</button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Policy */}
                    {currentStep === 4 && (
                        <div>
                            <h3 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>Security Policy</h3>
                            <p style={{ color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-lg)' }}>
                                NemoClaw sandboxes run with a default security policy that restricts network access.
                                You can customize policies after setup.
                            </p>
                            <div className="card" style={{ background: 'var(--nc-bg-secondary)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)' }}>
                                    <span className="status-dot ready"></span>
                                    <span style={{ fontWeight: 600 }}>openclaw-sandbox</span>
                                    <span style={{ color: 'var(--nc-text-secondary)', fontSize: '0.8rem' }}>— Default sandbox policy</span>
                                </div>
                            </div>
                            <div className="btn-group" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                                <button className="btn btn-secondary" onClick={() => setCurrentStep(3)}>← Back</button>
                                <button className="btn btn-primary" onClick={() => setCurrentStep(5)}>Complete Setup →</button>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Complete */}
                    {currentStep === 5 && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '4rem', marginBottom: 'var(--nc-spacing-md)' }}>🎉</div>
                            <h3 style={{ marginBottom: 'var(--nc-spacing-sm)' }}>Setup Complete!</h3>
                            <p style={{ color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-lg)' }}>
                                Your sandbox <strong>{sandboxName}</strong> is configured with <strong>{currentProvider.title}</strong>.
                                <br />To create it, run the following command:
                            </p>
                            <div className="card" style={{ background: 'var(--nc-bg-secondary)', textAlign: 'left', marginBottom: 'var(--nc-spacing-lg)' }}>
                                <code style={{ color: 'var(--nc-green)' }}>nemoclaw onboard</code>
                            </div>
                            <p style={{ color: 'var(--nc-text-muted)', fontSize: '0.8rem', marginBottom: 'var(--nc-spacing-lg)' }}>
                                The onboard command will create the sandbox using your configuration above.
                                You can also use the CLI flags to override settings.
                            </p>
                            <div className="btn-group" style={{ justifyContent: 'center' }}>
                                <a href="/" className="btn btn-primary">← Back to Dashboard</a>
                                <a href="/chat" className="btn btn-secondary">💬 Open Agent Chat</a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
