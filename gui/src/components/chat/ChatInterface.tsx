import { useState, useRef, useEffect } from 'react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Welcome to the OpenClaw Agent Chat! I\'m your AI assistant running inside a secure NemoClaw sandbox.\n\nYou can ask me to:\n- Browse the web and research topics\n- Write, edit, and run code\n- Manage files and data\n- Interact with APIs and services\n\nAll actions are constrained by the sandbox security policy. What would you like to do?',
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || sending) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setSending(true);

        // Simulate assistant response (in production, this would hit the sandbox API)
        setTimeout(() => {
            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `I received your message: "${userMsg.content}"\n\nNote: Full agent interaction requires a running OpenClaw sandbox. Connect to your sandbox to interact with the agent.\n\n\`\`\`\nnemoclaw <sandbox-name> connect\nopenclaw tui\n\`\`\``,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMsg]);
            setSending(false);
        }, 1000);
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
            <div className="chat-container">
                <div className="chat-messages">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`chat-message ${msg.role} fade-in`}>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
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
                        placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                        rows={1}
                        disabled={sending}
                    />
                    <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !input.trim()}>
                        Send
                    </button>
                </div>
            </div>
        </>
    );
}
