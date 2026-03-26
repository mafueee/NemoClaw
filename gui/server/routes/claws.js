// NemoClaw — Claw Instance REST Routes
// Provides endpoints for claw CRUD, monitoring, and lifecycle management.
// All sandbox operations use gRPC exclusively — no CLI fallback.

import { Router } from 'express';
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
import * as grpcClient from '../lib/grpcClient.js';
import { mapProviderToGrpcType } from '../lib/grpcClient.js';

const router = Router();

// ── List all claws ────────────────────────────────────────────────

router.get('/api/claws', async (req, res) => {
    try {
        const claws = await listClaws();
        res.json({ ok: true, claws });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, claws: [] });
    }
});

// ── Get single claw detail ────────────────────────────────────────

router.get('/api/claws/:id', async (req, res) => {
    try {
        const claw = await getClaw(req.params.id);
        if (!claw) {
            return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
        }
        res.json({ ok: true, claw });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Get claw real-time status ─────────────────────────────────────

router.get('/api/claws/:id/status', async (req, res) => {
    try {
        const claw = await getClaw(req.params.id);
        if (!claw) {
            return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
        }
        res.json({
            ok: true,
            id: claw.id,
            status: claw.status,
            sandboxStatus: claw.sandboxStatus,
            gatewayName: claw.gatewayName,
            lastConnected: claw.lastConnected,
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Create new claw (gRPC native) ─────────────────────────────────

router.post('/api/claws', async (req, res) => {
    const { name, gatewayName, provider, model, apiKey, endpoint } = req.body;

    if (!name || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
        return res.status(400).json({ ok: false, error: 'Invalid claw name. Use lowercase letters, numbers, and hyphens.' });
    }

    // SSE response for deployment progress
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    let clientDisconnected = false;
    const sendEvent = (data) => {
        if (clientDisconnected) return;
        try {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch { /* client gone */ }
    };

    req.on('close', () => { clientDisconnected = true; });

    // Step 1: Register the claw in our local registry
    try {
        registerClaw({
            id: name,
            sandboxName: name,
            gatewayName: gatewayName || 'nemoclaw',
            config: {
                provider: provider || 'cloud',
                model: model || '',
                endpointUrl: endpoint || '',
            },
        });
        sendEvent({ step: 'register', status: 'complete', message: `Claw '${name}' registered` });
    } catch (err) {
        sendEvent({ step: 'register', status: 'error', message: err.message });
        sendEvent({ done: true, success: false });
        res.end();
        return;
    }

    // Step 2: Create / update provider in the gateway via gRPC
    try {
        sendEvent({ step: 'provider', status: 'running', message: 'Configuring inference provider...' });
        const providerType = provider || 'cloud';
        const providerName = `nemoclaw-${providerType}`;
        const credentials = {};
        const config = {};

        if (apiKey) {
            const credKeyMap = {
                'cloud': 'api_key', 'ollama': 'api_key', 'openrouter': 'api_key',
                'gemini': 'api_key', 'vllm': 'api_key', 'nim-local': 'api_key',
            };
            credentials[credKeyMap[providerType] || 'api_key'] = apiKey;
        }
        if (endpoint) {
            config.base_url = endpoint;
        }

        try {
            await grpcClient.createProvider({
                name: providerName,
                type: mapProviderToGrpcType(providerType),
                credentials,
                config,
            });
        } catch (createErr) {
            if (createErr.code === 6 /* ALREADY_EXISTS */) {
                await grpcClient.updateProvider({
                    name: providerName,
                    type: mapProviderToGrpcType(providerType),
                    credentials,
                    config,
                });
            } else {
                throw createErr;
            }
        }
        sendEvent({ step: 'provider', status: 'complete', message: 'Provider configured' });
    } catch (err) {
        sendEvent({ step: 'provider', status: 'error', message: `Provider setup failed: ${err.message}` });
    }

    // Step 3: Set inference configuration via gRPC
    try {
        sendEvent({ step: 'inference', status: 'running', message: 'Setting inference configuration...' });
        const providerType = provider || 'cloud';
        const providerName = `nemoclaw-${providerType}`;
        await grpcClient.setClusterInference(providerName, model || '');
        sendEvent({ step: 'inference', status: 'complete', message: 'Inference configured' });
    } catch (err) {
        sendEvent({ step: 'inference', status: 'error', message: `Inference config failed: ${err.message}` });
    }

    // Step 4: Create sandbox via gRPC
    let sandboxId = null;
    try {
        sendEvent({ step: 'sandbox', status: 'running', message: `Creating sandbox '${name}'...` });
        const spec = {
            environment: {},
            template: {},
            policy: {
                filesystem: { includeWorkdir: true },
                landlock: { compatibility: 'best_effort' },
            },
            providers: [`nemoclaw-${provider || 'cloud'}`],
        };
        const resp = await grpcClient.createSandbox(spec, name);
        sandboxId = resp.sandbox?.id || '';
        sendEvent({ step: 'sandbox', status: 'complete', message: `Sandbox '${name}' created (id: ${sandboxId})` });
    } catch (err) {
        sendEvent({ step: 'sandbox', status: 'error', message: `Sandbox creation failed: ${err.message}` });
        try { removeClaw(name); } catch { /* best effort cleanup */ }
        sendEvent({ done: true, success: false });
        res.end();
        return;
    }

    // Step 5: Watch sandbox deployment progress via gRPC stream
    try {
        sendEvent({ step: 'deploy', status: 'running', message: 'Waiting for sandbox to become ready...' });
        const stream = grpcClient.watchSandbox(sandboxId, {
            followStatus: true,
            followLogs: true,
            stopOnTerminal: true,
            logTailLines: 20,
        });

        stream.on('data', (event) => {
            if (clientDisconnected) {
                stream.cancel();
                return;
            }
            if (event.sandbox) {
                const phase = event.sandbox.phase || 'SANDBOX_PHASE_UNSPECIFIED';
                const status = grpcClient.mapPhaseToStatus(phase);
                sendEvent({ step: 'deploy', status: 'running', message: `Sandbox phase: ${status}`, phase });

                if (phase === 'SANDBOX_PHASE_READY') {
                    try { updateClaw(name, { status: 'running' }); } catch { /* best effort */ }
                    sendEvent({ step: 'complete', status: 'complete', message: `Claw '${name}' deployed successfully` });
                    sendEvent({ done: true, success: true, clawId: name });
                    res.end();
                } else if (phase === 'SANDBOX_PHASE_ERROR') {
                    try { updateClaw(name, { status: 'error' }); } catch { /* best effort */ }
                    sendEvent({ step: 'deploy', status: 'error', message: 'Sandbox entered error state' });
                    sendEvent({ done: true, success: false, clawId: name });
                    res.end();
                }
            }
            if (event.log) {
                sendEvent({
                    step: 'deploy',
                    status: 'running',
                    message: `[${event.log.level || 'INFO'}] ${event.log.message || ''}`,
                });
            }
        });

        stream.on('error', (err) => {
            if (!clientDisconnected) {
                try { updateClaw(name, { status: 'error' }); } catch { /* best effort */ }
                sendEvent({ step: 'deploy', status: 'error', message: `Watch stream error: ${err.message}` });
                sendEvent({ done: true, success: false, clawId: name });
                res.end();
            }
        });

        stream.on('end', () => {
            if (!clientDisconnected && !res.writableEnded) {
                sendEvent({ done: true, success: true, clawId: name });
                res.end();
            }
        });
    } catch (err) {
        sendEvent({ step: 'deploy', status: 'error', message: `Failed to watch sandbox: ${err.message}` });
        sendEvent({ done: true, success: false, clawId: name });
        res.end();
    }
});

// ── Reconnect to a claw ─────────────────────────────────────────

router.post('/api/claws/:id/reconnect', async (req, res) => {
    try {
        const claw = await getClaw(req.params.id);
        if (!claw) {
            return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
        }
        touchClaw(req.params.id);
        res.json({
            ok: true,
            claw: await getClaw(req.params.id),
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Update claw config ──────────────────────────────────────────

router.put('/api/claws/:id/config', async (req, res) => {
    try {
        const claw = await getClaw(req.params.id);
        if (!claw) {
            return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
        }
        const updated = updateClaw(req.params.id, { config: req.body });
        res.json({ ok: true, claw: updated });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Destroy a claw (gRPC-native sandbox deletion) ───────────────

router.delete('/api/claws/:id', async (req, res) => {
    const { id } = req.params;
    const preserveSandbox = req.query.preserveSandbox === 'true';

    try {
        const claw = await getClaw(id);
        if (!claw) {
            return res.status(404).json({ ok: false, error: `Claw '${id}' not found` });
        }

        // Delete the underlying sandbox via gRPC
        if (!preserveSandbox) {
            try {
                await grpcClient.deleteSandbox(claw.sandboxName);
            } catch (err) {
                console.warn(`gRPC DeleteSandbox for '${claw.sandboxName}' failed: ${err.message}`);
            }
        }

        removeClaw(id);
        res.json({ ok: true, message: `Claw '${id}' destroyed${preserveSandbox ? ' (sandbox preserved)' : ''}` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Per-claw log streaming (SSE via gRPC WatchSandbox) ──────────

router.get('/api/claws/:id/logs', async (req, res) => {
    const claw = await getClaw(req.params.id);
    if (!claw) {
        return res.status(404).json({ ok: false, error: `Claw '${req.params.id}' not found` });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    try {
        const stream = grpcClient.watchSandbox(claw.id || claw.sandboxName, {
            followStatus: false,
            followLogs: true,
            logTailLines: parseInt(req.query.tail || '100', 10),
            logSources: req.query.source ? [req.query.source] : [],
            logMinLevel: req.query.level || '',
        });

        stream.on('data', (event) => {
            if (event.log) {
                const logLine = `[${event.log.level || 'INFO'}] ${event.log.message || ''}`;
                res.write(`data: ${JSON.stringify({
                    line: logLine,
                    source: event.log.source || 'gateway',
                    level: event.log.level || 'INFO',
                    timestamp: event.log.timestampMs || '',
                    fields: event.log.fields || {},
                })}\n\n`);
            }
        });

        stream.on('end', () => {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        });

        stream.on('error', (err) => {
            res.write(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        });

        req.on('close', () => {
            stream.cancel();
        });
    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: err.message || 'Failed to start log stream' })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    }
});

// ── Sync with OpenShell ─────────────────────────────────────────

router.post('/api/claws/sync', async (req, res) => {
    try {
        const claws = await syncWithOpenShell();
        res.json({ ok: true, claws });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── List available gateways ─────────────────────────────────────

router.get('/api/claws/gateways', async (req, res) => {
    try {
        const gateways = await getGateways();
        res.json({ ok: true, gateways });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;
