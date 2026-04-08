// NemoClaw — Draft Policy Routes
// Surfaces SubmitPolicyAnalysis draft chunks for approval/rejection in the GUI.
// All operations use gRPC exclusively.

import { Router } from 'express';
import * as grpcClient from '../lib/grpcClient.js';

const router = Router();

// ── Get draft policy chunks for a sandbox ───────────────────────

router.get('/api/policies/:sandbox/drafts', async (req, res) => {
    const { sandbox } = req.params;
    const { status: statusFilter } = req.query;
    try {
        const resp = await grpcClient.getDraftPolicy(sandbox, statusFilter || '');
        const chunks = (resp.chunks || []).map(chunk => ({
            id: chunk.id || '',
            status: chunk.status || 'pending',
            ruleName: chunk.ruleName || '',
            proposedRule: chunk.proposedRule || null,
            rationale: chunk.rationale || '',
            securityNotes: chunk.securityNotes || '',
            confidence: chunk.confidence || 0,
            denialSummaryIds: chunk.denialSummaryIds || [],
            createdAt: chunk.createdAtMs ? new Date(parseInt(chunk.createdAtMs, 10)).toISOString() : '',
            decidedAt: chunk.decidedAtMs && chunk.decidedAtMs !== '0'
                ? new Date(parseInt(chunk.decidedAtMs, 10)).toISOString()
                : null,
            stage: chunk.stage || 'initial',
            supersedesChunkId: chunk.supersedesChunkId || '',
            hitCount: chunk.hitCount || 0,
            firstSeen: chunk.firstSeenMs ? new Date(parseInt(chunk.firstSeenMs, 10)).toISOString() : '',
            lastSeen: chunk.lastSeenMs ? new Date(parseInt(chunk.lastSeenMs, 10)).toISOString() : '',
            binary: chunk.binary || '',
        }));
        res.json({
            ok: true,
            chunks,
            rollingSummary: resp.rollingSummary || '',
            draftVersion: resp.draftVersion || '0',
            lastAnalyzedAt: resp.lastAnalyzedAtMs
                ? new Date(parseInt(resp.lastAnalyzedAtMs, 10)).toISOString()
                : null,
        });
    } catch (err) {
        res.status(err.code === 5 ? 404 : 502).json({
            ok: false,
            error: err.message,
            chunks: [],
        });
    }
});

// ── Approve a draft chunk ───────────────────────────────────────

router.post('/api/policies/drafts/approve', async (req, res) => {
    const { sandboxName, chunkId } = req.body;
    if (!sandboxName || !chunkId) {
        return res.status(400).json({ ok: false, error: 'sandboxName and chunkId are required' });
    }
    try {
        const resp = await grpcClient.approveDraftChunk(sandboxName, chunkId);
        res.json({
            ok: true,
            policyVersion: resp.policyVersion || 0,
            policyHash: resp.policyHash || '',
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Reject a draft chunk ────────────────────────────────────────

router.post('/api/policies/drafts/reject', async (req, res) => {
    const { sandboxName, chunkId, reason } = req.body;
    if (!sandboxName || !chunkId) {
        return res.status(400).json({ ok: false, error: 'sandboxName and chunkId are required' });
    }
    try {
        await grpcClient.rejectDraftChunk(sandboxName, chunkId, reason || '');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Get draft history ───────────────────────────────────────────

router.get('/api/policies/:sandbox/drafts/history', async (req, res) => {
    try {
        const resp = await grpcClient.getDraftHistory(req.params.sandbox);
        const entries = (resp.entries || []).map(e => ({
            timestamp: e.timestampMs ? new Date(parseInt(e.timestampMs, 10)).toISOString() : '',
            eventType: e.eventType || '',
            description: e.description || '',
            chunkId: e.chunkId || '',
        }));
        res.json({ ok: true, entries });
    } catch (err) {
        res.status(err.code === 5 ? 404 : 502).json({ ok: false, error: err.message, entries: [] });
    }
});

export default router;
