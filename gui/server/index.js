// NemoClaw Dashboard — Express API Server
// Wraps nemoclaw/openshell CLI operations and serves the React frontend.

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import clawRoutes from './routes/claws.js';
import { listClaws } from './services/clawManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// ── Helper: run CLI command safely ──────────────────────────────
function runCli(cmd, opts = {}) {
    try {
        const output = execSync(cmd, {
            encoding: 'utf-8',
            timeout: opts.timeout || 30000,
            cwd: NEMOCLAW_ROOT,
            env: { ...process.env },
        });
        return { ok: true, output: output.trim() };
    } catch (err) {
        return {
            ok: false,
            output: (err.stdout || '') + (err.stderr || ''),
            code: err.status,
        };
    }
}

// ── API Routes ──────────────────────────────────────────────────

// Health
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});

// Sandboxes
app.get('/api/sandboxes', (req, res) => {
    const result = runCli('openshell sandbox list 2>/dev/null');
    if (!result.ok) {
        return res.json({ sandboxes: [], raw: result.output });
    }

    // Parse the sandbox list output
    const lines = result.output.split('\n').filter(l => l.trim());
    const sandboxes = [];
    for (const line of lines) {
        const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
        const cols = clean.split(/\s+/);
        if (cols.length >= 2 && !clean.startsWith('NAME') && !clean.startsWith('─')) {
            sandboxes.push({
                name: cols[0],
                image: cols[1] || '',
                created: cols[2] || '',
                status: cols[cols.length - 1] || 'Unknown',
            });
        }
    }
    res.json({ sandboxes, raw: result.output });
});

app.get('/api/sandboxes/:name/status', (req, res) => {
    const { name } = req.params;
    const result = runCli(`openshell sandbox get "${name}" 2>/dev/null`);
    res.json({ name, ...result });
});

app.post('/api/sandboxes/:name/start', (req, res) => {
    const { name } = req.params;
    const result = runCli(`node ${join(NEMOCLAW_ROOT, 'bin', 'nemoclaw.js')} start`);
    res.json({ name, ...result });
});

app.post('/api/sandboxes/:name/stop', (req, res) => {
    const { name } = req.params;
    const result = runCli(`node ${join(NEMOCLAW_ROOT, 'bin', 'nemoclaw.js')} stop`);
    res.json({ name, ...result });
});

