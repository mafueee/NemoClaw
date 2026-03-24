// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

const CLI = path.join(import.meta.dirname, "..", "bin", "nemoclaw.js");

function run(args) {
  try {
    const out = execSync(`node "${CLI}" ${args}`, {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, HOME: "/tmp/nemoclaw-cli-test-" + Date.now() },
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: (err.stdout || "") + (err.stderr || "") };
  }
}

describe("CLI dispatch", () => {
  it("help exits 0 and shows sections", () => {
    const r = run("help");
    expect(r.code).toBe(0);
    expect(r.out.includes("Getting Started")).toBeTruthy();
    expect(r.out.includes("Sandbox Management")).toBeTruthy();
    expect(r.out.includes("Policy Presets")).toBeTruthy();
  });

  it("--help exits 0", () => {
    expect(run("--help").code).toBe(0);
  });

  it("-h exits 0", () => {
    expect(run("-h").code).toBe(0);
  });

  it("no args exits 0 (shows help)", () => {
    const r = run("");
    expect(r.code).toBe(0);
    expect(r.out.includes("nemoclaw")).toBeTruthy();
  });

  it("unknown command exits 1", () => {
    const r = run("boguscmd");
    expect(r.code).toBe(1);
    expect(r.out.includes("Unknown command")).toBeTruthy();
  });

  it("list exits 0", () => {
    const r = run("list");
    expect(r.code).toBe(0);
    // With empty HOME, should say no sandboxes
    expect(r.out.includes("No sandboxes")).toBeTruthy();
  });

  it("unknown onboard option exits 1", () => {
    const r = run("onboard --non-interactiv");
    expect(r.code).toBe(1);
    expect(r.out.includes("Unknown onboard option")).toBeTruthy();
  });

  it("debug --help exits 0 and shows usage", () => {
    const r = run("debug --help");
    expect(r.code).toBe(0);
    expect(r.out.includes("Collect NemoClaw diagnostic information")).toBeTruthy();
    expect(r.out.includes("--quick")).toBeTruthy();
    expect(r.out.includes("--output")).toBeTruthy();
  });

  it("debug --quick exits 0 and produces diagnostic output", () => {
    const r = run("debug --quick");
    expect(r.code).toBe(0);
    expect(r.out.includes("Collecting diagnostics")).toBeTruthy();
    expect(r.out.includes("System")).toBeTruthy();
    expect(r.out.includes("Done")).toBeTruthy();
  });

  it("debug exits 1 on unknown option", () => {
    const r = run("debug --quik");
    expect(r.code).toBe(1);
    expect(r.out.includes("Unknown option")).toBeTruthy();
  });

  it("help mentions debug command", () => {
    const r = run("help");
    expect(r.code).toBe(0);
    expect(r.out.includes("Troubleshooting")).toBeTruthy();
    expect(r.out.includes("nemoclaw debug")).toBeTruthy();
  });

  // ── --json output tests (#753) ──────────────────────────────────
  it("list --json outputs valid JSON", () => {
    const r = run("list --json");
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out);
    expect(parsed).toHaveProperty("sandboxes");
    expect(parsed).toHaveProperty("defaultSandbox");
    expect(Array.isArray(parsed.sandboxes)).toBe(true);
  });

  it("status --json outputs valid JSON", () => {
    const r = run("status --json");
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out);
    expect(parsed).toHaveProperty("sandboxes");
    expect(parsed).toHaveProperty("defaultSandbox");
  });

  // ── per-command --help tests (#757) ─────────────────────────────
  it("list --help exits 0 and shows usage", () => {
    const r = run("list --help");
    expect(r.code).toBe(0);
    expect(r.out.includes("Usage")).toBeTruthy();
    expect(r.out.includes("--json")).toBeTruthy();
  });

  it("onboard --help exits 0 and shows usage", () => {
    const r = run("onboard --help");
    expect(r.code).toBe(0);
    expect(r.out.includes("Usage")).toBeTruthy();
    expect(r.out.includes("--non-interactive")).toBeTruthy();
  });

  it("gui --help exits 0 and shows usage", () => {
    const r = run("gui --help");
    expect(r.code).toBe(0);
    expect(r.out.includes("Usage")).toBeTruthy();
    expect(r.out.includes("--port")).toBeTruthy();
    expect(r.out.includes("--no-open")).toBeTruthy();
  });

  it("stop --help exits 0 and shows usage", () => {
    const r = run("stop --help");
    expect(r.code).toBe(0);
    expect(r.out.includes("Usage")).toBeTruthy();
  });

  it("uninstall --help exits 0 and shows flags", () => {
    const r = run("uninstall --help");
    expect(r.code).toBe(0);
    expect(r.out.includes("Usage")).toBeTruthy();
    expect(r.out.includes("--yes")).toBeTruthy();
    expect(r.out.includes("--keep-openshell")).toBeTruthy();
    expect(r.out.includes("--delete-models")).toBeTruthy();
  });

  it("status --help exits 0 and shows usage", () => {
    const r = run("status --help");
    expect(r.code).toBe(0);
    expect(r.out.includes("Usage")).toBeTruthy();
    expect(r.out.includes("--json")).toBeTruthy();
  });
});
