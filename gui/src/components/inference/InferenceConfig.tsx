import { useState } from 'react';

export function InferenceConfig() {
    const [provider, setProvider] = useState('cloud');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('nvidia/llama-3.3-nemotron-super-49b-v1');

    const providers = [
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
        },
        {
            key: 'ollama',
            icon: '🦙',
            title: 'Local Ollama',
            desc: 'Run open models locally via Ollama',
            models: [
                'llama3.3:latest',
                'qwen2.5:32b',
                'gemma3:27b',
                'mistral:latest',
            ],
        },
        {
            key: 'vllm',
            icon: '⚡',
            title: 'Local vLLM',
            desc: 'High-performance inference with vLLM server',
            models: ['Auto-detected from running server'],
        },
    ];

    const currentProvider = providers.find(p => p.key === provider)!;

    return (
        <>
            <div className="page-header">
                <h2>🧠 Inference Configuration</h2>
                <p>Configure your AI model provider and settings</p>
            </div>
            <div className="page-body">
                <h4 style={{ marginBottom: 'var(--nc-spacing-md)' }}>Provider</h4>
                <div className="inference-provider-grid">
                    {providers.map((p) => (
                        <div key={p.key}
                            className="card fade-in"
                            onClick={() => { setProvider(p.key); setModel(p.models[0]); }}
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

                <div className="card fade-in">
                    <h4 style={{ marginBottom: 'var(--nc-spacing-lg)' }}>{currentProvider.title} Settings</h4>

                    {provider === 'cloud' && (
                        <div className="form-group">
                            <label className="form-label">NVIDIA API Key</label>
                            <input
                                className="input"
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="nvapi-..."
                            />
                            <p style={{ fontSize: '0.7rem', color: 'var(--nc-text-muted)', marginTop: '4px' }}>
                                Get your API key at <a href="https://build.nvidia.com" target="_blank" rel="noopener">build.nvidia.com</a>
                            </p>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Model</label>
                        <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                            {currentProvider.models.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    {provider === 'ollama' && (
                        <div className="form-group">
                            <label className="form-label">Ollama Host</label>
                            <input className="input" defaultValue="http://localhost:11434" readOnly />
                        </div>
                    )}

                    {provider === 'vllm' && (
                        <div className="form-group">
                            <label className="form-label">vLLM Endpoint</label>
                            <input className="input" defaultValue="http://localhost:8000" readOnly />
                        </div>
                    )}

                    <div style={{ marginTop: 'var(--nc-spacing-lg)' }}>
                        <h4 style={{ marginBottom: 'var(--nc-spacing-sm)' }}>Apply via CLI</h4>
                        <div className="log-viewer" style={{ maxHeight: '120px' }}>
                            <div className="log-line">
                                <span style={{ color: 'var(--nc-green)' }}>$</span>{' '}
                                {provider === 'cloud'
                                    ? 'export NVIDIA_API_KEY=nvapi-...'
                                    : provider === 'ollama'
                                        ? 'OLLAMA_HOST=0.0.0.0:11434 ollama serve'
                                        : 'vllm serve --model <model-id>'}
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