app.post('/api/sandboxes/:name/destroy', (req, res) => {
    const { name } = req.params;
    // Validate sandbox name
    if (!name || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
        return res.status(400).json({ ok: false, error: 'Invalid sandbox name' });
    }
    try {
        // Stop NIM container
        runCli(`docker stop nemoclaw-nim-${name} 2>/dev/null || true`, { timeout: 15000 });
        runCli(`docker rm nemoclaw-nim-${name} 2>/dev/null || true`, { timeout: 10000 });
        // Delete sandbox via openshell
        runCli(`openshell sandbox delete "${name}" 2>/dev/null || true`, { timeout: 30000 });
        // Remove from registry
        try {
            const registry = require(join(NEMOCLAW_ROOT, 'bin', 'lib', 'registry.js'));
            registry.removeSandbox(name);
        } catch { /* registry may not be available */ }
        res.json({ ok: true, message: `Sandbox '${name}' destroyed` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Gateway
app.get('/api/gateway/status', (req, res) => {
    const result = runCli('openshell status 2>&1');
    const healthy = result.ok && result.output.includes('Connected');
    res.json({ healthy, ...result });
});

app.post('/api/gateway/start', (req, res) => {
    const result = runCli(`openshell gateway start --name nemoclaw 2>&1`, { timeout: 60000 });
    const healthy = result.ok && !result.output.includes('error');
    res.json({ ok: result.ok, healthy, output: result.output });
});

app.post('/api/gateway/stop', (req, res) => {
    const result = runCli(`openshell gateway stop 2>&1`, { timeout: 30000 });
    res.json({ ok: result.ok, output: result.output });
});

// ── Ports CRUD ──────────────────────────────────────────────────

function loadPortsModule() {
    const portsPath = join(NEMOCLAW_ROOT, 'bin', 'lib', 'ports.js');
    // Clear Node's require cache so we always get fresh config reads
    const resolvedPath = require.resolve(portsPath);
    delete require.cache[resolvedPath];
    // Use dynamic require for CommonJS module
    const mod = require(portsPath);
    return mod;
}

// Lazy-init require for CommonJS interop in ESM
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

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
        // Convert string values to numbers
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

// Policies
app.get('/api/policies', (req, res) => {
    const result = runCli(`ls ${join(NEMOCLAW_ROOT, 'nemoclaw-blueprint', 'policies', 'presets')} 2>/dev/null`);
    const presets = result.ok
        ? result.output.split('\n').filter(f => f.endsWith('.yaml')).map(f => f.replace('.yaml', ''))
        : [];
    res.json({ presets });
});

// Policies — presets with descriptions and applied status
app.get('/api/policies/presets', (req, res) => {
    const { sandboxName } = req.query;
    try {
        const policies = require(join(NEMOCLAW_ROOT, 'bin', 'lib', 'policies.js'));
        const allPresets = policies.listPresets();
        let applied = [];
        if (sandboxName) {
            applied = policies.getAppliedPresets(sandboxName);
        }
        const presets = allPresets.map(p => ({
            name: p.name,
            file: p.file,
            description: p.description,
            applied: applied.includes(p.name),
        }));
        res.json({ ok: true, presets });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, presets: [] });
    }
});

app.post('/api/policies/apply', (req, res) => {
    const { sandboxName, presetName } = req.body;
    if (!sandboxName || !presetName) {
        return res.status(400).json({ ok: false, error: 'sandboxName and presetName are required' });
    }
    try {
        const policies = require(join(NEMOCLAW_ROOT, 'bin', 'lib', 'policies.js'));
        const result = policies.applyPreset(sandboxName, presetName);
        res.json({ ok: result !== false, message: result !== false ? `Applied '${presetName}' to '${sandboxName}'` : 'Failed to apply preset' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/policies/remove', (req, res) => {
    const { sandboxName, presetName } = req.body;
    if (!sandboxName || !presetName) {
        return res.status(400).json({ ok: false, error: 'sandboxName and presetName are required' });
    }
    try {
        const registry = require(join(NEMOCLAW_ROOT, 'bin', 'lib', 'registry.js'));
        const sandbox = registry.getSandbox(sandboxName);
        if (sandbox) {
            const pols = (sandbox.policies || []).filter(p => p !== presetName);
            registry.updateSandbox(sandboxName, { policies: pols });
        }
        res.json({ ok: true, message: `Removed '${presetName}' from '${sandboxName}'` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Inference Config CRUD ───────────────────────────────────────

import { readFileSync, writeFileSync, existsSync as fsExists, mkdirSync } from 'fs';
import { homedir } from 'os';

const NEMOCLAW_CONFIG_DIR = join(homedir(), '.nemoclaw');
const INFERENCE_CONFIG_FILE = join(NEMOCLAW_CONFIG_DIR, 'config.json');

function ensureNemoClawConfigDir() {
    if (!fsExists(NEMOCLAW_CONFIG_DIR)) {
        mkdirSync(NEMOCLAW_CONFIG_DIR, { recursive: true });
    }
}

function loadInferenceConfig() {
    ensureNemoClawConfigDir();
    if (!fsExists(INFERENCE_CONFIG_FILE)) {
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

app.get('/api/inference', (req, res) => {
    const config = loadInferenceConfig();
    res.json({ config: config || {} });
});

app.put('/api/inference', (req, res) => {
    try {
        const { provider, model, endpointUrl, credentialEnv, apiKey } = req.body;
        if (!provider) {
            return res.status(400).json({ ok: false, error: 'provider is required' });
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

        // If an API key value is provided, set it as env var for the current process
        // and persist it in the config file so it survives server restarts
        if (apiKey) {
            const envVar = credentialEnv || `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
            process.env[envVar] = apiKey;
            updated._apiKey = apiKey;
        }

        saveInferenceConfigToDisk(updated);
        res.json({ ok: true, config: updated });
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
            // Try /models endpoint (standard OpenAI-compatible)
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

// Logs (Server-Sent Events)
app.get('/api/sandboxes/:name/logs', (req, res) => {
    const { name } = req.params;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const proc = spawn('openshell', ['logs', name, '--tail'], {
        cwd: NEMOCLAW_ROOT,
        env: process.env,
    });

    proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) {
                res.write(`data: ${JSON.stringify({ line: line.trim() })}\n\n`);
            }
        }
    });

    proc.stderr.on('data', (data) => {
        res.write(`data: ${JSON.stringify({ error: data.toString().trim() })}\n\n`);
    });

    proc.on('close', () => {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    });

    req.on('close', () => {
        proc.kill();
    });
});

// ── Onboard Execution (SSE) ─────────────────────────────────────

// Map GUI provider keys to CLI-compatible NEMOCLAW_PROVIDER values.
// The CLI only supports: cloud, ollama, vllm, nim.
// GUI-extra providers (openrouter, gemini) route through 'cloud' in the CLI
// and get their specific inference config saved separately.
function mapProviderToCliEnv(guiProvider) {
    const mapping = {
        'cloud': 'cloud',
        'ollama': 'ollama',
        'openrouter': 'cloud',   // CLI treats as cloud; we save inference config after
        'gemini': 'cloud',       // CLI treats as cloud; we save inference config after
        'vllm': 'vllm',
        'nim-local': 'nim',
    };
    return mapping[guiProvider] || 'cloud';
}

// Map GUI provider key to the env var name for the API key
function getApiKeyEnvVar(guiProvider) {
    const mapping = {
        'cloud': 'NVIDIA_API_KEY',
        'ollama': 'OLLAMA_API_KEY',
        'openrouter': 'OPENROUTER_API_KEY',
        'gemini': 'GEMINI_API_KEY',
        'vllm': 'OPENAI_API_KEY',
        'nim-local': 'NIM_API_KEY',
    };
    return mapping[guiProvider] || 'NVIDIA_API_KEY';
}

app.post('/api/onboard/execute', (req, res) => {
    const { sandboxName, provider, model, apiKey, endpoint } = req.body;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const sendEvent = (data) => {
        if (clientDisconnected) return;
        try {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch { /* client gone */ }
    };

    const safeName = (sandboxName || 'my-assistant').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const cliProvider = mapProviderToCliEnv(provider || 'cloud');
    const apiKeyEnvVar = getApiKeyEnvVar(provider || 'cloud');

    // Build environment for the CLI subprocess
    const cliEnv = {
        ...process.env,
        NEMOCLAW_NON_INTERACTIVE: '1',
        NEMOCLAW_SANDBOX_NAME: safeName,
        NEMOCLAW_PROVIDER: cliProvider,
    };

    // Set model (except for providers whose CLI path auto-detects)
    if (model) {
        cliEnv.NEMOCLAW_MODEL = model;
    }

    // Set API key in the env var the CLI expects
    if (apiKey) {
        cliEnv[apiKeyEnvVar] = apiKey;
        // For cloud-mapped providers, also set NVIDIA_API_KEY if provider is cloud
        if (cliProvider === 'cloud' && apiKeyEnvVar !== 'NVIDIA_API_KEY') {
            // The CLI cloud path requires NVIDIA_API_KEY; for openrouter/gemini
            // we still set their own key and handle inference config separately.
            // Set a placeholder for NVIDIA_API_KEY if it's not already set
            // so the CLI doesn't block asking for it.
            if (!cliEnv.NVIDIA_API_KEY) {
                cliEnv.NVIDIA_API_KEY = apiKey;
            }
        }
    }

    // Track current step for progress parsing
    let currentCliStep = '';
    let lastStepSent = '';
    let cliSucceeded = false;
    let cliProcess = null;
    let cliFinished = false;
    let clientDisconnected = false;

    // Parse CLI output lines into SSE events
    function parseCliLine(rawLine) {
        const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (!line) return;

        // Step markers from onboard.js: [1/7], [2/7], etc.
        const stepMatch = line.match(/^\[(\d+)\/7\]\s*(.+)/);
        if (stepMatch) {
            const stepNum = parseInt(stepMatch[1], 10);
            const stepMsg = stepMatch[2];
            const stepNames = ['preflight', 'gateway', 'sandbox', 'nim', 'inference', 'openclaw', 'policy'];
            currentCliStep = stepNames[stepNum - 1] || `step-${stepNum}`;

            // Send previous step as complete if it didn't error
            if (lastStepSent && lastStepSent !== currentCliStep) {
                sendEvent({ step: lastStepSent, status: 'complete', message: `${lastStepSent} complete` });
            }
            lastStepSent = currentCliStep;
            sendEvent({ step: currentCliStep, status: 'running', message: stepMsg });
            return;
        }

        // Success markers
        if (line.startsWith('✓') || line.includes('✓')) {
            const msg = line.replace(/^✓\s*/, '');
            if (currentCliStep) {
                sendEvent({ step: currentCliStep, status: 'complete', message: msg });
            }
            return;
        }

        // Error markers
        if (line.startsWith('!!') || line.includes('Failed') || line.includes('Error') || line.includes('error')) {
            if (currentCliStep) {
                sendEvent({ step: currentCliStep, status: 'error', message: line });
            }
            return;
        }

        // Progress messages — forward interesting ones
        if (line.includes('Creating sandbox') || line.includes('Waiting for') ||
            line.includes('Building image') || line.includes('Pulling') ||
            line.includes('Starting') || line.includes('Configuring') ||
            line.includes('Priming') || line.includes('Setting up') ||
            line.includes('Patching') || line.includes('Installing')) {
            if (currentCliStep) {
                sendEvent({ step: currentCliStep, status: 'running', message: line });
            }
        }
    }

    // Spawn the CLI process asynchronously
    sendEvent({ step: 'deploy', status: 'running', message: 'Starting deployment...' });

    const cliCmd = join(NEMOCLAW_ROOT, 'bin', 'nemoclaw.js');
    cliProcess = spawn('node', [cliCmd, 'onboard', '--non-interactive'], {
        cwd: NEMOCLAW_ROOT,
        env: cliEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';
    let errBuffer = '';

    cliProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            parseCliLine(line);
        }
    });

    cliProcess.stderr.on('data', (data) => {
        errBuffer += data.toString();
        const lines = errBuffer.split('\n');
        errBuffer = lines.pop() || '';
        for (const line of lines) {
            parseCliLine(line);
        }
    });

    cliProcess.on('error', (err) => {
        sendEvent({ step: 'deploy', status: 'error', message: `Failed to start deployment: ${err.message}` });
        sendEvent({ done: true, success: false });
        res.end();
    });

    cliProcess.on('close', (code, signal) => {
        cliFinished = true;
        // Flush remaining buffers
        if (buffer.trim()) parseCliLine(buffer);
        if (errBuffer.trim()) parseCliLine(errBuffer);

        cliSucceeded = code === 0;

        if (cliSucceeded) {
            // Mark last step complete
            if (lastStepSent) {
                sendEvent({ step: lastStepSent, status: 'complete', message: `${lastStepSent} complete` });
            }

            // Save inference config for GUI-specific providers (openrouter, gemini)
            // that the CLI doesn't natively handle
            if (['openrouter', 'gemini', 'ollama'].includes(provider) || endpoint) {
                try {
                    const inferenceConfig = {
                        endpointType: provider || 'cloud',
                        endpointUrl: endpoint || '',
                        model: model || '',
                        provider: provider || 'cloud',
                        providerLabel: provider || 'cloud',
                        onboardedAt: new Date().toISOString(),
                    };
                    if (apiKey) {
                        inferenceConfig.credentialEnv = apiKeyEnvVar;
                    }
                    saveInferenceConfigToDisk(inferenceConfig);
                } catch { /* inference config save is best-effort */ }
            }

            sendEvent({ step: 'complete', status: 'complete', message: `Sandbox '${safeName}' deployed successfully` });
        } else {
            sendEvent({ step: 'deploy', status: 'error', message: `Deployment failed (exit code ${code})` });
        }

        sendEvent({ done: true, success: cliSucceeded, sandboxName: safeName });
        res.end();
    });

    res.on('close', () => {
        clientDisconnected = true;
        if (cliProcess && !cliProcess.killed && !cliFinished) {
            cliProcess.kill('SIGTERM');
        }
    });
});

// ── Chat Proxy ──────────────────────────────────────────────────

app.post('/api/chat/message', (req, res) => {
    const { sandboxName, message, sessionId } = req.body;
    if (!sandboxName || !message) {
        return res.status(400).json({ ok: false, error: 'sandboxName and message required' });
    }
    const safeSession = (sessionId || 'gui-session').replace(/[^a-zA-Z0-9-_]/g, '');
    const safeName = sandboxName.replace(/[^a-z0-9-]/g, '');
    // Escape single quotes in the message for safe shell embedding
    const safeMsg = message.replace(/'/g, "'\\''");

    // Load inference config so we can pass credentials into the sandbox shell.
    // The `openclaw agent --local` flag requires API keys in the shell's env.
    const inferCfg = loadInferenceConfig() || {};
    const envLines = [];

    // Resolve the API key: prefer process.env, fall back to config file's _apiKey
    const credEnv = inferCfg.credentialEnv;
    const apiKey = (credEnv && process.env[credEnv]) || inferCfg._apiKey || '';

    if (!apiKey && inferCfg.provider && inferCfg.provider !== 'ollama') {
        return res.json({
            ok: false,
            response: `Inference API key not configured. Please go to the Inference Config page and save your ${inferCfg.provider} API key, then try again.`,
            error: 'Missing API key',
        });
    }

    // Map provider config to the env vars openclaw expects
    if (apiKey) {
        if (credEnv) {
            envLines.push(`export ${credEnv}='${apiKey}'`);
        }
        envLines.push(`export OPENAI_API_KEY='${apiKey}'`);
    }
    if (inferCfg.endpointUrl) {
        envLines.push(`export OPENAI_BASE_URL='${inferCfg.endpointUrl}'`);
    }
    if (inferCfg.model) {
        envLines.push(`export OPENCLAW_MODEL='${inferCfg.model}'`);
    }

    // `openshell sandbox exec` does not exist.
    // Use `openshell sandbox connect <name>` and pipe the openclaw command
    // through stdin. The connect command opens an SSH shell into the sandbox;
    // when stdin closes (after we write the command), the shell exits.
    const CHAT_TIMEOUT_MS = 120000;
    let stdout = '';
    let stderr = '';
    let finished = false;

    const proc = spawn('openshell', ['sandbox', 'connect', safeName], {
        cwd: NEMOCLAW_ROOT,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Build the shell command: set env vars, then run the agent, then exit
    const envSetup = envLines.length > 0 ? envLines.join('; ') + '; ' : '';
    const modelFlag = inferCfg.model ? ` --model '${inferCfg.model}'` : '';
    const cmd = `${envSetup}openclaw agent --agent main --local${modelFlag} -m '${safeMsg}' --session-id ${safeSession} 2>&1; exit\n`;
    proc.stdin.write(cmd);
    proc.stdin.end();

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
        if (!finished) {
            finished = true;
            proc.kill('SIGTERM');
            res.json({
                ok: false,
                response: stdout || 'Agent request timed out.',
                error: 'Timeout after 120 seconds',
            });
        }
    }, CHAT_TIMEOUT_MS);

    proc.on('close', (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);

        // Comprehensive output cleaning:
        // 1. Strip ALL terminal escape sequences (ANSI colors, bracketed paste, cursor control)
        // 2. Remove command echo, node warnings, shell prompts, 'exit' line
        // 3. Extract the meaningful agent response
        const clean = stdout
            // Strip all ANSI/terminal escape sequences (colors, cursor, bracketed paste mode, etc.)
            .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
            .replace(/\x1b\][^\x07]*\x07/g, '')   // OSC sequences
            .replace(/\r/g, '')                     // carriage returns
            .split('\n')
            .filter(l => {
                const t = l.trim();
                if (!t) return false;
                // Remove command echo (the command we piped in)
                if (t.startsWith('openclaw agent')) return false;
                if (t === 'exit') return false;
                // Remove shell prompts
                if (/^\s*(sandbox@|bash-|\$|~\$)/.test(t)) return false;
                // Remove node warnings
                if (t.includes('[UNDICI-') || t.includes('Warning:') || t.includes('--trace-warnings')) return false;
                // Remove OpenClaw banner decorative line
                if (t.startsWith('🦞') || t.startsWith('\u{1F99E}')) return false;
                if (/^\s+I've seen your|^\s+OpenClaw|^\s+Finally,/.test(t)) return false;
                // Remove bracketed paste artifacts
                if (/^\[(\?2004[hl]|[0-9;]*[A-Z])/.test(t)) return false;
                // Remove export/env-setup command echo
                if (t.startsWith('export ')) return false;
                // Remove log-style lines with timestamps (e.g. "00:09:42 [agent/embedded]")
                if (/^\d{2}:\d{2}:\d{2}\s+\[agent\//.test(t)) return false;
                return true;
            })
            .join('\n')
            .trim();

        if (code === 0 || clean) {
            res.json({ ok: true, response: clean || '(no output)' });
        } else {
            res.json({
                ok: false,
                response: clean || stderr.trim() || 'No response from agent. Is the sandbox running and OpenClaw installed?',
                error: code ? `Exit code ${code}` : 'Agent command failed',
            });
        }
    });

    proc.on('error', (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        res.status(500).json({
            ok: false,
            response: '',
            error: `Failed to connect to sandbox: ${err.message}`,
        });
    });
});

// Onboard status (for the wizard)
app.get('/api/onboard/preflight', async (req, res) => {
    const checks = [];

    // Docker check
    const docker = runCli('docker info 2>/dev/null', { timeout: 10000 });
    checks.push({ name: 'Docker', ok: docker.ok, detail: docker.ok ? 'Running' : 'Not running' });

    // OpenShell check
    const openshell = runCli('openshell --version 2>/dev/null', { timeout: 5000 });
    checks.push({ name: 'OpenShell CLI', ok: openshell.ok, detail: openshell.ok ? openshell.output : 'Not installed' });

    // Port checks
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

    // GPU check
    const gpu = runCli('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null', { timeout: 5000 });
    checks.push({
        name: 'GPU',
        ok: true,
        detail: gpu.ok ? gpu.output : 'No NVIDIA GPU detected — will use cloud inference',
        warning: !gpu.ok,
    });

    res.json({ checks });
});

// ── WebSocket for real-time updates ─────────────────────────────

// Shared state for change detection
let lastSandboxJson = '';
let cachedSandboxes = [];
let cachedGatewayHealthy = null;
let lastClawsJson = '';
let cachedClaws = [];

function parseSandboxList(output) {
    const lines = output.split('\n').filter(l => l.trim());
    const sandboxes = [];
    for (const line of lines) {
        const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
        const cols = clean.split(/\s+/);
        if (cols.length >= 2 && !clean.startsWith('NAME') && !clean.startsWith('─')) {
            sandboxes.push({
                name: cols[0],
                image: cols[1] || '',
                created: cols[2] || '',
                status: cols[cols.length - 1] || 'Unknown',
            });
        }
    }
    return sandboxes;
}

function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
            client.send(msg);
        }
    }
}

function sendCurrentState(ws) {
    if (ws.readyState !== ws.OPEN) return;
    const gw = runCli('openshell status 2>&1', { timeout: 5000 });
    const gwHealthy = gw.ok && gw.output.includes('Connected');
    ws.send(JSON.stringify({
        type: 'status',
        gateway: { healthy: gwHealthy },
        sandboxes: cachedSandboxes,
        claws: cachedClaws,
        timestamp: new Date().toISOString(),
    }));
}

// Global polling loop — runs once for all clients
const pollInterval = setInterval(() => {
    if (wss.clients.size === 0) return;

    // Poll sandbox list
    const sbResult = runCli('openshell sandbox list 2>/dev/null', { timeout: 10000 });
    if (sbResult.ok) {
        const sandboxes = parseSandboxList(sbResult.output);
        const json = JSON.stringify(sandboxes);
        if (json !== lastSandboxJson) {
            lastSandboxJson = json;
            cachedSandboxes = sandboxes;
            broadcast({ type: 'sandbox:list', sandboxes });
        }
    }

    // Poll gateway
    const gw = runCli('openshell status 2>&1', { timeout: 5000 });
    const gwHealthy = gw.ok && gw.output.includes('Connected');
    if (gwHealthy !== cachedGatewayHealthy) {
        cachedGatewayHealthy = gwHealthy;
    }

    // Poll claw list
    try {
        const claws = listClaws();
        const clawJson = JSON.stringify(claws);
        if (clawJson !== lastClawsJson) {
            lastClawsJson = clawJson;
            cachedClaws = claws;
            broadcast({ type: 'claw:list', claws });
        }
    } catch { /* claw polling is best-effort */ }

    // Always send periodic status with gateway + sandboxes + claws
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
        // In dev mode, serve a redirect message
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
