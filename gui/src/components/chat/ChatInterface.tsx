import { useState, useRef, useEffect } from 'react';
import { api } from '../../api/client';
import type { Sandbox } from '../../api/client';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

export function ChatInterface() {
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [selectedSandbox, setSelectedSandbox] = useState('');
    const [sessionId] = useState(() => `gui-${Date.now()}`);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Welcome to the OpenClaw Agent Chat! Select a claw above to start chatting.\n\nYour messages are routed through the selected sandbox via ExecSandbox — all agent actions are constrained by the sandbox\'s security policy.\n\nYou can ask me to:\n- Browse the web and research topics\n- Write, edit, and run code\n- Manage files and data\n- Interact with APIs and services\n\nAll actions are enforced by the claw\'s Landlock, network, and filesystem policies.',
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load sandboxes on mount
    useEffect(() => {
        api.listSandboxes().then(data => {
            setSandboxes(data.sandboxes);
            if (data.sandboxes.length > 0) {
                setSelectedSandbox(data.sandboxes[0].name);
            }
        }).catch(() => { });
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || sending) return;

        if (!selectedSandbox) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                content: '⚠ No sandbox selected. Please select a sandbox from the dropdown above.',
                timestamp: new Date(),
            }]);
            return;
        }

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setSending(true);

        try {
            const result = await api.sendChatMessage(selectedSandbox, userMsg.content, sessionId);
            if (result.ok === false) {
                // API returned a structured error — show as system warning
                const errorMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'system',
                    content: `⚠ ${result.response || result.error || 'Unknown error from agent'}`,
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMsg]);
            } else {
                const assistantMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: result.response || 'No response received.',
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, assistantMsg]);
            }
        } catch (err) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'system',
                content: `⚠ Failed to reach the agent: ${err instanceof Error ? err.message : 'Unknown error'}\n\nMake sure the sandbox is running and OpenClaw is installed inside it.`,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
        }

        setSending(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            <div className="page-header">
                <h2>💬 Agent Chat</h2>
                <p>Interact with the OpenClaw agent in your sandbox</p>
            </div>

            {/* Sandbox selector */}
            <div style={{
                padding: 'var(--nc-spacing-sm) var(--nc-spacing-md)',
                marginBottom: 'var(--nc-spacing-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--nc-spacing-sm)',
            }}>
                <label style={{ fontWeight: 500, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Sandbox:</label>
                {sandboxes.length === 0 ? (
                    <span style={{ color: 'var(--nc-text-muted)', fontSize: '0.85rem' }}>
                        No sandboxes available — <a href="/onboard" style={{ color: 'var(--nc-green)' }}>create one</a>
                    </span>
                ) : (
                    <select
                        className="input"
                        value={selectedSandbox}
                        onChange={(e) => setSelectedSandbox(e.target.value)}
                        style={{ maxWidth: '250px' }}
                        data-testid="chat-sandbox-selector"
                    >
                        {sandboxes.map(sb => (
                            <option key={sb.name} value={sb.name}>{sb.name} ({sb.status})</option>
                        ))}
                    </select>
                )}
                {selectedSandbox && (
                    <span className={`status-badge ${sandboxes.find(s => s.name === selectedSandbox)?.status === 'Ready' ? 'ready' : 'warning'}`}
                        style={{ marginLeft: 'auto' }}>
                        {sandboxes.find(s => s.name === selectedSandbox)?.status || 'Unknown'}
                    </span>
                )}
            </div>

            <div className="chat-container">
                <div className="chat-messages">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`chat-message ${msg.role === 'user' ? 'user' : 'assistant'} fade-in`}>
                            {msg.role === 'system' && (
                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--nc-amber)', marginBottom: '4px' }}>
                                    SYSTEM
                                </div>
                            )}
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                            {msg.role === 'system' && msg.content.includes('API key') && (
                                <a href="/inference" style={{ display: 'inline-block', marginTop: '8px', fontSize: '0.8rem', color: 'var(--nc-green)', fontWeight: 600 }}>
                                    → Reconfigure Inference
                                </a>
                            )}
                            {msg.role === 'system' && msg.content.includes('not installed') && (
                                <a href="/onboard" style={{ display: 'inline-block', marginTop: '8px', fontSize: '0.8rem', color: 'var(--nc-green)', fontWeight: 600 }}>
                                    → Create New Sandbox with OpenClaw
                                </a>
                            )}
                            {msg.role === 'system' && msg.content.includes('SSH transport') && (
                                <a href="/sandboxes" style={{ display: 'inline-block', marginTop: '8px', fontSize: '0.8rem', color: 'var(--nc-green)', fontWeight: 600 }}>
                                    → Manage Sandboxes
                                </a>
                            )}
                            <div style={{
                                fontSize: '0.65rem',
                                color: msg.role === 'user' ? 'rgba(0,0,0,0.5)' : 'var(--nc-text-muted)',
                                marginTop: 'var(--nc-spacing-xs)',
                                textAlign: 'right',
                            }}>
                                {msg.timestamp.toLocaleTimeString()}
                            </div>
                        </div>
                    ))}
                    {sending && (
                        <div className="chat-message assistant fade-in">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div className="loading-spinner"></div>
                                <span style={{ color: 'var(--nc-text-secondary)' }}>Thinking...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="chat-input-area">
                    <textarea
                        className="chat-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={selectedSandbox ? "Type a message... (Enter to send, Shift+Enter for new line)" : "Select a sandbox to start chatting"}
                        rows={1}
                        disabled={sending || !selectedSandbox}
                    />
                    <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !input.trim() || !selectedSandbox}>
                        Send
                    </button>
                </div>
            </div>
        </>
    );
}
