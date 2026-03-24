// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Dynamic port management for NemoClaw.
// Reads port overrides from environment variables and a persistent
// config file, validates them, and provides auto-detection of free
// ports when conflicts exist.

const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Config file path ─────────────────────────────────────────────
const CONFIG_DIR = path.join(os.homedir(), ".config", "nemoclaw");
const CONFIG_FILE = path.join(CONFIG_DIR, "ports.json");

// ── Default ports ────────────────────────────────────────────────
const DEFAULTS = {
    GATEWAY_PORT: 8080,
    DASHBOARD_PORT: 18789,
    VLLM_PORT: 8000,
    OLLAMA_PORT: 11434,
    GUI_PORT: 3000,
};

// Environment variable names for each port
const ENV_KEYS = {
    GATEWAY_PORT: "NEMOCLAW_GATEWAY_PORT",
    DASHBOARD_PORT: "NEMOCLAW_DASHBOARD_PORT",
    VLLM_PORT: "NEMOCLAW_VLLM_PORT",
    OLLAMA_PORT: "NEMOCLAW_OLLAMA_PORT",
    GUI_PORT: "NEMOCLAW_GUI_PORT",
};

// ── Validation ───────────────────────────────────────────────────

/**
 * Validate that a port number is within the user-bindable range.
 * @param {number} port
 * @returns {boolean}
 */
function isValidPort(port) {
    return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

/**
 * Parse a port from an environment variable string.
 * Returns null if the env var is not set or invalid.
 * @param {string} envKey
 * @returns {number|null}
 */
function parsePortEnv(envKey) {
    const raw = process.env[envKey];
    if (!raw) return null;
    const port = parseInt(raw, 10);
    if (!isValidPort(port)) {
        console.error(
            `  ⚠  Invalid port in ${envKey}: "${raw}" — must be 1024–65535. Using default.`
        );
        return null;
    }
    return port;
}

// ── Persistent Config File ───────────────────────────────────────

/**
 * Load port overrides from the config file.
 * Returns an empty object if the file does not exist or is invalid.
 * @returns {Object<string, number>}
 */
function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) return {};
        const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
        const data = JSON.parse(raw);
        // Only keep valid port entries that match known port names
        const cleaned = {};
        for (const [key, val] of Object.entries(data)) {
            if (DEFAULTS.hasOwnProperty(key) && isValidPort(val)) {
                cleaned[key] = val;
            }
        }
        return cleaned;
    } catch {
        return {};
    }
}

/**
 * Save port overrides to the config file.
 * Only saves ports that differ from the defaults.
 * @param {Object<string, number>} overrides - e.g. { GATEWAY_PORT: 9090 }
 */
function saveConfig(overrides) {
    // Validate all entries
    for (const [key, val] of Object.entries(overrides)) {
        if (!DEFAULTS.hasOwnProperty(key)) {
            throw new Error(`Unknown port name: ${key}`);
        }
        if (!isValidPort(val)) {
            throw new Error(`Invalid port for ${key}: ${val}. Must be 1024–65535.`);
        }
    }
    // Merge with existing config
    const existing = loadConfig();
    const merged = { ...existing, ...overrides };
    // Remove entries that match defaults
    for (const [key, val] of Object.entries(merged)) {
        if (val === DEFAULTS[key]) {
            delete merged[key];
        }
    }
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n", "utf-8");
    return merged;
}

/**
 * Delete the config file, reverting all ports to defaults.
 */
function resetConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            fs.unlinkSync(CONFIG_FILE);
        }
    } catch {
        // Ignore errors during cleanup
    }
}

// ── Port Resolution ──────────────────────────────────────────────

/**
 * Get the configured port for a named service.
 * Priority: env var override → config file → default.
 * @param {string} name - One of GATEWAY_PORT, DASHBOARD_PORT, etc.
 * @returns {number}
 */
function getPort(name) {
    const envKey = ENV_KEYS[name];
    if (!envKey) return DEFAULTS[name] || 0;
    // 1. Environment variable (highest priority)
    const envPort = parsePortEnv(envKey);
    if (envPort) return envPort;
    // 2. Config file
    const config = loadConfig();
    if (config[name]) return config[name];
    // 3. Default
    return DEFAULTS[name];
}

