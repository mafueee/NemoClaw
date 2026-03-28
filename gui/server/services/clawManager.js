// NemoClaw — Claw Instance Manager Service
// Provides CRUD operations for claw instances, persisted to ~/.nemoclaw/claws.json.
// Each claw maps to one OpenShell sandbox and tracks its own config + metadata.
//
// All sandbox queries use gRPC exclusively — no CLI fallback.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as grpcClient from '../lib/grpcClient.js';

const NEMOCLAW_DIR = join(homedir(), '.nemoclaw');
const CLAWS_FILE = join(NEMOCLAW_DIR, 'claws.json');

// ── Persistence ────────────────────────────────────────────────────

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

// ── OpenShell Integration (gRPC-only) ──────────────────────────

/** Get live sandbox statuses via gRPC ListSandboxes. */
async function getLiveSandboxes() {
    try {
        const resp = await grpcClient.listSandboxes();
        return (resp.sandboxes || []).map(grpcClient.sandboxToDto);
    } catch {
        return [];
    }
}

/** Get detailed info for a single sandbox via gRPC GetSandbox. */
async function getSandboxDetail(name) {
    try {
        const resp = await grpcClient.getSandbox(name);
        const dto = grpcClient.sandboxToDto(resp.sandbox);
        return { ok: true, output: JSON.stringify(dto, null, 2), data: dto };
    } catch (err) {
        return { ok: false, output: err.message || 'Sandbox not found' };
    }
}

// ── CRUD Operations ────────────────────────────────────────────────

/** List all claws with live status cross-referenced from openshell.
 *  Persists discovered status back to disk so 'creating' -> 'running' sticks. */
export async function listClaws() {
    const claws = loadClaws();
    const liveSandboxes = await getLiveSandboxes();
    const liveMap = new Map(liveSandboxes.map(s => [s.name, s]));

    let dirty = false;
    const result = claws.map(claw => {
        const live = liveMap.get(claw.sandboxName);
        const resolvedStatus = live ? mapSandboxStatus(live.status) : 'stopped';
        // Persist status change back to disk
        if (claw.status !== resolvedStatus) {
            claw.status = resolvedStatus;
            dirty = true;
        }
        return {
            ...claw,
            sandboxStatus: live ? live.status : 'not-found',
            status: resolvedStatus,
        };
    });

    if (dirty) saveClaws(claws);
    return result;
}

/** Get a single claw by ID with enriched status.
 *  Persists discovered status back to disk. */
export async function getClaw(id) {
    const claws = loadClaws();
    const claw = claws.find(c => c.id === id);
    if (!claw) return null;

    const liveSandboxes = await getLiveSandboxes();
    const live = liveSandboxes.find(s => s.name === claw.sandboxName);
    const detail = await getSandboxDetail(claw.sandboxName);

    const resolvedStatus = live ? mapSandboxStatus(live.status) : 'stopped';
    if (claw.status !== resolvedStatus) {
        claw.status = resolvedStatus;
        saveClaws(claws);
    }

    return {
        ...claw,
        sandboxStatus: live ? live.status : 'not-found',
        status: resolvedStatus,
        detail: detail.ok ? detail.output : null,
        detailData: detail.data || null,
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
export async function syncWithOpenShell() {
    const claws = loadClaws();
    const liveSandboxes = await getLiveSandboxes();
    const registeredNames = new Set(claws.map(c => c.sandboxName));

    // Discover orphaned sandboxes (exist in OpenShell but not in claw registry)
    const orphans = liveSandboxes
        .filter(s => !registeredNames.has(s.name))
        .map(s => ({
            id: s.name,
            sandboxName: s.name,
            gatewayName: 'nemoclaw',
            createdAt: s.createdAt || new Date().toISOString(),
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

/** Get available gateways — returns gateway info from gRPC health check */
export async function getGateways() {
    try {
        const conn = await grpcClient.checkConnection();
        if (conn.connected) {
            return [{
                name: conn.clusterName || 'nemoclaw',
                active: true,
                endpoint: conn.endpoint || '',
                version: conn.version || '',
            }];
        }
        return [];
    } catch {
        return [];
    }
}

/**
 * Reconcile the local claw registry with the live gateway state.
 * - Updates every claw's status from the gateway sandbox phase.
 * - Removes claws whose sandbox no longer exists and that were created >24 h ago.
 * Call once at server startup and optionally on a timer.
 */
export async function syncAndPersist() {
    const claws = loadClaws();
    const liveSandboxes = await getLiveSandboxes();
    const liveMap = new Map(liveSandboxes.map(s => [s.name, s]));
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const kept = [];
    for (const claw of claws) {
        const live = liveMap.get(claw.sandboxName);
        if (live) {
            claw.status = mapSandboxStatus(live.status);
            kept.push(claw);
        } else {
            // Remove if older than 24 h and sandbox is gone
            const created = claw.createdAt ? new Date(claw.createdAt).getTime() : 0;
            if (created && created < cutoff) {
                console.log(`[sync] Removing stale claw '${claw.id}' (sandbox gone, created ${claw.createdAt})`);
            } else {
                kept.push(claw); // keep recently-created entries even if sandbox is missing
            }
        }
    }

    // Auto-discover sandboxes not in registry
    const registeredNames = new Set(kept.map(c => c.sandboxName));
    for (const s of liveSandboxes) {
        if (!registeredNames.has(s.name)) {
            kept.push({
                id: s.name,
                sandboxName: s.name,
                gatewayName: 'nemoclaw',
                createdAt: s.createdAt || new Date().toISOString(),
                lastConnected: null,
                config: {},
                status: mapSandboxStatus(s.status),
                discovered: true,
            });
            console.log(`[sync] Auto-registered orphaned sandbox '${s.name}' as claw`);
        }
    }

    saveClaws(kept);
    return kept;
}

// ── Helpers ──────────────────────────────────────────────────────

function mapSandboxStatus(sandboxStatus) {
    const s = (sandboxStatus || '').toLowerCase();
    if (s === 'ready' || s === 'running') return 'running';
    if (s === 'notready' || s === 'pending' || s === 'creating') return 'creating';
    if (s === 'terminating') return 'stopped';
    if (s === 'error' || s === 'failed' || s === 'crashloopbackoff') return 'error';
    return 'unknown';
}
