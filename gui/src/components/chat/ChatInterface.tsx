import { useState, useRef, useEffect } from 'react';
import { api } from '../../api/client';
import type { ClawInstance } from '../../api/client';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    thought?: string;
    timestamp: Date;
    sandboxed?: boolean;
    warning?: string;
}

interface ChatInterfaceProps {
    /** When provided, locks the chat to this specific claw (embedded mode) */
    clawId?: string;
    /** When true, hides the page header for embedded use */
    embedded?: boolean;
}

export function ChatInterface({ clawId, embedded }: ChatInterfaceProps = {}) {
    const [claws, setClaws] = useState<ClawInstance[]>([]);
    const [selectedClaw, setSelectedClaw] = useState('');
    const [sessionId] = useState(() => `gui-${Date.now()}`);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Welcome to the Claw Agent Chat! Select a claw above to start chatting.\n\nYour messages are routed through the selected claw\'s sandbox via ExecSandbox — all agent actions are constrained by the claw\'s security policy.\n\nYou can ask me to:\n- Browse the web and research topics\n- Write, edit, and run code\n- Manage files and data\n- Interact with APIs and services\n\nAll actions are enforced by the claw\'s Landlock, network, and filesystem policies.',
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load claws on mount
    useEffect(() => {
        api.listClaws().then(data => {
            const runningClaws = data.claws.filter(c => c.status === 'running');
            setClaws(data.claws);
            if (clawId) {
                setSelectedClaw(clawId);
            } else if (runningClaws.length > 0) {
                setSelectedClaw(runningClaws[0].id);
            } else if (data.claws.length > 0) {
                setSelectedClaw(data.claws[0].id);
            }
        }).catch(() => { });
    }, [clawId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Resolve the sandbox name for the selected claw
    const getSelectedSandboxName = (): string => {
        const claw = claws.find(c => c.id === selectedClaw);
        return claw?.sandboxName || selectedClaw;
    };

    const getSelectedClaw = (): ClawInstance | undefined => {
        return claws.find(c => c.id === selectedClaw);
    };

    const sendMessage = async () => {
        if (!input.trim() || sending) return;

        if (!selectedClaw) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                content: '⚠ No claw selected. Please select a claw from the dropdown above.',
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
            const sandboxName = getSelectedSandboxName();
            const result = await api.sendChatMessage(sandboxName, userMsg.content, sessionId);
            if (result.ok === false) {
                // API returned a structured error — show as system warning
                const errorMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'system',
                    content: `⚠ ${result.response || result.error || 'Unknown error from agent'}`,
                    timestamp: new Date(),
                    sandboxed: result.sandboxed,
                    warning: result.warning,
                };
                setMessages(prev => [...prev, errorMsg]);
            } else {
                let finalContent = result.response || 'No response received.';
                let finalThought;
                if (finalContent.includes('<think>')) {
                    const match = finalContent.match(/<think>([\s\S]*?)<\/think>/);
                    if (match) {
                        finalThought = match[1].trim();
                        finalContent = finalContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
                    }
                }

                const assistantMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: finalContent,
                    thought: finalThought,
                    timestamp: new Date(),
                    sandboxed: result.sandboxed,
                    warning: result.warning,
                };
                setMessages(prev => [...prev, assistantMsg]);
            }
        } catch (err) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'system',
                content: `⚠ Failed to reach the agent: ${err instanceof Error ? err.message : 'Unknown error'}\n\nMake sure the claw's sandbox is running and the gateway is online.`,
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

    const selectedClawObj = getSelectedClaw();

    return (
        <>
            {!embedded && (
                <div className="page-header">
                    <h2>💬 Claw Agent Chat</h2>
                    <p>Chat with your claw — all inference is routed through the sandbox's security policy</p>
                </div>
            )}

            {/* Claw selector */}
            {!clawId && (
                <div style={{
                    padding: 'var(--nc-spacing-sm) var(--nc-spacing-md)',
                    marginBottom: 'var(--nc-spacing-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--nc-spacing-sm)',
                }}>
                    <label style={{ fontWeight: 500, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Claw:</label>
                    {claws.length === 0 ? (
                        <span style={{ color: 'var(--nc-text-muted)', fontSize: '0.85rem' }}>
                            No claws available — <a href="/claws/new" style={{ color: 'var(--nc-green)' }}>create one</a>
                        </span>
                    ) : (
                        <select
                            className="input"
                            value={selectedClaw}
                            onChange={(e) => setSelectedClaw(e.target.value)}
                            style={{ maxWidth: '300px' }}
                            data-testid="chat-claw-selector"
                        >
                            {claws.map(claw => (
                                <option key={claw.id} value={claw.id}>
                                    🐾 {claw.id} ({claw.status})
                                </option>
                            ))}
                        </select>
                    )}
                    {selectedClawObj && (
                        <span className={`status-badge ${selectedClawObj.status === 'running' ? 'ready' : 'warning'}`}
                            style={{ marginLeft: 'auto' }}>
                            {selectedClawObj.status}
                        </span>
                    )}
                </div>
            )}

            <div className="chat-container">
                <div className="chat-messages">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`chat-message ${msg.role === 'user' ? 'user' : 'assistant'} fade-in`}>
                            {msg.role === 'system' && (
                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--nc-amber)', marginBottom: '4px' }}>
                                    SYSTEM
                                </div>
                            )}
                            {msg.thought && (
                                <details style={{
                                    marginBottom: 'var(--nc-spacing-sm)',
                                    background: 'var(--nc-surface-hover)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--nc-border)',
                                    overflow: 'hidden'
                                }}>
                                    <summary style={{
                                        padding: '8px 12px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: 'var(--nc-text-secondary)',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <span style={{ fontSize: '1.2em' }}>🧠</span> Agent Thinking Process
                                    </summary>
                                    <div style={{
                                        padding: '12px',
                                        fontSize: '0.85rem',
                                        color: 'var(--nc-text-secondary)',
                                        whiteSpace: 'pre-wrap',
                                        background: 'var(--nc-surface)',
                                        borderTop: '1px solid var(--nc-border)'
                                    }}>
                                        {msg.thought}
                                    </div>
                                </details>
                            )}
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                            {/* Sandboxed / Bypassed indicator */}
                            {msg.role === 'assistant' && msg.sandboxed !== undefined && (
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    marginTop: '6px',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    background: msg.sandboxed
                                        ? 'rgba(76, 175, 80, 0.15)'
                                        : 'rgba(255, 152, 0, 0.15)',
                                    color: msg.sandboxed
                                        ? 'var(--nc-success, #4caf50)'
                                        : 'var(--nc-warning, #ff9800)',
                                    border: `1px solid ${msg.sandboxed ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`,
                                }}
                                    data-testid={msg.sandboxed ? 'badge-sandboxed' : 'badge-bypassed'}
                                >
                                    {msg.sandboxed ? '🔒 Sandboxed' : '⚠ Bypassed — not policy-constrained'}
                                </div>
                            )}
                            {msg.warning && (
                                <div style={{
                                    marginTop: '4px',
                                    fontSize: '0.7rem',
                                    color: 'var(--nc-warning, #ff9800)',
                                    fontStyle: 'italic',
                                }}>
                                    {msg.warning}
                                </div>
                            )}
                            {msg.role === 'system' && msg.content.includes('API key') && (
                                <a href="/inference" style={{ display: 'inline-block', marginTop: '8px', fontSize: '0.8rem', color: 'var(--nc-green)', fontWeight: 600 }}>
                                    → Reconfigure Inference
                                </a>
                            )}
                            {msg.role === 'system' && msg.content.includes('not installed') && (
                                <a href="/claws/new" style={{ display: 'inline-block', marginTop: '8px', fontSize: '0.8rem', color: 'var(--nc-green)', fontWeight: 600 }}>
                                    → Create New Claw
                                </a>
                            )}
                            {msg.role === 'system' && msg.content.includes('SSH transport') && (
                                <a href="/claws" style={{ display: 'inline-block', marginTop: '8px', fontSize: '0.8rem', color: 'var(--nc-green)', fontWeight: 600 }}>
                                    → Manage Claws
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
                        placeholder={selectedClaw ? "Type a message... (Enter to send, Shift+Enter for new line)" : "Select a claw to start chatting"}
                        rows={1}
                        disabled={sending || !selectedClaw}
                    />
                    <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !input.trim() || !selectedClaw}>
                        Send
                    </button>
                </div>
            </div>
        </>
    );
}