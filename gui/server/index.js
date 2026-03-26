// SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

// NemoClaw — Dashboard API Server
// Express server providing gRPC-native REST/SSE endpoints for the web dashboard.
// Zero CLI subprocess calls — all operations use direct gRPC and HTTP APIs.

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { homedir } from 'os';
import * as grpcClient from './lib/grpcClient.js';
import * as gatewayHealth from './lib/gatewayHealth.js';
import clawRoutes from './routes/claws.js';
import { listClaws, registerClaw } from './services/clawManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = parseInt(process.env.PORT || '3000', 10);
const NEMOCLAW_ROOT = process.env.NEMOCLAW_ROOT || join(__dirname, '..', '..');

app.use(express.json());

// Mount claw instance routes
app.use(clawRoutes);

// Serve static frontend
const distDir = join(__dirname, '..', 'dist');
if (existsSync(distDir)) {
    app.use(express.static(distDir));
}

// ── API Routes ──────────────────────────────────────────────────

// Health
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});

// ── Sandboxes — gRPC native ─────────────────────────────────────

app.get('/api/sandboxes', async (req, res) => {
    try {
        const resp = await grpcClient.listSandboxes();
        const sandboxes = (resp.sandboxes || []).map(grpcClient.sandboxToDto);
        res.json({ sandboxes, source: 'grpc' });
    } catch (err) {
        res.status(502).json({ sandboxes: [], error: err.message, source: 'grpc' });
    }
});

app.get('/api/sandboxes/:name/status', async (req, res) => {
    const { name } = req.params;
    try {
        const resp = await grpcClient.getSandbox(name);
        const dto = grpcClient.sandboxToDto(resp.sandbox);
        res.json({ name, ok: true, ...dto, source: 'grpc' });
    } catch (err) {
        res.status(502).json({ name, ok: false, error: err.message, source: 'grpc' });
    }
});

