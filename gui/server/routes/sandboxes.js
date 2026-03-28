// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES.
// SPDX-License-Identifier: Apache-2.0
//
// Sandbox management API routes.

const express = require("express");
const router = express.Router();
const path = require("path");

// Resolve bin/lib modules from project root
const LIB = path.resolve(__dirname, "..", "..", "..", "bin", "lib");
const registry = require(path.join(LIB, "registry"));
const { PROVIDERS, getInferenceStatus } = require(path.join(LIB, "inference"));
const policies = require(path.join(LIB, "policies"));
const { runCapture, run } = require(path.join(LIB, "runner"));

// ── GET /api/sandboxes — list all registered sandboxes ─────────────
router.get("/", (req, res) => {
  try {
    const { sandboxes, defaultSandbox } = registry.listSandboxes();

    // Enrich with provider label
    const enriched = sandboxes.map((sb) => ({
      ...sb,
      providerLabel: sb.provider
        ? PROVIDERS[sb.provider]?.label || sb.provider
        : "—",
      isDefault: sb.name === defaultSandbox,
    }));

    // Try to get live status from OpenShell
    let liveStatuses = [];
    try {
      const result = runCapture("openshell sandbox list --json", {
        ignoreError: true,
      });
      if (result) liveStatuses = JSON.parse(result);
    } catch {
      /* OpenShell not available */
    }

    // Merge live status
    const merged = enriched.map((sb) => {
      const live = liveStatuses.find(
        (l) => (l.name || l.Name) === sb.name
      );
      return {
        ...sb,
        running: !!live,
        phase: live?.phase || live?.Phase || null,
        image: live?.image || live?.Image || null,
      };
    });

    // Find unregistered live sandboxes
    const registeredNames = sandboxes.map((s) => s.name);
    const unregistered = liveStatuses
      .filter((l) => !registeredNames.includes(l.name || l.Name))
      .map((l) => ({
        name: l.name || l.Name,
        running: true,
        phase: l.phase || l.Phase,
        image: l.image || l.Image,
        registered: false,
      }));

    res.json({
      sandboxes: merged,
      unregistered,
      defaultSandbox,
      total: merged.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sandboxes/:name — sandbox detail ──────────────────────
router.get("/:name", (req, res) => {
  try {
    const { name } = req.params;
    const sb = registry.getSandbox(name);

    // Live status from OpenShell
    let liveStatus = null;
    try {
      const result = runCapture("openshell sandbox list --json", {
        ignoreError: true,
      });
      if (result) {
        const all = JSON.parse(result);
        liveStatus = all.find((s) => (s.name || s.Name) === name);
      }
    } catch {
      /* ignored */
    }

    // Active policy
    const activePolicy = policies.getCurrentPolicy(name);

    // Inference status
    const inference = getInferenceStatus();

    res.json({
      name,
      registered: !!sb,
      running: !!liveStatus,
      provider: sb?.provider || null,
      providerLabel: sb?.provider
        ? PROVIDERS[sb.provider]?.label || sb.provider
        : "—",
      model: sb?.model || null,
      policies: sb?.policies || [],
      createdAt: sb?.createdAt || null,
      live: liveStatus || null,
      inference: inference || null,
      policyGroupCount: activePolicy
        ? Object.keys(activePolicy.network_policies || {}).length
        : null,
      activePolicy: activePolicy || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/sandboxes — create sandbox (programmatic onboard) ────
router.post("/", (req, res) => {
  try {
    const {
      name,
      provider: providerKey,
      model,
      apiKey,
      endpoint,
    } = req.body;

    if (!name || !providerKey) {
      return res
        .status(400)
        .json({ error: "name and provider are required" });
    }

    const provider = PROVIDERS[providerKey];
    if (!provider) {
      return res.status(400).json({ error: `Unknown provider: ${providerKey}` });
    }

    // Store credential if provided
    if (apiKey) {
      const { setCredential } = require(path.join(LIB, "inference"));
      setCredential(providerKey, apiKey);
    }

    // Register in local registry
    registry.registerSandbox({
      name: name.toLowerCase(),
      model: model || provider.defaultModel,
      provider: providerKey,
      policies: [],
      createdAt: new Date().toISOString(),
    });

    // Attempt OpenShell sandbox creation
    let openshellResult = { created: false, message: "" };
    try {
      const createResult = run(
        `openshell sandbox create --name ${name} --from openclaw`,
        { ignoreError: true }
      );
      if (createResult.status === 0) {
        openshellResult.created = true;

        // Apply baseline policy
        const BLUEPRINT_DIR = path.resolve(
          __dirname, "..", "..", "..", "nemoclaw-blueprint"
        );
        const BASELINE = path.join(
          BLUEPRINT_DIR, "policies", "openclaw-sandbox.yaml"
        );
        run(
          `openshell policy set ${name} --policy ${BASELINE} --wait`,
          { ignoreError: true }
        );

        // Configure inference route
        run(
          `openshell inference set --provider ${provider.providerName} --model ${model || provider.defaultModel}`,
          { ignoreError: true }
        );
        openshellResult.message = "Sandbox created with policy and inference configured";
      } else {
        openshellResult.message =
          "OpenShell sandbox creation failed. Registered locally only.";
      }
    } catch {
      openshellResult.message = "OpenShell CLI not available. Registered locally.";
    }

    // Emit real-time update
    const io = req.app.get("io");
    if (io) io.to("status").emit("sandbox:created", { name });

    res.json({
      success: true,
      name: name.toLowerCase(),
      openshell: openshellResult,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/sandboxes/:name — destroy sandbox ──────────────────
router.delete("/:name", (req, res) => {
  try {
    const { name } = req.params;

    // Destroy via OpenShell
    let destroyed = false;
    try {
      const result = run(`openshell sandbox destroy ${name}`, {
        ignoreError: true,
      });
      destroyed = result.status === 0;
    } catch {
      /* ignored */
    }

    // Remove from registry
    registry.removeSandbox(name);

    // Emit real-time update
    const io = req.app.get("io");
    if (io) io.to("status").emit("sandbox:destroyed", { name });

    res.json({
      success: true,
      name,
      openshellDestroyed: destroyed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sandboxes/:name/logs — SSE log stream ─────────────────
router.get("/:name/logs", (req, res) => {
  const { name } = req.params;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Try to spawn log stream
  const { spawn } = require("child_process");
  let proc;
  try {
    proc = spawn("openshell", ["logs", name, "--tail"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({ line, ts: Date.now() })}\n\n`);
        }
      }
    });

    proc.stderr.on("data", (data) => {
      res.write(
        `data: ${JSON.stringify({ line: `[stderr] ${data.toString().trim()}`, ts: Date.now() })}\n\n`
      );
    });

    proc.on("close", () => {
      res.write(`data: ${JSON.stringify({ line: "[stream ended]", ts: Date.now() })}\n\n`);
      res.end();
    });
  } catch {
    res.write(
      `data: ${JSON.stringify({ line: "OpenShell CLI not available — cannot stream logs", ts: Date.now() })}\n\n`
    );
  }

  req.on("close", () => {
    if (proc) proc.kill();
  });
});

module.exports = router;
