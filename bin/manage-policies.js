#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// NemoClaw Policy Manager
// Standalone CLI for listing, showing, merging, and applying policy presets.
//
// Usage:
//   node bin/manage-policies.js list                    List available presets
//   node bin/manage-policies.js show <preset>           Show a preset's details
//   node bin/manage-policies.js baseline                Show the baseline policy
//   node bin/manage-policies.js merge <preset> [...]    Merge presets and print result
//   node bin/manage-policies.js apply <sandbox> <preset> [preset...]  Apply to sandbox
//   node bin/manage-policies.js status <sandbox>        Show current sandbox policy
//   node bin/manage-policies.js validate                Validate all preset files

const path = require("path");
const policies = require("./lib/policies");
const registry = require("./lib/registry");

const USAGE = `
NemoClaw Policy Manager

Usage:
  manage-policies list                              List available presets
  manage-policies show <preset>                     Show a preset's details
  manage-policies baseline                          Show the baseline policy
  manage-policies merge [--dry-run] <preset> [...]  Merge presets (print YAML)
  manage-policies apply <sandbox> <preset> [...]    Apply presets to a sandbox
  manage-policies status <sandbox>                  Show current sandbox policy
  manage-policies validate                          Validate all preset files

Presets:
  discord, telegram, slack, docker, pypi, npm, jira, outlook, huggingface
`;

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(USAGE);
    process.exit(0);
  }
  const command = args[0];
  switch (command) {
    case "list": cmdList(); break;
    case "show": cmdShow(args[1]); break;
    case "baseline": cmdBaseline(); break;
    case "merge": cmdMerge(args.slice(1)); break;
    case "apply": cmdApply(args[1], args.slice(2)); break;
    case "status": cmdStatus(args[1]); break;
    case "validate": cmdValidate(); break;
    case "help": case "--help": case "-h": console.log(USAGE); break;
    default: console.error(`Unknown command: ${command}`); console.log(USAGE); process.exit(1);
  }
}

function cmdList() {
  const presets = policies.listPresets();
  if (presets.length === 0) { console.log("No presets found."); return; }
  console.log("\n  Available Policy Presets");
  console.log("  " + "─".repeat(60));
  const maxName = Math.max(...presets.map((p) => p.name.length), 12);
  for (const p of presets) { console.log(`  ${p.name.padEnd(maxName + 2)} ${p.description}`); }
  console.log();
  try {
    const baseline = policies.loadBaseline();
    const groups = Object.keys(baseline.network_policies || {});
    console.log(`  Baseline policy: ${groups.length} endpoint groups`);
    console.log(`  Groups: ${groups.join(", ")}`);
    console.log();
  } catch (err) { console.warn(`  Warning: Could not load baseline: ${err.message}`); }
}

function cmdShow(presetName) {
  if (!presetName) { console.error("Usage: manage-policies show <preset>"); process.exit(1); }
  const preset = policies.loadPreset(presetName);
  if (!preset) {
    console.error(`Preset '${presetName}' not found.`);
    console.error(`Available: ${policies.listPresets().map((p) => p.name).join(", ")}`);
    process.exit(1);
  }
  console.log(`\n  Preset: ${preset.preset?.name || presetName}`);
  console.log(`  Description: ${preset.preset?.description || "N/A"}\n`);
  if (preset.network_policies) {
    for (const [key, policy] of Object.entries(preset.network_policies)) {
      console.log(`  Network Policy: ${policy.name || key}`);
      console.log(`  Endpoints:`);
      for (const ep of policy.endpoints || []) {
        const mode = ep.access === "full" ? "[CONNECT tunnel]" : ep.protocol === "rest" ? "[L7 REST]" : "[passthrough]";
        console.log(`    → ${ep.host}:${ep.port} ${mode}`);
        if (ep.rules) { for (const rule of ep.rules) { if (rule.allow) { console.log(`      ALLOW ${rule.allow.method} ${rule.allow.path}`); } } }
      }
      console.log(`  Binaries:`);
      for (const bin of policy.binaries || []) { console.log(`    → ${bin.path}`); }
      console.log();
    }
  }
}

function cmdBaseline() {
  try { console.log(policies.stringifyYaml(policies.loadBaseline())); }
  catch (err) { console.error(`Error: ${err.message}`); process.exit(1); }
}

function cmdMerge(args) {
  const presetNames = args.filter((a) => !a.startsWith("--"));
  if (presetNames.length === 0) { console.error("Usage: manage-policies merge <preset> [preset...]"); process.exit(1); }
  const available = policies.listPresets().map((p) => p.name);
  for (const name of presetNames) { if (!available.includes(name)) { console.error(`Unknown preset: ${name}. Available: ${available.join(", ")}`); process.exit(1); } }
  console.log(`\n  Merging baseline + presets: ${presetNames.join(", ")}`);
  const merged = policies.mergePresets(policies.loadBaseline(), presetNames);
  const pc = Object.keys(merged.network_policies || {}).length;
  const ec = Object.values(merged.network_policies || {}).reduce((s, p) => s + (p.endpoints?.length || 0), 0);
  console.log(`  Result: ${pc} groups, ${ec} endpoints\n`);
  console.log(policies.stringifyYaml(merged));
}

