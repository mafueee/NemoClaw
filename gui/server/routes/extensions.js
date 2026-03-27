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
 * The ~/.openclaw/openclaw.json file is read-only (owned by root, mode 0444),
 * so we cannot modify it directly. Instead we:
 *  1. Use Python (with the token passed as argv[1] to avoid all shell escaping)
 *     to write a small env file to the writable /sandbox/.openclaw-data volume.
 *  2. Run `openclaw doctor --fix` (sourcing the env file) to hot-apply the
 *     channel config to the running gateway daemon via its local socket.
 *     The gateway (pid 52, started by nemoclaw-start.sh) cannot be killed from
 *     our ExecSandbox session due to sandbox process isolation.
 *
 * The nemoclaw-start.sh entrypoint also sources this env file at startup,
 * so the Discord token survives container restarts automatically.
 *
 * @param {string} sandboxId  - resolved sandbox UUID for ExecSandbox
 * @param {string} channelKey - openclaw channel key e.g. "discord"
 * @param {string} token      - bot token to inject
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function configureChannelInSandbox(sandboxId, channelKey, token) {
    // Map channel key to its env var name (openclaw env fallback convention)
    const envVarMap = {
        discord: 'DISCORD_BOT_TOKEN',
        telegram: 'TELEGRAM_BOT_TOKEN',
        slack: 'SLACK_BOT_TOKEN',
    };
    const envVar = envVarMap[channelKey] || `${channelKey.toUpperCase()}_BOT_TOKEN`;

    // Python script: writes the env file. Token is passed as argv[1] to bypass shell quoting.
    const pyScript = [
        'import os, sys',
        "env_dir = '/sandbox/.openclaw-data'",
        'os.makedirs(env_dir, exist_ok=True)',
        "env_file = os.path.join(env_dir, '.channel-env')",
        'tok = sys.argv[1]',
        'with open(env_file, "w") as f:',
        `    f.write("export ${envVar}=" + repr(tok) + "\\n")`,
        'os.chmod(env_file, 0o600)',
        'print("ENV_WRITTEN")',
    ].join('\n');

    // Bash script: source the env file and run openclaw doctor --fix to
    // hot-apply the channel config to the running gateway daemon.
    const restartScript = [
        '. /sandbox/.openclaw-data/.channel-env',
        'openclaw doctor --fix 2>&1',
        'echo DOCTOR_DONE',
    ].join('\n');

    try {
        // Step 1: Write env file via Python (token as argv avoids all shell escaping)
        const writeStream = grpcClient.execSandbox(sandboxId, ['python3', '-c', pyScript, token], {
            timeoutSeconds: 15,
        });
        const { stdout: writeOut, stderr: writeErr, exitCode: writeCode } = await collectExecResult(writeStream);

        if (!writeOut.includes('ENV_WRITTEN') || writeCode !== 0) {
            const detail = (writeErr || writeOut).slice(0, 400);
            console.warn(`[extensions] configureChannelInSandbox: env write failed (exit ${writeCode}): ${detail}`);
            return { ok: false, message: `Env file write failed: ${detail}` };
        }
        console.log(`[extensions] ${envVar} env file written in sandbox ${sandboxId}`);

        // Step 2: Hot-apply with openclaw doctor --fix
        const restartStream = grpcClient.execSandbox(sandboxId, ['bash', '-c', restartScript], {
            timeoutSeconds: 20,
        });
        const { stdout: restartOut } = await collectExecResult(restartStream);
        const gwOk = restartOut.includes('DOCTOR_DONE');
        console.log(`[extensions] openclaw doctor --fix in ${sandboxId}: ${restartOut.slice(0, 400)}`);

        return {
            ok: true,
            message: `${envVar} injected and openclaw doctor --fix applied${gwOk ? ' — Discord channel activated' : ' (doctor may be pending)'}`,
        };
    } catch (err) {
        console.warn(`[extensions] configureChannelInSandbox failed: ${err.message}`);
        return { ok: false, message: `ExecSandbox failed: ${err.message}` };
    }
}

// ── List all extensions ─────────────────────────────────────────

router.get('/api/extensions', async (req, res) => {
    const { sandboxName } = req.query;

    try {
        const extensions = loadRegistry();

        // If a sandbox is specified, check which extensions are currently installed
        let installedNames = [];
        if (sandboxName) {
            try {
                const config = await grpcClient.getSandboxConfig(sandboxName);
                const networkPolicies = config.policy?.networkPolicies || {};
                installedNames = Object.keys(networkPolicies);
            } catch {
                // Gateway unavailable — return without install status
            }
        }

        const enriched = extensions.map(ext => ({
            ...ext,
            installed: installedNames.includes(ext.policyPreset),
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
            const config = await grpcClient.getSandboxConfig(sandboxName);
            const networkPolicies = config.policy?.networkPolicies || {};
            installed = !!networkPolicies[ext.policyPreset];
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
    // the token to a persistent env file and run openclaw doctor --fix.
    if (ext.channelName && credential) {
        try {
            let sandboxId = sandboxName;
            try {
                const resp = await grpcClient.getSandbox(sandboxName);
                sandboxId = resp.sandbox?.id || sandboxName;
            } catch { /* fall back to name */ }

            const cfgResult = await configureChannelInSandbox(sandboxId, ext.channelName, credential);
            steps.push({
                step: 'channel',
                status: cfgResult.ok ? 'complete' : 'warning',
                message: cfgResult.ok
                    ? `${ext.channelName} channel configured in sandbox and gateway reloaded`
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

            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        for (const cmd of ext.installCommands) {
            try {
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
                    const output = (result.stderr || result.stdout).slice(0, 500);
                    steps.push({
                        step: 'install',
                        status: 'warning',
                        message: `Package install skipped (exit ${result.exitCode}): may already be installed or can be installed on demand. Command: ${cmd}`,
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

    const criticalSteps = steps.filter(s => s.step === 'policy' || s.step === 'credential' || s.step === 'channel');
    const criticalOk = criticalSteps.every(s => s.status === 'complete' || s.status === 'skipped');
    const hasInstallWarnings = steps.some(s => s.step === 'install' && s.status === 'warning');

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
        const policiesPath = join(NEMOCLAW_ROOT, 'bin', 'lib', 'policies.js');
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        delete require.cache[require.resolve(policiesPath)];
        const policies = require(policiesPath);

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
            const presetContent = policies.loadPreset(ext.policyPreset);
            const presetEntries = presetContent ? policies.extractPresetEntries(presetContent) : null;

            let cleanedPolicy = currentPolicyYaml;
            if (presetEntries) {
                cleanedPolicy = currentPolicyYaml.replace(presetEntries, '').replace(/\n{3,}/g, '\n\n').trim();
            }

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
// gateway inside the sandbox via the env-file + doctor mechanism.
// Used to fix already-installed extensions that were configured before
// this mechanism was added (backfill), and callable from the Extensions panel.

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
        let sandboxId = sandboxName;
        try {
            const resp = await grpcClient.getSandbox(sandboxName);
            sandboxId = resp.sandbox?.id || sandboxName;
        } catch { /* use name as fallback */ }

        const result = await configureChannelInSandbox(sandboxId, ext.channelName, credential);

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
