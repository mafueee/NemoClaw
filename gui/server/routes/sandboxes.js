// ══════════════════════════════════════════════════════════════════
// Sandbox Management Routes
// ══════════════════════════════════════════════════════════════════

const express = require("express");
const { spawn } = require("child_process");
const router = express.Router();
const registry = require("../../../bin/lib/registry");
const { PROVIDERS, getCredential, setInference, getInferenceStatus } = require("../../../bin/lib/inference");
const policies = require("../../../bin/lib/policies");
const { run, runCapture } = require("../../../bin/lib/runner");
const { validateParams, validateBodyFields } = require("../middleware/validate");
const { createLogger } = require("../lib/logger");

const log = createLogger("routes/sandboxes");

// Track active SSE streams to prevent leaks
const activeStreams = new Map();

// ── List all sandboxes ─────────────────────────────────────────────
router.get("/", (req, res) => {
  try {
    const { sandboxes, defaultSandbox } = registry.listSandboxes();

    // Enrich with live data
    let liveSandboxes = [];
    try {
      const result = runCapture("openshell sandbox list --json", {
        ignoreError: true,
      });
      if (result) liveSandboxes = JSON.parse(result);
    } catch (err) {
      log.warn("Failed to query live sandboxes", { error: err.message });
    }

    const enriched = sandboxes.map((sb) => {
      const live = liveSandboxes.find(
        (l) => (l.name || l.Name) === sb.name
      );
      const providerInfo = PROVIDERS[sb.provider] || {};
      return {
        ...sb,
        running: !!live,
        phase: live?.phase || live?.Phase || null,
        image: live?.image || live?.Image || null,
        providerLabel: providerInfo.label || sb.provider,
        default: sb.name === defaultSandbox,
      };
    });

    // Find unregistered live sandboxes
    const registeredNames = sandboxes.map((s) => s.name);
    const unregistered = liveSandboxes
      .filter((l) => !registeredNames.includes(l.name || l.Name))
      .map((l) => ({
        name: l.name || l.Name,
        running: true,
        phase: l.phase || l.Phase,
        image: l.image || l.Image,
        registered: false,
      }));

    res.json({
      sandboxes: enriched,
      unregistered,
      total: enriched.length + unregistered.length,
    });
  } catch (err) {
    log.error("Failed to list sandboxes", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Get sandbox detail ─────────────────────────────────────────────
router.get("/:name", validateParams("name"), (req, res) => {
  try {
    const sb = registry.getSandbox(req.params.name);
    if (!sb) return res.status(404).json({ error: "Sandbox not found" });

    // Enrich
    let running = false;
    try {
      const result = runCapture("openshell sandbox list --json", {
        ignoreError: true,
      });
      if (result) {
        const live = JSON.parse(result);
        running = live.some(
          (l) => (l.name || l.Name) === req.params.name
        );
      }
    } catch (err) {
      log.warn("Failed to check sandbox status", { error: err.message });
    }

    const activePolicy = policies.getCurrentPolicy(req.params.name);
    const inference = getInferenceStatus();
    const providerInfo = PROVIDERS[sb.provider] || {};

    res.json({
      ...sb,
      running,
      providerLabel: providerInfo.label || sb.provider,
      activePolicy,
      inference,
      policyGroupCount: activePolicy
        ? Object.keys(activePolicy.network_policies || {}).length
        : 0,
    });
  } catch (err) {
    log.error("Failed to get sandbox detail", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Create sandbox ─────────────────────────────────────────────────
router.post("/", validateBodyFields("name"), (req, res) => {
  const { name, provider, model, apiKey, endpoint } = req.body;
  const io = req.app.get("io");

  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    // Register
    registry.registerSandbox({
      name,
      model,
      provider,
      policies: [],
      createdAt: new Date().toISOString(),
    });

    // Create via openshell
    let openshellResult = null;
    try {
      const result = run(
        `openshell sandbox create --name ${name} --from openclaw`,
        { ignoreError: true }
      );
      openshellResult = {
        success: result.status === 0,
        message:
          result.status === 0
            ? "Sandbox created via OpenShell"
            : "Registered locally (OpenShell unavailable)",
      };
    } catch (err) {
      log.warn("OpenShell sandbox create failed", { error: err.message });
      openshellResult = {
        success: false,
        message: "Registered locally",
      };
    }

    // Save credential if provided
    if (apiKey && provider) {
      try {
        const { setCredential } = require("../../../bin/lib/inference");
        setCredential(provider, apiKey, endpoint);
      } catch (err) {
        log.warn("Failed to save credential", { error: err.message });
      }
    }

    // Configure the local inference gateway
    if (provider) {
      try {
        const providerObj = PROVIDERS[provider];
        if (providerObj) {
          const finalModel = model || providerObj.defaultModel;
          setInference(providerObj.providerName, finalModel);
          log.info(`Inference configured to ${providerObj.providerName} / ${finalModel}`);
        } else {
          log.warn(`Unknown provider key: ${provider}, skipping inference set`);
        }
      } catch (err) {
        log.warn("Failed to set inference configuration", { error: err.message });
      }
    }

    log.info(`Sandbox '${name}' created`, { provider, model });
    if (io) io.emit("sandbox:created", { name, provider, model });

    res.json({
      name,
      provider,
      model,
      openshell: openshellResult,
    });
  } catch (err) {
    log.error("Failed to create sandbox", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Start sandbox ──────────────────────────────────────────────────
router.post("/:name/start", validateParams("name"), (req, res) => {
  const io = req.app.get("io");
  const name = req.params.name;

  try {
    const result = run(`openshell sandbox start ${name}`, {
      ignoreError: true,
    });

    if (result.status === 0) {
      log.info(`Sandbox '${name}' started`);
      if (io) io.emit("sandbox:started", { name });
      res.json({ success: true, message: `Sandbox '${name}' started` });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to start sandbox. Is OpenShell available?",
      });
    }
  } catch (err) {
    log.error("Failed to start sandbox", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Stop sandbox ───────────────────────────────────────────────────
router.post("/:name/stop", validateParams("name"), (req, res) => {
  const io = req.app.get("io");
  const name = req.params.name;

  try {
    const result = run(`openshell sandbox stop ${name}`, {
      ignoreError: true,
    });

    if (result.status === 0) {
      log.info(`Sandbox '${name}' stopped`);
      if (io) io.emit("sandbox:stopped", { name });
      res.json({ success: true, message: `Sandbox '${name}' stopped` });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to stop sandbox",
      });
    }
  } catch (err) {
    log.error("Failed to stop sandbox", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Destroy sandbox ────────────────────────────────────────────────
router.delete("/:name", validateParams("name"), (req, res) => {
  const io = req.app.get("io");
  const name = req.params.name;

  try {
    // Destroy via openshell
    run(`openshell sandbox destroy ${name}`, { ignoreError: true });

    // Remove from registry
    registry.removeSandbox(name);

    log.info(`Sandbox '${name}' destroyed`);
    if (io) io.emit("sandbox:destroyed", { name });

    res.json({ success: true });
  } catch (err) {
    log.error("Failed to destroy sandbox", { error: err.message });
    // Still remove from registry
    try {
      registry.removeSandbox(name);
    } catch (regErr) {
      log.warn("Also failed to remove from registry", { error: regErr.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── Stream logs (SSE) ──────────────────────────────────────────────
router.get("/:name/logs", validateParams("name"), (req, res) => {
  const name = req.params.name;

  // Prevent duplicate streams for the same sandbox
  const streamKey = `logs:${name}:${req.ip}`;
  if (activeStreams.has(streamKey)) {
    const prev = activeStreams.get(streamKey);
    try { prev.kill(); } catch { /* already dead */ }
    activeStreams.delete(streamKey);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const child = spawn("openshell", ["logs", name, "--tail"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  activeStreams.set(streamKey, child);

  const sendLine = (line) => {
    const trimmed = line.toString().trim();
    if (trimmed) {
      res.write(
        `data: ${JSON.stringify({ line: trimmed, ts: Date.now() })}\n\n`
      );
    }
  };

  child.stdout.on("data", sendLine);
  child.stderr.on("data", sendLine);

  child.on("error", (err) => {
    log.warn(`Log stream error for '${name}'`, { error: err.message });
    res.write(`data: ${JSON.stringify({ line: `[Error: ${err.message}]`, ts: Date.now() })}\n\n`);
    activeStreams.delete(streamKey);
  });

  child.on("close", () => {
    activeStreams.delete(streamKey);
    try { res.end(); } catch { /* client gone */ }
  });

  // Clean up when client disconnects (prevents memory leak)
  req.on("close", () => {
    log.debug(`Log stream client disconnected for '${name}'`);
    activeStreams.delete(streamKey);
    try { child.kill(); } catch { /* already dead */ }
  });

  // Safety timeout — max 30 minutes per stream
  const timeout = setTimeout(() => {
    log.info(`Log stream timeout for '${name}'`);
    activeStreams.delete(streamKey);
    try { child.kill(); } catch { /* ok */ }
    try { res.end(); } catch { /* ok */ }
  }, 30 * 60 * 1000);

  req.on("close", () => clearTimeout(timeout));
});

module.exports = router;