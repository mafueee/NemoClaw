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
 * Parse a YAML policy preset file and extract its network_policies as a
 * simplified JS object suitable for gRPC updateConfig.
 * This is a lightweight YAML parser that handles the preset format.
 */
function parsePresetYaml(presetName) {
    const filePath = join(PRESETS_DIR, `${presetName}.yaml`);
    if (!existsSync(filePath)) return null;

    try {
        const content = readFileSync(filePath, 'utf-8');
        // Extract the network_policies block
        const npMatch = content.match(/^network_policies:\n([\s\S]*)$/m);
        if (!npMatch) return null;

        // Parse the YAML into a policy-compatible structure
        // We return the raw content for policy merging
        return { raw: content, presetName };
    } catch {
        return null;
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

    // Step 3: Register channel credential via gateway settings (gateway-native approach).
    // Instead of running `openclaw channels add` inside the sandbox (which requires
    // the openclaw binary to be present in the container), we store the bot token
    // as a named gateway sandbox setting. The agent runtime reads these settings as
    // environment variables, allowing the openclaw SDK to pick them up automatically.
    //
    // Setting key format: CHANNEL_<NAME>_TOKEN  (e.g. CHANNEL_DISCORD_TOKEN)
    if (ext.channelName && credential) {
        const settingKey = `CHANNEL_${ext.channelName.toUpperCase()}_TOKEN`;
        try {
            await grpcClient.updateConfig(sandboxName, {
                settingKey,
                settingValue: credential,
            });
            steps.push({
                step: 'channel',
                status: 'complete',
                message: `Channel credential '${settingKey}' registered in gateway`,
            });
        } catch (err) {
            // Gateway may be unavailable — fall back to recording in local state so
            // the chat handler can inject the token as an env var when executing.
            const state = loadExtState();
            if (!state[sandboxName]) state[sandboxName] = {};
            if (!state[sandboxName][extensionId]) state[sandboxName][extensionId] = {};
            state[sandboxName][extensionId][settingKey] = credential;
            saveExtState(state);
            steps.push({
                step: 'channel',
                status: 'complete',
                message: `Channel credential '${settingKey}' stored locally (gateway unavailable: ${err.message})`,
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
    const criticalOk = criticalSteps.every(s => s.status === 'complete' || s.status === 'skipped');
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

export default router;
