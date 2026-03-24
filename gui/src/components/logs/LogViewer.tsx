import { useState, useEffect, useRef } from 'react';
import { api, streamLogs } from '../../api/client';
import type { Sandbox } from '../../api/client';

export function LogViewer() {
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [selectedSandbox, setSelectedSandbox] = useState('');
    const [logs, setLogs] = useState<string[]>([]);
    const [streaming, setStreaming] = useState(false);
    const [filter, setFilter] = useState('');
    const logRef = useRef<HTMLDivElement>(null);
    const stopRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        api.listSandboxes().then(data => {
            setSandboxes(data.sandboxes);
            if (data.sandboxes.length > 0) {
                setSelectedSandbox(data.sandboxes[0].name);
            }
        }).catch(() => { });
    }, []);

    const startStreaming = () => {
        if (!selectedSandbox) return;
        setLogs([]);
        setStreaming(true);

        stopRef.current = streamLogs(
            selectedSandbox,
            (line) => {
                setLogs(prev => [...prev.slice(-500), line]);
                setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
            },
            (err) => {
                setLogs(prev => [...prev, `[ERROR] ${err}`]);
                setStreaming(false);
            }
        );
    };

    const stopStreaming = () => {
        if (stopRef.current) {
            stopRef.current();
            stopRef.current = null;
        }
        setStreaming(false);
    };

    useEffect(() => {
        return () => { if (stopRef.current) stopRef.current(); };
    }, []);

    const filteredLogs = filter
        ? logs.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
        : logs;

    const getLineClass = (line: string) => {
        if (/error|fail|panic/i.test(line)) return 'error';
        if (/warn/i.test(line)) return 'warn';
        if (/info|ready|\u2713/i.test(line)) return 'info';
        return '';
    };

    return (
        <>
            <div className="page-header">
                <h2>📋 Log Viewer</h2>
                <p>Stream and search sandbox logs in real-time</p>
            </div>
            <div className="page-body">
                <div className="log-controls">
                    <select
                        className="input"
                        value={selectedSandbox}
                        onChange={(e) => { stopStreaming(); setSelectedSandbox(e.target.value); }}
                    >
                        <option value="">Select sandbox...</option>
                        {sandboxes.map(sb => (
                            <option key={sb.name} value={sb.name}>{sb.name}</option>
                        ))}
                    </select>
                    <input
                        className="input"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="🔍 Filter logs..."
                    />
                    {streaming ? (
                        <button className="btn btn-danger" onClick={stopStreaming}>⏹ Stop</button>
                    ) : (
                        <button className="btn btn-primary" onClick={startStreaming} disabled={!selectedSandbox}>
                            ▶ Stream Logs
                        </button>
                    )}
                    <button className="btn btn-secondary" onClick={() => setLogs([])}>🗑 Clear</button>
                </div>

                <div className="log-viewer" ref={logRef} style={{ height: 'calc(100vh - 300px)' }}>
                    {filteredLogs.length === 0 ? (
                        <div style={{ color: 'var(--nc-text-muted)', textAlign: 'center', padding: 'var(--nc-spacing-2xl)' }}>
                            {streaming ? 'Waiting for logs...' : 'Click "Stream Logs" to start viewing'}
                        </div>
                    ) : (
                        filteredLogs.map((line, idx) => (
                            <div key={idx} className={`log-line ${getLineClass(line)}`}>{line}</div>
                        ))
                    )}
                    {streaming && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'var(--nc-spacing-sm)' }}>
                            <div className="loading-spinner" style={{ width: '12px', height: '12px' }}></div>
                            <span style={{ color: 'var(--nc-text-muted)', fontSize: '0.75rem' }}>Streaming...</span>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 'var(--nc-spacing-sm)', fontSize: '0.75rem', color: 'var(--nc-text-muted)' }}>
                    {filteredLogs.length} lines {filter ? '(filtered)' : ''} · Last 500 lines retained
                </div>
            </div>
        </>
    );
}
