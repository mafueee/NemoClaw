/**
 * Sandbox REST API Proxy Routes
 *
 * Forwards requests to the OpenClaw gateway HTTP REST API inside the sandbox
 * by tunnelling curl calls via grpcClient.execSandbox.
 *
 * Mounted at: /api/sandbox/:name/*
 */

import { Router } from 'express';
import * as grpcClient from '../lib/grpcClient.js';

const router = Router({ mergeParams: true });

async function proxyRequest(sandboxUuid, method, path, body = null) {
    const bodyArg = body ? `-d '${JSON.stringify(body).replace(/'/g, "'\\''")}'` : '';
    const curlCmd = [
        'sh', '-c',
        `curl -s -X ${method} -H 'Content-Type: application/json' ${bodyArg} http://127.0.0.1:18789${path}`
    ];
    const stream = grpcClient.execSandbox(sandboxUuid, curlCmd, { timeoutSeconds: 15 });
    return new Promise((resolve, reject) => {
        let buf = '';
        stream.on('data', ev => { if (ev.stdout?.data) buf += Buffer.from(ev.stdout.data).toString('utf8'); });
        stream.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({ raw: buf }); } });
        stream.on('error', reject);
    });
}

async function resolveSandbox(name) {
    const resp = await grpcClient.getSandbox(name);
    const id = resp.sandbox?.id;
    if (!id) throw new Error(`Sandbox '${name}' not found`);
    return id;
}

router.use(async (req, res, next) => {
    try { req.sandboxUuid = await resolveSandbox(req.params.name); next(); }
    catch (err) { res.status(404).json({ ok: false, error: err.message }); }
});

// Approvals
router.get('/approvals', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'GET', '/api/approvals') }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.post('/approvals/:id/approve', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'POST', `/api/approvals/${req.params.id}/approve`, req.body) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.post('/approvals/:id/deny', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'POST', `/api/approvals/${req.params.id}/deny`, req.body) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Sessions
router.get('/sessions', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'GET', '/api/sessions') }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.delete('/sessions/:id', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'DELETE', `/api/sessions/${req.params.id}`) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Agents
router.get('/agents', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'GET', '/api/agents') }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Skills
router.get('/skills', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'GET', '/api/skills') }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.get('/skills/:name', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'GET', `/api/skills/${req.params.name}`) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Plugins
router.get('/plugins', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'GET', '/api/plugins') }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.post('/plugins/install', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'POST', '/api/plugins/install', req.body) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.post('/plugins/:name/enable', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'POST', `/api/plugins/${req.params.name}/enable`) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.post('/plugins/:name/disable', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'POST', `/api/plugins/${req.params.name}/disable`) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.delete('/plugins/:name', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'DELETE', `/api/plugins/${req.params.name}`) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Memory
router.get('/memory/search', async (req, res) => {
    const q = req.query.q || '';
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'GET', `/api/memory/search?q=${encodeURIComponent(q)}`) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.post('/memory/reindex', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'POST', '/api/memory/reindex') }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Cron
router.get('/cron', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'GET', '/api/cron') }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.post('/cron', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'POST', '/api/cron', req.body) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.delete('/cron/:id', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'DELETE', `/api/cron/${req.params.id}`) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Browser automation passthrough
router.get('/browser/:sub(*)', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'GET', '/api/browser/' + req.params.sub) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
router.post('/browser/:sub(*)', async (req, res) => {
    try { res.json({ ok: true, ...await proxyRequest(req.sandboxUuid, 'POST', '/api/browser/' + req.params.sub, req.body) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

export default router;
