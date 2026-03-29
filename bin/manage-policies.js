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
    case "list":
      cmdList();
      break;
    case "show":
      cmdShow(args[1]);
      break;
    case "baseline":
      cmdBaseline();
      break;
    case "merge":
      cmdMerge(args.slice(1));
      break;
    case "apply":
      cmdApply(args[1], args.slice(2));
      break;
    case "status":
      cmdStatus(args[1]);
      break;
    case "validate":
      cmdValidate();
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

function cmdList() {
  const presets = policies.listPresets();
  if (presets.length === 0) {
    console.log("No presets found.");
    return;
  }

  console.log("\n  Available Policy Presets");
  console.log("  " + "─".repeat(60));
  const maxName = Math.max(...presets.map((p) => p.name.length), 12);
  for (const p of presets) {
    console.log(`  ${p.name.padEnd(maxName + 2)} ${p.description}`);
  }
  console.log();

  // Also show baseline policy summary
  try {
    const baseline = policies.loadBaseline();
    const groups = Object.keys(baseline.network_policies || {});
    console.log(`  Baseline policy: ${groups.length} endpoint groups`);
    console.log(`  Groups: ${groups.join(", ")}`);
    console.log();
  } catch (err) {
    console.warn(`  ⚠ Could not load baseline: ${err.message}`);
  }
}

function cmdShow(presetName) {
  if (!presetName) {
    console.error("Usage: manage-policies show <preset>");
    process.exit(1);
  }

  const preset = policies.loadPreset(presetName);
  if (!preset) {
    console.error(`Preset '${presetName}' not found.`);
    const available = policies.listPresets().map((p) => p.name);
    console.error(`Available: ${available.join(", ")}`);
    process.exit(1);
  }

  console.log(`\n  Preset: ${preset.preset?.name || presetName}`);
  console.log(`  Description: ${preset.preset?.description || "N/A"}`);
  console.log();

  if (preset.network_policies) {
    for (const [key, policy] of Object.entries(preset.network_policies)) {
      console.log(`  Network Policy: ${policy.name || key}`);
      console.log(`  Endpoints:`);
      for (const ep of policy.endpoints || []) {
        const mode = ep.access === "full"
          ? "[CONNECT tunnel]"
          : ep.protocol === "rest"
            ? "[L7 REST]"
            : "[passthrough]";
        console.log(`    → ${ep.host}:${ep.port} ${mode}`);
        if (ep.rules) {
          for (const rule of ep.rules) {
            if (rule.allow) {
              console.log(`      ALLOW ${rule.allow.method} ${rule.allow.path}`);
            }
          }
        }
      }
      console.log(`  Binaries:`);
      for (const bin of policy.binaries || []) {
        console.log(`    → ${bin.path}`);
      }
      console.log();
    }
  }
}

function cmdBaseline() {
  try {
    const baseline = policies.loadBaseline();
    const yaml = policies.stringifyYaml(baseline);
    console.log(yaml);
  } catch (err) {
    console.error(`Error loading baseline: ${err.message}`);
    process.exit(1);
  }
}

