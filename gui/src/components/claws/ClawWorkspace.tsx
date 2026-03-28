import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { WorkspaceFile } from '../../api/client';

interface Props {
    clawId: string;
}

export function ClawWorkspace({ clawId }: Props) {
    const [files, setFiles] = useState<WorkspaceFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeFile, setActiveFile] = useState<string>('SOUL.md');
    const [editContent, setEditContent] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const loadWorkspace = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.getClawWorkspace(clawId);
            if (res.ok && res.files) {
                setFiles(res.files);
                const current = res.files.find(f => f.name === activeFile);
                if (current) {
                    setEditContent(current.content);
                } else if (res.files.length > 0) {
                    setActiveFile(res.files[0].name);
                    setEditContent(res.files[0].content);
                }
            } else {
                setError('Failed to load workspace files');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error loading workspace files');
        }
        setLoading(false);
    }, [clawId, activeFile]);

    useEffect(() => {
        loadWorkspace();
    }, [loadWorkspace]);

    const handleFileSelect = (filename: string) => {
        const file = files.find(f => f.name === filename);
        if (file) {
            setActiveFile(filename);
            setEditContent(file.content);
            setSuccessMsg('');
            setError('');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSuccessMsg('');
        setError('');
        try {
            const res = await api.updateClawWorkspaceFile(clawId, activeFile, editContent);
            if (res.ok) {
                setSuccessMsg(`Successfully updated ${activeFile}`);
                // Update local state to reflect saved changes
                setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: editContent } : f));
            } else {
                setError('Failed to save file');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error saving file');
        }
        setSaving(false);
    };

    if (loading && files.length === 0) {
        return <div className="card">Loading workspace files...</div>;
    }

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '600px' }}>
            <h3 style={{ marginTop: 0, marginBottom: 'var(--nc-spacing-md)' }}>📂 Workspace Files</h3>
            <p style={{ color: 'var(--nc-text-muted)', fontSize: '0.85rem', marginBottom: 'var(--nc-spacing-md)' }}>
                These Markdown files define your claw's core personality and knowledge base. They are injected into the sandbox workspace.
            </p>
            
            {error && <div className="alert alert-danger" style={{ marginBottom: 'var(--nc-spacing-sm)' }}>{error}</div>}
            {successMsg && <div className="alert alert-success" style={{ marginBottom: 'var(--nc-spacing-sm)' }}>{successMsg}</div>}

            <div style={{ display: 'flex', flex: 1, gap: 'var(--nc-spacing-md)', overflow: 'hidden' }}>
                {/* Sidebar */}
                <div style={{ width: '200px', borderRight: '1px solid var(--nc-border, #333)', paddingRight: 'var(--nc-spacing-sm)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {files.map(f => (
                        <button
                            key={f.name}
                            onClick={() => handleFileSelect(f.name)}
                            style={{
                                textAlign: 'left',
                                padding: '8px 12px',
                                background: activeFile === f.name ? 'var(--nc-surface-hover, rgba(118, 185, 0, 0.15))' : 'transparent',
                                border: 'none',
                                borderLeft: activeFile === f.name ? '3px solid var(--nc-primary, #76B900)' : '3px solid transparent',
                                color: activeFile === f.name ? '#fff' : 'var(--nc-text-secondary)',
                                cursor: 'pointer',
                                borderRadius: '0 4px 4px 0',
                                fontWeight: activeFile === f.name ? 600 : 400,
                            }}
                        >
                            📄 {f.name}
                        </button>
                    ))}
                </div>

                {/* Editor */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--nc-spacing-sm)' }}>
                        <strong style={{ fontSize: '0.9rem' }}>Editing: {activeFile}</strong>
                        <div style={{ display: 'flex', gap: 'var(--nc-spacing-sm)' }}>
                            <button className="btn btn-sm" onClick={loadWorkspace} disabled={saving || loading}>
                                🔄 Reload
                            </button>
                            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || loading}>
                                {saving ? 'Saving...' : '💾 Save'}
                            </button>
                        </div>
                    </div>
                    <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        style={{
                            flex: 1,
                            width: '100%',
                            background: '#0a0a14',
                            color: '#e0e0e0',
                            border: '1px solid var(--nc-border, #333)',
                            borderRadius: '4px',
                            padding: '12px',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            resize: 'none',
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
