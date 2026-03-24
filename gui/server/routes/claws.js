// NemoClaw — Claw Instance REST Routes
// Provides endpoints for claw CRUD, monitoring, and lifecycle management.

import { Router } from 'express';
import { spawn, execSync } from 'child_process';
import { join } from 'path';
import {
    listClaws,
    getClaw,
    registerClaw,
    updateClaw,
    removeClaw,
    touchClaw,
    syncWithOpenShell,
    getGateways,
} from '../services/clawManager.js';

const router = Router();
const NEMOCLAW_ROOT = process.env.NEMOCLAW_ROOT || join(new URL('.', import.meta.url).pathname, '..', '..', '..');

router.get('/api/claws', (req, res) => {
    try {
        const claws = listClaws();
        res.json({ ok: true, claws });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, claws: [] });
    }
});

router.get('/api/claws/:id', (req, res) => {
    try {
        const claw = getClaw(req.params.id);
        if (!claw) return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
        res.json({ ok: true, claw });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/api/claws/:id/status', (req, res) => {
    try {
        const claw = getClaw(req.params.id);
        if (!claw) return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
        res.json({ ok: true, id: claw.id, status: claw.status, sandboxStatus: claw.sandboxStatus, gatewayName: claw.gatewayName, lastConnected: claw.lastConnected });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/api/claws', (req, res) => {
    const { name, gatewayName, provider, model, apiKey, endpoint } = req.body;
    if (!name || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
        return res.status(400).json({ ok: false, error: 'Invalid claw name.' });
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    let clientDisconnected = false;
    const sendEvent = (data) => { if (!clientDisconnected) try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };
    try {
        registerClaw({ id: name, sandboxName: name, gatewayName: gatewayName || 'nemoclaw', config: { provider: provider || 'cloud', model: model || '', endpointUrl: endpoint || '' } });
        sendEvent({ step: 'register', status: 'complete', message: `Claw '${name}' registered` });
    } catch (err) {
        sendEvent({ step: 'register', status: 'error', message: err.message });
        sendEvent({ done: true, success: false });
        res.end();
        return;
    }
    const providerMapping = { 'cloud': 'cloud', 'ollama': 'ollama', 'openrouter': 'cloud', 'gemini': 'cloud', 'vllm': 'vllm', 'nim-local': 'nim' };
    const apiKeyMapping = { 'cloud': 'NVIDIA_API_KEY', 'ollama': 'OLLAMA_API_KEY', 'openrouter': 'OPENROUTER_API_KEY', 'gemini': 'GEMINI_API_KEY', 'vllm': 'OPENAI_API_KEY', 'nim-local': 'NIM_API_KEY' };
    const cliProvider = providerMapping[provider] || 'cloud';
    const apiKeyEnvVar = apiKeyMapping[provider] || 'NVIDIA_API_KEY';
    const cliEnv = { ...process.env, NEMOCLAW_NON_INTERACTIVE: '1', NEMOCLAW_SANDBOX_NAME: name, NEMOCLAW_PROVIDER: cliProvider };
    if (model) cliEnv.NEMOCLAW_MODEL = model;
    if (apiKey) { cliEnv[apiKeyEnvVar] = apiKey; if (cliProvider === 'cloud' && apiKeyEnvVar !== 'NVIDIA_API_KEY' && !cliEnv.NVIDIA_API_KEY) cliEnv.NVIDIA_API_KEY = apiKey; }
    sendEvent({ step: 'deploy', status: 'running', message: 'Starting deployment...' });
    let currentCliStep = '', lastStepSent = '', cliFinished = false;
    function parseCliLine(rawLine) {
        const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (!line) return;
        const stepMatch = line.match(/^\[(\d+)\/7\]\s*(.+)/);
        if (stepMatch) {
            const stepNum = parseInt(stepMatch[1], 10);
            const stepNames = ['preflight', 'gateway', 'sandbox', 'nim', 'inference', 'openclaw', 'policy'];
            currentCliStep = stepNames[stepNum - 1] || `step-${stepNum}`;
            if (lastStepSent && lastStepSent !== currentCliStep) sendEvent({ step: lastStepSent, status: 'complete', message: `${lastStepSent} complete` });
            lastStepSent = currentCliStep;
            sendEvent({ step: currentCliStep, status: 'running', message: stepMatch[2] });
            return;
        }
        if (line.includes('✓')) { if (currentCliStep) sendEvent({ step: currentCliStep, status: 'complete', message: line.replace(/^✓\s*/, '') }); return; }
        if (line.startsWith('!!') || line.includes('Failed') || line.includes('Error')) { if (currentCliStep) sendEvent({ step: currentCliStep, status: 'error', message: line }); return; }
        if (/Creating|Waiting|Building|Pulling|Starting|Configuring/.test(line)) { if (currentCliStep) sendEvent({ step: currentCliStep, status: 'running', message: line }); }
    }
    const cliCmd = join(NEMOCLAW_ROOT, 'bin', 'nemoclaw.js');
    const cliProcess = spawn('node', [cliCmd, 'onboard', '--non-interactive'], { cwd: NEMOCLAW_ROOT, env: cliEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '', errBuffer = '';
    cliProcess.stdout.on('data', (data) => { buffer += data.toString(); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) parseCliLine(line); });
    cliProcess.stderr.on('data', (data) => { errBuffer += data.toString(); const lines = errBuffer.split('\n'); errBuffer = lines.pop() || ''; for (const line of lines) parseCliLine(line); });
    cliProcess.on('error', (err) => { try { removeClaw(name); } catch {} sendEvent({ step: 'deploy', status: 'error', message: `Failed: ${err.message}` }); sendEvent({ done: true, success: false }); res.end(); });
    cliProcess.on('close', (code) => {
        cliFinished = true;
        if (buffer.trim()) parseCliLine(buffer);
        if (errBuffer.trim()) parseCliLine(errBuffer);
        const success = code === 0;
        if (success) { if (lastStepSent) sendEvent({ step: lastStepSent, status: 'complete', message: `${lastStepSent} complete` }); try { updateClaw(name, { status: 'running' }); } catch {} sendEvent({ step: 'complete', status: 'complete', message: `Claw '${name}' deployed` }); }
        else { try { updateClaw(name, { status: 'error' }); } catch {} sendEvent({ step: 'deploy', status: 'error', message: `Failed (exit ${code})` }); }
        sendEvent({ done: true, success, clawId: name });
        res.end();
    });
    res.on('close', () => { clientDisconnected = true; if (cliProcess && !cliProcess.killed && !cliFinished) cliProcess.kill('SIGTERM'); });
});

router.post('/api/claws/:id/reconnect', (req, res) => {
    try {
        const claw = getClaw(req.params.id);
        if (!claw) return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
        touchClaw(req.params.id);
        res.json({ ok: true, claw: getClaw(req.params.id), connectCmd: `openshell sandbox connect ${claw.sandboxName}` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.put('/api/claws/:id/config', (req, res) => {
    try {
        const claw = getClaw(req.params.id);
        if (!claw) return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
        const updated = updateClaw(req.params.id, { config: req.body });
        res.json({ ok: true, claw: updated });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.delete('/api/claws/:id', (req, res) => {
    const { id } = req.params;
    const preserveSandbox = req.query.preserveSandbox === 'true';
    try {
        const claw = getClaw(id);
        if (!claw) return res.status(404).json({ ok: false, error: `Claw '${id}' not found` });
        if (!preserveSandbox) { try { execSync(`openshell sandbox delete "${claw.sandboxName}" 2>/dev/null || true`, { encoding: 'utf-8', timeout: 30000 }); } catch {} }
        removeClaw(id);
        res.json({ ok: true, message: `Claw '${id}' destroyed${preserveSandbox ? ' (sandbox preserved)' : ''}` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/api/claws/:id/logs', (req, res) => {
    const claw = getClaw(req.params.id);
    if (!claw) return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const proc = spawn('openshell', ['logs', claw.sandboxName, '--tail'], { env: process.env });
    proc.stdout.on('data', (data) => { for (const line of data.toString().split('\n')) { if (line.trim()) res.write(`data: ${JSON.stringify({ line: line.trim() })}\n\n`); } });
    proc.stderr.on('data', (data) => { res.write(`data: ${JSON.stringify({ error: data.toString().trim() })}\n\n`); });
    proc.on('close', () => { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); });
    req.on('close', () => { proc.kill(); });
});

router.post('/api/claws/sync', (req, res) => {
    try {
        const claws = syncWithOpenShell();
        res.json({ ok: true, claws });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/api/claws/gateways', (req, res) => {
    try {
        const gateways = getGateways();
        res.json({ ok: true, gateways });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;