app.post('/api/sandboxes/:name/destroy', async (req, res) => {
    const { name } = req.params;
    if (!name || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
        return res.status(400).json({ ok: false, error: 'Invalid sandbox name' });
    }
    try {
        await grpcClient.deleteSandbox(name);
        res.json({ ok: true, message: `Sandbox '${name}' destroyed` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Gateway — health check via gRPC/HTTP ────────────────────────

app.get('/api/gateway/status', async (req, res) => {
    try {
        const health = await gatewayHealth.checkHealth();
        res.json({
            healthy: health.healthy,
            version: health.version || '',
            method: health.method || '',
            endpoint: health.endpoint || '',
            clusterName: health.clusterName || '',
            configured: gatewayHealth.isGatewayConfigured(),
            source: 'native',
        });
    } catch (err) {
        res.status(502).json({ healthy: false, error: err.message, source: 'native' });
    }
});

// ── Provider CRUD ───────────────────────────────────────────────

app.get('/api/providers', async (req, res) => {
    try {
        const resp = await grpcClient.listProviders();
        res.json({ ok: true, providers: resp.providers || [] });
    } catch (err) {
        res.status(502).json({ ok: false, error: err.message, providers: [] });
    }
});

app.get('/api/providers/:name', async (req, res) => {
    try {
        const resp = await grpcClient.getProvider(req.params.name);
        res.json({ ok: true, provider: resp.provider });
    } catch (err) {
        res.status(err.code === 5 ? 404 : 502).json({ ok: false, error: err.message });
    }
});

app.post('/api/providers', async (req, res) => {
    try {
        const resp = await grpcClient.createProvider(req.body);
        res.json({ ok: true, provider: resp.provider });
    } catch (err) {
        res.status(err.code === 6 ? 409 : 500).json({ ok: false, error: err.message });
    }
});

app.put('/api/providers/:name', async (req, res) => {
    try {
        const provider = { ...req.body, name: req.params.name };
        const resp = await grpcClient.updateProvider(provider);
        res.json({ ok: true, provider: resp.provider });
    } catch (err) {
        res.status(err.code === 5 ? 404 : 500).json({ ok: false, error: err.message });
    }
});

app.delete('/api/providers/:name', async (req, res) => {
    try {
        const resp = await grpcClient.deleteProvider(req.params.name);
        res.json({ ok: true, deleted: resp.deleted });
    } catch (err) {
        res.status(err.code === 5 ? 404 : 500).json({ ok: false, error: err.message });
    }
});

// ── Ports CRUD ──────────────────────────────────────────────────

function loadPortsModule() {
    const portsPath = join(NEMOCLAW_ROOT, 'bin', 'lib', 'ports.js');
    const resolvedPath = require.resolve(portsPath);
    delete require.cache[resolvedPath];
    return require(portsPath);
}

app.get('/api/ports', async (req, res) => {
    try {
        const ports = loadPortsModule();
        const allPorts = ports.getAllPorts();
        const status = await ports.checkAllPorts();
        const sources = ports.getPortSources();
        res.json({ ports: allPorts, status, sources });
    } catch (err) {
        res.json({ ports: {}, status: [], sources: [], error: err.message });
    }
});

app.put('/api/ports', (req, res) => {
    try {
        const ports = loadPortsModule();
        const overrides = req.body;
        if (!overrides || typeof overrides !== 'object') {
            return res.status(400).json({ ok: false, error: 'Body must be an object of port overrides' });
        }
        const parsed = {};
        for (const [key, val] of Object.entries(overrides)) {
            parsed[key] = typeof val === 'string' ? parseInt(val, 10) : val;
        }
        ports.saveConfig(parsed);
        const allPorts = ports.getAllPorts();
        const sources = ports.getPortSources();
        res.json({ ok: true, ports: allPorts, sources });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

app.post('/api/ports/reset', (req, res) => {
    try {
        const ports = loadPortsModule();
        ports.resetConfig();
        const allPorts = ports.getAllPorts();
        const sources = ports.getPortSources();
        res.json({ ok: true, ports: allPorts, sources });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/ports/auto-resolve', async (req, res) => {
    try {
        const ports = loadPortsModule();
        const resolved = await ports.resolveAllPorts({ autoResolve: true });
        ports.saveConfig(resolved);
        const allPorts = ports.getAllPorts();
        const status = await ports.checkAllPorts();
        const sources = ports.getPortSources();
        res.json({ ok: true, ports: allPorts, status, sources });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Policies — gRPC native ──────────────────────────────────────

app.get('/api/policies', (req, res) => {
    try {
        const presetsDir = join(NEMOCLAW_ROOT, 'nemoclaw-blueprint', 'policies', 'presets');
        if (!existsSync(presetsDir)) {
            return res.json({ presets: [] });
        }
        const { readdirSync } = require('fs');
        const presets = readdirSync(presetsDir)
            .filter(f => f.endsWith('.yaml'))
            .map(f => f.replace('.yaml', ''));
        res.json({ presets });
    } catch (err) {
        res.json({ presets: [], error: err.message });
    }
});

app.get('/api/policies/presets', async (req, res) => {
    const { sandboxName } = req.query;
    try {
        const policies = require(join(NEMOCLAW_ROOT, 'bin', 'lib', 'policies.js'));
        const allPresets = policies.listPresets();

        let appliedNames = [];
        if (sandboxName) {
            try {
                const config = await grpcClient.getSandboxConfig(sandboxName);
                const networkPolicies = config.policy?.networkPolicies || {};
                appliedNames = Object.keys(networkPolicies);
            } catch {
                appliedNames = policies.getAppliedPresets(sandboxName);
            }
        }

        const presets = allPresets.map(p => ({
            name: p.name,
            file: p.file,
            description: p.description,
            applied: appliedNames.includes(p.name),
        }));
        res.json({ ok: true, presets });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, presets: [] });
    }
});

app.post('/api/policies/apply', async (req, res) => {
    const { sandboxName, presetName } = req.body;
    if (!sandboxName || !presetName) {
        return res.status(400).json({ ok: false, error: 'sandboxName and presetName are required' });
    }
    try {
        const policies = require(join(NEMOCLAW_ROOT, 'bin', 'lib', 'policies.js'));
        const presetPolicy = policies.loadPresetPolicy(presetName);
        if (!presetPolicy) {
            return res.status(404).json({ ok: false, error: `Preset '${presetName}' not found` });
        }

        let currentPolicy = {};
        try {
            const config = await grpcClient.getSandboxConfig(sandboxName);
            currentPolicy = config.policy || {};
        } catch { /* start fresh if sandbox config not available */ }

        const mergedPolicy = {
            ...currentPolicy,
            networkPolicies: {
                ...(currentPolicy.networkPolicies || {}),
                ...(presetPolicy.network_policies || {}),
            },
        };

        await grpcClient.updateConfig(sandboxName, { policy: mergedPolicy });
        res.json({ ok: true, message: `Applied '${presetName}' to '${sandboxName}'` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/policies/remove', async (req, res) => {
    const { sandboxName, presetName } = req.body;
    if (!sandboxName || !presetName) {
        return res.status(400).json({ ok: false, error: 'sandboxName and presetName are required' });
    }
    try {
        const config = await grpcClient.getSandboxConfig(sandboxName);
        const currentPolicy = config.policy || {};
        const networkPolicies = { ...(currentPolicy.networkPolicies || {}) };

        delete networkPolicies[presetName];

        const updatedPolicy = {
            ...currentPolicy,
            networkPolicies,
        };

        await grpcClient.updateConfig(sandboxName, { policy: updatedPolicy });
        res.json({ ok: true, message: `Removed '${presetName}' from '${sandboxName}'` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Inference Config — gRPC native ──────────────────────────────

const NEMOCLAW_CONFIG_DIR = join(homedir(), '.nemoclaw');
const INFERENCE_CONFIG_FILE = join(NEMOCLAW_CONFIG_DIR, 'config.json');

function ensureNemoClawConfigDir() {
    if (!existsSync(NEMOCLAW_CONFIG_DIR)) {
        mkdirSync(NEMOCLAW_CONFIG_DIR, { recursive: true });
    }
}

function loadInferenceConfig() {
    ensureNemoClawConfigDir();
    if (!existsSync(INFERENCE_CONFIG_FILE)) {
        return null;
    }
    try {
        return JSON.parse(readFileSync(INFERENCE_CONFIG_FILE, 'utf-8'));
    } catch {
        return null;
    }
}

function saveInferenceConfigToDisk(config) {
    ensureNemoClawConfigDir();
    writeFileSync(INFERENCE_CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Validate that an API key looks syntactically plausible.
 * Rejects empty, whitespace-only, or obviously corrupted keys.
 */
function isValidApiKey(key) {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    if (trimmed.length < 8) return false;
    // Reject keys that are entirely non-printable or look like garbled data
    if (/[^\x20-\x7E]/.test(trimmed)) return false;
    return true;
}

/**
 * Restore persisted API key from config.json into process.env at startup.
 * Without this, the key is lost whenever the server restarts because
 * process.env values are only held in memory.
 */
function restoreApiKeyFromConfig() {
    try {
        const cfg = loadInferenceConfig();
        if (!cfg) return;
        const envVar = cfg.credentialEnv;
        const key = cfg._apiKey;
        if (envVar && key && isValidApiKey(key)) {
            process.env[envVar] = key;
            console.log(`  ✓ Restored ${envVar} from persisted config`);
        }
    } catch (err) {
        console.warn('[startup] Could not restore API key from config:', err.message);
    }
}

// Restore API key into process.env immediately on module load
restoreApiKeyFromConfig();

app.get('/api/inference', async (req, res) => {
    try {
        const gwConfig = await grpcClient.getClusterInference();
        const localConfig = loadInferenceConfig() || {};
        res.json({
            config: {
                provider: gwConfig.providerName || localConfig.provider || '',
                model: gwConfig.modelId || localConfig.model || '',
                routeName: gwConfig.routeName || '',
                version: gwConfig.version || '',
                endpointUrl: localConfig.endpointUrl || '',
                credentialEnv: localConfig.credentialEnv || '',
                endpointType: localConfig.endpointType || gwConfig.providerName || '',
                providerLabel: localConfig.providerLabel || gwConfig.providerName || '',
            },
        });
    } catch {
        const config = loadInferenceConfig();
        res.json({ config: config || {} });
    }
});

app.put('/api/inference', async (req, res) => {
    try {
        const { provider, model, endpointUrl, credentialEnv, apiKey } = req.body;
        if (!provider) {
            return res.status(400).json({ ok: false, error: 'provider is required' });
        }

        const providerName = `nemoclaw-${provider}`;

        // Best-effort gRPC — save locally even if gateway is unreachable
        let gatewayWarning = '';
        const credentials = {};
        const config = {};
        if (apiKey) {
            credentials.api_key = apiKey;
        }
        if (endpointUrl) {
            config.base_url = endpointUrl;
        }

        try {
            try {
                await grpcClient.createProvider({
                    name: providerName,
                    type: grpcClient.mapProviderToGrpcType(provider),
                    credentials,
                    config,
                });
            } catch (createErr) {
                if (createErr.code === 6 /* ALREADY_EXISTS */) {
                    await grpcClient.updateProvider({
                        name: providerName,
                        type: grpcClient.mapProviderToGrpcType(provider),
                        credentials,
                        config,
                    });
                } else {
                    throw createErr;
                }
            }

            await grpcClient.setClusterInference(providerName, model || '');
        } catch (grpcErr) {
            // Gateway unreachable — continue with local-only save
            gatewayWarning = `Gateway not reachable (${grpcErr.message}). Config saved locally.`;
            console.warn('[inference] gRPC save failed, persisting locally:', grpcErr.message);
        }

        const existing = loadInferenceConfig() || {};
        const updated = {
            ...existing,
            endpointType: provider,
            endpointUrl: endpointUrl || existing.endpointUrl || '',
            model: model || existing.model || '',
            credentialEnv: credentialEnv || existing.credentialEnv || '',
            provider,
            providerLabel: provider,
            onboardedAt: new Date().toISOString(),
        };

        if (apiKey) {
            const envVar = credentialEnv || `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
            process.env[envVar] = apiKey;
            updated._apiKey = apiKey;
            updated.credentialEnv = envVar;
        }

        saveInferenceConfigToDisk(updated);
        const result = { ok: true, config: updated };
        if (gatewayWarning) result.warning = gatewayWarning;
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/inference/test', async (req, res) => {
    try {
        const { endpoint, apiKey } = req.body;
        if (!endpoint) {
            return res.status(400).json({ ok: false, error: 'endpoint is required' });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            const modelsUrl = endpoint.replace(/\/+$/, '') + '/models';
            const response = await fetch(modelsUrl, {
                headers,
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (response.ok) {
                const data = await response.json();
                const models = data.data?.map(m => m.id) || [];
                res.json({ ok: true, status: response.status, models: models.slice(0, 20) });
            } else {
                res.json({ ok: false, status: response.status, error: `HTTP ${response.status}` });
            }
        } catch (fetchErr) {
            clearTimeout(timeout);
            res.json({ ok: false, error: fetchErr.message || 'Connection failed' });
        }
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Inference Routing Transparency ──────────────────────────────

app.get('/api/inference/routes', async (req, res) => {
    try {
        const bundle = await grpcClient.getInferenceBundle();
        const routes = (bundle.routes || []).map(route => ({
            name: route.name || '',
            baseUrl: route.baseUrl || '',
            protocols: route.protocols || [],
            hasCredential: !!(route.apiKey && route.apiKey !== ''),
            credentialMasked: route.apiKey ? `${route.apiKey.slice(0, 4)}...${route.apiKey.slice(-4)}` : '',
            modelId: route.modelId || '',
            providerType: route.providerType || '',
        }));
        res.json({
            ok: true,
            routes,
            revision: bundle.revision || '',
            generatedAt: bundle.generatedAtMs ? new Date(parseInt(bundle.generatedAtMs, 10)).toISOString() : '',
        });
    } catch (err) {
        // Gateway unreachable — return empty routes instead of 500
        res.json({ ok: true, routes: [], revision: '', generatedAt: '', warning: err.message });
    }
});

// ── Log Streaming (SSE via gRPC WatchSandbox) ───────────────────

app.get('/api/sandboxes/:name/logs', async (req, res) => {
    const { name } = req.params;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    try {
        let sandboxId = name;
        try {
            const resp = await grpcClient.getSandbox(name);
            sandboxId = resp.sandbox?.id || name;
        } catch { /* use name as fallback identifier */ }

        const stream = grpcClient.watchSandbox(sandboxId, {
            followStatus: false,
            followLogs: true,
            logTailLines: parseInt(req.query.tail || '100', 10),
        });

        stream.on('data', (event) => {
            if (event.log) {
                const logLine = `[${event.log.level || 'INFO'}] ${event.log.message || ''}`;
                res.write(`data: ${JSON.stringify({
                    line: logLine,
                    source: event.log.source || 'gateway',
                    level: event.log.level || 'INFO',
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
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    }
});

// ── Onboard Execution (SSE via gRPC) ────────────────────────────

app.get('/api/onboard/execute', async (req, res) => {
    // Config via query: ?config=URL-encoded-JSON or individual params
    let sandboxName, provider, model, apiKey, endpoint;
    if (req.query.config) {
        try {
            const cfg = JSON.parse(req.query.config);
            ({ sandboxName, provider, model, apiKey, endpoint } = cfg);
        } catch { /* fallback to individual params */ }
    }
    sandboxName = sandboxName || req.query.sandboxName;
    provider = provider || req.query.provider;
    model = model || req.query.model;
    apiKey = apiKey || req.query.apiKey;
    endpoint = endpoint || req.query.endpoint;

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

    const safeName = (sandboxName || 'my-assistant').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const providerType = provider || 'cloud';
    const providerName = `nemoclaw-${providerType}`;

    // Step 1: Create/update provider in gateway
    try {
        sendEvent({ step: 'provider', status: 'running', message: 'Configuring inference provider...' });
        const credentials = {};
        const config = {};
        if (apiKey) {
            credentials.api_key = apiKey;
        }
        if (endpoint) {
            config.base_url = endpoint;
        }
        try {
            await grpcClient.createProvider({
                name: providerName,
                type: grpcClient.mapProviderToGrpcType(providerType),
                credentials,
                config,
            });
        } catch (createErr) {
            if (createErr.code === 6 /* ALREADY_EXISTS */) {
                await grpcClient.updateProvider({
                    name: providerName,
                    type: grpcClient.mapProviderToGrpcType(providerType),
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

    // Step 2: Set inference configuration
    try {
        sendEvent({ step: 'inference', status: 'running', message: 'Setting inference configuration...' });
        await grpcClient.setClusterInference(providerName, model || '');
        sendEvent({ step: 'inference', status: 'complete', message: 'Inference configured' });
    } catch (err) {
        sendEvent({ step: 'inference', status: 'error', message: `Inference config failed: ${err.message}` });
    }

    // Step 3: Create sandbox
    let sandboxId = null;
    try {
        sendEvent({ step: 'sandbox', status: 'running', message: `Creating sandbox '${safeName}'...` });
        const spec = {
            environment: {},
            template: {},
            policy: {
                filesystem: { includeWorkdir: true },
                landlock: { compatibility: 'best_effort' },
            },
            providers: [providerName],
        };
        const resp = await grpcClient.createSandbox(spec, safeName);
        sandboxId = resp.sandbox?.id || '';
        sendEvent({ step: 'sandbox', status: 'complete', message: `Sandbox '${safeName}' created` });
    } catch (err) {
        sendEvent({ step: 'sandbox', status: 'error', message: `Sandbox creation failed: ${err.message}` });
        sendEvent({ done: true, success: false, sandboxName: safeName });
        res.end();
        return;
    }

    // Save inference config locally
    try {
        const apiKeyEnvVar = `${providerType.toUpperCase().replace(/-/g, '_')}_API_KEY`;
        const inferenceConfig = {
            endpointType: providerType,
            endpointUrl: endpoint || '',
            model: model || '',
            provider: providerType,
            providerLabel: providerType,
            onboardedAt: new Date().toISOString(),
        };
        if (apiKey) {
            inferenceConfig.credentialEnv = apiKeyEnvVar;
            inferenceConfig._apiKey = apiKey;
            process.env[apiKeyEnvVar] = apiKey;
        }
        saveInferenceConfigToDisk(inferenceConfig);
    } catch { /* best-effort */ }

    // Register the sandbox as a claw
    try {
        registerClaw({
            id: safeName,
            sandboxName: safeName,
            gatewayName: 'nemoclaw',
            config: {
                provider: providerType,
                model: model || '',
                endpointUrl: endpoint || '',
            },
        });
    } catch { /* claw may already exist */ }

    // Step 4: Watch sandbox deployment progress
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
                    sendEvent({ step: 'complete', status: 'complete', message: `Sandbox '${safeName}' deployed successfully` });
                    sendEvent({ done: true, success: true, sandboxName: safeName });
                    res.end();
                } else if (phase === 'SANDBOX_PHASE_ERROR') {
                    sendEvent({ step: 'deploy', status: 'error', message: 'Sandbox entered error state' });
                    sendEvent({ done: true, success: false, sandboxName: safeName });
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
                sendEvent({ step: 'deploy', status: 'error', message: `Watch error: ${err.message}` });
                sendEvent({ done: true, success: false, sandboxName: safeName });
                res.end();
            }
        });

        stream.on('end', () => {
            if (!clientDisconnected && !res.writableEnded) {
                sendEvent({ done: true, success: true, sandboxName: safeName });
                res.end();
            }
        });
    } catch (err) {
        sendEvent({ step: 'deploy', status: 'error', message: `Failed to watch: ${err.message}` });
        sendEvent({ done: true, success: false, sandboxName: safeName });
        res.end();
    }
});

// ── Chat Proxy (gRPC ExecSandbox) ───────────────────────────────

app.post('/api/chat/message', async (req, res) => {
    const { sandboxName, message, sessionId } = req.body;
    if (!sandboxName || !message) {
        return res.status(400).json({ ok: false, error: 'sandboxName and message required' });
    }
    const safeSession = (sessionId || 'gui-session').replace(/[^a-zA-Z0-9-_]/g, '');

    let sandboxId;
    try {
        const resp = await grpcClient.getSandbox(sandboxName);
        sandboxId = resp.sandbox?.id || sandboxName;
    } catch {
        return res.json({
            ok: false,
            response: `Sandbox '${sandboxName}' not found or unreachable. Check the Sandboxes page to verify it is running.`,
            error: 'Sandbox not found',
        });
    }

    const inferCfg = loadInferenceConfig() || {};
    const environment = {};

    const credEnv = inferCfg.credentialEnv;
    const resolvedApiKey = (credEnv && process.env[credEnv]) || inferCfg._apiKey || '';

    if (!resolvedApiKey && inferCfg.provider && inferCfg.provider !== 'ollama') {
        return res.json({
            ok: false,
            response: `No API key found for provider '${inferCfg.provider}'. Please configure your API key on the Inference Config page.`,
            error: 'Missing API key',
        });
    }

    if (resolvedApiKey && !isValidApiKey(resolvedApiKey)) {
        return res.json({
            ok: false,
            response: `The stored API key for '${inferCfg.provider}' appears to be corrupted (contains non-printable characters or is too short). Please re-enter your API key on the Inference Config page.`,
            error: 'Corrupted API key',
        });
    }

    if (credEnv && resolvedApiKey) {
        environment[credEnv] = resolvedApiKey;
    }
    if (inferCfg.endpointUrl) {
        const urlEnvMap = {
            'ollama': 'OLLAMA_HOST',
            'vllm': 'VLLM_ENDPOINT',
            'openrouter': 'OPENROUTER_BASE_URL',
            'nim-local': 'NIM_ENDPOINT',
        };
        const urlEnv = urlEnvMap[inferCfg.provider] || `${inferCfg.provider?.toUpperCase()}_ENDPOINT`;
        environment[urlEnv] = inferCfg.endpointUrl;
    }

    try {
        const command = [
            'openclaw', 'agent',
            '--agent', 'main',
            '--local',
            '-m', message,
            '--session-id', safeSession,
        ];

        const stream = grpcClient.execSandbox(sandboxId, command, {
            environment,
            timeoutSeconds: 120,
        });

        let stdout = '';
        let stderr = '';
        let exitCode = null;
        let finished = false;

        const timeout = setTimeout(() => {
            if (!finished) {
                finished = true;
                stream.cancel();
                res.json({
                    ok: false,
                    response: 'The agent did not respond within 120 seconds. The sandbox may be overloaded.',
                    error: 'Timeout',
                });
            }
        }, 125000);

        stream.on('data', (event) => {
            if (finished) return;
            if (event.stdout) {
                stdout += Buffer.isBuffer(event.stdout) ? event.stdout.toString('utf-8') : String(event.stdout);
            }
            if (event.stderr) {
                stderr += Buffer.isBuffer(event.stderr) ? event.stderr.toString('utf-8') : String(event.stderr);
            }
            if (event.exitCode !== undefined && event.exitCode !== null) {
                exitCode = event.exitCode;
            }
            if (event.exit !== undefined) {
                exitCode = event.exit;
                finished = true;
                clearTimeout(timeout);

                if (exitCode === 127) {
                    res.json({
                        ok: false,
                        response: 'OpenClaw is not installed in this sandbox. The sandbox may need to be rebuilt with the OpenClaw image.\n\nTry creating a new sandbox from the Onboard page.',
                        error: 'OpenClaw not found (exit 127)',
                    });
                } else if (exitCode === 0) {
                    const clean = stdout
                        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                        .replace(/\r/g, '')
                        .trim();
                    res.json({
                        ok: true,
                        response: clean || '(no output)',
                    });
                } else {
                    const clean = stdout
                        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                        .replace(/\r/g, '')
                        .trim();
                    res.json({
                        ok: false,
                        response: clean || stderr.trim() || 'No response from agent. Is the sandbox running and OpenClaw installed?',
                        error: exitCode ? `Exit code ${exitCode}` : 'Agent command failed',
                    });
                }
            }
        });

        stream.on('error', (err) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);

            // Classify the gRPC error into a user-friendly message
            const msg = err.message || 'Unknown error';
            let response;
            if (msg.includes('ssh transport') || msg.includes('Connection reset')) {
                response = 'The sandbox SSH transport was reset. The sandbox may need to be restarted.\n\nTry restarting the sandbox from the Sandboxes page, or create a new one from the Onboard page.';
            } else if (msg.includes('UNAVAILABLE') || msg.includes('connect')) {
                response = 'Cannot reach the OpenShell gateway. Make sure the gateway container is running.';
            } else if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
                response = `The sandbox was not found. It may have been deleted. Please select a different sandbox.`;
            } else {
                response = `Failed to reach the agent: ${msg}\n\nMake sure the sandbox is running and OpenClaw is installed inside it.`;
            }

            // Return 200 with structured error so the frontend can display
            // the actual message instead of a generic "500 Internal Server Error"
            res.json({
                ok: false,
                response,
                error: msg,
            });
        });

        stream.on('end', () => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            res.json({
                ok: stdout.length > 0,
                response: stdout.trim() || '(no output)',
            });
        });
    } catch (err) {
        const msg = err.message || 'Unknown error';
        let response;
        if (msg.includes('No gateway connection')) {
            response = 'OpenShell gateway is not configured or unreachable. Check the Gateway page for status.';
        } else {
            response = `Failed to connect to sandbox: ${msg}`;
        }
        res.json({
            ok: false,
            response,
            error: msg,
        });
    }
});

// ── Onboard Preflight ───────────────────────────────────────────

app.get('/api/onboard/preflight', async (req, res) => {
    const checks = [];

    try {
        const health = await gatewayHealth.checkHealth();
        checks.push({
            name: 'OpenShell Gateway',
            ok: health.healthy,
            detail: health.healthy
                ? `Connected (${health.method}) — v${health.version || 'unknown'}`
                : (health.error || 'Not reachable'),
        });
    } catch {
        checks.push({ name: 'OpenShell Gateway', ok: false, detail: 'Health check failed' });
    }

    try {
        const ports = loadPortsModule();
        const portStatus = await ports.checkAllPorts();
        for (const ps of portStatus) {
            if (ps.name === 'GATEWAY_PORT' || ps.name === 'DASHBOARD_PORT') {
                checks.push({
                    name: `Port ${ps.port} (${ps.name})`,
                    ok: ps.available,
                    detail: ps.available ? 'Available' : ps.reason || 'In use',
                });
            }
        }
    } catch {
        checks.push({ name: 'Port Check', ok: false, detail: 'Could not load ports module' });
    }

    try {
        const resp = await grpcClient.listProviders();
        const count = (resp.providers || []).length;
        checks.push({
            name: 'Inference Providers',
            ok: true,
            detail: count > 0 ? `${count} provider(s) configured` : 'No providers — will configure during onboard',
        });
    } catch {
        checks.push({ name: 'Inference Providers', ok: true, detail: 'Will configure during onboard', warning: true });
    }

    res.json({ checks });
});

// ── WebSocket for real-time updates ─────────────────────────────

let lastSandboxJson = '';
let cachedSandboxes = [];
let cachedGatewayHealthy = null;
let lastClawsJson = '';
let cachedClaws = [];

function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
            client.send(msg);
        }
    }
}

async function sendCurrentState(ws) {
    if (ws.readyState !== ws.OPEN) return;
    try {
        const health = await gatewayHealth.checkHealth();
        ws.send(JSON.stringify({
            type: 'status',
            gateway: { healthy: health.healthy, method: health.method, version: health.version },
            sandboxes: cachedSandboxes,
            claws: cachedClaws,
            timestamp: new Date().toISOString(),
        }));
    } catch {
        ws.send(JSON.stringify({
            type: 'status',
            gateway: { healthy: false },
            sandboxes: cachedSandboxes,
            claws: cachedClaws,
            timestamp: new Date().toISOString(),
        }));
    }
}

const pollInterval = setInterval(async () => {
    if (wss.clients.size === 0) return;

    let gwHealthy = cachedGatewayHealthy;
    try {
        const resp = await grpcClient.listSandboxes();
        const sandboxes = (resp.sandboxes || []).map(grpcClient.sandboxToDto);
        const json = JSON.stringify(sandboxes);
        if (json !== lastSandboxJson) {
            lastSandboxJson = json;
            cachedSandboxes = sandboxes;
            broadcast({ type: 'sandbox:list', sandboxes });
        }
    } catch {
        // gRPC unavailable — keep cached state
    }

    try {
        const health = await gatewayHealth.checkHealthGrpc();
        gwHealthy = health.healthy;
    } catch {
        gwHealthy = false;
    }
    if (gwHealthy !== cachedGatewayHealthy) {
        cachedGatewayHealthy = gwHealthy;
    }

    try {
        const claws = await listClaws();
        const clawJson = JSON.stringify(claws);
        if (clawJson !== lastClawsJson) {
            lastClawsJson = clawJson;
            cachedClaws = claws;
            broadcast({ type: 'claw:list', claws });
        }
    } catch { /* best-effort */ }

    broadcast({
        type: 'status',
        gateway: { healthy: gwHealthy },
        sandboxes: cachedSandboxes,
        claws: cachedClaws,
        timestamp: new Date().toISOString(),
    });
}, 5000);

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected' }));

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'subscribe') {
                sendCurrentState(ws);
            }
        } catch { /* ignore */ }
    });
});

// ── SPA fallback ────────────────────────────────────────────────
app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        return res.status(404).json({ error: 'Not found' });
    }
    const indexPath = join(distDir, 'index.html');
    if (existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send(`
      <html>
        <body style="background:#1a1a2e;color:#fff;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <h1 style="color:#76B900">NemoClaw Dashboard API</h1>
            <p>API server is running. Run <code>npm run dev</code> in gui/ for the frontend.</p>
          </div>
        </body>
      </html>
    `);
    }
});

server.listen(PORT, () => {
    console.log(`  NemoClaw Dashboard API running on http://localhost:${PORT}`);
});
