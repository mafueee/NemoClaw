// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES.
// SPDX-License-Identifier: Apache-2.0
//
// System health and deployment API routes.

const express = require("express");
const router = express.Router();
const path = require("path");

const LIB = path.resolve(__dirname, "..", "..", "..", "bin", "lib");
const { runCapture, run, runInteractive } = require(path.join(LIB, "runner"));

// ── GET /api/system/preflight — Docker, OpenShell, port checks ─────
router.get("/preflight", (req, res) => {
  const checks = {
    docker: { available: false, message: "" },
    openshell: { available: false, version: "", message: "" },
    port: { available: false, port: 18789, conflicting: [] },
    cgroupv2: { enabled: false, message: "" },
  };

  // Docker check
  try {
    const result = runCapture("docker info --format '{{.ServerVersion}}'", {
      ignoreError: true,
    });
    checks.docker.available = !!result;
    checks.docker.message = result ? `Docker ${result.trim()}` : "Docker not running";
  } catch {
    checks.docker.message = "Docker not installed";
  }

  // OpenShell check
  try {
    const result = runCapture("openshell --version", { ignoreError: true });
    checks.openshell.available = !!result;
    checks.openshell.version = result ? result.trim() : "";
    checks.openshell.message = result ? `OpenShell ${result.trim()}` : "Not installed";
  } catch {
    checks.openshell.message = "Not installed";
  }

  // Port check
  try {
    const result = runCapture("lsof -i :18789 -t", { ignoreError: true });
    const pids = result
      ? result.split("\n").map((p) => p.trim()).filter(Boolean)
      : [];
    checks.port.available = pids.length === 0;
    checks.port.conflicting = pids;
  } catch {
    checks.port.available = true;
  }

  // cgroup v2 check
  try {
    const result = runCapture("stat -fc %T /sys/fs/cgroup", { ignoreError: true });
    checks.cgroupv2.enabled = result?.trim() === "cgroup2fs";
    checks.cgroupv2.message = checks.cgroupv2.enabled ? "cgroup v2 active" : "cgroup v1";
  } catch {
    checks.cgroupv2.message = "Could not detect";
  }

  const allGood =
    checks.docker.available && checks.openshell.available && checks.port.available;

  res.json({ healthy: allGood, checks });
});

// ── GET /api/system/health — overall system health ─────────────────
router.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    version: "1.0.0",
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

// ── GET /api/system/version — version info ─────────────────────────
router.get("/version", (req, res) => {
  const blueprintPath = path.resolve(
    __dirname, "..", "..", "..", "nemoclaw-blueprint", "blueprint.yaml"
  );
  let blueprintVersion = "unknown";
  try {
    const yaml = require("yaml");
    const fs = require("fs");
    const content = fs.readFileSync(blueprintPath, "utf-8");
    const parsed = yaml.parse(content);
    blueprintVersion = parsed.version || "unknown";
  } catch {
    /* ignored */
  }

  res.json({
    gui: "1.0.0",
    blueprint: blueprintVersion,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  });
});

