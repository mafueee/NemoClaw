import { useState } from 'react';
import { PROVIDER_DEFINITIONS, ProviderDefinition } from '../../lib/providers';

interface DeployStep {
    step: string;
    status: string;
    message: string;
}

export default function OnboardWizard() {
    const [currentStep, setCurrentStep] = useState(1);
    const [sandboxName, setSandboxName] = useState('my-assistant');
    const [provider, setProvider] = useState('cloud');
    const [model, setModel] = useState('nvidia/nemotron-3-super-120b-a12b');
    const [apiKey, setApiKey] = useState('');
    const [endpoint, setEndpoint] = useState('');

    // Deploy state
    const [deploying, setDeploying] = useState(false);
    const [deploySteps, setDeploySteps] = useState<DeployStep[]>([]);
    const [deployDone, setDeployDone] = useState(false);
    const [deploySuccess, setDeploySuccess] = useState(false);

    const providers = Object.values(PROVIDER_DEFINITIONS);
    const currentProvider: ProviderDefinition = PROVIDER_DEFINITIONS[provider] || providers[0];

    // Update model and endpoint when provider changes
    const handleProviderChange = (newProvider: string) => {
        setProvider(newProvider);
        const pDef = PROVIDER_DEFINITIONS[newProvider];
        if (pDef) {
            setModel(pDef.defaultModel);
            setEndpoint(pDef.defaultEndpoint);
        }
    };

    // Set initial endpoint for cloud provider on first render
    if (!endpoint && currentProvider.defaultEndpoint) {
        setEndpoint(currentProvider.defaultEndpoint);
    }

    // Determine which optional fields to show based on provider
    const showApiKey = ['cloud', 'openrouter', 'gemini', 'ollama'].includes(provider);
    const showEndpoint = currentProvider.endpointEditable;

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

    const stepLabels = ['Gateway', 'Sandbox', 'Provider', 'Policy', 'Deploy'];

    return (
        <>
            <h2 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                <span style={{ marginRight: '0.5rem' }}>🧙‍♂️</span> Onboarding Wizard
            </h2>

            {/* Step indicator */}
            <div className="step-indicator" style={{
                display: 'flex', justifyContent: 'center', gap: 'var(--nc-spacing-md)',
                marginBottom: 'var(--nc-spacing-xl)',
            }}>
                {stepLabels.map((label, idx) => (
                    <div key={idx} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                    }}>
                        <div style={{
                            width: '2rem', height: '2rem', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8rem', fontWeight: 700,
                            background: idx + 1 <= currentStep ? 'var(--nc-accent)' : 'var(--nc-bg-secondary)',
                            color: idx + 1 <= currentStep ? '#000' : 'var(--nc-text-secondary)',
                        }}>{idx + 1}</div>
                        <span style={{
                            fontSize: '0.7rem',
                            color: idx + 1 <= currentStep ? 'var(--nc-text-primary)' : 'var(--nc-text-secondary)',
                        }}>{label}</span>
                    </div>
                ))}
            </div>

            {/* Wizard body */}
            <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <div className="card-body">
                    {/* Step 1: Gateway check */}
                    {currentStep === 1 && (
                        <div>
                            <h3 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>Gateway Check</h3>
                            <p style={{ color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-lg)' }}>
                                NemoClaw will use the local OpenShell gateway to manage your sandbox.
                            </p>
                            <div className="card" style={{ background: 'var(--nc-bg-secondary)', marginBottom: 'var(--nc-spacing-lg)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)' }}>
                                    <span className="status-dot ready"></span>
                                    <span style={{ fontWeight: 600 }}>Gateway available</span>
                                </div>
                            </div>
                            <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={() => setCurrentStep(2)}
                                    data-testid="continue-gateway">Continue →</button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Sandbox name */}
                    {currentStep === 2 && (
                        <div>
                            <h3 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>Sandbox Name</h3>
                            <p style={{ color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-md)' }}>
                                Choose a name for your sandboxed agent environment.
                            </p>
                            <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                                <label className="form-label">Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={sandboxName}
                                    onChange={e => setSandboxName(e.target.value)}
                                    placeholder="my-assistant"
                                    data-testid="sandbox-name-input"
                                />
                                <small style={{ color: 'var(--nc-text-secondary)' }}>
                                    Lowercase letters, numbers, and hyphens only.
                                </small>
                            </div>
                            <div className="btn-group">
                                <button className="btn btn-secondary" onClick={() => setCurrentStep(1)}>← Back</button>
                                <button className="btn btn-primary" onClick={() => setCurrentStep(3)}
                                    data-testid="continue-sandbox">Continue →</button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Provider & inference */}
                    {currentStep === 3 && (
                        <div>
                            <h3 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>Inference Provider</h3>
                            <p style={{ color: 'var(--nc-text-secondary)', marginBottom: 'var(--nc-spacing-md)' }}>
                                Select the inference provider for your agent.
                            </p>

                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                gap: 'var(--nc-spacing-sm)', marginBottom: 'var(--nc-spacing-lg)',
                            }}>
                                {providers.map(p => (
                                    <div
                                        key={p.id}
                                        onClick={() => handleProviderChange(p.id)}
                                        data-testid={`provider-${p.id}`}
                                        style={{
                                            padding: 'var(--nc-spacing-md)', borderRadius: 'var(--nc-radius-md)',
                                            border: `2px solid ${provider === p.id ? 'var(--nc-accent)' : 'var(--nc-border)'}`,
                                            cursor: 'pointer', textAlign: 'center',
                                            background: provider === p.id ? 'rgba(118,185,0,0.08)' : 'transparent',
                                        }}
                                    >
                                        <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>{p.icon}</div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{p.title}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}>
                                <label className="form-label">Model</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={model}
                                    onChange={e => setModel(e.target.value)}
                                    placeholder={currentProvider.defaultModel}
                                    data-testid="model-input"
                                />
                            </div>

                            {showApiKey && (
                                <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}>
                                    <label className="form-label">{currentProvider.apiKeyLabel || 'API Key'}</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        value={apiKey}
                                        onChange={e => setApiKey(e.target.value)}
                                        placeholder={`Enter ${currentProvider.apiKeyLabel || 'API key'}`}
                                        data-testid="api-key-input"
                                    />
                                    {currentProvider.apiKeyHelp && (
                                        <small style={{ color: 'var(--nc-text-secondary)' }}>
                                            {currentProvider.apiKeyHelp}
                                        </small>
                                    )}
                                </div>
                            )}

                            {showEndpoint && (
                                <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}>
                                    <label className="form-label">Endpoint URL</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={endpoint}
                                        onChange={e => setEndpoint(e.target.value)}
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
                                You can customize policies after deployment from the Policies page.
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
