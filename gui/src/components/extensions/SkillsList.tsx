/**
 * SkillsList — displays all installed agent tools/skills for a claw.
 */
import { useState, useEffect } from 'react';
import styles from './SkillsList.module.css';

interface Skill {
    name: string; description?: string; version?: string;
    enabled?: boolean; requirementsMet?: boolean; category?: string;
}

export function SkillsList({ clawId }: { clawId: string }) {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Skill | null>(null);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/sandbox/${clawId}/skills`)
            .then(r => r.json()).then(d => { setSkills(d.skills || d.items || []); setError(null); })
            .catch(e => setError(e.message)).finally(() => setLoading(false));
    }, [clawId]);

    const inspect = async (name: string) => {
        try { const d = await (await fetch(`/api/sandbox/${clawId}/skills/${name}`)).json(); setSelected(d.skill || d); }
        catch (e: any) { setError(e.message); }
    };

    if (loading) return <div className={styles.loading}><div className={styles.spinner}/>Loading skills...</div>;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>⚡ Agent Skills</h2>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.grid}>
                {skills.length === 0 ? <p className={styles.empty}>No skills found</p> : skills.map(s => (
                    <div key={s.name} className={`${styles.card} ${s.enabled === false ? styles.disabled : ''}`} onClick={() => inspect(s.name)}>
                        <div className={styles.cardHeader}>
                            <span className={styles.skillName}>{s.name}</span>
                            {s.version && <span className={styles.version}>v{s.version}</span>}
                        </div>
                        {s.description && <p className={styles.desc}>{s.description}</p>}
                        <div className={styles.cardFooter}>
                            {s.category && <span className={styles.category}>{s.category}</span>}
                            <span className={`${styles.statusDot} ${s.requirementsMet !== false ? styles.ok : styles.warn}`} />
                        </div>
                    </div>
                ))}
            </div>
            {selected && (
                <div className={styles.modal} onClick={() => setSelected(null)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h3>{selected.name}</h3>
                        <pre className={styles.json}>{JSON.stringify(selected, null, 2)}</pre>
                        <button className={styles.close} onClick={() => setSelected(null)}>✕ Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
