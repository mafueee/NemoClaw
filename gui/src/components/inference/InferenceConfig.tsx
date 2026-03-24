import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';

interface ProviderDef {
    key: string;
    icon: string;
    title: string;
    desc: string;
    models: string[];
    endpointEditable: boolean;
    defaultEndpoint: string;
    apiKeyEnv: string;
    apiKeyPlaceholder: string;
    apiKeyHelp?: string;
    apiKeyHelpUrl?: string;
}

const PROVIDERS: ProviderDef[] = [
    {
        key: 'cloud',
        icon: '☁️',
        title: 'NVIDIA Cloud API',
        desc: 'Use models hosted on build.nvidia.com',
        models: [
            'nvidia/llama-3.3-nemotron-super-49b-v1',
            'nvidia/llama-3.1-nemotron-ultra-253b-v1',
            'meta/llama-3.3-70b-instruct',
            'deepseek/deepseek-r1',
        ],
        endpointEditable: false,
        defaultEndpoint: 'https://integrate.api.nvidia.com/v1',
        apiKeyEnv: 'NVIDIA_API_KEY',
        apiKeyPlaceholder: 'nvapi-...',
        apiKeyHelp: 'Get your API key at',
        apiKeyHelpUrl: 'https://build.nvidia.com',
    },
    {
        key: 'ollama',
        icon: '🦙',
        title: 'Ollama',
        desc: 'Connect to an Ollama server (local or remote)',
        models: [
            'llama3.3:latest',
            'qwen2.5:32b',
            'gemma3:27b',
            'mistral:latest',
            'deepseek-r1:latest',
        ],
        endpointEditable: true,
        defaultEndpoint: 'http://localhost:11434/v1',
        apiKeyEnv: 'OLLAMA_API_KEY',
        apiKeyPlaceholder: 'Optional — leave blank for local',
        apiKeyHelp: 'Only needed if your Ollama server requires auth',
    },
    {
        key: 'openrouter',
        icon: '🌐',
        title: 'OpenRouter',
        desc: '200+ models via openrouter.ai',
        models: [
            'anthropic/claude-sonnet-4',
            'google/gemini-2.5-pro',
            'google/gemini-3-flash',
            'openai/gpt-4.1',
            'deepseek/deepseek-r1',
            'meta-llama/llama-4-maverick',
        ],
        endpointEditable: false,
        defaultEndpoint: 'https://openrouter.ai/api/v1',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        apiKeyPlaceholder: 'sk-or-v1-...',
        apiKeyHelp: 'Get your API key at',
        apiKeyHelpUrl: 'https://openrouter.ai/keys',
    },
    {
        key: 'gemini',
        icon: '💎',
        title: 'Google Gemini',
        desc: 'Gemini models via Google AI Studio',
        models: [
            'gemini-3-flash',
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
        ],
        endpointEditable: false,
        defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKeyEnv: 'GEMINI_API_KEY',
        apiKeyPlaceholder: 'AIza...',
        apiKeyHelp: 'Get your API key at',
        apiKeyHelpUrl: 'https://aistudio.google.com/apikey',
    },
    {
        key: 'vllm',
        icon: '⚡',
        title: 'Local vLLM',
        desc: 'High-performance inference with vLLM server',
        models: ['Auto-detected from running server'],
        endpointEditable: true,
        defaultEndpoint: 'http://localhost:8000/v1',
        apiKeyEnv: 'OPENAI_API_KEY',
        apiKeyPlaceholder: 'Optional',
    },
    {
        key: 'nim-local',
        icon: '🖥️',
        title: 'Local GPU (NIM)',
        desc: 'On-premise NIM container inference',
        models: [
            'nvidia/nemotron-3-super-120b-a12b',
            'nvidia/nemotron-3-nano-30b-a3b',
        ],
        endpointEditable: true,
        defaultEndpoint: 'http://nim-service.local:8000/v1',
        apiKeyEnv: 'NIM_API_KEY',
        apiKeyPlaceholder: 'Optional',
    },
];

type BannerState = { type: 'success' | 'error' | 'info'; message: string } | null;

