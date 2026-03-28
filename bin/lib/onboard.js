// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Onboarding wizard — interactive provider selection, credential validation,
// model selection, sandbox creation, and blueprint application.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  PROVIDERS,
  setCredential,
  getCredential,
  validateProvider,
  detectOllama,
} = require("./inference");
const { validateName, runCapture, run } = require("./runner");
const registry = require("./registry");

const BLUEPRINT_DIR = path.resolve(__dirname, "..", "..", "nemoclaw-blueprint");
const BASELINE_POLICY = path.join(
  BLUEPRINT_DIR,
  "policies",
  "openclaw-sandbox.yaml"
);

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function askSecret(rl, question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);

    let input = "";
    const onData = (char) => {
      const c = char.toString("utf-8");
      if (c === "\n" || c === "\r") {
        stdin.removeListener("data", onData);
        if (stdin.setRawMode) stdin.setRawMode(wasRaw || false);
        process.stdout.write("\n");
        resolve(input.trim());
      } else if (c === "\u0003") {
        process.exit(0);
      } else if (c === "\u007f" || c === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        input += c;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}

function selectMenu(rl, title, options) {
  return new Promise((resolve) => {
    console.log(`\n  ${title}`);
    console.log("  " + "-".repeat(50));
    options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt.label}`);
    });
    console.log();

    const doAsk = () => {
      rl.question("  Select [1-" + options.length + "]: ", (answer) => {
        const idx = parseInt(answer, 10) - 1;
        if (idx >= 0 && idx < options.length) {
          resolve(options[idx]);
        } else {
          console.log("  Invalid selection. Try again.");
          doAsk();
        }
      });
    };
    doAsk();
  });
}

function checkDocker() {
  try {
    const result = runCapture("docker info", { ignoreError: true });
    return !!result;
  } catch {
    return false;
  }
}

function checkOpenShell() {
  try {
    const result = runCapture("openshell --version", { ignoreError: true });
    return !!result;
  } catch {
    return false;
  }
}

function checkPort(port) {
  try {
    const result = runCapture(`lsof -i :${port} -t`, { ignoreError: true });
    return result ? result.split("\n").map((p) => p.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function runOnboard() {
  const rl = createRl();

  console.log("\n  NemoClaw Onboarding Wizard\n");

  // Step 1: Preflight
  console.log("  Step 1/5: Preflight checks\n");

  if (!checkDocker()) {
    console.error("  Error: Docker is not running. Start Docker and try again.");
    rl.close();
    return { success: false, sandboxName: "" };
  }
  console.log("  [ok] Docker is running");

  const hasOpenShell = checkOpenShell();
  if (hasOpenShell) {
    console.log("  [ok] OpenShell CLI is available");
  } else {
    console.log("  [warn] OpenShell CLI not found - will attempt to install");
  }

  const port = 18789;
  const conflicting = checkPort(port);
  if (conflicting.length > 0) {
    console.log(
      `  [warn] Port ${port} is in use by PID(s): ${conflicting.join(", ")}`
    );
    const action = await ask(rl, `  Kill conflicting process(es)? [y/N]: `);
    if (action.toLowerCase() === "y") {
      for (const pid of conflicting) {
        try {
          runCapture(`kill ${pid}`, { ignoreError: true });
          console.log(`    Killed PID ${pid}`);
        } catch { /* ignored */ }
      }
    } else {
      console.log("  Continuing - port conflict may cause issues.");
    }
  } else {
    console.log(`  [ok] Port ${port} is available`);
  }

  // Step 2: Provider selection
  console.log("\n  Step 2/5: Select inference provider\n");

  const providerOptions = Object.entries(PROVIDERS)
    .filter(([, p]) => !p.custom)
    .map(([key, p]) => ({
      key,
      label: p.label + (p.local ? " (local)" : ""),
      value: p,
    }));

  providerOptions.push(
    {
      key: "compatible-openai",
      label: PROVIDERS["compatible-openai"].label,
      value: PROVIDERS["compatible-openai"],
    },
    {
      key: "compatible-anthropic",
      label: PROVIDERS["compatible-anthropic"].label,
      value: PROVIDERS["compatible-anthropic"],
    }
  );

  const selected = await selectMenu(rl, "Inference Provider", providerOptions);
  const providerKey = selected.key;
  const provider = selected.value;

  // Step 3: Credentials
  console.log("\n  Step 3/5: Configure credentials\n");

  let apiKey = "";
  let endpoint = provider.endpoint;

  if (provider.local) {
    const ollama = detectOllama();
    if (!ollama.running) {
      console.error("  Error: Ollama is not running. Start Ollama with: ollama serve");
      rl.close();
      return { success: false, sandboxName: "" };
    }
    console.log("  [ok] Ollama detected");
    if (ollama.models.length > 0) {
      console.log(`  Available models: ${ollama.models.join(", ")}`);
    } else {
      console.log("  [warn] No models installed. Run: ollama pull <model>");
    }
    apiKey = "ollama";
  } else if (provider.custom) {
    endpoint = await ask(rl, "  Endpoint URL: ");
    if (!endpoint) {
      console.error("  Error: Endpoint is required.");
      rl.close();
      return { success: false, sandboxName: "" };
    }
    const existing = getCredential(providerKey);
    if (existing) {
      const mask = existing.slice(0, 4) + "..." + existing.slice(-4);
      console.log(`  Existing key found: ${mask}`);
      const reuse = await ask(rl, "  Use existing key? [Y/n]: ");
      if (reuse.toLowerCase() !== "n") {
        apiKey = existing;
      }
    }
    if (!apiKey) {
      apiKey = await askSecret(rl, "  API Key: ");
    }
  } else {
    const envKey = process.env[provider.credentialEnv];
    const storedKey = getCredential(providerKey);

    if (envKey) {
      const mask = envKey.slice(0, 4) + "..." + envKey.slice(-4);
      console.log(`  Found ${provider.credentialEnv} in environment: ${mask}`);
      const useEnv = await ask(rl, "  Use this key? [Y/n]: ");
      if (useEnv.toLowerCase() !== "n") {
        apiKey = envKey;
      }
    } else if (storedKey) {
      const mask = storedKey.slice(0, 4) + "..." + storedKey.slice(-4);
      console.log(`  Found stored credential: ${mask}`);
      const useStored = await ask(rl, "  Use stored key? [Y/n]: ");
      if (useStored.toLowerCase() !== "n") {
        apiKey = storedKey;
      }
    }

    if (!apiKey) {
      apiKey = await askSecret(rl, `  ${provider.credentialEnv}: `);
    }
  }

  if (!apiKey) {
    console.error("  Error: API key is required.");
    rl.close();
    return { success: false, sandboxName: "" };
  }

  console.log("\n  Validating credentials...");
  const validation = validateProvider(providerKey, endpoint, apiKey, "");
  if (!validation.valid) {
    console.error(`  Error: ${validation.error}`);
    const proceed = await ask(rl, "  Continue anyway? [y/N]: ");
    if (proceed.toLowerCase() !== "y") {
      rl.close();
      return { success: false, sandboxName: "" };
    }
  } else {
    console.log("  [ok] Credentials validated");
  }

  setCredential(providerKey, apiKey);
  console.log("  [ok] Credential saved to ~/.nemoclaw/credentials.json");

  // Step 4: Model selection
  console.log("\n  Step 4/5: Select model\n");

  let model = provider.defaultModel;
  if (provider.local) {
    const ollama = detectOllama();
    if (ollama.models.length > 0) {
      model = await ask(rl, `  Model [${ollama.models[0]}]: `);
      if (!model) model = ollama.models[0];
    } else {
      model = await ask(rl, "  Model name: ");
    }
  } else if (!model) {
    model = await ask(rl, "  Model name: ");
  } else {
    const customModel = await ask(rl, `  Model [${model}]: `);
    if (customModel) model = customModel;
  }

  if (!model) {
    console.error("  Error: Model name is required.");
    rl.close();
    return { success: false, sandboxName: "" };
  }
  console.log(`  [ok] Model: ${model}`);

  // Step 5: Sandbox creation
  console.log("\n  Step 5/5: Create sandbox\n");

  let sandboxName = await ask(rl, "  Sandbox name [my-assistant]: ");
  if (!sandboxName) sandboxName = "my-assistant";

  sandboxName = sandboxName.toLowerCase();
  try {
    validateName(sandboxName, "Sandbox name");
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    rl.close();
    return { success: false, sandboxName: "" };
  }

  console.log(`\n  -- Summary --`);
  console.log(`  Provider:  ${provider.label}`);
  console.log(`  Model:     ${model}`);
  console.log(`  Sandbox:   ${sandboxName}`);
  console.log(`  Endpoint:  ${endpoint}`);
  console.log(`  Policy:    ${BASELINE_POLICY}`);

  const confirm = await ask(rl, "\n  Proceed? [Y/n]: ");
  if (confirm.toLowerCase() === "n") {
    console.log("  Aborted.");
    rl.close();
    return { success: false, sandboxName: "" };
  }

  rl.close();

  console.log("\n  Creating sandbox...");

  registry.registerSandbox({
    name: sandboxName,
    model,
    provider: providerKey,
    policies: [],
    createdAt: new Date().toISOString(),
  });

  if (hasOpenShell) {
    console.log("  -> Creating sandbox via OpenShell...");
    const createResult = run(
      `openshell sandbox create --name ${sandboxName} --from openclaw`,
      { ignoreError: true }
    );

    if (createResult.status === 0) {
      console.log("  [ok] Sandbox created");

      console.log("  -> Applying baseline policy...");
      run(
        `openshell policy set ${sandboxName} --policy ${BASELINE_POLICY} --wait`,
        { ignoreError: true }
      );
      console.log("  [ok] Baseline policy applied");

      console.log("  -> Configuring inference route...");
      run(
        `openshell inference set --provider ${provider.providerName} --model ${model}`,
        { ignoreError: true }
      );
      console.log("  [ok] Inference configured");
    } else {
      console.log(
        "  [warn] Sandbox creation via OpenShell failed. Sandbox registered locally."
      );
    }
  } else {
    console.log(
      "  [warn] OpenShell CLI not available. Sandbox registered in local registry."
    );
    console.log("  Install OpenShell and run: nemoclaw onboard");
  }

  console.log("\n  Onboarding Complete!");
  console.log(`\n  Your sandbox '${sandboxName}' is ready.`);
  console.log(`  Connect with: nemoclaw ${sandboxName} connect`);
  console.log(`  Status:       nemoclaw ${sandboxName} status`);
  console.log(`  Logs:         nemoclaw ${sandboxName} logs\n`);

  return { success: true, sandboxName };
}

module.exports = { runOnboard, checkDocker, checkOpenShell, checkPort };
