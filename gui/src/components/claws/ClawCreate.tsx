// ClawCreate — Form to spin up a new claw with gateway & config selection
import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { PROVIDERS as providerDefs } from '../../data/providers';

interface Props { onNavigate?: (path: string) => void; }
interface DeployStep { step: string; status: 'pending' | 'running' | 'complete' | 'error'; message: string; }

export function ClawCreate({ onNavigate }: Props) {
    const [name, setName] = useState('');
    const [gateway, setGateway] = useState('nemoclaw');
    const [provider, setProvider] = useState('cloud');
    const [model, setModel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [endpoint, setEndpoint] = useState('');
    const [gateways, setGateways] = useState<{ name: string; active: boolean }[]>([]);
    const [deploying, setDeploying] = useState(false);
    const [steps, setSteps] = useState<DeployStep[]>([]);
    const [deployResult, setDeployResult] = useState<{ success: boolean; clawId?: string } | null>(null);
    const [error, setError] = useState('');

    useEffect(() => { api.getClawGateways().then(data => { if (data.ok && data.gateways.length > 0) { setGateways(data.gateways); const active = data.gateways.find(g => g.active); if (active) setGateway(active.name); } }).catch(() => {}); }, []);

    const nameValid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) && name.length >= 2;
    const providers = providerDefs || [];

    const handleDeploy = () => {
        if (!nameValid) { setError('Name must be lowercase, alphanumeric with hyphens, at least 2 chars.'); return; }
        setDeploying(true); setSteps([]); setDeployResult(null); setError('');
        const eventSource = new EventSource('/api/claws?' + new URLSearchParams({ _stream: '1' }).toString());
        fetch('/api/claws', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, gatewayName: gateway, provider, model, apiKey, endpoint }) })
        .then(async (res) => {
            if (!res.body) { setError('No response body'); setDeploying(false); return; }
            const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n'); buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim(); if (!trimmed.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(trimmed.slice(6));
                        if (data.done) { setDeployResult({ success: data.success, clawId: data.clawId }); setDeploying(false); return; }
                        if (data.step && data.status) { setSteps(prev => { const idx = prev.findIndex(s => s.step === data.step); if (idx >= 0) { const u = [...prev]; u[idx] = { step: data.step, status: data.status, message: data.message || '' }; return u; } return [...prev, { step: data.step, status: data.status, message: data.message || '' }]; }); }
                    } catch {}
                }
            }
        }).catch(err => { setError(err.message || 'Deployment failed'); setDeploying(false); });
        eventSource.close();
    };

    const stepIcon = (s: string) => { switch (s) { case 'complete': return '✅'; case 'running': return '⏳'; case 'error': return '❌'; default: return '⬜'; } };

    return (
        <div className="page-container">
            <div className="page-header"><div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nc-spacing-sm)' }}><button className="btn btn-sm" onClick={() => onNavigate?.('/claws')}>← Back</button><h2>🐾 New Claw</h2></div></div>
            {error && <div className="alert alert-danger" style={{ marginBottom: 'var(--nc-spacing-md)' }}>{error}</div>}
            {deployResult ? (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--nc-spacing-xl)' }}>
                    {deployResult.success ? (<><div style={{ fontSize: '3rem', marginBottom: 'var(--nc-spacing-md)' }}>🎉</div><h3 style={{ color: 'var(--nc-success, #4caf50)' }}>Claw Created Successfully!</h3><p>Your claw <strong>{deployResult.clawId}</strong> is ready.</p><div style={{ display: 'flex', gap: 'var(--nc-spacing-sm)', justifyContent: 'center', marginTop: 'var(--nc-spacing-md)' }}><button className="btn btn-primary" onClick={() => onNavigate?.(`/claws/${deployResult.clawId}`)}>View Claw</button><button className="btn" onClick={() => onNavigate?.('/claws')}>All Claws</button></div></>) : (<><div style={{ fontSize: '3rem', marginBottom: 'var(--nc-spacing-md)' }}>⚠️</div><h3 style={{ color: 'var(--nc-danger, #f44336)' }}>Deployment Failed</h3><p>Check the steps below for details.</p></>)}
                </div>
            ) : (
                <div className="card" style={{ maxWidth: '600px' }}>
                    <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}><label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>Claw Name *</label><input className="form-input" data-testid="claw-name-input" value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="e.g. my-assistant" disabled={deploying} />{name && !nameValid && <div style={{ color: 'var(--nc-danger, #f44336)', fontSize: '0.75rem', marginTop: '4px' }}>Must be 2+ chars, lowercase alphanumeric with hyphens.</div>}</div>
                    <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}><label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>Gateway</label><select className="form-input" value={gateway} onChange={e => setGateway(e.target.value)} disabled={deploying}>{gateways.length > 0 ? gateways.map(g => <option key={g.name} value={g.name}>{g.name}{g.active ? ' (active)' : ''}</option>) : <option value="nemoclaw">nemoclaw (default)</option>}</select></div>
                    <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>Inference Provider</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>{providers.map(p => <button key={p.key} className={`btn btn-sm ${provider === p.key ? 'btn-primary' : ''}`} onClick={() => setProvider(p.key)} disabled={deploying} data-testid={`provider-${p.key}`} style={{ textAlign: 'center', padding: '10px 8px' }}><div style={{ fontSize: '1.2rem' }}>{p.icon}</div><div style={{ fontSize: '0.75rem', marginTop: '4px' }}>{p.title}</div></button>)}</div></div>
                    <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}><label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>Model</label><input className="form-input" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. nvidia/nemotron-3-super-120b-a12b" disabled={deploying} /></div>
                    <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}><label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>API Key</label><input className="form-input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Your API key" disabled={deploying} /></div>
                    {['ollama', 'vllm', 'nim-local'].includes(provider) && <div className="form-group" style={{ marginBottom: 'var(--nc-spacing-md)' }}><label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>Endpoint URL</label><input className="form-input" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="e.g. http://localhost:11434/v1" disabled={deploying} /></div>}
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--nc-spacing-sm)' }} onClick={handleDeploy} disabled={deploying || !nameValid} data-testid="deploy-claw-btn">{deploying ? '⏳ Deploying...' : '🚀 Deploy Claw'}</button>
                </div>
            )}
            {steps.length > 0 && <div className="card" style={{ marginTop: 'var(--nc-spacing-md)' }}><h3 style={{ marginTop: 0 }}>Deployment Progress</h3><div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{steps.map((step, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', background: step.status === 'error' ? 'rgba(244,67,54,0.1)' : step.status === 'complete' ? 'rgba(76,175,80,0.1)' : 'transparent' }}><span>{stepIcon(step.status)}</span><span style={{ fontWeight: 600, minWidth: '80px' }}>{step.step}</span><span style={{ fontSize: '0.8rem', color: 'var(--nc-text-secondary)' }}>{step.message}</span></div>)}</div></div>}
        </div>
    );
}
