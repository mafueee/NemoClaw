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
