// NemoClaw Dashboard — Express API Server
// Wraps nemoclaw/openshell CLI operations and serves the React frontend.

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = parseInt(process.env.PORT || '3000', 10);
const NEMOCLAW_ROOT = process.env.NEMOCLAW_ROOT || join(__dirname, '..', '..');

app.use(express.json());

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

// Gateway
app.get('/api/gateway/status', (req, res) => {
    const result = runCli('openshell status 2>&1');
    const healthy = result.ok && result.output.includes('Connected');
    res.json({ healthy, ...result });
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

    // Always send periodic status with both gateway + sandboxes
    broadcast({
        type: 'status',
        gateway: { healthy: gwHealthy },
        sandboxes: cachedSandboxes,
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
