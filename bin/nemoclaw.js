#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// NemoClaw CLI — main orchestration tool.
//
// Usage:
//   nemoclaw onboard                               Interactive onboarding wizard
//   nemoclaw list                                   List registered sandboxes
//   nemoclaw <name> connect                         Connect to a sandbox
//   nemoclaw <name> status [--json]                 Show sandbox status
//   nemoclaw <name> logs [--follow]                 Stream sandbox logs
//   nemoclaw <name> destroy                         Destroy a sandbox
//   nemoclaw <name> policy-add <preset> [preset...] Add policy preset(s)
//   nemoclaw <name> policy-list                     List active policies
//   nemoclaw deploy <instance>                      Deploy to remote GPU (via scripts/)
//   nemoclaw help                                   Show this help

const path = require("path");
const { runOnboard } = require("./lib/onboard");
const { PROVIDERS, getCredential, getInferenceStatus } = require("./lib/inference");
const { run, runCapture, runInteractive, validateName } = require("./lib/runner");
const registry = require("./lib/registry");
const policies = require("./lib/policies");

const VERSION = "1.0.0";

const USAGE = `
  NemoClaw CLI v${VERSION}

  Usage:
    nemoclaw onboard                                 Interactive onboarding wizard
    nemoclaw list                                    List registered sandboxes
    nemoclaw <name> connect                          Connect to a sandbox
    nemoclaw <name> status [--json]                  Show sandbox status
    nemoclaw <name> logs [--follow]                  Stream sandbox logs
    nemoclaw <name> destroy                          Destroy a sandbox
    nemoclaw <name> policy-add <preset> [preset...]  Add policy preset(s)
    nemoclaw <name> policy-list                      List active policies
    nemoclaw deploy <instance>                       Deploy to remote GPU instance
    nemoclaw help                                    Show this help

  Examples:
    nemoclaw onboard                # Set up a new sandbox with provider + model
    nemoclaw my-assistant connect   # Open a terminal inside the sandbox
    nemoclaw my-assistant status    # Check sandbox health
    nemoclaw my-assistant logs -f   # Stream live logs (Ctrl+C to stop)
    nemoclaw my-assistant policy-add discord telegram  # Add presets
    nemoclaw my-assistant destroy   # Tear down sandbox
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(USAGE);
    process.exit(0);
  }

  const command = args[0];

  // ── Top-level commands ────────────────────────────────────────────
  switch (command) {
    case "onboard":
      return cmdOnboard();
    case "list":
      return cmdList();
    case "deploy":
      return cmdDeploy(args[1]);
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return;
    case "--version":
    case "-v":
      console.log(`nemoclaw v${VERSION}`);
      return;
    default:
      // <name> <subcommand> pattern
      break;
  }

  // ── Namespaced commands: nemoclaw <name> <subcommand> ─────────────
  const sandboxName = args[0];
  const subcommand = args[1];

  if (!subcommand) {
    // No subcommand — show status for this sandbox
    return cmdStatus(sandboxName, args.slice(2));
  }

  switch (subcommand) {
    case "connect":
      return cmdConnect(sandboxName);
    case "status":
      return cmdStatus(sandboxName, args.slice(2));
    case "logs":
      return cmdLogs(sandboxName, args.slice(2));
    case "destroy":
      return cmdDestroy(sandboxName);
    case "policy-add":
      return cmdPolicyAdd(sandboxName, args.slice(2));
    case "policy-list":
      return cmdPolicyList(sandboxName);
    default:
      console.error(`  Unknown command: ${sandboxName} ${subcommand}`);
      console.log(USAGE);
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

async function cmdOnboard() {
  const result = await runOnboard();
  if (!result.success) {
    process.exit(1);
  }
}

function cmdList() {
  const { sandboxes, defaultSandbox } = registry.listSandboxes();

  if (sandboxes.length === 0) {
    console.log("\n  No sandboxes registered.");
    console.log("  Run: nemoclaw onboard\n");
    return;
  }

  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║           Registered Sandboxes           ║");
  console.log("  ╚══════════════════════════════════════════╝\n");

  const maxName = Math.max(...sandboxes.map((s) => s.name.length), 8);

  for (const sb of sandboxes) {
    const isDefault = sb.name === defaultSandbox ? " ★" : "";
    const providerLabel = sb.provider
      ? (PROVIDERS[sb.provider]?.label || sb.provider)
      : "—";
    const pols = sb.policies?.length > 0 ? sb.policies.join(", ") : "none";
    const model = sb.model || "—";

    console.log(`  ${sb.name.padEnd(maxName + 2)}${isDefault}`);
    console.log(`    Provider: ${providerLabel}`);
    console.log(`    Model:    ${model}`);
    console.log(`    Presets:  ${pols}`);
    console.log(`    Created:  ${sb.createdAt || "—"}`);
    console.log();
  }

  // Also check OpenShell for live sandbox status
  try {
    const result = runCapture("openshell sandbox list --json", {
      ignoreError: true,
    });
    if (result) {
      const liveSandboxes = JSON.parse(result);
      const liveNames = liveSandboxes.map((s) => s.name || s.Name);
      const registeredNames = sandboxes.map((s) => s.name);
      const unregistered = liveNames.filter(
        (n) => !registeredNames.includes(n)
      );
      if (unregistered.length > 0) {
        console.log(
          `  Live (unregistered): ${unregistered.join(", ")}`
        );
      }
    }
  } catch {
    /* ignored */
  }
}

function cmdConnect(sandboxName) {
  console.log(`\n  Connecting to sandbox '${sandboxName}'...\n`);

  // Check registry
  const sb = registry.getSandbox(sandboxName);
  if (!sb) {
    console.log(
      `  ⚠ Sandbox '${sandboxName}' not in registry. Attempting direct connection.\n`
    );
  }

  const result = runInteractive(`openshell sandbox connect ${sandboxName}`, {
    ignoreError: true,
  });

  if (result.status !== 0) {
    console.error(`\n  ✗ Could not connect to '${sandboxName}'.`);
    console.error("  Is the sandbox running? Is OpenShell CLI available?");
    process.exit(1);
  }
}

function cmdStatus(sandboxName, flags) {
  const jsonOutput = flags.includes("--json");

  // Registry info
  const sb = registry.getSandbox(sandboxName);

  // Live status from OpenShell
  let liveStatus = null;
  try {
    const result = runCapture(
      `openshell sandbox list --json`,
      { ignoreError: true }
    );
    if (result) {
      const all = JSON.parse(result);
      liveStatus = all.find(
        (s) => (s.name || s.Name) === sandboxName
      );
    }
  } catch {
    /* ignored */
  }

  // Active policy
  const activePolicy = policies.getCurrentPolicy(sandboxName);

  // Inference status
  const inference = getInferenceStatus();

  if (jsonOutput) {
    const output = {
      name: sandboxName,
      registered: !!sb,
      running: !!liveStatus,
      provider: sb?.provider || null,
      model: sb?.model || null,
      policies: sb?.policies || [],
      createdAt: sb?.createdAt || null,
      live: liveStatus || null,
      inference: inference || null,
      policyGroupCount: activePolicy
        ? Object.keys(activePolicy.network_policies || {}).length
        : null,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║    Sandbox: ${sandboxName.padEnd(27)} ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);

  if (sb) {
    const providerLabel = sb.provider
      ? (PROVIDERS[sb.provider]?.label || sb.provider)
      : "—";
    console.log(`  Provider:    ${providerLabel}`);
    console.log(`  Model:       ${sb.model || "—"}`);
    console.log(`  Created:     ${sb.createdAt || "—"}`);
    console.log(`  Presets:     ${(sb.policies || []).join(", ") || "none"}`);
  } else {
    console.log(`  ⚠ Not found in local registry.`);
  }

  if (liveStatus) {
    console.log(`\n  Runtime:`);
    console.log(`    Running:   ✓`);
    console.log(
      `    Phase:     ${liveStatus.phase || liveStatus.Phase || "—"}`
    );
    console.log(
      `    Image:     ${liveStatus.image || liveStatus.Image || "—"}`
    );
  } else {
    console.log(`\n  Runtime:     ✗ Not running or OpenShell unavailable`);
  }

  if (activePolicy) {
    const groups = Object.keys(activePolicy.network_policies || {});
    const endpointCount = Object.values(
      activePolicy.network_policies || {}
    ).reduce((sum, p) => sum + (p.endpoints?.length || 0), 0);
    console.log(`\n  Policy:`);
    console.log(`    Groups:    ${groups.length}`);
    console.log(`    Endpoints: ${endpointCount}`);
    console.log(`    Groups:    ${groups.join(", ")}`);
  }

  if (inference) {
    console.log(`\n  Inference:`);
    console.log(`    Provider:  ${inference.provider || "—"}`);
    console.log(`    Model:     ${inference.model || "—"}`);
    console.log(`    Endpoint:  ${inference.endpoint || "—"}`);
  }

  console.log();
}

function cmdLogs(sandboxName, flags) {
  const follow = flags.includes("--follow") || flags.includes("-f");
  const tailFlag = follow ? "--tail" : "";

  console.log(
    `\n  Streaming logs for '${sandboxName}'... ${follow ? "(Ctrl+C to stop)" : ""}\n`
  );

  runInteractive(`openshell logs ${sandboxName} ${tailFlag}`, {
    ignoreError: true,
  });
}

function cmdDestroy(sandboxName) {
  console.log(`\n  Destroying sandbox '${sandboxName}'...`);

  // Confirm
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(
    `\n  ⚠ This will permanently delete the sandbox and its data.\n  Type '${sandboxName}' to confirm: `,
    (answer) => {
      rl.close();
      if (answer.trim() !== sandboxName) {
        console.log("  Aborted.");
        return;
      }

      // Destroy via OpenShell
      const result = run(
        `openshell sandbox destroy ${sandboxName}`,
        { ignoreError: true }
      );

      if (result.status === 0) {
        console.log("  ✓ Sandbox destroyed");
      } else {
        console.log(
          "  ⚠ OpenShell destroy failed — removing from registry only"
        );
      }

      // Remove from registry
      registry.removeSandbox(sandboxName);
      console.log("  ✓ Removed from registry\n");
    }
  );
}

function cmdPolicyAdd(sandboxName, presetNames) {
  if (presetNames.length === 0) {
    console.error(
      "  Usage: nemoclaw <sandbox> policy-add <preset> [preset...]"
    );
    const available = policies.listPresets().map((p) => p.name);
    console.error(`  Available presets: ${available.join(", ")}`);
    process.exit(1);
  }

  // Validate preset names
  const available = policies.listPresets().map((p) => p.name);
  for (const name of presetNames) {
    if (!available.includes(name)) {
      console.error(`  Unknown preset: ${name}`);
      console.error(`  Available: ${available.join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`\n  Adding presets to '${sandboxName}': ${presetNames.join(", ")}`);

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
    } else {
      registry.registerSandbox({
        name: sandboxName,
        policies: presetNames,
      });
    }
    console.log("  ✓ Done\n");
  } else {
    console.error("  ✗ Failed to apply presets. See errors above.\n");
    process.exit(1);
  }
}

