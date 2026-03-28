const express = require('express');
const { createServer } = require('http');
const { join } = require('path');
const { readFileSync } = require('fs');
const grpcClient = require('./lib/grpcClient');
const registry = require('../bin/lib/registry');

// Load settings
const PORT = process.env.PORT || 3000;
const NEMOCLAW_ROOT = process.env.NEMOCLAW_ROOT || join(__dirname, '../../');
const DATA_DIR = join(NEMOCLAW_ROOT, 'data');

const app = express();
app.use(express.json());

const server = createServer(app);

// ── WebSocket Proxy Implementation for ExecSandbox ───────────────

const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ noServer: true });

// Attach WS upgrade handler to Express HTTP server
server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);
    
    // Check if upgrading to a proxy route: /api/sandbox/:sandboxId/proxy
    const match = pathname.match(/^\/api\/sandbox\/([a-zA-Z0-9._-]+)\/proxy$/);
    if (match) {
        const sandboxId = match[1];
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request, sandboxId);
        });
    } else {
        socket.destroy();
    }
});

// Manage active WebSocket connections
const activeProxies = new Map();

wss.on('connection', (ws, request, sandboxId) => {
    console.log(`[ws-proxy] Client connected to sandbox ${sandboxId}`);

    // If a proxy stream already exists for this sandbox, close it
    if (activeProxies.has(sandboxId)) {
        activeProxies.get(sandboxId).cancel();
    }

    try {
        // Start streaming ExecSandbox as a proxy tunnel
        // Using `bash -i` gives us a pseudo-interactive shell tunnel
        const stream = grpcClient.execSandbox(sandboxId, ['bash', '-i'], { timeoutSeconds: 3600 });
        activeProxies.set(sandboxId, stream);

        // Send stdout/stderr down to the client terminal
        stream.on('data', (response) => {
            if (response.stdout) {
                ws.send(JSON.stringify({ type: 'stdout', data: response.stdout }));
            }
            if (response.stderr) {
                ws.send(JSON.stringify({ type: 'stderr', data: response.stderr }));
            }
        });

        stream.on('end', () => {
            console.log(`[ws-proxy] Host closed stream for ${sandboxId}`);
            ws.close();
            activeProxies.delete(sandboxId);
        });

        stream.on('error', (err) => {
            console.error(`[ws-proxy] gRPC Error for ${sandboxId}:`, err.message);
            // Ignore grpc-node cancellation errors which are expected
            if (err.code !== 1) {
                ws.send(JSON.stringify({ type: 'error', data: err.message }));
            }
        });

        // Forward incoming client input (stdin) up to the sandbox
        ws.on('message', (message) => {
            try {
                const msg = JSON.parse(message.toString());
                if (msg.type === 'stdin' && msg.data) {
                    stream.write({ stdin: msg.data });
                } else if (msg.type === 'resize') {
                    // ExecSandbox does not support native resize in stock OpenClaw, 
                    // but we catch it here for future-proofing
                    console.log(`[ws-proxy] Client resizing terminal: ${msg.cols}x${msg.rows}`);
                }
            } catch (err) {
                console.warn(`[ws-proxy] Invalid message format: ${err.message}`);
            }
        });

        ws.on('close', () => {
            console.log(`[ws-proxy] Client disconnected from ${sandboxId}`);
            if (activeProxies.has(sandboxId)) {
                activeProxies.get(sandboxId).cancel();
                activeProxies.delete(sandboxId);
            }
        });

    } catch (err) {
        console.error(`[ws-proxy] Failed to connect stream:`, err.message);
        ws.close();
    }
});

// ── Static Files (Vite Production Build) ────────────────────────

// In production, Vite builds to gui/dist
const distDir = join(__dirname, '..', 'dist');
if (process.env.NODE_ENV !== 'development') {
    app.use(express.static(distDir));
}

// ── API Routes ──────────────────────────────────────────────────

// Health
app.get('/api/health', (req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
});

// Import the modular routing
const sandboxRouter = require('./routes/sandbox');
const extensionsRouter = require('./routes/extensions');
const telemetryRouter = require('./routes/telemetry'); // Cron/Task scheduling endpoint

app.use(sandboxRouter);
app.use(extensionsRouter);
app.use(telemetryRouter);


// ── Agent Chat Routing ──────────────────────────────────────────

/**
 * Route chat messages directly through the selected OpenClaw sandbox
 * instead of hitting the external LLM directly. This ensures that
 * all AI interactions, tool usages, and agent skills are properly
 * constrained by the network policies and environment of the sandbox.
 */