export function InferenceConfig() {
    const [provider, setProvider] = useState('cloud');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState(PROVIDERS[0].models[0]);
    const [endpoint, setEndpoint] = useState(PROVIDERS[0].defaultEndpoint);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [banner, setBanner] = useState<BannerState>(null);
    const [loaded, setLoaded] = useState(false);
    const [remoteModels, setRemoteModels] = useState<string[]>([]);

    const currentProvider = PROVIDERS.find(p => p.key === provider)!;

    // Load saved config on mount
    useEffect(() => {
        api.getInferenceConfig()
            .then(({ config }) => {
                if (config && config.provider) {
                    const found = PROVIDERS.find(p => p.key === config.provider);
                    if (found) {
                        setProvider(config.provider);
                        setModel(config.model || found.models[0]);
                        setEndpoint(config.endpointUrl || found.defaultEndpoint);
                    }
                }
            })
            .catch(() => { /* silently ignore on dev/offline */ })
            .finally(() => setLoaded(true));
    }, []);

    // Update endpoint/model when switching providers
    const switchProvider = useCallback((key: string) => {
        const p = PROVIDERS.find(pr => pr.key === key)!;
        setProvider(key);
        setModel(p.models[0]);
        setEndpoint(p.defaultEndpoint);
        setApiKey('');
        setBanner(null);
        setRemoteModels([]);
    }, []);

    // Save config
    const handleSave = async () => {
        setSaving(true);
        setBanner(null);
        try {
            await api.saveInferenceConfig({
                provider,
                model,
                endpointUrl: endpoint,
                credentialEnv: currentProvider.apiKeyEnv,
            });
            setBanner({ type: 'success', message: '✅ Configuration saved successfully' });
        } catch (err) {
            setBanner({ type: 'error', message: `❌ Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}` });
        } finally {
            setSaving(false);
        }
    };

    // Test connection
    const handleTest = async () => {
        setTesting(true);
        setBanner(null);
        try {
            const result = await api.testInferenceEndpoint(endpoint, apiKey || undefined);
            if (result.ok) {
                if (result.models && result.models.length > 0) {
                    setRemoteModels(result.models);
                    setBanner({ type: 'success', message: `✅ Connected — ${result.models.length} model(s) available` });
                } else {
                    setBanner({ type: 'success', message: '✅ Endpoint is reachable' });
                }
            } else {
                setBanner({ type: 'error', message: `❌ Connection failed: ${result.error || 'Unknown error'}` });
            }
        } catch (err) {
            setBanner({ type: 'error', message: `❌ Test failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
        } finally {
            setTesting(false);
        }
    };

    // CLI hint for the current provider
    const cliHint = (() => {
        switch (provider) {
            case 'cloud':
                return 'export NVIDIA_API_KEY=nvapi-...';
            case 'ollama':
                return `OLLAMA_HOST=${endpoint.replace('/v1', '')} ollama serve`;
            case 'openrouter':
                return 'export OPENROUTER_API_KEY=sk-or-v1-...';
            case 'gemini':
                return 'export GEMINI_API_KEY=AIza...';
            case 'vllm':
                return 'vllm serve --model <model-id>';
            case 'nim-local':
                return 'docker run --gpus all nvcr.io/nim/...';
            default:
                return '';
        }
    })();

    // Merge static models with remote-discovered ones
    const availableModels = remoteModels.length > 0
        ? [...new Set([...remoteModels, ...currentProvider.models])]
        : currentProvider.models;

    if (!loaded) {
        return (
            <>
                <div className="page-header">
                    <h2>🧠 Inference Configuration</h2>
                    <p>Loading configuration...</p>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="page-header">
                <h2>🧠 Inference Configuration</h2>
                <p>Configure your AI model provider and settings</p>
            </div>
            <div className="page-body">
                {/* Banner */}
                {banner && (
                    <div className={`port-banner port-banner-${banner.type === 'success' ? 'success' : banner.type === 'error' ? 'error' : 'info'}`}
                        style={{ marginBottom: 'var(--nc-spacing-lg)' }}>
                        {banner.message}
                        <button className="port-banner-close" onClick={() => setBanner(null)}>✕</button>
                    </div>
                )}

                {/* Provider Selection */}
                <h4 style={{ marginBottom: 'var(--nc-spacing-md)' }}>Provider</h4>
                <div className="inference-provider-grid">
                    {PROVIDERS.map((p) => (
                        <div key={p.key}
                            className="card fade-in"
                            onClick={() => switchProvider(p.key)}
                            style={{
                                cursor: 'pointer',
                                textAlign: 'center',
                                borderColor: provider === p.key ? 'var(--nc-border-active)' : undefined,
                                boxShadow: provider === p.key ? 'var(--nc-shadow-glow)' : undefined,
                            }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--nc-spacing-sm)' }}>{p.icon}</div>
                            <div style={{ fontWeight: 600, marginBottom: '2px' }}>{p.title}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--nc-text-secondary)' }}>{p.desc}</div>
                        </div>
                    ))}
                </div>

                {/* Configuration */}
                <div className="card fade-in" style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                    <h4 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>{currentProvider.title} Settings</h4>

                    {/* API Key */}
                    {(provider === 'cloud' || provider === 'openrouter' || provider === 'gemini' || provider === 'ollama') && (
                        <div className="form-group">
                            <label className="form-label">{currentProvider.apiKeyEnv.replace(/_/g, ' ')}</label>
                            <input
                                className="input"
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={currentProvider.apiKeyPlaceholder}
                            />
                            {currentProvider.apiKeyHelp && (
                                <p style={{ fontSize: '0.7rem', color: 'var(--nc-text-muted)', marginTop: '4px' }}>
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

                    {/* Endpoint */}
                    {currentProvider.endpointEditable ? (
                        <div className="form-group">
                            <label className="form-label">Endpoint URL</label>
                            <input
                                className="input"
                                type="url"
                                value={endpoint}
                                onChange={(e) => setEndpoint(e.target.value)}
                                placeholder={currentProvider.defaultEndpoint}
                            />
                        </div>
                    ) : (
                        <div className="form-group">
                            <label className="form-label">Endpoint</label>
                            <input className="input" value={endpoint} readOnly
                                style={{ color: 'var(--nc-text-muted)' }} />
                        </div>
                    )}

                    {/* Model */}
                    <div className="form-group">
                        <label className="form-label">Model</label>
                        <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                            {availableModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        {remoteModels.length > 0 && (
                            <p style={{ fontSize: '0.7rem', color: 'var(--nc-green)', marginTop: '4px' }}>
                                ✓ {remoteModels.length} model(s) discovered from server
                            </p>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 'var(--nc-spacing-sm)', marginTop: 'var(--nc-spacing-lg)' }}>
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? '⏳ Saving...' : '💾 Save Configuration'}
                        </button>
                        <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
                            {testing ? '⏳ Testing...' : '🔌 Test Connection'}
                        </button>
                    </div>

                    {/* CLI Hint */}
                    <div style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                        <h4 style={{ marginBottom: 'var(--nc-spacing-sm)' }}>Apply via CLI</h4>
                        <div className="log-viewer" style={{ maxHeight: '120px' }}>
                            <div className="log-line">
                                <span style={{ color: 'var(--nc-green)' }}>$</span> {cliHint}
                            </div>
                            <div className="log-line">
                                <span style={{ color: 'var(--nc-green)' }}>$</span> nemoclaw onboard
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
