/**
 * Gateway WebSocket Proxy
 *
 * Bridges a WebSocket client (React frontend) to the OpenClaw gateway daemon
 * running on port 18789 inside the sandbox container.
 *
 * The proxy also auto-starts the openclaw gateway daemon if it is not already
 * listening on port 18789 before establishing the bridge.
 */

import { WebSocketServer } from 'ws';
import * as grpcClient from './grpcClient.js';

const BRIDGE_SCRIPT = `
var http = require('http');
var opts = {
  host: '127.0.0.1', port: 18789, path: '/',
  headers: {
    'Connection': 'Upgrade', 'Upgrade': 'websocket',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13'
  }
};
var req = http.request(opts);
req.on('upgrade', function(_r, sock) {
  process.stdin.pipe(sock);
  sock.pipe(process.stdout);
  sock.on('close', function() { process.exit(0); });
  sock.on('error',  function(e) { process.stderr.write('err:'+e.message+'\\n'); process.exit(1); });
});
req.on('error', function(e) {
  process.stderr.write('connect:'+e.message+'\\n');
  process.exit(1);
});
req.end();
setInterval(function(){}, 1000);
`.trim();

const ENSURE_GATEWAY_SCRIPT = `
var net = require('net');
var client = net.connect(18789, '127.0.0.1', function() {
  client.destroy();
  process.stdout.write('RUNNING\\n');
  process.exit(0);
});
client.on('error', function() {
  process.stdout.write('STARTING\\n');
  process.exit(0);
});
`.trim();

const GATEWAY_START_CMD = [
    'sh', '-c',
    'openclaw gateway --allow-unconfigured --auth none > /tmp/gw.log 2>&1 &'
];

async function ensureGateway(sandboxUuid) {
    const checkStream = grpcClient.execSandbox(sandboxUuid, ['node', '-e', ENSURE_GATEWAY_SCRIPT], { timeoutSeconds: 5 });
    const status = await new Promise((resolve) => {
        let out = '';
        checkStream.on('data', ev => { if (ev.stdout?.data) out += Buffer.from(ev.stdout.data).toString('utf8'); });
        checkStream.on('end', () => resolve(out.trim()));
        checkStream.on('error', () => resolve('UNKNOWN'));
    });

    if (status === 'STARTING') {
        console.log('[gateway-auto] Gateway not running, starting it...');
        const startStream = grpcClient.execSandbox(sandboxUuid, GATEWAY_START_CMD, { timeoutSeconds: 4 });
        await new Promise(resolve => { startStream.on('end', resolve); startStream.on('error', resolve); });
        await new Promise(r => setTimeout(r, 2000));
    }
}

export function attachGatewayProxy(httpServer) {
    const proxyWss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
        const match = request.url.match(/^\/api\/sandbox\/([^/]+)\/proxy\/?$/);
        if (match) {
            const sandboxName = decodeURIComponent(match[1]);
            proxyWss.handleUpgrade(request, socket, head, (ws) => {
                proxyWss.emit('connection', ws, request, sandboxName);
            });
        }
    });

    proxyWss.on('connection', async (ws, _req, sandboxName) => {
        const tag = `[proxy:${sandboxName}]`;
        let execStream = null;

        try {
            const resp = await grpcClient.getSandbox(sandboxName);
            const realId = resp.sandbox?.id;
            if (!realId) throw new Error(`Sandbox '${sandboxName}' not found`);

            await ensureGateway(realId);

            execStream = grpcClient.execSandbox(realId, ['node', '-e', BRIDGE_SCRIPT], { timeoutSeconds: 0 });

            execStream.on('data', (event) => {
                if (event.stdout?.data?.length > 0 && ws.readyState === 1) {
                    ws.send(event.stdout.data);
                }
                if (event.stderr?.data) {
                    const msg = Buffer.from(event.stderr.data).toString('utf8').trim();
                    if (msg) console.error(tag, 'stderr:', msg);
                }
                if (event.exit?.exitCode) {
                    console.error(tag, 'exit:', event.exit.exitCode);
                }
            });

            execStream.on('end', () => { console.log(tag, 'ended'); if (ws.readyState < 2) ws.close(); });
            execStream.on('error', (e) => { console.error(tag, 'error:', e.message); if (ws.readyState < 2) ws.close(); });

            ws.on('message', (raw) => {
                const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
                try { execStream.write({ stdin: buf }); } catch (_) {}
            });

            ws.on('close', () => { console.log(tag, 'closed'); try { execStream.cancel(); } catch (_) {} });

        } catch (err) {
            console.error(tag, 'setup error:', err.message);
            if (ws.readyState < 2) ws.close();
        }
    });
}
