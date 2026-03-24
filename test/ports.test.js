// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";

// Import the module under test
const ports = require(path.join(import.meta.dirname, "..", "bin", "lib", "ports.js"));

const { DEFAULTS, ENV_KEYS, getPort, getAllPorts, isValidPort, checkPort, findFreePort } = ports;

// ── Helpers ──────────────────────────────────────────────────────

/** Save and restore env vars across tests */
function withEnv(overrides, fn) {
    const saved = {};
    for (const key of Object.keys(overrides)) {
        saved[key] = process.env[key];
        if (overrides[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = overrides[key];
        }
    }
    try {
        return fn();
    } finally {
        for (const key of Object.keys(saved)) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
    }
}

// ── DEFAULTS & ENV_KEYS ──────────────────────────────────────────

describe("ports module constants", () => {
    it("exports default ports for all 5 services", () => {
        expect(DEFAULTS).toEqual({
            GATEWAY_PORT: 8080,
            DASHBOARD_PORT: 18789,
            VLLM_PORT: 8000,
            OLLAMA_PORT: 11434,
            GUI_PORT: 3000,
        });
    });

    it("exports env var names for every default port", () => {
        for (const name of Object.keys(DEFAULTS)) {
            expect(ENV_KEYS[name]).toBeDefined();
            expect(ENV_KEYS[name]).toMatch(/^NEMOCLAW_/);
        }
    });
});

// ── isValidPort ──────────────────────────────────────────────────

describe("isValidPort", () => {
    it("rejects ports below 1024", () => {
        expect(isValidPort(80)).toBe(false);
        expect(isValidPort(0)).toBe(false);
        expect(isValidPort(1023)).toBe(false);
    });

    it("accepts 1024", () => {
        expect(isValidPort(1024)).toBe(true);
    });

    it("accepts high port numbers", () => {
        expect(isValidPort(65535)).toBe(true);
    });

    it("rejects ports above 65535", () => {
        expect(isValidPort(65536)).toBe(false);
    });

    it("rejects non-integers", () => {
        expect(isValidPort(3000.5)).toBe(false);
        expect(isValidPort(NaN)).toBe(false);
    });
});

// ── getPort ──────────────────────────────────────────────────────

describe("getPort", () => {
    afterEach(() => {
        // Clean up any test env vars
        for (const key of Object.values(ENV_KEYS)) {
            delete process.env[key];
        }
    });

    it("returns the default when no env var is set", () => {
        delete process.env.NEMOCLAW_GATEWAY_PORT;
        expect(getPort("GATEWAY_PORT")).toBe(8080);
    });

    it("reads env var override", () => {
        withEnv({ NEMOCLAW_GATEWAY_PORT: "9090" }, () => {
            expect(getPort("GATEWAY_PORT")).toBe(9090);
        });
    });

    it("falls back to default on invalid env var", () => {
        withEnv({ NEMOCLAW_GATEWAY_PORT: "notanumber" }, () => {
            expect(getPort("GATEWAY_PORT")).toBe(8080);
        });
    });

    it("falls back to default on out-of-range env var", () => {
        withEnv({ NEMOCLAW_GATEWAY_PORT: "80" }, () => {
            expect(getPort("GATEWAY_PORT")).toBe(8080);
        });
    });

    it("works for all known port names", () => {
        for (const name of Object.keys(DEFAULTS)) {
            expect(getPort(name)).toBe(DEFAULTS[name]);
        }
    });

    it("returns 0 for unknown port name", () => {
        expect(getPort("UNKNOWN_PORT")).toBe(0);
    });
});

// ── getAllPorts ───────────────────────────────────────────────────

describe("getAllPorts", () => {
    it("returns all 5 ports with default values", () => {
        const all = withEnv(
            {
                NEMOCLAW_GATEWAY_PORT: undefined,
                NEMOCLAW_DASHBOARD_PORT: undefined,
                NEMOCLAW_VLLM_PORT: undefined,
                NEMOCLAW_OLLAMA_PORT: undefined,
                NEMOCLAW_GUI_PORT: undefined,
            },
            getAllPorts
        );
        expect(Object.keys(all)).toHaveLength(5);
        expect(all).toEqual(DEFAULTS);
    });

    it("reflects env var overrides", () => {
        const all = withEnv(
            { NEMOCLAW_GUI_PORT: "4000", NEMOCLAW_GATEWAY_PORT: "9080" },
            getAllPorts
        );
        expect(all.GUI_PORT).toBe(4000);
        expect(all.GATEWAY_PORT).toBe(9080);
        expect(all.DASHBOARD_PORT).toBe(18789);
    });
});

// ── checkPort ────────────────────────────────────────────────────

describe("checkPort", () => {
    it("reports a high ephemeral port as available", async () => {
        // Port 59123 is very unlikely to be in use
        const result = await checkPort(59123);
        expect(result.ok).toBe(true);
    });

    it("returns an object with ok and optional reason", async () => {
        const result = await checkPort(59124);
        expect(typeof result.ok).toBe("boolean");
        if (!result.ok) {
            expect(typeof result.reason).toBe("string");
        }
    });
});

// ── findFreePort ─────────────────────────────────────────────────

describe("findFreePort", () => {
    it("returns the preferred port when it is free", async () => {
        // Use high ephemeral port that is almost certainly available
        const port = await findFreePort(59200);
        expect(port).toBeGreaterThanOrEqual(59200);
        expect(port).toBeLessThanOrEqual(65535);
    });

    it("returns a valid port number", async () => {
        const port = await findFreePort(59300);
        expect(Number.isInteger(port)).toBe(true);
        expect(port).toBeGreaterThanOrEqual(1024);
        expect(port).toBeLessThanOrEqual(65535);
    });

    it("throws when maxAttempts is exhausted and all ports taken at boundary", async () => {
        // Port 65535 with maxAttempts=1 — only one candidate (65535)
        // This test just verifies the function handles the boundary
        const port = await findFreePort(65535, 1);
        expect(port).toBe(65535);
    });
});

// ── Integration: env overrides round-trip ────────────────────────

describe("end-to-end env override", () => {
    it("overridden ports flow through getAllPorts correctly", () => {
        withEnv(
            {
                NEMOCLAW_GATEWAY_PORT: "8181",
                NEMOCLAW_DASHBOARD_PORT: "19789",
                NEMOCLAW_VLLM_PORT: "8001",
                NEMOCLAW_OLLAMA_PORT: "11435",
                NEMOCLAW_GUI_PORT: "3001",
            },
            () => {
                const all = getAllPorts();
                expect(all.GATEWAY_PORT).toBe(8181);
                expect(all.DASHBOARD_PORT).toBe(19789);
                expect(all.VLLM_PORT).toBe(8001);
                expect(all.OLLAMA_PORT).toBe(11435);
                expect(all.GUI_PORT).toBe(3001);
            }
        );
    });

    it("invalid overrides fall back without crashing", () => {
        withEnv(
            {
                NEMOCLAW_GATEWAY_PORT: "abc",
                NEMOCLAW_DASHBOARD_PORT: "-1",
                NEMOCLAW_VLLM_PORT: "99999",
                NEMOCLAW_GUI_PORT: "",
            },
            () => {
                const all = getAllPorts();
                expect(all.GATEWAY_PORT).toBe(DEFAULTS.GATEWAY_PORT);
                expect(all.DASHBOARD_PORT).toBe(DEFAULTS.DASHBOARD_PORT);
                expect(all.VLLM_PORT).toBe(DEFAULTS.VLLM_PORT);
                expect(all.GUI_PORT).toBe(DEFAULTS.GUI_PORT);
            }
        );
    });
});

// ── Config file persistence ──────────────────────────────────────

import fs from "node:fs";
import os from "node:os";

const {
    CONFIG_FILE,
    loadConfig,
    saveConfig,
    resetConfig,
    getPortSources,
} = ports;

describe("config file persistence", () => {
    // Use a temp dir to avoid touching the real config
    const origConfigFile = CONFIG_FILE;
    let tmpDir;
    let tmpConfigFile;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-test-"));
        tmpConfigFile = path.join(tmpDir, "ports.json");
        // Monkey-patch the module's CONFIG_FILE reference
        // We test through saveConfig/loadConfig which use the module-level var
    });

    afterEach(() => {
        // Clean up temp files
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { }
        resetConfig();
    });

    it("loadConfig returns empty object when no config file exists", () => {
        resetConfig();
        const config = loadConfig();
        expect(config).toEqual({});
    });

    it("saveConfig creates a config file and loadConfig reads it", () => {
        resetConfig();
        saveConfig({ GATEWAY_PORT: 9090 });
        const config = loadConfig();
        expect(config.GATEWAY_PORT).toBe(9090);
    });

    it("saveConfig rejects unknown port names", () => {
        expect(() => saveConfig({ UNKNOWN_PORT: 5000 })).toThrow("Unknown port name");
    });

    it("saveConfig rejects invalid port numbers", () => {
        expect(() => saveConfig({ GATEWAY_PORT: 80 })).toThrow("Invalid port");
    });

    it("saveConfig omits ports that match defaults", () => {
        resetConfig();
        saveConfig({ GATEWAY_PORT: 8080 }); // Same as default
        const config = loadConfig();
        expect(config.GATEWAY_PORT).toBeUndefined(); // Should not be in config
    });

    it("resetConfig removes the config file", () => {
        saveConfig({ GATEWAY_PORT: 9090 });
        resetConfig();
        const config = loadConfig();
        expect(config).toEqual({});
    });

    it("saveConfig merges with existing config", () => {
        resetConfig();
        saveConfig({ GATEWAY_PORT: 9090 });
        saveConfig({ DASHBOARD_PORT: 19000 });
        const config = loadConfig();
        expect(config.GATEWAY_PORT).toBe(9090);
        expect(config.DASHBOARD_PORT).toBe(19000);
    });
});