function cmdPolicyList(sandboxName) {
  const sb = registry.getSandbox(sandboxName);
  const applied = sb?.policies || [];

  console.log(`\n  Policies for '${sandboxName}':`);

  if (applied.length === 0) {
    console.log("  No policy presets applied.\n");
  } else {
    for (const name of applied) {
      const preset = policies.loadPreset(name);
      const desc = preset?.preset?.description || "";
      console.log(`    ✓ ${name} — ${desc}`);
    }
    console.log();
  }

  // Show available presets
  const allPresets = policies.listPresets();
  const notApplied = allPresets.filter((p) => !applied.includes(p.name));
  if (notApplied.length > 0) {
    console.log("  Available presets:");
    for (const p of notApplied) {
      console.log(`    ○ ${p.name} — ${p.description}`);
    }
    console.log(
      `\n  Add with: nemoclaw ${sandboxName} policy-add <preset>\n`
    );
  }
}

function cmdDeploy(instanceName) {
  if (!instanceName) {
    console.error("  Usage: nemoclaw deploy <instance-name>");
    process.exit(1);
  }

  const scriptPath = path.resolve(
    __dirname,
    "..",
    "scripts",
    "remote-deploy.sh"
  );

  const fs = require("fs");
  if (!fs.existsSync(scriptPath)) {
    console.error(`  Deploy script not found: ${scriptPath}`);
    console.error(
      "  Direct SSH deployment is available via: scripts/remote-deploy.sh"
    );
    process.exit(1);
  }

  console.log(`\n  Deploying to remote instance '${instanceName}'...\n`);
  runInteractive(`bash ${scriptPath} ${instanceName}`, { ignoreError: true });
}

// Entry point
main().catch((err) => {
  console.error(`  Fatal error: ${err.message}`);
  process.exit(1);
});
