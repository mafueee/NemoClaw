import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { PreflightCheck } from '../../api/client';
import { PROVIDERS } from '../../data/providers';

interface DeployStep {
    step: string;
    status: string;
    message: string;
}

const WIZARD_STEPS = [
    { id: 'preflight', title: 'Preflight' },
    { id: 'gateway', title: 'Gateway' },
    { id: 'sandbox', title: 'Sandbox' },
    { id: 'inference', title: 'Inference' },
    { id: 'policy', title: 'Policy' },
    { id: 'deploy', title: 'Deploy' },
];

export function OnboardWizard() {
    const [currentStep, setCurrentStep] = useState(0);
    const [checks, setChecks] = useState<PreflightCheck[]>([]);
    const [loading, setLoading] = useState(false);
    const [sandboxName, setSandboxName] = useState('my-assistant');
    const [provider, setProvider] = useState('cloud');
    const [model, setModel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [endpoint, setEndpoint] = useState('');

    // Deploy state
    const [deploying, setDeploying] = useState(false);
    const [deploySteps, setDeploySteps] = useState<DeployStep[]>([]);
    const [deployDone, setDeployDone] = useState(false);
    const [deploySuccess, setDeploySuccess] = useState(false);

    const currentProvider = PROVIDERS.find(p => p.key === provider) || PROVIDERS[0];

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

    // Set initial model and endpoint when provider changes
    const handleProviderChange = (key: string) => {
        setProvider(key);
        const p = PROVIDERS.find(pr => pr.key === key);
        if (p) {
            setModel(p.models[0] || '');
            setEndpoint(p.defaultEndpoint);
        }
    };

    // Set initial model/endpoint on first render
    useEffect(() => {
        if (!model && currentProvider) {
            setModel(currentProvider.models[0] || '');
            setEndpoint(currentProvider.defaultEndpoint);
        }
    }, []);

    const allPassed = checks.length > 0 && checks.every(c => c.ok || c.warning);

    const startDeploy = async () => {
        setDeploying(true);
        setDeploySteps([]);
        setDeployDone(false);
        setDeploySuccess(false);

        try {
            const config = encodeURIComponent(JSON.stringify({
                sandboxName,
                provider,
                model,
                apiKey: apiKey || undefined,
                endpoint: endpoint || undefined,
            }));
            const response = await fetch(`/api/onboard/execute?config=${config}`);

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            if (!reader) {
                setDeploySteps([{ step: 'error', status: 'error', message: 'No response stream available' }]);
                setDeployDone(true);
                setDeploying(false);
                return;
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const evt = JSON.parse(line.slice(6));
                            if (evt.done) {
                                setDeployDone(true);
                                setDeploySuccess(evt.success || false);
                                setDeploying(false);
                            } else {
                                setDeploySteps(prev => {
                                    const idx = prev.findIndex(s => s.step === evt.step);
                                    if (idx >= 0 && evt.status === prev[idx].status) {
                                        const copy = [...prev];
                                        copy[idx] = evt;
                                        return copy;
                                    }
                                    return [...prev, evt];
                                });
                            }
                        } catch { /* ignore parse errors */ }
                    }
                }
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setDeploySteps(prev => [...prev, { step: 'error', status: 'error', message: msg }]);
            setDeployDone(true);
            setDeploying(false);
        }
    };

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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nc-spacing-sm)' }}>
                                {PROVIDERS.map(opt => (
                                    <div key={opt.key}
                                        onClick={() => handleProviderChange(opt.key)}
                                        data-testid={`provider-${opt.key}`}
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

                            <div className="form-group" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                                <label className="form-label">Model</label>
                                <input
                                    className="input"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    placeholder={currentProvider.models[0] || 'Model name'}
                                    data-testid="model-input"
                                />
                            </div>

                            <div className="form-group" style={{ marginTop: 'var(--nc-spacing-md)' }}>
                                <label className="form-label">{currentProvider.apiKeyEnv.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</label>
                                <input
                                    className="input"
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={currentProvider.apiKeyPlaceholder}
                                    data-testid="api-key-input"
                                />
                                {currentProvider.apiKeyHelp && (
                                    <p style={{ fontSize: '0.75rem', color: 'var(--nc-text-muted)', marginTop: 'var(--nc-spacing-xs)' }}>
                                        {currentProvider.apiKeyHelp}{' '}
                                        {currentProvider.apiKeyHelpUrl && (
                                            <a href={currentProvider.apiKeyHelpUrl} target="_blank" rel="noopener">
                                                {currentProvider.apiKeyHelpUrl.replace(/^https?:\/\//, '')}
                                            </a>
                                        )}
                                    </p>
                                )}
                            </div>

                            {currentProvider.endpointEditable && (
                                <div className="form-group" style={{ marginTop: 'var(--nc-spacing-md)' }}>
                                    <label className="form-label">Endpoint URL</label>
                                    <input
                                        className="input"
                                        value={endpoint}
                                        onChange={(e) => setEndpoint(e.target.value)}
                                        placeholder={currentProvider.defaultEndpoint || 'https://...'}
                                        data-testid="endpoint-input"
                                    />
                                </div>
                            )}

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
                                <button className="btn btn-primary" onClick={() => setCurrentStep(5)}
                                    data-testid="continue-policy">Deploy Sandbox →</button>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Deploy */}
                    {currentStep === 5 && (
                        <div>
                            {!deploying && !deployDone && (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: 'var(--nc-spacing-md)' }}>🚀</div>
                                    <h3 style={{ marginBottom: 'var(--nc-spacing-sm)' }}>Ready to Deploy</h3>
                                    <p style={{ color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-lg)' }}>
                                        Sandbox <strong>{sandboxName}</strong> will be created with <strong>{currentProvider.title}</strong> inference.
                                    </p>
                                    <div style={{
                                        textAlign: 'left',
                                        background: 'var(--nc-bg-secondary)',
                                        borderRadius: 'var(--nc-radius-md)',
                                        padding: 'var(--nc-spacing-md)',
                                        marginBottom: 'var(--nc-spacing-lg)',
                                        fontSize: '0.85rem',
                                    }}>
                                        <div><strong>Name:</strong> {sandboxName}</div>
                                        <div><strong>Provider:</strong> {currentProvider.title}</div>
                                        <div><strong>Model:</strong> {model}</div>
                                        {endpoint && <div><strong>Endpoint:</strong> {endpoint}</div>}
                                    </div>
                                    <div className="btn-group" style={{ justifyContent: 'center' }}>
                                        <button className="btn btn-secondary" onClick={() => setCurrentStep(4)}>← Back</button>
                                        <button
                                            className="btn btn-primary"
                                            onClick={startDeploy}
                                            data-testid="deploy-btn"
                                        >
                                            🚀 Deploy Sandbox
                                        </button>
                                    </div>
                                </div>
                            )}

                            {(deploying || deployDone) && (
                                <div>
                                    <h3 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                                        {deployDone ? (deploySuccess ? '✅ Deployment Complete' : '❌ Deployment Failed') : '⏳ Deploying...'}
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nc-spacing-sm)' }}>
                                        {deploySteps.map((evt, idx) => (
                                            <div key={idx} className="fade-in" style={{
                                                display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)',
                                                padding: 'var(--nc-spacing-sm) var(--nc-spacing-md)',
                                                background: 'var(--nc-bg-secondary)',
                                                borderRadius: 'var(--nc-radius-sm)',
                                            }}>
                                                <span className={`status-dot ${evt.status === 'complete' ? 'ready' : evt.status === 'error' ? 'error' : 'warning'}`}></span>
                                                <span style={{ flex: 1, fontSize: '0.85rem' }}>
                                                    <strong style={{ textTransform: 'capitalize' }}>{evt.step}</strong>
                                                    {' — '}{evt.message}
                                                </span>
                                            </div>
                                        ))}
                                        {deploying && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)', padding: 'var(--nc-spacing-sm)' }}>
                                                <div className="loading-spinner"></div>
                                                <span style={{ color: 'var(--nc-text-secondary)' }}>Working...</span>
                                            </div>
                                        )}
                                    </div>

                                    {deployDone && (
                                        <div className="btn-group" style={{ marginTop: 'var(--nc-spacing-xl)', justifyContent: 'center' }}>
                                            <a href="/" className="btn btn-primary">← Dashboard</a>
                                            {deploySuccess && <a href="/chat" className="btn btn-secondary">💬 Chat with Agent</a>}
                                            {!deploySuccess && (
                                                <button className="btn btn-secondary" onClick={() => {
                                                    setDeployDone(false);
                                                    setDeploySteps([]);
                                                }}>🔄 Retry</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