function cmdApply(sandboxName, presetNames) {
  if (!sandboxName || presetNames.length === 0) { console.error("Usage: manage-policies apply <sandbox> <preset> [preset...]"); process.exit(1); }
  const available = policies.listPresets().map((p) => p.name);
  for (const name of presetNames) { if (!available.includes(name)) { console.error(`Unknown preset: ${name}. Available: ${available.join(", ")}`); process.exit(1); } }
  console.log(`\n  NemoClaw Policy Manager\n  Sandbox:  ${sandboxName}\n  Presets:  ${presetNames.join(", ")}\n`);
  const success = policies.applyPresets(sandboxName, presetNames);
  if (success) {
    const existing = registry.getSandbox(sandboxName);
    if (existing) {
      const cp = new Set(existing.policies || []); presetNames.forEach(n => cp.add(n));
      registry.updateSandbox(sandboxName, { policies: [...cp] });
    } else { registry.registerSandbox({ name: sandboxName, policies: presetNames }); }
    console.log(`  ✓ Done\n`);
  } else { console.error(`\n  ✗ Failed. See errors above.\n`); process.exit(1); }
}

function cmdStatus(sandboxName) {
  if (!sandboxName) {
    const { sandboxes, defaultSandbox } = registry.listSandboxes();
    if (sandboxes.length === 0) { console.log("\n  No sandboxes registered.\n"); return; }
    console.log("\n  Registered Sandboxes\n  " + "─".repeat(60));
    for (const sb of sandboxes) {
      console.log(`  ${sb.name}${sb.name === defaultSandbox ? " (default)" : ""}`);
      console.log(`    Created: ${sb.createdAt}\n    Presets: ${(sb.policies || []).join(", ") || "none"}`);
    }
    console.log(); return;
  }
  const current = policies.getCurrentPolicy(sandboxName);
  if (current) { console.log(`\n  Active policy for '${sandboxName}':\n${policies.stringifyYaml(current)}`); }
  else { console.log(`\n  Could not retrieve active policy for '${sandboxName}'.`); }
  const reg = registry.getSandbox(sandboxName);
  if (reg) { console.log(`\n  Registry: presets=${(reg.policies||[]).join(", ")||"none"}, created=${reg.createdAt}`); }
  console.log();
}

function cmdValidate() {
  console.log("\n  Validating policy files...\n"); let errors = 0;
  try {
    const baseline = policies.loadBaseline();
    const groups = Object.keys(baseline.network_policies || {});
    console.log(`  ✓ Baseline policy: ${groups.length} groups`);
    const discord = baseline.network_policies?.discord;
    if (discord) {
      const gw = discord.endpoints?.find((e) => e.host === "gateway.discord.gg");
      if (gw?.access === "full") { console.log(`    ✓ Discord gateway uses CONNECT tunnel (access: full)`); }
      else { console.error(`    ✗ Discord gateway.discord.gg missing access: full — WebSocket will break!`); errors++; }
    }
  } catch (err) { console.error(`  ✗ Baseline: ${err.message}`); errors++; }
  const presets = policies.listPresets();
  for (const p of presets) {
    try {
      const preset = policies.loadPreset(p.name);
      if (!preset) { console.error(`  ✗ '${p.name}': not found`); errors++; continue; }
      const np = preset.network_policies || {};
      const gc = Object.keys(np).length, ec = Object.values(np).reduce((s,p)=>s+(p.endpoints?.length||0),0);
      if (gc === 0) { console.error(`  ✗ '${p.name}': no network_policies`); errors++; continue; }
      for (const [,pol] of Object.entries(np)) { for (const ep of pol.endpoints||[]) {
        if ((ep.host.includes("gateway")||ep.host.includes("wss"))&&ep.access!=="full") console.warn(`  ⚠ '${p.name}': ${ep.host} may need access: full`);
      }}
      console.log(`  ✓ '${p.name}': ${gc} group(s), ${ec} endpoint(s)`);
    } catch (err) { console.error(`  ✗ '${p.name}': ${err.message}`); errors++; }
  }
  try {
    const merged = policies.mergePresets(policies.loadBaseline(), presets.map(p=>p.name));
    const tg = Object.keys(merged.network_policies||{}).length;
    const te = Object.values(merged.network_policies||{}).reduce((s,p)=>s+(p.endpoints?.length||0),0);
    console.log(`\n  ✓ Full merge: ${tg} groups, ${te} endpoints`);
  } catch (err) { console.error(`\n  ✗ Merge failed: ${err.message}`); errors++; }
  console.log(); if (errors > 0) { console.error(`  ${errors} error(s).`); process.exit(1); } else { console.log(`  All valid. ✓\n`); }
}

main();
