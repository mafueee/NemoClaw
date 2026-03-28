// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Inference routing management — wraps `openshell inference set` and provider
// credential handling. Credentials live on the host only; the sandbox uses
// inference.local to reach the provider via the OpenShell gateway.

const fs = require("fs");
const path = require("path");
const { runCapture } = require("./runner");

// ---------------------------------------------------------------------------
// Provider catalogue — mirrors the upstream NemoClaw onboard wizard.
// ---------------------------------------------------------------------------

const PROVIDERS = {
  nvidia: {
    label: "NVIDIA Endpoints",
    type: "nvidia",
    providerName: "nvidia-prod",
    endpoint: "https://integrate.api.nvidia.com/v1",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    credentialEnv: "NVIDIA_API_KEY",
    validateEndpoint: "/v1/models",
    validateMethod: "GET",
    compatible: "openai",
  },
  openai: {
    label: "OpenAI",
    type: "openai",
    providerName: "openai-api",
    endpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1",
    credentialEnv: "OPENAI_API_KEY",
    validatePaths: ["/v1/responses", "/v1/chat/completions"],
    validateMethod: "POST",
    compatible: "openai",
  },
  anthropic: {
    label: "Anthropic",
    type: "anthropic",
    providerName: "anthropic-prod",
    endpoint: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-6",
    credentialEnv: "ANTHROPIC_API_KEY",
    validateEndpoint: "/v1/messages",
    validateMethod: "POST",
    compatible: "anthropic",
  },
  gemini: {
    label: "Google Gemini",
    type: "openai",
    providerName: "gemini-api",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    credentialEnv: "GEMINI_API_KEY",
    validatePaths: ["/v1/chat/completions"],
    validateMethod: "POST",
    compatible: "openai",
  },
  ollama: {
    label: "Local Ollama",
    type: "openai",
    providerName: "ollama-local",
    endpoint: "http://localhost:11434/v1",
    defaultModel: "",
    credentialEnv: "",
    validateEndpoint: "/api/tags",
    validateMethod: "GET",
    compatible: "openai",
    local: true,
  },
  "compatible-openai": {
    label: "Other OpenAI-compatible endpoint",
    type: "openai",
    providerName: "compatible-endpoint",
    endpoint: "",
    defaultModel: "",
    credentialEnv: "OPENAI_API_KEY",
    compatible: "openai",
    custom: true,
  },
  "compatible-anthropic": {
    label: "Other Anthropic-compatible endpoint",
    type: "anthropic",
    providerName: "compatible-anthropic-endpoint",
    endpoint: "",
    defaultModel: "",
    credentialEnv: "ANTHROPIC_API_KEY",
    compatible: "anthropic",
    custom: true,
  },
};

// ---------------------------------------------------------------------------
// Credential management — host-side only.
// ---------------------------------------------------------------------------

const CREDS_FILE = path.join(
  process.env.HOME || "/tmp",
  ".nemoclaw",
  "credentials.json"
);

function loadCredentials() {
  try {
    if (fs.existsSync(CREDS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDS_FILE, "utf-8"));
    }
  } catch {
    /* ignored */
  }
  return {};
}

function saveCredentials(creds) {
  const dir = path.dirname(CREDS_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
}

function setCredential(providerKey, apiKey) {
  const creds = loadCredentials();
  creds[providerKey] = {
    apiKey,
    updatedAt: new Date().toISOString(),
  };
  saveCredentials(creds);
}

function getCredential(providerKey) {
  const creds = loadCredentials();
  return creds[providerKey]?.apiKey || null;
}

// ---------------------------------------------------------------------------
// Inference switching — wraps `openshell inference set`.
// ---------------------------------------------------------------------------

function setInference(providerName, model) {
  try {
    const result = runCapture(
      `openshell inference set --provider ${providerName} --model ${model}`,
      { ignoreError: true }
    );
    return { success: !!result || result === "", output: result || "" };
  } catch (err) {
    return { success: false, output: err.message };
  }
}

function getInferenceStatus() {
  try {
    const result = runCapture("openshell inference get --json", {
      ignoreError: true,
    });
    if (result) {
      return JSON.parse(result);
    }
  } catch {
    /* ignored */
  }
  return null;
}

function detectOllama() {
  try {
    const result = runCapture("curl -s http://localhost:11434/api/tags", {
      ignoreError: true,
    });
    if (result) {
      const parsed = JSON.parse(result);
      const models = (parsed.models || []).map((m) => m.name || m.model);
      return { running: true, models };
    }
  } catch {
    /* ignored */
  }
  return { running: false, models: [] };
}

function validateProvider(providerKey, endpoint, apiKey, model) {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    return { valid: false, error: `Unknown provider: ${providerKey}` };
  }

  if (provider.local) {
    const ollama = detectOllama();
    if (!ollama.running) {
      return { valid: false, error: "Ollama is not running on localhost" };
    }
    if (model && !ollama.models.includes(model)) {
      return {
        valid: false,
        error: `Model '${model}' not found. Available: ${ollama.models.join(", ")}`,
      };
    }
    return { valid: true, error: "" };
  }

  const validateUrl = provider.validateEndpoint
    ? `${endpoint}${provider.validateEndpoint}`
    : `${endpoint}/v1/models`;

  try {
    const authHeader = provider.compatible === "anthropic"
      ? `-H "x-api-key: ${apiKey}" -H "anthropic-version: 2023-06-01"`
      : `-H "Authorization: Bearer ${apiKey}"`;

    const result = runCapture(
      `curl -s -w "\\n%{http_code}" ${authHeader} "${validateUrl}"`,
      { ignoreError: true }
    );

    if (result) {
      const lines = result.split("\n");
      const statusCode = parseInt(lines[lines.length - 1], 10);
      if (statusCode >= 200 && statusCode < 300) {
        return { valid: true, error: "" };
      }
      if (statusCode === 401) {
        return { valid: false, error: "Invalid API key (401 Unauthorized)" };
      }
      if (statusCode === 403) {
        return { valid: false, error: "Access denied (403 Forbidden)" };
      }
      return {
        valid: false,
        error: `Validation failed with HTTP ${statusCode}`,
      };
    }
  } catch (err) {
    return { valid: false, error: `Validation error: ${err.message}` };
  }

  return { valid: false, error: "Could not reach provider endpoint" };
}

module.exports = {
  PROVIDERS,
  CREDS_FILE,
  loadCredentials,
  saveCredentials,
  setCredential,
  getCredential,
  setInference,
  getInferenceStatus,
  detectOllama,
  validateProvider,
};
