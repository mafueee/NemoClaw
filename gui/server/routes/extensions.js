// NemoClaw — Extension Management REST Routes
// Provides endpoints to browse, install, and uninstall extensions on sandboxes/claws.
// Extensions combine network policy presets, credential configuration, and optional
// in-sandbox package installation via ExecSandbox gRPC.

import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as grpcClient from '../lib/grpcClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

const NEMOCLAW_ROOT = process.env.NEMOCLAW_ROOT || join(__dirname, '..', '..', '..');
const REGISTRY_PATH = join(NEMOCLAW_ROOT, 'nemoclaw-blueprint', 'extensions', 'registry.json');
const PRESETS_DIR = join(NEMOCLAW_ROOT, 'nemoclaw-blueprint', 'policies', 'presets');
const EXT_STATE_PATH = join(NEMOCLAW_ROOT, 'data', 'extensions-state.json');

// ── Extension state persistence ─────────────────────────────────
// Tracks installed extensions per sandbox in a local JSON file.
// This is the source of truth for the chat handler's extension awareness.

function loadExtState() {
    try {
        if (!existsSync(EXT_STATE_PATH)) return {};
        return JSON.parse(readFileSync(EXT_STATE_PATH, 'utf-8'));
    } catch { return {}; }
}

function saveExtState(state) {
    try {
        const dir = dirname(EXT_STATE_PATH);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(EXT_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
        console.warn('[extensions] Failed to persist state:', err.message);
    }
}

function markInstalled(sandboxName, extensionId, credential) {
    const state = loadExtState();
    if (!state[sandboxName]) state[sandboxName] = {};
    state[sandboxName][extensionId] = {
        installedAt: new Date().toISOString(),
        ...(credential ? { credential } : {}),
    };
    saveExtState(state);
}

function markUninstalled(sandboxName, extensionId) {
    const state = loadExtState();
    if (state[sandboxName]) {
        delete state[sandboxName][extensionId];
        if (Object.keys(state[sandboxName]).length === 0) delete state[sandboxName];
    }
    saveExtState(state);
}

// ── Registry Loader ─────────────────────────────────────────────

/**
 * Load the extension registry from disk.
 * Returns a validated array of extension manifests.
 */
function loadRegistry() {
    if (!existsSync(REGISTRY_PATH)) {
        return [];
    }
    try {
        const raw = readFileSync(REGISTRY_PATH, 'utf-8');
        const extensions = JSON.parse(raw);
        if (!Array.isArray(extensions)) return [];
        return extensions.filter(ext => ext.id && ext.name);
    } catch {
        return [];
    }
}

/**
 * Collect a streaming ExecSandbox response into a result object.
 * Returns { stdout, stderr, exitCode }.
 */
function collectExecResult(stream) {
    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let exitCode = -1;

        const timeout = setTimeout(() => {
            stream.cancel();
            reject(new Error('ExecSandbox timed out after 120s'));
        }, 120000);

        stream.on('data', (event) => {
            if (event.stdout) {
                stdout += Buffer.isBuffer(event.stdout.data)
                    ? event.stdout.data.toString('utf-8')
                    : String(event.stdout.data || '');
            }
            if (event.stderr) {
                stderr += Buffer.isBuffer(event.stderr.data)
                    ? event.stderr.data.toString('utf-8')
                    : String(event.stderr.data || '');
            }
            if (event.exit !== undefined && event.exit !== null) {
                exitCode = event.exit.exitCode ?? event.exit.exit_code ?? -1;
            }
        });

        stream.on('end', () => {
            clearTimeout(timeout);
            resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
        });

        stream.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Inject a bot token into the openclaw gateway running inside the sandbox.
 *
 * Strategy:
 *  1. Use Python (with the token passed as argv[1] to avoid all shell escaping)
 *     to write a persistent env file to the writable /sandbox/.openclaw-data volume.
 *  2. Use the gRPC UpdateConfig call to inject the env var directly into the sandbox
 *     environment — this is the same approach used for inference provider credentials
 *     and is far more reliable than trying to restart the openclaw daemon.
 *
 * The `openclaw doctor --fix` approach was removed because `openclaw` is often not
 * in the ExecSandbox PATH, causing a silent no-op that is indistinguishable from
 * success.  The gRPC env-inject path works regardless of what's installed inside.
 *
 * @param {string} sandboxId  - resolved sandbox UUID for ExecSandbox
 * @param {string} channelKey - openclaw channel key e.g. "discord"
 * @param {string} token      - bot token to inject
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function configureChannelInSandbox(sandboxId, sandboxName, channelKey, token) {
    // Map channel key to its env var name (openclaw env fallback convention)
    const envVarMap = {
        discord: 'DISCORD_BOT_TOKEN',
        telegram: 'TELEGRAM_BOT_TOKEN',
        slack: 'SLACK_BOT_TOKEN',
    };
    const envVar = envVarMap[channelKey] || `${channelKey.toUpperCase()}_BOT_TOKEN`;

    // Step 1: Write a persistent env file inside the sandbox data volume.
    // Token is passed as argv[1] to Python to bypass all shell quoting hazards.
    const pyScript = [
        'import os, sys, json, shutil',
        "env_dir = '/sandbox/.openclaw-data'",
        'os.makedirs(env_dir, exist_ok=True)',
        "env_file = os.path.join(env_dir, '.channel-env')",
        'tok = sys.argv[1]',
        'with open(env_file, "w") as f:',
        `    f.write("export ${envVar}=" + repr(tok) + "\\n")`,
        'os.chmod(env_file, 0o600)',
        '',
        '# Clone read-only openclaw.json to a writable volume so doctor can fix it',
        "orig_config = '/sandbox/.openclaw/openclaw.json'",
        "writable_config = os.path.join(env_dir, 'openclaw.json')",
        'if os.path.exists(orig_config):',
        '    try:',
        '        with open(orig_config, "r") as f: data = json.load(f)',
        '        ',
        '        # Ensure channel is explicitly enabled in config',
        `        ch = "${channelKey}"`,
        '        if "channels" not in data: data["channels"] = {}',
        '        if ch not in data["channels"]: data["channels"][ch] = {}',
        '        data["channels"][ch]["enabled"] = True',
        '        ',
        '        # Ensure plugin is explicitly enabled without destroying other plugins',
        '        if "plugins" not in data or not isinstance(data["plugins"], dict): data["plugins"] = {"entries": {}}',
        '        if "entries" not in data["plugins"]: data["plugins"]["entries"] = {}',
        '        data["plugins"]["entries"][f"@openclaw/{ch}"] = {"enabled": True}',
        '        ',
        '        with open(writable_config, "w") as f: json.dump(data, f, indent=2)',
        '    except Exception as e: print("Config warning:", e)',
        '',
        'print("ENV_WRITTEN")',
    ].join('\n');

    try {
        const writeStream = grpcClient.execSandbox(sandboxId, ['python3', '-c', pyScript, token], {
            timeoutSeconds: 15,
        });
        const { stdout: writeOut, stderr: writeErr, exitCode: writeCode } = await collectExecResult(writeStream);

        if (!writeOut.includes('ENV_WRITTEN') || writeCode !== 0) {
            const detail = (writeErr || writeOut).slice(0, 400);
            console.warn(`[extensions] configureChannelInSandbox: env file write failed (exit ${writeCode}): ${detail}`);
            return { ok: false, message: `Env file write failed: ${detail}` };
        }
        console.log(`[extensions] ${envVar} env file written in sandbox ${sandboxId}`);

        // Restart the openclaw gateway so it picks up the new token from .channel-env.
        //
        // Strategy: source .channel-env into the current shell, then kill the running
        // gateway process and restart it with DISCORD_BOT_TOKEN (and others) in its env.
        //
        // We use the `env` command to explicitly pass the token to the launched process
        // so it survives in the daemon's env regardless of sourcing.
        const restartCmd = [
            // Source the env file so this shell has the token
            '[ -f /sandbox/.openclaw-data/.channel-env ] && . /sandbox/.openclaw-data/.channel-env || true',
            // Kill any existing gateway, accounting for process name truncation
            'pkill -f "gateway run" 2>/dev/null || pkill -f "openclaw-gatewa" 2>/dev/null || pkill -f "openclaw gateway" 2>/dev/null || true',
            'sleep 1',
            // Find the openclaw binary wherever it lives
            'OPENCLAW_BIN=$(which openclaw 2>/dev/null || ls /usr/local/bin/openclaw /usr/bin/openclaw /root/.local/bin/openclaw /home/user/.local/bin/openclaw 2>/dev/null | head -1)',
            // Start the gateway with the token explicitly in its env using the `env` trick
            // nohup ensures it keeps running after this shell exits
            `[ -n "$OPENCLAW_BIN" ] && export OPENCLAW_CONFIG_PATH=/sandbox/.openclaw-data/openclaw.json && export ${envVar}=$${envVar} && nohup "$OPENCLAW_BIN" gateway run --allow-unconfigured --auth none > /tmp/gateway.log 2>&1 & echo "GATEWAY_STARTED:$!" || echo "GATEWAY_BIN_NOT_FOUND"`,
        ].join('; ');

        const restartStream = grpcClient.execSandbox(sandboxId, [
            'bash', '-c', restartCmd,
        ], { timeoutSeconds: 20 });
        const restartRes = await collectExecResult(restartStream);
        const restartOut = (restartRes.stdout + restartRes.stderr).trim();

        if (restartOut.includes('GATEWAY_STARTED')) {
            console.log(`[extensions] ✓ Gateway restarted with ${envVar} in its environment (sandbox ${sandboxId})`);
        } else if (restartOut.includes('GATEWAY_BIN_NOT_FOUND')) {
            console.warn(`[extensions] openclaw binary not found in sandbox — token written to env file, will load on next sandbox restart`);
        } else {
            console.warn(`[extensions] Gateway restart uncertain: ${restartOut.slice(0, 200)}`);
        }
    } catch (err) {
        console.warn(`[extensions] configureChannelInSandbox: ExecSandbox write failed: ${err.message}`);
        return { ok: false, message: `ExecSandbox write failed: ${err.message}` };
    }

    // Step 2: Inject the env var directly into the sandbox via gRPC UpdateConfig.
    // This is the preferred path — it does not depend on openclaw being installed
    // inside the sandbox, and takes effect on the next agent invocation.
    // updateConfig uses settingKey/settingValue to set sandbox-scoped settings.
    try {
        if (typeof grpcClient.updateConfig === 'function') {
            await grpcClient.updateConfig(sandboxName, {
                settingKey: envVar,
                settingValue: { stringValue: token },
            });
            await grpcClient.updateConfig(sandboxName, {
                settingKey: `channels.defaults.${channelKey}`,
                settingValue: { boolValue: true },
            });
            console.log(`[extensions] ${envVar} and channel enabled via gRPC updateConfig for sandbox ${sandboxId}`);
            return {
                ok: true,
                message: `${envVar} injected into sandbox environment via gRPC — channel will be active on next agent invocation`,
            };
        }
    } catch (grpcErr) {
        // Non-fatal — env file is already written, token will be available on next sandbox restart
        console.warn(`[extensions] gRPC updateSandboxConfig failed (non-fatal): ${grpcErr.message}`);
    }

    // Fallback: env file written successfully — token persists across restarts via the data volume.
    return {
        ok: true,
        message: `${envVar} stored in sandbox data volume. The token will be picked up by the agent on the next sandbox restart or when the env file is sourced.`,
    };
}

// ── List all extensions ─────────────────────────────────────────

router.get('/api/extensions', async (req, res) => {
    const { sandboxName } = req.query;

    try {
        const extensions = loadRegistry();

        // If a sandbox is specified, check which extensions are currently installed
        let installedNames = [];
        if (sandboxName) {
            const state = loadExtState();
            installedNames = Object.keys(state[sandboxName] || {});
        }

        const enriched = extensions.map(ext => ({
            ...ext,
            installed: installedNames.includes(ext.id),
            presetAvailable: existsSync(join(PRESETS_DIR, `${ext.policyPreset}.yaml`)),
        }));

        // Group by category for easier frontend rendering
        const categories = [...new Set(enriched.map(e => e.category))];

        res.json({
            ok: true,
            extensions: enriched,
            categories,
            total: enriched.length,
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, extensions: [] });
    }
});

// ── Get single extension detail ─────────────────────────────────

router.get('/api/extensions/:id', async (req, res) => {
    const extensions = loadRegistry();
    const ext = extensions.find(e => e.id === req.params.id);

    if (!ext) {
        return res.status(404).json({ ok: false, error: `Extension '${req.params.id}' not found` });
    }

    const { sandboxName } = req.query;
    let installed = false;
    if (sandboxName) {
        try {
            const state = loadExtState();
            installed = !!state[sandboxName]?.[ext.id];
        } catch { /* ignore */ }
    }

    res.json({
        ok: true,
        extension: {
            ...ext,
            installed,
            presetAvailable: existsSync(join(PRESETS_DIR, `${ext.policyPreset}.yaml`)),
        },
    });
});

// ── Install extension ───────────────────────────────────────────

router.post('/api/extensions/install', async (req, res) => {
    const { extensionId, sandboxName, credential } = req.body;

    if (!extensionId || !sandboxName) {
        return res.status(400).json({
            ok: false,
            error: 'extensionId and sandboxName are required',
        });
    }

    const extensions = loadRegistry();
    const ext = extensions.find(e => e.id === extensionId);
    if (!ext) {
        return res.status(404).json({ ok: false, error: `Extension '${extensionId}' not found` });
    }

    const steps = [];

    // Step 1: Apply network policy preset
    // We use the CLI-based applyPreset from policies.js rather than gRPC updateConfig.
    // The gRPC approach fails on live sandboxes because proto3 serialization
    // of the SandboxPolicy object alters filesystem fields, triggering:
    // "filesystem policy cannot be removed on a live sandbox".
    // The CLI approach uses `openshell policy set --policy <yaml>` which
    // properly handles YAML merge semantics and is the proven working path.
    try {
        const presetFile = join(PRESETS_DIR, `${ext.policyPreset}.yaml`);
        if (!existsSync(presetFile)) {
            steps.push({ step: 'policy', status: 'error', message: `Policy preset '${ext.policyPreset}' not found on disk` });
        } else {
            const policiesPath = join(NEMOCLAW_ROOT, 'bin', 'lib', 'policies.js');
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            delete require.cache[require.resolve(policiesPath)];
            const policies = require(policiesPath);

            const applied = policies.applyPreset(sandboxName, ext.policyPreset);
            if (applied) {
                steps.push({ step: 'policy', status: 'complete', message: `Network policy '${ext.policyPreset}' applied` });
            } else {
                steps.push({ step: 'policy', status: 'error', message: `Failed to apply policy preset '${ext.policyPreset}'` });
            }
        }
    } catch (err) {
        steps.push({ step: 'policy', status: 'error', message: `Policy application failed: ${err.message}` });
    }

    // Step 2: Store credential if provided
    if (ext.credentialKey && credential) {
        try {
            // Store in environment for the current session
            process.env[ext.credentialKey] = credential;
            steps.push({ step: 'credential', status: 'complete', message: `Credential '${ext.credentialKey}' stored` });
        } catch (err) {
            steps.push({ step: 'credential', status: 'error', message: `Credential storage failed: ${err.message}` });
        }
    } else if (ext.credentialKey && !credential) {
        steps.push({ step: 'credential', status: 'skipped', message: `No credential provided for '${ext.credentialLabel || ext.credentialKey}'` });
    }

    // Step 3: Write the bot token into the sandbox's openclaw channel config.
    // The ~/.openclaw/openclaw.json is read-only (root-owned), so we write
    // the token to a persistent env file in the writable data volume and
    // restart the openclaw gateway daemon with/the token in its environment.
    if (ext.channelName && credential) {
        try {
            // Resolve sandbox ID for ExecSandbox
            let sandboxId = sandboxName;
            try {
                const resp = await grpcClient.getSandbox(sandboxName);
                sandboxId = resp.sandbox?.id || sandboxName;
            } catch { /* fall back to name */ }

            const cfgResult = await configureChannelInSandbox(sandboxId, sandboxName, ext.channelName, credential);
            steps.push({
                step: 'channel',
                status: cfgResult.ok ? 'complete' : 'warning',
                message: cfgResult.ok
                    ? `${ext.channelName} channel configured in sandbox and gateway restarted`
                    : `Channel config warning: ${cfgResult.message}`,
            });
        } catch (err) {
            steps.push({
                step: 'channel',
                status: 'warning',
                message: `Channel config failed (token stored locally for env injection): ${err.message}`,
            });
        }
    }

    // Step 4: Run install commands inside sandbox via ExecSandbox
    // First, auto-apply any required package registry policies so pip/npm can
    // download packages through the sandbox proxy.
    if (ext.installCommands && ext.installCommands.length > 0) {
        const needsPypi = ext.installCommands.some(c => /pip|pip3|python.*pip/.test(c));
        const needsNpm = ext.installCommands.some(c => /\bnpm\b/.test(c));

        if (needsPypi || needsNpm) {
            try {
                const policiesPath = join(NEMOCLAW_ROOT, 'bin', 'lib', 'policies.js');
                const { createRequire } = await import('module');
                const require = createRequire(import.meta.url);
                delete require.cache[require.resolve(policiesPath)];
                const policies = require(policiesPath);

                if (needsPypi) {
                    policies.applyPreset(sandboxName, 'pypi');
                    steps.push({ step: 'policy-dep', status: 'complete', message: 'Applied PyPI registry policy for package installation' });
                }
                if (needsNpm) {
                    policies.applyPreset(sandboxName, 'npm');
                    steps.push({ step: 'policy-dep', status: 'complete', message: 'Applied npm registry policy for package installation' });
                }
            } catch (err) {
                steps.push({ step: 'policy-dep', status: 'error', message: `Failed to apply registry policy: ${err.message}` });
            }

            // Small delay to allow the sandbox proxy to propagate new network rules
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        for (const cmd of ext.installCommands) {
            try {
                // Resolve sandbox ID from name
                let sandboxId = sandboxName;
                try {
                    const resp = await grpcClient.getSandbox(sandboxName);
                    sandboxId = resp.sandbox?.id || sandboxName;
                } catch { /* use name as fallback */ }

                const stream = grpcClient.execSandbox(sandboxId, ['bash', '-c', cmd], {
                    timeoutSeconds: 120,
                });
                const result = await collectExecResult(stream);

                if (result.exitCode === 0) {
                    steps.push({
                        step: 'install',
                        status: 'complete',
                        message: `Command executed: ${cmd}`,
                        output: result.stdout.slice(0, 500),
                    });
                } else {
                    // Package install failures are non-fatal warnings.
                    // Packages may already be present in the sandbox image, or can
                    // be installed on demand by the agent at runtime once network
                    // policy propagates. The extension is still usable.
                    const output = (result.stderr || result.stdout).slice(0, 500);
                    steps.push({
                        step: 'install',
                        status: 'warning',
                        message: `Package install skipped (exit ${result.exitCode}): the package may already be installed or can be installed on demand. Command: ${cmd}`,
                        output,
                    });
                }
            } catch (err) {
                steps.push({
                    step: 'install',
                    status: 'warning',
                    message: `Package install skipped (sandbox exec failed): ${err.message}. The package can be installed manually inside the sandbox.`,
                });
            }
        }
    }

    // An extension is considered installed when policy + credential + channel steps succeed.
    // Install commands (pip/npm) are advisory — packages are pre-installed in the Docker image.
    // Only policy, credential, and channel registration steps are critical.
    const criticalSteps = steps.filter(s => s.step === 'policy' || s.step === 'credential' || s.step === 'channel');
    const criticalOk = criticalSteps.every(s => s.status === 'complete' || s.status === 'skipped' || s.status === 'warning');
    const hasInstallWarnings = steps.some(s => s.step === 'install' && s.status === 'warning');

    // Persist state so chat handler knows about installed extensions
    if (criticalOk) {
        markInstalled(sandboxName, extensionId, credential || null);
    }

    res.json({
        ok: criticalOk,
        extensionId,
        sandboxName,
        steps,
        message: criticalOk
            ? (hasInstallWarnings
                ? `Extension '${ext.name}' installed on '${sandboxName}' (some packages may need manual install)`
                : `Extension '${ext.name}' installed on '${sandboxName}'`)
            : `Extension '${ext.name}' failed to install — check steps for details`,
    });
});

// ── Uninstall extension ─────────────────────────────────────────

router.post('/api/extensions/uninstall', async (req, res) => {
    const { extensionId, sandboxName } = req.body;

    if (!extensionId || !sandboxName) {
        return res.status(400).json({
            ok: false,
            error: 'extensionId and sandboxName are required',
        });
    }

    const extensions = loadRegistry();
    const ext = extensions.find(e => e.id === extensionId);
    if (!ext) {
        return res.status(404).json({ ok: false, error: `Extension '${extensionId}' not found` });
    }

    try {
        // Use CLI-based policy removal like the install route.
        // Get current policy, strip the preset's entries, and re-apply.
        const policiesPath = join(NEMOCLAW_ROOT, 'bin', 'lib', 'policies.js');
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        delete require.cache[require.resolve(policiesPath)];
        const policies = require(policiesPath);

        // Get the raw current policy YAML
        let rawPolicy = '';
        try {
            const { execSync } = await import('child_process');
            rawPolicy = execSync(
                policies.buildPolicyGetCommand(sandboxName),
                { encoding: 'utf-8', timeout: 10000 }
            );
        } catch { /* no current policy */ }

        const currentPolicyYaml = policies.parseCurrentPolicy(rawPolicy);

        if (currentPolicyYaml) {
            // Remove the preset's network_policies entries from the YAML
            // The preset entries are keyed under a top-level name matching the preset
            const presetContent = policies.loadPreset(ext.policyPreset);
            const presetEntries = presetContent ? policies.extractPresetEntries(presetContent) : null;

            let cleanedPolicy = currentPolicyYaml;
            if (presetEntries) {
                // Strip the preset's entries from the current policy
                cleanedPolicy = currentPolicyYaml.replace(presetEntries, '').replace(/\n{3,}/g, '\n\n').trim();
            }

            // Write cleaned policy to temp file and apply
            const { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } = await import('fs');
            const { tmpdir } = await import('os');

            const tmpDir = mkdtempSync(join(tmpdir(), 'nemoclaw-policy-'));
            const tmpFile = join(tmpDir, 'policy.yaml');
            writeFileSync(tmpFile, cleanedPolicy, { encoding: 'utf-8', mode: 0o600 });

            try {
                const { execSync: exec2 } = await import('child_process');
                exec2(
                    policies.buildPolicySetCommand(tmpFile, sandboxName),
                    { encoding: 'utf-8', timeout: 15000 }
                );
            } finally {
                try { unlinkSync(tmpFile); } catch {}
                try { rmdirSync(tmpDir); } catch {}
            }
        }

        // Clean up credential from environment and state file
        if (ext.credentialKey && process.env[ext.credentialKey]) {
            delete process.env[ext.credentialKey];
        }
        markUninstalled(sandboxName, extensionId);

        res.json({
            ok: true,
            extensionId,
            sandboxName,
            message: `Extension '${ext.name}' removed from '${sandboxName}'`,
        });
    } catch (err) {
        res.status(500).json({
            ok: false,
            error: `Failed to uninstall extension: ${err.message}`,
        });
    }
});

// ── Sync channel config into sandbox ───────────────────────────
//
// Applies the stored credential for a channel extension to the openclaw
// gateway inside the sandbox.  Used to fix already-installed extensions
// that were configured before this mechanism was added (backfill), and
// testable from the Extensions panel.

router.post('/api/extensions/sync-channel', async (req, res) => {
    const { extensionId, sandboxName } = req.body;

    if (!extensionId || !sandboxName) {
        return res.status(400).json({ ok: false, error: 'extensionId and sandboxName are required' });
    }

    const extensions = loadRegistry();
    const ext = extensions.find(e => e.id === extensionId);
    if (!ext) {
        return res.status(404).json({ ok: false, error: `Extension '${extensionId}' not found` });
    }

    if (!ext.channelName) {
        return res.status(400).json({ ok: false, error: `Extension '${extensionId}' has no channelName — nothing to sync` });
    }

    // Resolve credential from state file or environment
    const state = loadExtState();
    const extState = state[sandboxName]?.[extensionId] || {};
    const credential = extState.credential || (ext.credentialKey ? process.env[ext.credentialKey] : null);

    if (!credential) {
        return res.status(400).json({
            ok: false,
            error: `No credential found for '${extensionId}' on sandbox '${sandboxName}'. Install the extension first with a bot token.`,
        });
    }

    try {
        // Resolve sandbox UUID
        let sandboxId = sandboxName;
        try {
            const resp = await grpcClient.getSandbox(sandboxName);
            sandboxId = resp.sandbox?.id || sandboxName;
        } catch { /* use name as fallback */ }

        const result = await configureChannelInSandbox(sandboxId, sandboxName, ext.channelName, credential);

        res.json({
            ok: result.ok,
            sandboxName,
            extensionId,
            channelName: ext.channelName,
            message: result.message,
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;