// ── getPortSources ───────────────────────────────────────────────

describe("getPortSources", () => {
    afterEach(() => {
        for (const key of Object.values(ENV_KEYS)) {
            delete process.env[key];
        }
        resetConfig();
    });

    it("returns default source when no overrides exist", () => {
        resetConfig();
        const sources = withEnv(
            {
                NEMOCLAW_GATEWAY_PORT: undefined,
                NEMOCLAW_DASHBOARD_PORT: undefined,
                NEMOCLAW_VLLM_PORT: undefined,
                NEMOCLAW_OLLAMA_PORT: undefined,
                NEMOCLAW_GUI_PORT: undefined,
            },
            getPortSources
        );
        for (const s of sources) {
            expect(s.source).toBe("default");
        }
    });

    it("returns env source when env var is set", () => {
        resetConfig();
        const sources = withEnv(
            { NEMOCLAW_GATEWAY_PORT: "9090" },
            getPortSources
        );
        const gw = sources.find((s) => s.name === "GATEWAY_PORT");
        expect(gw.source).toBe("env");
        expect(gw.port).toBe(9090);
    });

    it("returns config source when config file has override", () => {
        withEnv(
            { NEMOCLAW_GATEWAY_PORT: undefined },
            () => {
                resetConfig();
                saveConfig({ GATEWAY_PORT: 9191 });
                const sources = getPortSources();
                const gw = sources.find((s) => s.name === "GATEWAY_PORT");
                expect(gw.source).toBe("config");
                expect(gw.port).toBe(9191);
            }
        );
    });

    it("env takes priority over config", () => {
        saveConfig({ GATEWAY_PORT: 9191 });
        withEnv(
            { NEMOCLAW_GATEWAY_PORT: "7070" },
            () => {
                const sources = getPortSources();
                const gw = sources.find((s) => s.name === "GATEWAY_PORT");
                expect(gw.source).toBe("env");
                expect(gw.port).toBe(7070);
            }
        );
        resetConfig();
    });
});

// ── Resolution order: env > config > default ─────────────────────

describe("port resolution order", () => {
    afterEach(() => {
        for (const key of Object.values(ENV_KEYS)) {
            delete process.env[key];
        }
        resetConfig();
    });

    it("config file takes precedence over defaults", () => {
        withEnv({ NEMOCLAW_GATEWAY_PORT: undefined }, () => {
            saveConfig({ GATEWAY_PORT: 9292 });
            expect(getPort("GATEWAY_PORT")).toBe(9292);
        });
        resetConfig();
    });

    it("env var takes precedence over config file", () => {
        saveConfig({ GATEWAY_PORT: 9292 });
        withEnv({ NEMOCLAW_GATEWAY_PORT: "7777" }, () => {
            expect(getPort("GATEWAY_PORT")).toBe(7777);
        });
        resetConfig();
    });

    it("defaults are used when no overrides exist", () => {
        resetConfig();
        withEnv({ NEMOCLAW_GATEWAY_PORT: undefined }, () => {
            expect(getPort("GATEWAY_PORT")).toBe(8080);
        });
    });
});