app.post('/api/chat/message', async (req, res) => {
    const { message, sandbox: sandboxId, stream, systemPrompt } = req.body;

    if (!message || !sandboxId) {
        return res.status(400).json({ error: 'message and sandbox ID are required' });
    }

    // Set headers for standard JSON or SSE streaming response
    if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
    }

    try {
        const { sandboxes } = registry.listSandboxes();
        const sbNode = sandboxes.find(s => s.name === sandboxId || s.id === sandboxId);
        
        if (!sbNode) {
            throw new Error(`Sandbox ${sandboxId} not found in registry`);
        }

        // Dynamically collect credentials mapped to installed extensions.
        // E.g., if marvin has 'discord' installed, inject DISCORD_BOT_TOKEN
        const extStatePath = join(DATA_DIR, 'extensions-state.json');
        let sandboxExts = {};
        if (require('fs').existsSync(extStatePath)) {
            const allState = JSON.parse(require('fs').readFileSync(extStatePath, 'utf8'));
            sandboxExts = allState[sbNode.name] || allState[sbNode.id] || {};
        }

        const extensions = require('./routes/extensions').loadRegistry();

        // Dynamically prepend context to the chat message
        let finalMessage = message;
        if (systemPrompt) {
            finalMessage = `[System Context & Capabilities]\n${systemPrompt}\n\n[User Message]\n${message}`;
        }

        // Escape the combined message for safe shell embedding
        const escapedMessage = finalMessage.replace(/'/g, "'\\''");

        // Build shell-level export lines for extension credentials.
        // We do this in addition to (not instead of) the gRPC environment map
        // because openclaw agent may spawn subshells or Python subprocesses
        // that don't inherit the gRPC-injected top-level environment.
        // Also source the persistent .channel-env file written during install.
        const envExports = [
            // Point OpenClaw at the writable config we created during extension sync
            '[ -f /sandbox/.openclaw-data/openclaw.json ] && export OPENCLAW_CONFIG_PATH=/sandbox/.openclaw-data/openclaw.json',
            // Source the persistent env file written by the install/sync-channel route
            '[ -f /sandbox/.openclaw-data/.channel-env ] && . /sandbox/.openclaw-data/.channel-env',
            // Export each extension credential explicitly
            Object.keys(sandboxExts).map(extId => {
                const ext = extensions.find(e => e.id === extId);
                return ext && ext.credentialKey
                    ? `export ${ext.credentialKey}="${sandboxExts[extId].credential || ''}"`
                    : '';
            }).filter(Boolean).join('\n')
        ].join('\n');

        // Command to execute openclaw inside the sandbox.
        // Note: It uses `--auth none` assuming intra-sandbox traffic implies consent,
        // but egress is still controlled by standard NVIDIA Landlock policies.
        const cmd = [
            'bash', '-c',
            `${envExports}\nOPENCLAW_BIN=$(which openclaw 2>/dev/null || ls /usr/local/bin/openclaw /usr/bin/openclaw /root/.local/bin/openclaw /home/user/.local/bin/openclaw 2>/dev/null | head -1)\n` +
            `if [ -z "$OPENCLAW_BIN" ]; then echo "{\"error\":\"openclaw binary not found inside sandbox\"}"; exit 1; fi\n` +
            `"$OPENCLAW_BIN" bot chat --prompt '${escapedMessage}' --json`
        ];

        let accumulatedOutput = "";

        // Send via gRPC stream
        const execStream = grpcClient.execSandbox(sbNode.id || sbNode.name, cmd, { timeoutSeconds: 120 });

        execStream.on('data', (response) => {
            if (response.stdout) {
                accumulatedOutput += response.stdout;
                if (stream) {
                    // Send chunk directly to UI
                    res.write(`data: ${JSON.stringify({ chunk: response.stdout })}\n\n`);
                }
            }
            if (response.stderr) {
                console.warn(`[chat][${sandboxId}] stderr: ${response.stderr}`);
            }
        });

        execStream.on('end', () => {
            if (stream) {
                res.write(`data: [DONE]\n\n`);
                res.end();
            } else {
                // Determine if we received a JSON envelope from openclaw
                try {
                    // OpenClaw CLI outputs strict JSON objects per line when using --json
                    const lines = accumulatedOutput.trim().split('\n').filter(Boolean);
                    if (lines.length > 0) {
                        const lastLine = JSON.parse(lines[lines.length - 1]);
                        res.json({ reply: lastLine.message || lastLine.content || accumulatedOutput });
                    } else {
                        res.json({ reply: accumulatedOutput });
                    }
                } catch {
                    res.json({ reply: accumulatedOutput });
                }
            }
        });

        execStream.on('error', (err) => {
            console.error(`[chat][${sandboxId}] stream error: ${err.message}`);
            if (stream) {
                res.write(`data: {"error": "${err.message}"}\n\n`);
                res.end();
            } else {
                res.status(500).json({ error: err.message });
            }
        });

    } catch (err) {
        console.error('Chat routing error:', err);
        if (stream) {
            res.write(`data: {"error": "${err.message}"}\n\n`);
            res.end();
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});


// Fallback for SPA routing if requested URL isn't an API endpoint
app.get('*', (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
        res.sendFile(join(distDir, 'index.html'));
    } else {
        res.status(404).send('Vite Dev Server handles these routes in development mode.');
    }
});


// Initialize server
const serverPort = PORT;
server.listen(serverPort, () => {
    console.log(`  NemoClaw Dashboard API running on http://localhost:${serverPort}`);
    // Warm up initialization calls
    try {
        const { sandboxes } = registry.listSandboxes();
        console.log(`  ✓ Claw sync complete: ${sandboxes.length} claw(s) in registry`);
    } catch {
        // Suppress initial errors if backend is not fully setup
    }
});