function cmdMerge(args) {
  const dryRun = args.includes("--dry-run");
  const presetNames = args.filter((a) => !a.startsWith("--"));

  if (presetNames.length === 0) {
    console.error("Usage: manage-policies merge <preset> [preset...]");
    process.exit(1);
  }

  // Validate preset names
  const available = policies.listPresets().map((p) => p.name);
  for (const name of presetNames) {
    if (!available.includes(name)) {
      console.error(`Unknown preset: ${name}`);
      console.error(`Available: ${available.join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`\n  Merging baseline + presets: ${presetNames.join(", ")}`);
  const baseline = policies.loadBaseline();
  const merged = policies.mergePresets(baseline, presetNames);

  const policyCount = Object.keys(merged.network_policies || {}).length;
  const endpointCount = Object.values(merged.network_policies || {}).reduce(
    (sum, p) => sum + (p.endpoints?.length || 0),
    0
  );
  console.log(`  Result: ${policyCount} groups, ${endpointCount} endpoints\n`);

  const yaml = policies.stringifyYaml(merged);
  console.log(yaml);
}

function cmdApply(sandboxName, presetNames) {
  if (!sandboxName || presetNames.length === 0) {
    console.error("Usage: manage-policies apply <sandbox> <preset> [preset...]");
    process.exit(1);
  }

  // Validate preset names
  const available = policies.listPresets().map((p) => p.name);
  for (const name of presetNames) {
    if (!available.includes(name)) {
      console.error(`Unknown preset: ${name}`);
      console.error(`Available: ${available.join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`\n  NemoClaw Policy Manager`);
  console.log(`  Sandbox:  ${sandboxName}`);
  console.log(`  Presets:  ${presetNames.join(", ")}`);
  console.log();

  const success = policies.applyPresets(sandboxName, presetNames);

  if (success) {
    // Update registry
    const existing = registry.getSandbox(sandboxName);
    if (existing) {
      const currentPolicies = new Set(existing.policies || []);
      for (const name of presetNames) {
        currentPolicies.add(name);
      }
      registry.updateSandbox(sandboxName, {
        policies: [...currentPolicies],
      });
      console.log(`  Registry updated.`);
    } else {
      // Auto-register sandbox if not in registry
      registry.registerSandbox({
        name: sandboxName,
        policies: presetNames,
      });
      console.log(`  Sandbox '${sandboxName}' registered with presets.`);
    }
    console.log(`  ✓ Done\n`);
  } else {
    console.error(`\n  ✗ Failed to apply policy. See errors above.\n`);
    process.exit(1);
  }
}

function cmdStatus(sandboxName) {
  if (!sandboxName) {
    // Show all sandboxes from registry
    const { sandboxes, defaultSandbox } = registry.listSandboxes();
    if (sandboxes.length === 0) {
      console.log("\n  No sandboxes registered.");
      console.log("  Use: manage-policies apply <sandbox> <preset> to register.\n");
      return;
    }

    console.log("\n  Registered Sandboxes");
    console.log("  " + "─".repeat(60));
    for (const sb of sandboxes) {
      const isDefault = sb.name === defaultSandbox ? " (default)" : "";
      const pols = sb.policies?.length > 0 ? sb.policies.join(", ") : "none";
      console.log(`  ${sb.name}${isDefault}`);
      console.log(`    Created: ${sb.createdAt}`);
      console.log(`    Presets: ${pols}`);
    }
    console.log();
    return;
  }

  // Show specific sandbox
  const current = policies.getCurrentPolicy(sandboxName);
  if (current) {
    console.log(`\n  Active policy for '${sandboxName}':`);
    console.log(policies.stringifyYaml(current));
  } else {
    console.log(`\n  Could not retrieve active policy for '${sandboxName}'.`);
    console.log("  Is the sandbox running? Is openshell CLI available?");
  }

  // Also check registry
  const registered = registry.getSandbox(sandboxName);
  if (registered) {
    console.log(`\n  Registry info:`);
    console.log(`    Presets applied: ${(registered.policies || []).join(", ") || "none"}`);
    console.log(`    Created: ${registered.createdAt}`);
  }
  console.log();
}

function cmdValidate() {
  console.log("\n  Validating policy files...\n");
  let errors = 0;

  // Validate baseline
  try {
    const baseline = policies.loadBaseline();
    const groups = Object.keys(baseline.network_policies || {});
    console.log(`  ✓ Baseline policy: ${groups.length} groups`);

    // Verify critical Discord fix
    const discord = baseline.network_policies?.discord;
    if (discord) {
      const gateway = discord.endpoints?.find((e) => e.host === "gateway.discord.gg");
      if (gateway?.access === "full") {
        console.log(`    ✓ Discord gateway uses CONNECT tunnel (access: full)`);
      } else {
        console.error(`    ✗ Discord gateway.discord.gg missing access: full — WebSocket will break!`);
        errors++;
      }
    }
  } catch (err) {
    console.error(`  ✗ Baseline policy: ${err.message}`);
    errors++;
  }

  // Validate all presets
  const presets = policies.listPresets();
  for (const p of presets) {
    try {
      const preset = policies.loadPreset(p.name);
      if (!preset) {
        console.error(`  ✗ Preset '${p.name}': could not load`);
        errors++;
        continue;
      }

      const netPols = preset.network_policies || {};
      const groupCount = Object.keys(netPols).length;
      const endpointCount = Object.values(netPols).reduce(
        (sum, pol) => sum + (pol.endpoints?.length || 0),
        0
      );

      if (groupCount === 0) {
        console.error(`  ✗ Preset '${p.name}': no network_policies defined`);
        errors++;
        continue;
      }

      // Check for WebSocket endpoints that should use CONNECT tunnel
      for (const [key, pol] of Object.entries(netPols)) {
        for (const ep of pol.endpoints || []) {
          if (
            (ep.host.includes("gateway") || ep.host.includes("wss")) &&
            ep.access !== "full"
          ) {
            console.warn(
              `  ⚠ Preset '${p.name}': ${ep.host} may need access: full for WebSocket`
            );
          }
        }
      }

      console.log(`  ✓ Preset '${p.name}': ${groupCount} group(s), ${endpointCount} endpoint(s)`);
    } catch (err) {
      console.error(`  ✗ Preset '${p.name}': ${err.message}`);
      errors++;
    }
  }

  // Test merge
  try {
    const baseline = policies.loadBaseline();
    const allNames = presets.map((p) => p.name);
    const merged = policies.mergePresets(baseline, allNames);
    const totalGroups = Object.keys(merged.network_policies || {}).length;
    const totalEndpoints = Object.values(merged.network_policies || {}).reduce(
      (sum, p) => sum + (p.endpoints?.length || 0),
      0
    );
    console.log(`\n  ✓ Full merge test (all presets): ${totalGroups} groups, ${totalEndpoints} endpoints`);
  } catch (err) {
    console.error(`\n  ✗ Merge failed: ${err.message}`);
    errors++;
  }

  console.log();
  if (errors > 0) {
    console.error(`  ${errors} error(s) found.`);
    process.exit(1);
  } else {
    console.log(`  All policy files valid. ✓\n`);
  }
}

main();
