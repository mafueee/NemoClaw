---
title:
  page: "NemoClaw CLI Commands Reference"
  nav: "Commands"
description: "Full CLI and dashboard reference for NemoClaw sandbox management."
keywords: ["nemoclaw cli commands", "nemoclaw command reference", "nemoclaw dashboard"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "nemoclaw", "cli", "dashboard"]
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

# Commands

NemoClaw provides both a CLI and a web dashboard for managing sandboxes. The dashboard is the primary interface for most operations, while the CLI is available for scripting, automation, and quick terminal access.

> **Dashboard First**
>
> All sandbox lifecycle, inference configuration, policy management, and monitoring operations are available in the web dashboard at `http://localhost:3000`. Launch it with `nemoclaw gui`.

Every CLI command supports `--help` to print usage, options, and examples:

```console
$ nemoclaw <command> --help
```

## Primary Commands

### `nemoclaw gui`

Launch the NemoClaw web dashboard. This is the recommended way to manage sandboxes, configure inference, edit policies, and chat with agents.

```console
$ nemoclaw gui [--port <port>] [--no-open]
```

| Flag | Effect |
|------|--------|
| `--port <port>` | Run dashboard on a custom port (default: 3000) |
| `--no-open` | Don't auto-open the browser |

The dashboard provides the full feature set: Onboard Wizard, Sandbox Manager, Agent Chat, Policy Editor, Inference Config, Log Viewer, Denial Dashboard, Gateway Lifecycle, Container Image Builder, and Port Manager.

### `nemoclaw onboard`

Run the interactive setup wizard via CLI. Creates an OpenShell gateway, registers inference providers, builds the sandbox image, and creates the sandbox.

```console
$ nemoclaw onboard [--non-interactive]
```

| Flag | Effect |
|------|--------|
| `--non-interactive` | Skip interactive prompts (use environment variables and defaults) |

:::{tip}
The same onboarding flow is available in the dashboard via the **Onboard Wizard**, which provides SSE-streamed deployment progress and visual provider selection.
:::

## Sandbox Commands

### `nemoclaw <name> connect`

Connect to a sandbox by name. Opens an interactive shell inside the sandbox.

```console
$ nemoclaw my-assistant connect
```

### `nemoclaw <name> status`

Show sandbox status, health, and inference configuration.

```console
$ nemoclaw my-assistant status [--json]
```

| Flag | Effect |
|------|--------|
| `--json` | Output structured JSON for scripting |

:::{tip}
The dashboard's Sandbox Manager shows this information in real time with live status badges.
:::

### `nemoclaw <name> logs`

View sandbox logs. Use `--follow` to stream output in real time.

```console
$ nemoclaw my-assistant logs [--follow]
```

:::{tip}
The dashboard's Log Viewer provides the same streaming with source and level filtering.
:::

### `nemoclaw <name> destroy`

Stop and delete a sandbox. This removes the sandbox from the registry.

:::{warning}
Destroying a sandbox permanently deletes all files inside it, including
[workspace files](../workspace/workspace-files.md).
Back up your workspace first by following the instructions at [Back Up and Restore](../workspace/backup-restore.md).
:::

```console
$ nemoclaw my-assistant destroy [--yes|--force]
```

| Flag | Effect |
|------|--------|
| `--yes`, `--force` | Skip the confirmation prompt |

### `nemoclaw list`

List all registered sandboxes with their model, provider, and policy presets.

```console
$ nemoclaw list [--json]
```

## Policy Commands

### `nemoclaw <name> policy-add`

Add a policy preset to a sandbox. Presets extend the baseline network policy with additional endpoints.

```console
$ nemoclaw my-assistant policy-add
```

:::{tip}
The dashboard's Policy Editor provides a visual YAML editor with OPA validation for editing policies.
:::

### `nemoclaw <name> policy-list`

List available policy presets and show which ones are applied to the sandbox.

```console
$ nemoclaw my-assistant policy-list [--json]
```

## Utility Commands

### `nemoclaw start` / `stop` / `status`

Manage auxiliary services (Telegram bridge, cloudflared tunnel).

```console
$ nemoclaw start
$ nemoclaw stop
$ nemoclaw status [--json]
```

### `nemoclaw debug`

Collect diagnostics for bug reports.

```console
$ nemoclaw debug [--quick] [--output FILE]
```

### `nemoclaw uninstall`

Remove NemoClaw and all resources created during setup.

```console
$ nemoclaw uninstall [--yes] [--keep-openshell] [--delete-models]
```

| Flag | Effect |
|------|--------|
| `--yes` | Skip the confirmation prompt |
| `--keep-openshell` | Leave the `openshell` binary installed |
| `--delete-models` | Also remove NemoClaw-pulled Ollama models |

### `nemoclaw deploy`

:::{warning}
The `nemoclaw deploy` command is experimental.
:::

Deploy to a remote GPU instance through [Brev](https://brev.nvidia.com).

```console
$ nemoclaw deploy <instance-name>
```

### `nemoclaw setup-spark`

Set up NemoClaw on DGX Spark. Applies cgroup v2 and Docker fixes for Ubuntu 24.04. Run with `sudo`.

```console
$ sudo nemoclaw setup-spark
```

## OpenShell Commands

### `openshell term`

Open the OpenShell TUI to monitor sandbox activity and approve network egress requests.

```console
$ openshell term
```

## Dashboard vs CLI Feature Matrix

| Feature | Dashboard | CLI |
|---------|-----------|-----|
| Sandbox create/destroy | ✅ Onboard Wizard | ✅ `nemoclaw onboard` |
| Sandbox status | ✅ Real-time badges | ✅ `nemoclaw <name> status` |
| Log streaming | ✅ Filtered log viewer | ✅ `nemoclaw <name> logs --follow` |
| Inference config | ✅ Visual provider picker | ✅ `openshell inference set` |
| Policy editing | ✅ YAML editor + OPA | ✅ `nemoclaw <name> policy-add` |
| Agent chat | ✅ Browser chat | ✅ `openclaw tui` (inside sandbox) |
| Gateway lifecycle | ✅ Start/Stop/Restart | — |
| Denial dashboard | ✅ Draft policy approval | — |
| Image builder | ✅ Dockerfile builds | — |
| Port management | ✅ Visual port manager | ✅ Environment variables |
| Multi-claw management | ✅ Card grid + detail views | — |
