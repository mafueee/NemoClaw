// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES.
// SPDX-License-Identifier: Apache-2.0
//
// Monitoring API routes (Network & Approvals).

const express = require("express");
const router = express.Router();
const path = require("path");
const { spawn } = require("child_process");

// ── GET /api/monitoring/:sandbox/network — SSE Network Activity ────
router.get("/:sandbox/network", (req, res) => {
  const { sandbox } = req.params;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Tail sandbox logs and filter for network activity representing Proxy logs
  let proc;
  try {
    proc = spawn("openshell", ["logs", sandbox, "--tail"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (let line of lines) {
        if (!line.trim()) continue;
        
        // Simulating parsing of proxy log
        if (line.toLowerCase().includes("connect") || line.toLowerCase().includes("network") || line.toLowerCase().includes("proxy")) {
           const time = new Date().toLocaleTimeString();
           const decision = (line.toLowerCase().includes("denied") || line.toLowerCase().includes("block"))
                ? "Denied" 
                : ((line.toLowerCase().includes("route") || line.toLowerCase().includes("inference")) ? "Routed" : "Allowed");
                
           // Send network event mapping
           res.write(
             `data: ${JSON.stringify({ 
               destination: "unknown (parsed from logs)", 
               port: "—", 
               binary: "openclaw", 
               decision, 
               ts: time,
               raw: line.trim()
             })}\n\n`
           );
        }
      }
    });

    req.on("close", () => {
      if (proc) proc.kill();
    });
  } catch {
    res.end();
  }
});

// ── GET /api/monitoring/:sandbox/approvals — REST / SSE Approval Queue ────
router.get("/:sandbox/approvals", (req, res) => {
  // Returns empty for now, mapping the operator queue fallback
  res.json({ approvals: [] });
});

module.exports = router;
