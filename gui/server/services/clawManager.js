// NemoClaw — Claw Instance Manager Service
// Provides CRUD operations for claw instances, persisted to ~/.nemoclaw/claws.json.
// Each claw maps to one OpenShell sandbox and tracks its own config + metadata.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const NEMOCLAW_DIR = join(homedir(), '.nemoclaw');
const CLAWS_FILE = join(NEMOCLAW_DIR, 'claws.json');

// ── Persistence ────────────────────────────────────────────────

function ensureDir() {
    if (!existsSync(NEMOCLAW_DIR)) {
        mkdirSync(NEMOCLAW_DIR, { recursive: true });
    }
}

function loadClaws() {
    ensureDir();
    if (!existsSync(CLAWS_FILE)) {
        return [];
    }
    try {
        return JSON.parse(readFileSync(CLAWS_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

function saveClaws(claws) {
    ensureDir();
    writeFileSync(CLAWS_FILE, JSON.stringify(claws, null, 2));
}

// ── OpenShell Integration ──────────────────────────────────────

function runCli(cmd, opts = {}) {
    try {
        const output = execSync(cmd, {
            encoding: 'utf-8',
            timeout: opts.timeout || 15000,
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

/** Parse `openshell sandbox list` output into structured objects */
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

/** Get live sandbox statuses from openshell */
function getLiveSandboxes() {
    const result = runCli('openshell sandbox list 2>/dev/null');
    if (!result.ok) return [];
    return parseSandboxList(result.output);
}

/** Get detailed info for a single sandbox */
function getSandboxDetail(name) {
    const result = runCli(`openshell sandbox get "${name}" 2>/dev/null`);
    return { ok: result.ok, output: result.output };
}

/** List registered gateways */
function listGateways() {
    const result = runCli('openshell gateway select 2>/dev/null');
    if (!result.ok) return [];
    const lines = result.output.split('\n').filter(l => l.trim());
    const gateways = [];
    for (const line of lines) {
        const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (!clean || clean.startsWith('NAME') || clean.startsWith('─')) continue;
        const isActive = clean.includes('*') || clean.includes('→');
        const name = clean.replace(/[*→]/g, '').split(/\s+/)[0];
        if (name) {
            gateways.push({ name, active: isActive });
        }
    }
    return gateways;
}

// ── CRUD Operations ────────────────────────────────────────────

/** List all claws with live status cross-referenced from openshell */
export function listClaws() {
    const claws = loadClaws();
    const liveSandboxes = getLiveSandboxes();
    const liveMap = new Map(liveSandboxes.map(s => [s.name, s]));

    return claws.map(claw => {
        const live = liveMap.get(claw.sandboxName);
        return {
            ...claw,
            sandboxStatus: live ? live.status : 'not-found',
            status: live
                ? mapSandboxStatus(live.status)
                : 'stopped',
        };
    });
}

/** Get a single claw by ID with enriched status */
export function getClaw(id) {
    const claws = loadClaws();
    const claw = claws.find(c => c.id === id);
    if (!claw) return null;

    const liveSandboxes = getLiveSandboxes();
    const live = liveSandboxes.find(s => s.name === claw.sandboxName);
    const detail = getSandboxDetail(claw.sandboxName);

    return {
        ...claw,
        sandboxStatus: live ? live.status : 'not-found',
        status: live ? mapSandboxStatus(live.status) : 'stopped',
        detail: detail.ok ? detail.output : null,
    };
}

/** Register a new claw instance */
export function registerClaw({ id, sandboxName, gatewayName, config }) {
    const claws = loadClaws();

    // Don't duplicate
    if (claws.find(c => c.id === id)) {
        throw new Error(`Claw '${id}' already exists`);
    }

    const claw = {
        id,
        sandboxName: sandboxName || id,
        gatewayName: gatewayName || 'nemoclaw',
        createdAt: new Date().toISOString(),
        lastConnected: null,
        config: config || {},
        status: 'creating',
    };

    claws.push(claw);
    saveClaws(claws);
    return claw;
}

/** Update an existing claw's metadata or config */
export function updateClaw(id, updates) {
    const claws = loadClaws();
    const idx = claws.findIndex(c => c.id === id);
    if (idx === -1) {
        throw new Error(`Claw '${id}' not found`);
    }

    // Merge updates
    if (updates.config) {
        claws[idx].config = { ...claws[idx].config, ...updates.config };
        delete updates.config;
    }
    Object.assign(claws[idx], updates);
    saveClaws(claws);
    return claws[idx];
}

/** Remove a claw from the registry */
export function removeClaw(id) {
    const claws = loadClaws();
    const idx = claws.findIndex(c => c.id === id);
    if (idx === -1) {
        throw new Error(`Claw '${id}' not found`);
    }
    const removed = claws.splice(idx, 1)[0];
    saveClaws(claws);
    return removed;
}

/** Mark a claw as recently connected */
export function touchClaw(id) {
    return updateClaw(id, { lastConnected: new Date().toISOString() });
}

/**
 * Sync the registry with actual OpenShell sandbox list.
 * Discovers new sandboxes not in the registry (orphans) and
 * marks registry entries whose sandbox no longer exists.
 */
export function syncWithOpenShell() {
    const claws = loadClaws();
    const liveSandboxes = getLiveSandboxes();
    const registeredNames = new Set(claws.map(c => c.sandboxName));

    // Discover orphaned sandboxes (exist in OpenShell but not in claw registry)
    const orphans = liveSandboxes
        .filter(s => !registeredNames.has(s.name))
        .map(s => ({
            id: s.name,
            sandboxName: s.name,
            gatewayName: 'nemoclaw',
            createdAt: s.created || new Date().toISOString(),
            lastConnected: null,
            config: {},
            status: mapSandboxStatus(s.status),
            discovered: true,
        }));

    // Auto-register orphans
    if (orphans.length > 0) {
        claws.push(...orphans);
        saveClaws(claws);
    }

    // Return enriched list
    const liveMap = new Map(liveSandboxes.map(s => [s.name, s]));
    return claws.map(claw => {
        const live = liveMap.get(claw.sandboxName);
        return {
            ...claw,
            sandboxStatus: live ? live.status : 'not-found',
            status: live ? mapSandboxStatus(live.status) : 'stopped',
        };
    });
}

/** Get available gateways */
export function getGateways() {
    return listGateways();
}

// ── Helpers ────────────────────────────────────────────────────

function mapSandboxStatus(sandboxStatus) {
    const s = (sandboxStatus || '').toLowerCase();
    if (s === 'ready' || s === 'running') return 'running';
    if (s === 'notready' || s === 'pending' || s === 'creating') return 'creating';
    if (s === 'terminating') return 'stopped';
    if (s === 'error' || s === 'failed' || s === 'crashloopbackoff') return 'error';
    return 'unknown';
}
