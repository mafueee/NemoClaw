// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES.
// SPDX-License-Identifier: Apache-2.0
//
// Chat management API routes.

const express = require("express");
const router = express.Router();
const path = require("path");

const LIB = path.resolve(__dirname, "..", "..", "..", "bin", "lib");
const { run } = require(path.join(LIB, "runner"));

// ── POST /api/chat/:sandbox — send chat prompt ──────────────────
router.post("/:sandbox", async (req, res) => {
  try {
    const { sandbox } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Escape message for safely passing to the shell command
    const safeMessage = message.replace(/'/g, "'\\''");

    // Execute openclaw agent inside sandbox
    const result = run(
      `openshell sandbox exec ${sandbox} -- openclaw agent --agent main --local -m '${safeMessage}' --session-id web`,
      { ignoreError: true }
    );

    if (result.status !== 0) {
      console.error(`Chat error (sandbox ${sandbox}):`, result.stderr || result.output);
      return res.status(500).json({ 
        error: "Agent execution failed in sandbox",
        output: result.stderr || result.output || "No output"
      });
    }

    res.json({ success: true, response: result.stdout || result.output });
  } catch (err) {
    res.status(500).json({ error: Object.keys(err).length > 0 ? err.message : String(err) });
  }
});

module.exports = router;
