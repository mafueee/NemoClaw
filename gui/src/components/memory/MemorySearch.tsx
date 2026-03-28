/**
 * MemorySearch — Search and reindex agent memory files.
 */
import { useState } from 'react';
import styles from './MemorySearch.module.css';

interface MemoryResult { file: string; snippet: string; score?: number; }

export function MemorySearch({ clawId }: { clawId: string }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MemoryResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [reindexing, setReindexing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const search = async () => {
        if (!query.trim()) return;
        setLoading(true); setError(null);
        try { const d = await (await fetch(`/api/sandbox/${clawId}/memory/search?q=${encodeURIComponent(query)}`)).json(); setResults(d.results || d.items || []); }
        catch (e: any) { setError(e.message); } finally { setLoading(false); }
    };
    const reindex = async () => {
        setReindexing(true); setError(null); setMessage(null);
        try { const d = await (await fetch(`/api/sandbox/${clawId}/memory/reindex`, { method: 'POST' })).json(); setMessage(d.message || 'Reindex complete'); }
        catch (e: any) { setError(e.message); } finally { setReindexing(false); }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>🧠 Memory Search</h2>
            {error && <div className={styles.error}>{error}</div>}
            {message && <div className={styles.success}>{message}</div>}
            <div className={styles.searchBar}>
                <input className={styles.input} type="text" placeholder="Search agent memory..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
                <button className={styles.searchBtn} onClick={search} disabled={loading || !query.trim()}>{loading ? '...' : '🔍 Search'}</button>
                <button className={styles.reindexBtn} onClick={reindex} disabled={reindexing}>{reindexing ? '...' : '↻ Reindex'}</button>
            </div>
            {results.length === 0 && !loading && query && <div className={styles.empty}>No results for "{query}"</div>}
            <ul className={styles.results}>
                {results.map((r, i) => (
                    <li key={i} className={styles.result}>
                        <div className={styles.resultFile}>{r.file}</div>
                        <p className={styles.snippet}>{r.snippet}</p>
                        {r.score != null && <span className={styles.score}>score: {r.score.toFixed(3)}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}
