// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES.
// SPDX-License-Identifier: Apache-2.0
//
// NemoClaw GUI — Express + Socket.IO server.
// Wraps all bin/lib modules as REST API endpoints and provides
// real-time WebSocket events for log streaming and operator approvals.

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server: SocketServer } = require("socket.io");

const PORT = parseInt(process.env.GUI_PORT || "3000", 10);

// ── Resolve project root (OpenShell/) ──────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

// ── Express app ────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, "..", "public")));

// ── API Routes ─────────────────────────────────────────────────────
app.use("/api/sandboxes", require("./routes/sandboxes"));
app.use("/api/policies", require("./routes/policies"));
app.use("/api/inference", require("./routes/inference"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/monitoring", require("./routes/monitoring"));
app.use("/api/workspace", require("./routes/workspace"));
app.use("/api/system", require("./routes/system"));

// SPA fallback — serve index.html for all non-API routes
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api/")) {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  }
});

// ── HTTP + Socket.IO server ────────────────────────────────────────
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Attach io to app so routes can emit events
app.set("io", io);
app.set("projectRoot", PROJECT_ROOT);

io.on("connection", (socket) => {
  console.log(`  [ws] Client connected: ${socket.id}`);

  socket.on("subscribe:logs", (sandboxName) => {
    socket.join(`logs:${sandboxName}`);
    console.log(`  [ws] ${socket.id} subscribed to logs:${sandboxName}`);
  });

  socket.on("subscribe:status", () => {
    socket.join("status");
  });

  socket.on("disconnect", () => {
    console.log(`  [ws] Client disconnected: ${socket.id}`);
  });
});

// ── Start ──────────────────────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  ╔══════════════════════════════════════════╗");
  console.log("  ║        NemoClaw Dashboard v1.0.0         ║");
  console.log("  ╚══════════════════════════════════════════╝");
  console.log("");
  console.log(`  → GUI:  http://0.0.0.0:${PORT}`);
  console.log(`  → API:  http://0.0.0.0:${PORT}/api`);
  console.log(`  → Root: ${PROJECT_ROOT}`);
  console.log("");
});

module.exports = { app, server, io };
