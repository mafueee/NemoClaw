// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES.
// SPDX-License-Identifier: Apache-2.0
//
// Inference routing API routes.

const express = require("express");
const router = express.Router();
const path = require("path");

const LIB = path.resolve(__dirname, "..", "..", "..", "bin", "lib");
const { createLogger } = require("../lib/logger");

const log = createLogger("routes/inference");
const {
  PROVIDERS,
  getCredential,
  setCredential,
  setInference,
  getInferenceStatus,
  detectOllama,
  validateProvider,
} = require(path.join(LIB, "inference"));

// ── GET /api/inference/providers — provider catalogue ──────────────
router.get("/providers", (req, res) => {
  const catalogue = Object.entries(PROVIDERS).map(([key, p]) => ({
    key,
    label: p.label,
    type: p.type,
    providerName: p.providerName,
    endpoint: p.endpoint,
    defaultModel: p.defaultModel,
    credentialEnv: p.credentialEnv,
    compatible: p.compatible,
    local: !!p.local,
    custom: !!p.custom,
    hasCredential: !!getCredential(key),
  }));
  res.json({ providers: catalogue });
});

// ── GET /api/inference/status — current inference config ───────────
router.get("/status", (req, res) => {
  try {
    const status = getInferenceStatus();
    const ollama = detectOllama();
    res.json({
      inference: status,
      ollama: { running: ollama.running, modelCount: ollama.models.length, models: ollama.models },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/inference/switch — switch provider/model ─────────────
router.post("/switch", (req, res) => {
  try {
    const { providerKey, model } = req.body;
    if (!providerKey) {
      return res.status(400).json({ error: "providerKey is required" });
    }
    const provider = PROVIDERS[providerKey];
    if (!provider) {
      return res.status(400).json({ error: `Unknown provider: ${providerKey}` });
    }
    const finalModel = model || provider.defaultModel;
    const result = setInference(provider.providerName, finalModel);

    // Emit real-time update
    const io = req.app.get("io");
    if (io) io.to("status").emit("inference:switched", { providerKey, model: finalModel });

    res.json({ success: result.success, providerKey, model: finalModel, output: result.output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/inference/validate — validate credentials ────────────
router.post("/validate", (req, res) => {
  try {
    const { providerKey, apiKey, endpoint, model } = req.body;
    if (!providerKey) {
      return res.status(400).json({ error: "providerKey is required" });
    }
    const provider = PROVIDERS[providerKey];
    if (!provider) {
      return res.status(400).json({ error: `Unknown provider: ${providerKey}` });
    }
    const finalEndpoint = endpoint || provider.endpoint;
    const finalKey = apiKey || getCredential(providerKey) || "";
    const result = validateProvider(providerKey, finalEndpoint, finalKey, model || "");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/inference/credentials — masked credential status ──────
router.get("/credentials", (req, res) => {
  const status = Object.entries(PROVIDERS).map(([key, p]) => {
    const cred = getCredential(key);
    return {
      key,
      label: p.label,
      credentialEnv: p.credentialEnv,
      hasKey: !!cred,
      mask: cred ? cred.slice(0, 4) + "..." + cred.slice(-4) : null,
    };
  });
  res.json({ credentials: status });
});

// ── POST /api/inference/credentials — store/update credential ──────
router.post("/credentials", (req, res) => {
  try {
    const { providerKey, apiKey, endpoint } = req.body;
    if (!providerKey || !apiKey) {
      return res.status(400).json({ error: "providerKey and apiKey are required" });
    }
    setCredential(providerKey, apiKey, endpoint);
    res.json({ success: true, providerKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;