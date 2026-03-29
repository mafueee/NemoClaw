// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES.
// SPDX-License-Identifier: Apache-2.0
//
// Policy management API routes.

const express = require("express");
const router = express.Router();
const path = require("path");

const LIB = path.resolve(__dirname, "..", "..", "..", "bin", "lib");
const policies = require(path.join(LIB, "policies"));
const registry = require(path.join(LIB, "registry"));

// ── GET /api/policies/presets — list available presets ──────────────
router.get("/presets", (req, res) => {
  try {
    const presets = policies.listPresets();
    res.json({ presets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/policies/presets/:name — preset detail ────────────────
router.get("/presets/:name", (req, res) => {
  try {
    const preset = policies.loadPreset(req.params.name);
    if (!preset) {
      return res.status(404).json({ error: `Preset '${req.params.name}' not found` });
    }
    res.json(preset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/policies/baseline — full baseline policy ──────────────
router.get("/baseline", (req, res) => {
  try {
    const baseline = policies.loadBaseline();
    const yaml = policies.stringifyYaml(baseline);
    const groups = Object.keys(baseline.network_policies || {});
    const endpointCount = Object.values(baseline.network_policies || {}).reduce(
      (sum, p) => sum + (p.endpoints?.length || 0),
      0
    );
    res.json({
      policy: baseline,
      yaml,
      groups,
      groupCount: groups.length,
      endpointCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/policies/apply — apply presets to sandbox ────────────
router.post("/apply", (req, res) => {
  try {
    const { sandbox, presets } = req.body;
    if (!sandbox || !presets || !Array.isArray(presets) || presets.length === 0) {
      return res
        .status(400)
        .json({ error: "sandbox and presets[] are required" });
    }

    // Validate preset names
    const available = policies.listPresets().map((p) => p.name);
    const invalid = presets.filter((p) => !available.includes(p));
    if (invalid.length > 0) {
      return res
        .status(400)
        .json({ error: `Unknown presets: ${invalid.join(", ")}`, available });
    }

    const success = policies.applyPresets(sandbox, presets);

    if (success) {
      // Update registry
      const existing = registry.getSandbox(sandbox);
      if (existing) {
        const currentPolicies = new Set(existing.policies || []);
        for (const name of presets) currentPolicies.add(name);
        registry.updateSandbox(sandbox, { policies: [...currentPolicies] });
      } else {
        registry.registerSandbox({ name: sandbox, policies: presets });
      }

      // Emit real-time update
      const io = req.app.get("io");
      if (io) io.to("status").emit("policy:applied", { sandbox, presets });
    }

    res.json({ success, sandbox, presets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/policies/:sandbox/current — active policy ─────────────
router.get("/:sandbox/current", (req, res) => {
  try {
    const current = policies.getCurrentPolicy(req.params.sandbox);
    if (!current) {
      return res.json({
        active: false,
        message: "Could not retrieve active policy. Is the sandbox running?",
      });
    }
    const groups = Object.keys(current.network_policies || {});
    const endpointCount = Object.values(current.network_policies || {}).reduce(
      (sum, p) => sum + (p.endpoints?.length || 0),
      0
    );
    res.json({
      active: true,
      policy: current,
      yaml: policies.stringifyYaml(current),
      groups,
      groupCount: groups.length,
      endpointCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/policies/merge — merge preview (dry-run) ─────────────
router.post("/merge", (req, res) => {
  try {
    const { presets } = req.body;
    if (!presets || presets.length === 0) {
      return res.status(400).json({ error: "presets[] required" });
    }
    const baseline = policies.loadBaseline();
    const merged = policies.mergePresets(baseline, presets);
    const policyCount = Object.keys(merged.network_policies || {}).length;
    const endpointCount = Object.values(merged.network_policies || {}).reduce(
      (sum, p) => sum + (p.endpoints?.length || 0),
      0
    );
    res.json({
      merged,
      yaml: policies.stringifyYaml(merged),
      policyCount,
      endpointCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/policies/validate — validate all policy files ────────
router.post("/validate", (req, res) => {
  try {
    const results = [];
    let errors = 0;

    // Validate baseline
    try {
      const baseline = policies.loadBaseline();
      const groups = Object.keys(baseline.network_policies || {});
      results.push({ type: "baseline", valid: true, groups: groups.length });
    } catch (err) {
      results.push({ type: "baseline", valid: false, error: err.message });
      errors++;
    }

    // Validate presets
    const presets = policies.listPresets();
    for (const p of presets) {
      try {
        const preset = policies.loadPreset(p.name);
        if (!preset) throw new Error("Could not load");
        const netPols = preset.network_policies || {};
        const groupCount = Object.keys(netPols).length;
        const endpointCount = Object.values(netPols).reduce(
          (sum, pol) => sum + (pol.endpoints?.length || 0),
          0
        );
        results.push({
          type: "preset",
          name: p.name,
          valid: groupCount > 0,
          groups: groupCount,
          endpoints: endpointCount,
        });
        if (groupCount === 0) errors++;
      } catch (err) {
        results.push({
          type: "preset",
          name: p.name,
          valid: false,
          error: err.message,
        });
        errors++;
      }
    }

    // Test merge
    try {
      const baseline = policies.loadBaseline();
      const allNames = presets.map((p) => p.name);
      const merged = policies.mergePresets(baseline, allNames);
      results.push({
        type: "merge",
        valid: true,
        groups: Object.keys(merged.network_policies || {}).length,
      });
    } catch (err) {
      results.push({ type: "merge", valid: false, error: err.message });
      errors++;
    }

    res.json({ valid: errors === 0, errors, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/policies/custom — apply raw YAML policy ──────────────
router.post("/custom", (req, res) => {
  try {
    const { sandbox, yaml: yamlContent } = req.body;
    if (!sandbox || !yamlContent) {
      return res
        .status(400)
        .json({ error: "sandbox and yaml content are required" });
    }

    // Validate YAML can be parsed
    let parsed;
    try {
      parsed = policies.parseYaml(yamlContent);
    } catch (parseErr) {
      return res
        .status(400)
        .json({ error: `Invalid YAML: ${parseErr.message}` });
    }

    // Write to temp file and apply
    const fs = require("fs");
    const os = require("os");
    const tmpFile = path.join(
      os.tmpdir(),
      `nemoclaw-custom-${sandbox}-${Date.now()}.yaml`
    );
    fs.writeFileSync(tmpFile, yamlContent, { mode: 0o600 });

    try {
      const result = runCapture(
        `openshell policy set ${sandbox} --file ${tmpFile}`,
        { ignoreError: true }
      );

      const io = req.app.get("io");
      if (io) io.to("status").emit("policy:custom-applied", { sandbox });

      res.json({
        success: true,
        sandbox,
        message: "Custom policy applied",
        output: result || "",
      });
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignored */ }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/policies/:sandbox/presets/:preset — remove preset ───
router.delete("/:sandbox/presets/:preset", (req, res) => {
  try {
    const { sandbox, preset } = req.params;

    // Get current registry entry
    const entry = registry.getSandbox(sandbox);
    if (!entry) {
      return res.status(404).json({ error: `Sandbox '${sandbox}' not found` });
    }

    const currentPresets = entry.policies || [];
    if (!currentPresets.includes(preset)) {
      return res.status(400).json({
        error: `Preset '${preset}' is not applied to '${sandbox}'`,
        applied: currentPresets,
      });
    }

    // Remove the preset from the list
    const remaining = currentPresets.filter((p) => p !== preset);

    // Recompute merged policy from remaining presets
    const baseline = policies.loadBaseline();
    const merged = remaining.length > 0
      ? policies.mergePresets(baseline, remaining)
      : baseline;

    // Apply the recomputed policy
    const success = policies.applyPolicy(sandbox, merged);

    if (success) {
      registry.updateSandbox(sandbox, { policies: remaining });

      const io = req.app.get("io");
      if (io) io.to("status").emit("policy:removed", { sandbox, preset, remaining });
    }

    res.json({ success, sandbox, removed: preset, remaining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/policies/:sandbox/reset — reset to baseline ──────────
router.post("/:sandbox/reset", (req, res) => {
  try {
    const { sandbox } = req.params;

    const entry = registry.getSandbox(sandbox);
    if (!entry) {
      return res.status(404).json({ error: `Sandbox '${sandbox}' not found` });
    }

    // Load and apply baseline only
    const baseline = policies.loadBaseline();
    const success = policies.applyPolicy(sandbox, baseline);

    if (success) {
      registry.updateSandbox(sandbox, { policies: [] });

      const io = req.app.get("io");
      if (io) io.to("status").emit("policy:reset", { sandbox });
    }

    res.json({ success, sandbox, message: "Reset to baseline policy" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
