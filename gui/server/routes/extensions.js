// NemoClaw — Extension Management REST Routes
// Provides endpoints to browse, install, and uninstall extensions on sandboxes/claws.
// Extensions combine network policy presets, credential configuration, and optional
// in-sandbox package installation via ExecSandbox gRPC.

import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as grpcClient from '../lib/grpcClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

const NEMOCLAW_ROOT = process.env.NEMOCLAW_ROOT || join(__dirname, '..', '..', '..');
const REGISTRY_PATH = join(NEMOCLAW_ROOT, 'nemoclaw-blueprint', 'extensions', 'registry.json');
const PRESETS_DIR = join(NEMOCLAW_ROOT, 'nemoclaw-blueprint', 'policies', 'presets');

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
    try {
        const presetFile = join(PRESETS_DIR, `${ext.policyPreset}.yaml`);
        if (!existsSync(presetFile)) {
            steps.push({ step: 'policy', status: 'error', message: `Policy preset '${ext.policyPreset}' not found on disk` });
        } else {
            // Load the preset content and parse network_policies
            const content = readFileSync(presetFile, 'utf-8');

            // Get current sandbox config
            let currentPolicy = {};
            try {
                const config = await grpcClient.getSandboxConfig(sandboxName);
                currentPolicy = config.policy || {};
            } catch { /* start fresh */ }

            // Parse endpoints from the YAML preset for the gRPC update
            // We use the policies.js approach — programmatic policy merge
            const policiesPath = join(NEMOCLAW_ROOT, 'bin', 'lib', 'policies.js');
            let presetPolicy = null;
            try {
                const { createRequire } = await import('module');
                const require = createRequire(import.meta.url);
                delete require.cache[require.resolve(policiesPath)];
                const policies = require(policiesPath);
                if (typeof policies.loadPresetPolicy === 'function') {
                    presetPolicy = policies.loadPresetPolicy(ext.policyPreset);
                }
            } catch { /* fallback below */ }

            // Merge network policies
            const mergedPolicy = {
                ...currentPolicy,
                networkPolicies: {
                    ...(currentPolicy.networkPolicies || {}),
                    // If policies.js parsing worked, use it; otherwise use preset name as key
                    ...(presetPolicy?.network_policies || { [ext.policyPreset]: { name: ext.policyPreset } }),
                },
            };

            await grpcClient.updateConfig(sandboxName, { policy: mergedPolicy });
            steps.push({ step: 'policy', status: 'complete', message: `Network policy '${ext.policyPreset}' applied` });
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

    // Step 3: Run install commands inside sandbox via ExecSandbox
    if (ext.installCommands && ext.installCommands.length > 0) {
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
                    steps.push({
                        step: 'install',
                        status: 'error',
                        message: `Command failed (exit ${result.exitCode}): ${cmd}`,
                        output: (result.stderr || result.stdout).slice(0, 500),
                    });
                }
            } catch (err) {
                steps.push({
                    step: 'install',
                    status: 'error',
                    message: `ExecSandbox failed for '${cmd}': ${err.message}`,
                });
            }
        }
    }

    const allComplete = steps.every(s => s.status === 'complete' || s.status === 'skipped');

    res.json({
        ok: allComplete,
        extensionId,
        sandboxName,
        steps,
        message: allComplete
            ? `Extension '${ext.name}' installed on '${sandboxName}'`
            : `Extension '${ext.name}' partially installed — check steps for details`,
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
        // Remove the policy preset from the sandbox
        const config = await grpcClient.getSandboxConfig(sandboxName);
        const currentPolicy = config.policy || {};
        const networkPolicies = { ...(currentPolicy.networkPolicies || {}) };

        // Remove the preset's policies
        delete networkPolicies[ext.policyPreset];

        const updatedPolicy = {
            ...currentPolicy,
            networkPolicies,
        };

        await grpcClient.updateConfig(sandboxName, { policy: updatedPolicy });

        // Clean up credential from environment
        if (ext.credentialKey && process.env[ext.credentialKey]) {
            delete process.env[ext.credentialKey];
        }

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