// ── POST /api/system/deploy — remote GPU deployment ────────────────
router.post("/deploy", (req, res) => {
  try {
    const { instance } = req.body;
    if (!instance) {
      return res.status(400).json({ error: "instance name is required" });
    }

    const scriptPath = path.resolve(
      __dirname, "..", "..", "..", "scripts", "remote-deploy.sh"
    );
    const fs = require("fs");
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({
        error: "Deploy script not found",
        hint: "Direct SSH deployment is available via: scripts/remote-deploy.sh",
      });
    }

    // Start deployment asynchronously
    const { spawn } = require("child_process");
    const proc = spawn("bash", [scriptPath, instance], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
      const io = req.app.get("io");
      if (io) io.to("status").emit("deploy:output", { instance, data: data.toString() });
    });

    proc.stderr.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      const io = req.app.get("io");
      if (io) io.to("status").emit("deploy:complete", { instance, code });
    });

    res.json({ success: true, instance, message: "Deployment started" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──  POST /api/system/telegram — save Telegram integration ──────────
router.post("/telegram", (req, res) => {
  try {
    const { token, sandbox, allowedChatIds } = req.body;
    if (!token || !sandbox) {
      return res.status(400).json({ error: "token and sandbox are required" });
    }

    const fs = require("fs");
    const os = require("os");
    const configDir = path.join(os.homedir(), ".nemoclaw");
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

    const configFile = path.join(configDir, "credentials.json");
    let creds = {};
    if (fs.existsSync(configFile)) {
      try { creds = JSON.parse(fs.readFileSync(configFile, "utf8")); } catch(e) {}
    }

    if (!creds.telegram) creds.telegram = {};
    creds.telegram[sandbox] = {
      token,
      allowedChatIds: allowedChatIds || [],
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(configFile, JSON.stringify(creds, null, 2));

    res.json({ success: true, message: "Telegram bridge configured successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system/services/start — start auxiliary services ──────
router.post("/services/start", (req, res) => {
  try {
    const fs = require("fs");
    const os = require("os");
    const { spawn } = require("child_process");

    // Load Telegram credentials
    const configFile = path.join(os.homedir(), ".nemoclaw", "credentials.json");
    let tgToken = "";
    let allowedChatIds = "";
    if (fs.existsSync(configFile)) {
      try {
        const creds = JSON.parse(fs.readFileSync(configFile, "utf8"));
        if (creds.telegram) {
          const sandboxName = Object.keys(creds.telegram)[0];
          if (sandboxName) {
            const tgConfig = creds.telegram[sandboxName];
            tgToken = typeof tgConfig === "string" ? tgConfig : tgConfig.token || "";
            allowedChatIds = Array.isArray(tgConfig.allowedChatIds)
              ? tgConfig.allowedChatIds.join(",")
              : "";
          }
        }
      } catch { /* ignored */ }
    }

    const env = { ...process.env };
    if (tgToken) env.TELEGRAM_BOT_TOKEN = tgToken;
    if (allowedChatIds) env.ALLOWED_CHAT_IDS = allowedChatIds;

    // Start auxiliary services via nemoclaw start
    const ROOT = path.resolve(__dirname, "..", "..", "..");
    const nemoclawBin = path.join(ROOT, "bin", "nemoclaw.js");

    const proc = spawn("node", [nemoclawBin, "start"], {
      env,
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    let output = "";
    proc.stdout.on("data", (data) => { output += data.toString(); });
    proc.stderr.on("data", (data) => { output += data.toString(); });

    proc.on("close", (code) => {
      const io = req.app.get("io");
      if (io) {
        io.to("status").emit("services:started", { code, output: output.slice(-200) });
      }
    });

    // Unref so the process doesn't keep the GUI event loop alive
    proc.unref();

    const io = req.app.get("io");
    if (io) io.to("status").emit("services:starting", {});

    res.json({ success: true, message: "Auxiliary services starting..." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system/services/stop — stop auxiliary services ────────
router.post("/services/stop", (req, res) => {
  try {
    const ROOT = path.resolve(__dirname, "..", "..", "..");
    const nemoclawBin = path.join(ROOT, "bin", "nemoclaw.js");

    const result = runCapture(`node ${nemoclawBin} stop`, {
      ignoreError: true,
      cwd: ROOT,
    });

    const io = req.app.get("io");
    if (io) io.to("status").emit("services:stopped", {});

    res.json({ success: true, message: "Auxiliary services stopped", output: result || "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system/services/status — auxiliary service health ──────
router.get("/services/status", (req, res) => {
  try {
    const services = {
      telegram: { running: false, details: "" },
      cloudflared: { running: false, details: "" },
    };

    // Check for Telegram bridge process
    try {
      const tgResult = runCapture("pgrep -fa 'telegram.*bridge\\|TELEGRAM_BOT'", { ignoreError: true });
      services.telegram.running = !!tgResult;
      services.telegram.details = tgResult ? "Bridge process active" : "Not running";
    } catch {
      services.telegram.details = "Not running";
    }

    // Check for Cloudflared tunnel process
    try {
      const cfResult = runCapture("pgrep -f cloudflared", { ignoreError: true });
      services.cloudflared.running = !!cfResult;
      services.cloudflared.details = cfResult ? "Tunnel active" : "Not running";
    } catch {
      services.cloudflared.details = "Not running";
    }

    // Check for Telegram token in credentials
    const fs = require("fs");
    const os = require("os");
    const configFile = path.join(os.homedir(), ".nemoclaw", "credentials.json");
    let telegramConfigured = false;
    if (fs.existsSync(configFile)) {
      try {
        const creds = JSON.parse(fs.readFileSync(configFile, "utf8"));
        telegramConfigured = !!(creds.telegram && Object.keys(creds.telegram).length > 0);
      } catch { /* ignored */ }
    }

    services.telegram.configured = telegramConfigured;

    res.json({ services });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
