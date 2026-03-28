---
title:
  page: "NemoClaw Troubleshooting Guide"
  nav: "Troubleshooting"
description: "Diagnose and resolve common NemoClaw installation, dashboard, and runtime issues."
keywords: ["nemoclaw troubleshooting", "nemoclaw debug dashboard issues"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "troubleshooting", "nemoclaw", "dashboard"]
content:
  type: reference
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

<!-- markdownlint-disable MD014 -->

# Troubleshooting

This page covers common issues with installation, the web dashboard, and runtime, along with resolution steps.

:::{admonition} Get Help
:class: tip

If your issue is not listed here, [file an issue on GitHub](https://github.com/NVIDIA/NemoClaw/issues/new) or join the [NemoClaw Discord](https://discord.gg/XFpfPv9Uvx).
:::

## Installation

### `nemoclaw` not found after install

If you use nvm or fnm to manage Node.js, the installer may not update your current shell's PATH.

Run `source ~/.bashrc` (or `source ~/.zshrc` for zsh), or open a new terminal.

### Node.js version is too old

NemoClaw requires Node.js 20 or later. Check your version:

```console
$ node --version
```

If below 20, upgrade via nvm:

```console
$ nvm install 20
$ nvm use 20
```

### Docker is not running

The dashboard and onboard wizard require Docker. Start the daemon:

```console
$ sudo systemctl start docker
```

On macOS, open Docker Desktop and wait for it to finish starting.

### npm install fails with permission errors

Don't run npm with `sudo`. Configure npm to use a directory you own:

```console
$ mkdir -p ~/.npm-global
$ npm config set prefix ~/.npm-global
$ export PATH=~/.npm-global/bin:$PATH
```

Add the `export` line to `~/.bashrc` or `~/.zshrc`, then retry.

### Port already in use

If a port conflict is detected, find the blocking process:

```console
$ lsof -i :3000
$ kill <PID>
```

## Web Dashboard

### Dashboard won't start

If `nemoclaw gui` fails or the dashboard is unreachable:

1. Check that port 3000 (or your configured port) is free.
2. Ensure the frontend is built: `cd gui && npm install && npm run build`.
3. Check the server logs for startup errors.
4. If accessing from another machine on the LAN, verify the server binds to `0.0.0.0` (not just `localhost`).

### Gateway shows "Not Installed" or "Offline"

The dashboard monitors gateway health via gRPC and HTTP. If it shows offline:

1. Check if the gateway container is running: `docker ps | grep openshell`.
2. Use the **Gateway** page in the dashboard to Start the container.
3. Verify Docker API compatibility — NemoClaw requires Docker API ≥ v1.44.
4. Check that gateway config files exist at `~/.config/openshell/active_gateway`.

A **global alert banner** appears on every page when the gateway is offline, with a one-click Start button.

### Onboarding deployment stalls

If the Onboard Wizard progress bar freezes:

1. Check the browser's developer console for SSE connection errors.
2. Verify the gateway is online (check the sidebar health indicator).
3. If SSE events stopped flowing, the server may have timed out a gRPC call. Refresh the page and retry.
4. For DNS propagation delays on DGX, wait 30 seconds and retry.

### Chat returns errors

Common chat errors and their solutions:

| Error | Cause | Fix |
|-------|-------|-----|
| "Authentication failed" | Invalid or missing API key | Go to Inference Config, re-enter your API key |
| "Provider unreachable" | Inference endpoint is down or misconfigured | Check the provider URL in Inference Config, verify the service is running |
| "Missing API key" | No key configured for the selected provider | Navigate to Inference Config and enter the key |
| "OpenClaw agent is not available" | The sandbox image is missing the `openclaw` CLI, or a legacy false-positive plugin warning triggered a fallback | Rebuild the sandbox image, or ensure your dashboard is up-to-date. |
| "Bypassed — not policy-constrained" | The agent request failed and the dashboard fell back to a direct LLM proxy without tool access | Rebuild the sandbox image to restore the full agent binary. |
| SSH transport errors | Sandbox connectivity issues | Verify the sandbox is running via the Sandbox Manager |

The chat interface shows actionable error messages with links to the relevant configuration page.

### WebSocket disconnects

If live updates stop working:

1. The dashboard auto-reconnects with exponential backoff. Wait a few seconds.
2. If it persists, refresh the page.
3. Check that no proxy or firewall is terminating WebSocket connections.

## Onboarding

### Cgroup v2 errors during onboard

On Ubuntu 24.04, DGX Spark, and WSL2, Docker may not be configured for cgroup v2 delegation.

Run the Spark setup script:

```console
$ sudo nemoclaw setup-spark
$ nemoclaw onboard
```

### Invalid sandbox name

Sandbox names must follow RFC 1123: lowercase alphanumeric and hyphens only, must start and end with an alphanumeric character. Example: `my-assistant`, `dev1`.

### Provider type conflict

If you see "unsupported provider type" during deployment, the gRPC client's provider type mapping may not cover your chosen provider. NemoClaw maps providers to gateway-supported types:

| NemoClaw Provider | Gateway Type |
|-------------------|-------------|
| OpenRouter | `openai` |
| Gemini | `openai` |
| Ollama | `openai` |
| vLLM | `openai` |
| NVIDIA Cloud | `nvidia` |
| NIM Local | `nvidia` |

### UNIQUE constraint violation

If sandbox creation fails with a UNIQUE constraint error, a sandbox with that name already exists. Either:
- Choose a different name
- Delete the existing sandbox first via the Sandbox Manager or `nemoclaw <name> destroy`

## Runtime

### Sandbox shows as stopped

The sandbox may have been stopped or deleted. Run `nemoclaw onboard` or use the dashboard's Onboard Wizard to recreate it.

### Inference requests time out

1. Check the active provider in the dashboard's Inference Config page.
2. Use **Test Connection** to verify the endpoint is reachable.
3. Check for network policy rules that may block the inference endpoint.
4. Verify your API key is valid and hasn't expired.

### Agent cannot reach an external host

OpenShell blocks outbound connections not listed in the network policy. Options:

1. Open the **Denial Dashboard** in the web UI to see blocked requests and approve recommended policy changes.
2. Use `openshell term` on the host to see and approve blocked requests in real time.
3. Add the endpoint permanently via the **Policy Editor**.

Refer to [Customize the Network Policy](../network-policy/customize-network-policy.md) for details.

### Credential vault issues

If API keys aren't being restored on server restart:

1. Check that `~/.nemoclaw/credentials.json` exists and contains valid JSON.
2. Verify the file has correct permissions (readable by the server process).
3. Re-enter the key via the dashboard's Inference Config page to regenerate the vault entry.
