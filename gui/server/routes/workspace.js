// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES.
// SPDX-License-Identifier: Apache-2.0
//
// Workspace file management API routes.

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const WORKSPACE_FILES = [
  { name: "SOUL.md", description: "Core personality, tone, and behavioral rules" },
  { name: "USER.md", description: "Preferences, context, and facts about you" },
  { name: "IDENTITY.md", description: "Agent name, creature type, emoji, self-presentation" },
  { name: "AGENTS.md", description: "Multi-agent coordination and safety guidelines" },
  { name: "MEMORY.md", description: "Curated long-term memory" },
];

const BACKUP_DIR = path.join(
  process.env.HOME || "/tmp",
  ".nemoclaw",
  "backups"
);

// Helper: read a workspace file from sandbox via openshell
function readSandboxFile(sandbox, filename) {
  try {
    const result = execSync(
      `openshell sandbox exec ${sandbox} -- cat /sandbox/.openclaw/workspace/${filename}`,
      { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }
    );
    return { content: result, exists: true };
  } catch {
    return { content: null, exists: false };
  }
}

// Helper: write a workspace file to sandbox via openshell
function writeSandboxFile(sandbox, filename, content) {
  try {
    execSync(
      `echo '${content.replace(/'/g, "'\\''")}' | openshell sandbox exec ${sandbox} -- tee /sandbox/.openclaw/workspace/${filename}`,
      { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }
    );
    return true;
  } catch {
    return false;
  }
}

// ── GET /api/workspace/:sandbox/files — list workspace files ───────
router.get("/:sandbox/files", (req, res) => {
  try {
    const { sandbox } = req.params;
    const files = WORKSPACE_FILES.map((f) => {
      const { exists } = readSandboxFile(sandbox, f.name);
      return { ...f, exists };
    });

    // Check for memory directory files
    let memoryFiles = [];
    try {
      const result = execSync(
        `openshell sandbox exec ${sandbox} -- ls /sandbox/.openclaw/workspace/memory/`,
        { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }
      );
      memoryFiles = result
        .split("\n")
        .filter((f) => f.trim())
        .map((f) => ({
          name: `memory/${f.trim()}`,
          description: "Daily note",
          exists: true,
        }));
    } catch {
      /* memory dir may not exist */
    }

    res.json({ files: [...files, ...memoryFiles], sandbox });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/workspace/:sandbox/files/:filename — read file ────────
router.get("/:sandbox/files/:filename(*)", (req, res) => {
  try {
    const { sandbox, filename } = req.params;
    const { content, exists } = readSandboxFile(sandbox, filename);
    if (!exists) {
      return res.status(404).json({
        error: `File '${filename}' not found in sandbox '${sandbox}'`,
        hint: "Is the sandbox running?",
      });
    }
    res.json({ filename, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/workspace/:sandbox/files/:filename — edit file ────────
router.put("/:sandbox/files/:filename(*)", (req, res) => {
  try {
    const { sandbox, filename } = req.params;
    const { content } = req.body;
    if (content === undefined) {
      return res.status(400).json({ error: "content is required" });
    }
    const success = writeSandboxFile(sandbox, filename, content);
    res.json({ success, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/workspace/:sandbox/backup — create backup ────────────
router.post("/:sandbox/backup", (req, res) => {
  try {
    const { sandbox } = req.params;
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const backupPath = path.join(BACKUP_DIR, sandbox, timestamp);
    fs.mkdirSync(backupPath, { recursive: true });

    const backed = [];
    for (const f of WORKSPACE_FILES) {
      const { content, exists } = readSandboxFile(sandbox, f.name);
      if (exists && content) {
        fs.writeFileSync(path.join(backupPath, f.name), content);
        backed.push(f.name);
      }
    }

    res.json({
      success: true,
      sandbox,
      timestamp,
      backupPath,
      files: backed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/workspace/:sandbox/backups — list backups ─────────────
router.get("/:sandbox/backups", (req, res) => {
  try {
    const { sandbox } = req.params;
    const sandboxDir = path.join(BACKUP_DIR, sandbox);
    if (!fs.existsSync(sandboxDir)) {
      return res.json({ backups: [] });
    }
    const dirs = fs
      .readdirSync(sandboxDir)
      .filter((d) => fs.statSync(path.join(sandboxDir, d)).isDirectory())
      .sort()
      .reverse();
    const backups = dirs.map((d) => {
      const files = fs.readdirSync(path.join(sandboxDir, d));
      return { timestamp: d, files, path: path.join(sandboxDir, d) };
    });
    res.json({ backups, sandbox });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/workspace/:sandbox/restore — restore from backup ─────
router.post("/:sandbox/restore", (req, res) => {
  try {
    const { sandbox } = req.params;
    const { timestamp } = req.body;
    if (!timestamp) {
      return res.status(400).json({ error: "timestamp is required" });
    }
    const backupPath = path.join(BACKUP_DIR, sandbox, timestamp);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: `Backup '${timestamp}' not found` });
    }

    const restored = [];
    const files = fs.readdirSync(backupPath);
    for (const file of files) {
      const content = fs.readFileSync(path.join(backupPath, file), "utf-8");
      const success = writeSandboxFile(sandbox, file, content);
      if (success) restored.push(file);
    }

    res.json({ success: true, sandbox, timestamp, restored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