/**
 * Get the source of each port's current value.
 * @returns {Array<{name: string, port: number, source: 'env'|'config'|'default'}>}
 */
function getPortSources() {
    const config = loadConfig();
    const sources = [];
    for (const name of Object.keys(DEFAULTS)) {
        const envKey = ENV_KEYS[name];
        const envPort = envKey ? parsePortEnv(envKey) : null;
        if (envPort) {
            sources.push({ name, port: envPort, source: "env" });
        } else if (config[name]) {
            sources.push({ name, port: config[name], source: "config" });
        } else {
            sources.push({ name, port: DEFAULTS[name], source: "default" });
        }
    }
    return sources;
}

/**
 * Get all configured ports as a flat object.
 * @returns {Object<string, number>}
 */
function getAllPorts() {
    const ports = {};
    for (const name of Object.keys(DEFAULTS)) {
        ports[name] = getPort(name);
    }
    return ports;
}

// ── Port Availability ────────────────────────────────────────────

/**
 * Check if a single TCP port is available on localhost.
 * Distinguishes EADDRINUSE (port taken) from EPERM/EACCES (probe
 * not permitted) — the latter is treated as "probably available" to
 * avoid false negatives in restricted environments (issue #544).
 *
 * @param {number} port
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
function checkPort(port) {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.once("error", (err) => {
            if (err.code === "EADDRINUSE") {
                resolve({ ok: false, reason: `port ${port} is in use` });
            } else if (err.code === "EPERM" || err.code === "EACCES") {
                // Permission error — not a true port conflict.
                // Degrade gracefully per issue #544.
                resolve({ ok: true, reason: `probe not permitted (${err.code}), assuming available` });
            } else {
                resolve({ ok: false, reason: `probe error: ${err.message}` });
            }
        });
        srv.listen(port, "127.0.0.1", () => {
            srv.close(() => resolve({ ok: true }));
        });
    });
}

/**
 * Find a free port starting from a preferred port.
 * Tries the preferred port first, then scans upward up to 100 ports.
 *
 * @param {number} preferred
 * @param {number} [maxAttempts=100]
 * @returns {Promise<number>}
 */
async function findFreePort(preferred, maxAttempts = 100) {
    for (let offset = 0; offset < maxAttempts; offset++) {
        const candidate = preferred + offset;
        if (candidate > 65535) break;
        const result = await checkPort(candidate);
        if (result.ok) return candidate;
    }
    throw new Error(
        `Could not find a free port starting from ${preferred} (tried ${maxAttempts} ports)`
    );
}

/**
 * Check all configured ports for conflicts and return a status report.
 * @returns {Promise<Array<{name: string, port: number, available: boolean, reason?: string}>>}
 */
async function checkAllPorts() {
    const ports = getAllPorts();
    const results = [];
    for (const [name, port] of Object.entries(ports)) {
        const result = await checkPort(port);
        results.push({
            name,
            port,
            available: result.ok,
            reason: result.reason,
        });
    }
    return results;
}

/**
 * Resolve all required ports, auto-finding free ports when conflicts exist.
 * Returns an object with the same keys as DEFAULTS but with resolved (free) ports.
 *
 * @param {Object} [options]
 * @param {boolean} [options.autoResolve=true] - Auto-find free ports on conflict
 * @param {string[]} [options.required] - Port names that must be resolved (default: all)
 * @returns {Promise<Object<string, number>>}
 */
async function resolveAllPorts(options = {}) {
    const { autoResolve = true, required } = options;
    const configuredPorts = getAllPorts();
    const resolved = {};

    const portNames = required || Object.keys(configuredPorts);
    for (const name of portNames) {
        const preferred = configuredPorts[name];
        if (autoResolve) {
            resolved[name] = await findFreePort(preferred);
        } else {
            const check = await checkPort(preferred);
            resolved[name] = preferred;
            if (!check.ok) {
                console.error(`  ⚠  Port ${preferred} (${name}) is not available: ${check.reason}`);
            }
        }
    }

    return resolved;
}

module.exports = {
    DEFAULTS,
    ENV_KEYS,
    CONFIG_FILE,
    getPort,
    getAllPorts,
    getPortSources,
    isValidPort,
    loadConfig,
    saveConfig,
    resetConfig,
    checkPort,
    findFreePort,
    checkAllPorts,
    resolveAllPorts,
};
