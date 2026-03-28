# OpenShell

[![License](https://img.shields.io/badge/License-Apache_2.0-blue)](https://github.com/NVIDIA/OpenShell/blob/main/LICENSE)
[![PyPI](https://img.shields.io/badge/PyPI-openshell-orange?logo=pypi)](https://pypi.org/project/openshell/)
[![Security Policy](https://img.shields.io/badge/Security-Report%20a%20Vulnerability-red)](SECURITY.md)
[![Documentation](https://img.shields.io/badge/docs-latest-brightgreen)](https://docs.nvidia.com/openshell/latest/index.html)
[![Project Status](https://img.shields.io/badge/status-alpha-orange)](https://docs.nvidia.com/openshell/latest/about/release-notes.html)

OpenShell is the safe, private runtime for autonomous AI agents. It provides sandboxed execution environments that protect your data, credentials, and infrastructure — governed by declarative YAML policies that prevent unauthorized file access, data exfiltration, and uncontrolled network activity.

OpenShell is built agent-first. The project ships with agent skills for everything from cluster debugging to policy generation, and we expect contributors to use them.

> **Alpha software — single-player mode.** OpenShell is proof-of-life: one developer, one environment, one gateway. We are building toward multi-tenant enterprise deployments, but the starting point is getting your own environment up and running. Expect rough edges. Bring your agent.

## Quickstart

### Prerequisites

- **Docker** — Docker Desktop (or a Docker daemon) must be running.

### Install

**Binary (recommended):**

```bash
curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
```

**From PyPI (requires [uv](https://docs.astral.sh/uv/)):**

```bash
uv tool install -U openshell
```

Both methods install the latest stable release by default. To install a specific version, set `OPENSHELL_VERSION` (binary) or pin the version with `uv tool install openshell==<version>`. A [`dev` release](https://github.com/NVIDIA/OpenShell/releases/tag/dev) is also available that tracks the latest commit on `main`.

### Create a sandbox

```bash
openshell sandbox create -- claude  # or opencode, codex, copilot
```

A gateway is created automatically on first use. To deploy on a remote host instead, pass `--remote user@host` to the create command.

The sandbox container includes the following tools by default:

| Category   | Tools                                                    |
| ---------- | -------------------------------------------------------- |
| Agent      | `claude`, `opencode`, `codex`, `copilot`                 |
| Language   | `python` (3.13), `node` (22)                             |
| Developer  | `gh`, `git`, `vim`, `nano`                               |
| Networking | `ping`, `dig`, `nslookup`, `nc`, `traceroute`, `netstat` |

For more details see https://github.com/NVIDIA/OpenShell-Community/tree/main/sandboxes/base.

### See network policy in action

Every sandbox starts with **minimal outbound access**. You open additional access with a short YAML policy that the proxy enforces at the HTTP method and path level, without restarting anything.

```bash
# 1. Create a sandbox (starts with minimal outbound access)
openshell sandbox create

# 2. Inside the sandbox — blocked
sandbox$ curl -sS https://api.github.com/zen
curl: (56) Received HTTP code 403 from proxy after CONNECT

# 3. Back on the host — apply a read-only GitHub API policy
sandbox$ exit
openshell policy set demo --policy examples/sandbox-policy-quickstart/policy.yaml --wait

# 4. Reconnect — GET allowed, POST blocked by L7
openshell sandbox connect demo
sandbox$ curl -sS https://api.github.com/zen
Anything added dilutes everything else.

sandbox$ curl -sS -X POST https://api.github.com/repos/octocat/hello-world/issues -d '{"title":"oops"}'
{"error":"policy_denied","detail":"POST /repos/octocat/hello-world/issues not permitted by policy"}
```

See the [full walkthrough](examples/sandbox-policy-quickstart/) or run the automated demo:

```bash
bash examples/sandbox-policy-quickstart/demo.sh
```

## How It Works

OpenShell isolates each sandbox in its own container with policy-enforced egress routing. A lightweight gateway coordinates sandbox lifecycle, and every outbound connection is intercepted by the policy engine, which does one of three things:

- **Allows** — the destination and binary match a policy block.
- **Routes for inference** — strips caller credentials, injects backend credentials, and forwards to the managed model.
- **Denies** — blocks the request and logs it.

| Component          | Role                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **Gateway**        | Control-plane API that coordinates sandbox lifecycle and acts as the auth boundary.          |
| **Sandbox**        | Isolated runtime with container supervision and policy-enforced egress routing.              |
| **Policy Engine**  | Enforces filesystem, network, and process constraints from application layer down to kernel. |
| **Privacy Router** | Privacy-aware LLM routing that keeps sensitive context on sandbox compute.                   |

Under the hood, all these components run as a [K3s](https://k3s.io/) Kubernetes cluster inside a single Docker container — no separate K8s install required. The `openshell gateway` commands take care of provisioning the container and cluster.

## Protection Layers

OpenShell applies defense in depth across four policy domains:

| Layer      | What it protects                                    | When it applies             |
| ---------- | --------------------------------------------------- | --------------------------- |
| Filesystem | Prevents reads/writes outside allowed paths.        | Locked at sandbox creation. |
| Network    | Blocks unauthorized outbound connections.           | Hot-reloadable at runtime.  |
| Process    | Blocks privilege escalation and dangerous syscalls. | Locked at sandbox creation. |
| Inference  | Reroutes model API calls to controlled backends.    | Hot-reloadable at runtime.  |

Policies are declarative YAML files. Static sections (filesystem, process) are locked at creation; dynamic sections (network, inference) can be hot-reloaded on a running sandbox with `openshell policy set`.

## Providers

Agents need credentials — API keys, tokens, service accounts. OpenShell manages these as **providers**: named credential bundles that are injected into sandboxes at creation. The CLI auto-discovers credentials for recognized agents (Claude, Codex, OpenCode, Copilot) from your shell environment, or you can create providers explicitly with `openshell provider create`. Credentials never leak into the sandbox filesystem; they are injected as environment variables at runtime.

## GPU Support (Experimental)

> **Experimental** — GPU passthrough works on supported hosts but is under active development. Expect rough edges and breaking changes.

OpenShell can pass host GPUs into sandboxes for local inference, fine-tuning, or any GPU workload. Add `--gpu` when creating a sandbox:

```bash
openshell sandbox create --gpu --from [gpu-enabled-sandbox] -- claude
```

The CLI auto-bootstraps a GPU-enabled gateway on first use. GPU intent is also inferred automatically for community images with `gpu` in the name.

**Requirements:** NVIDIA drivers and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) must be installed on the host. The sandbox image itself must include the appropriate GPU drivers and libraries for your workload — the default `base` image does not. See the [BYOC example](https://github.com/NVIDIA/OpenShell/tree/main/examples/bring-your-own-container) for building a custom sandbox image with GPU support.

## Supported Agents

| Agent                                                         | Source                                                                           | Notes                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | [`base`](https://github.com/NVIDIA/OpenShell-Community/tree/main/sandboxes/base) | Works out of the box. Provider uses `ANTHROPIC_API_KEY`.                      |
| [OpenCode](https://opencode.ai/)                              | [`base`](https://github.com/NVIDIA/OpenShell-Community/tree/main/sandboxes/base) | Works out of the box. Provider uses `OPENAI_API_KEY` or `OPENROUTER_API_KEY`. |
| [Codex](https://developers.openai.com/codex)                  | [`base`](https://github.com/NVIDIA/OpenShell-Community/tree/main/sandboxes/base) | Works out of the box. Provider uses `OPENAI_API_KEY`.                         |
| [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) | [`base`](https://github.com/NVIDIA/OpenShell-Community/tree/main/sandboxes/base) | Works out of the box. Provider uses `GITHUB_TOKEN` or `COPILOT_GITHUB_TOKEN`. |
| [OpenClaw](https://openclaw.ai/)                              | [Community](https://github.com/NVIDIA/OpenShell-Community)                       | Launch with `openshell sandbox create --from openclaw`.                       |
| [Ollama](https://ollama.com/)                                 | [Community](https://github.com/NVIDIA/OpenShell-Community)                       | Launch with `openshell sandbox create --from ollama`.                         |

## Key Commands

| Command                                                    | Description                                     |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `openshell sandbox create -- <agent>`                      | Create a sandbox and launch an agent.           |
| `openshell sandbox connect [name]`                         | SSH into a running sandbox.                     |
| `openshell sandbox list`                                   | List all sandboxes.                             |
| `openshell provider create --type [type]] --from-existing` | Create a credential provider from env vars.     |
| `openshell policy set <name> --policy file.yaml`           | Apply or update a policy on a running sandbox.  |
| `openshell policy get <name>`                              | Show the active policy.                         |
| `openshell inference set --provider <p> --model <m>`       | Configure the `inference.local` endpoint.       |
| `openshell logs [name] --tail`                             | Stream sandbox logs.                            |
| `openshell term`                                           | Launch the real-time terminal UI for debugging. |

See the full [CLI reference](https://github.com/NVIDIA/OpenShell/blob/main/docs/reference/cli.md) for all commands, flags, and environment variables.

## Terminal UI

OpenShell includes a real-time terminal dashboard for monitoring gateways, sandboxes, and providers — inspired by [k9s](https://k9scli.io/).

```bash
openshell term
```

<p align="center">
  <img src="docs/assets/openshell-terminal.png" alt="OpenShell Terminal UI">
</p>

The TUI gives you a live, keyboard-driven view of your cluster. Navigate with `Tab` to switch panels, `j`/`k` to move through lists, `Enter` to select, and `:` for command mode. Cluster health and sandbox status auto-refresh every two seconds.

## Community Sandboxes and BYOC

Use `--from` to create sandboxes from the [OpenShell Community](https://github.com/NVIDIA/OpenShell-Community) catalog, a local directory, or a container image:

```bash
openshell sandbox create --from openclaw           # community catalog
openshell sandbox create --from ./my-sandbox-dir   # local Dockerfile
openshell sandbox create --from registry.io/img:v1 # container image
```

See the [community sandboxes](https://github.com/NVIDIA/OpenShell/blob/main/docs/sandboxes/community-sandboxes.md) catalog and the [BYOC example](https://github.com/NVIDIA/OpenShell/tree/main/examples/bring-your-own-container) for details.

## Explore with Your Agent

Clone the repo and point your coding agent at it. The project includes agent skills that can answer questions, walk you through workflows, and diagnose problems — no issue filing required.

```bash
git clone https://github.com/NVIDIA/OpenShell.git   # or git@github.com:NVIDIA/OpenShell.git
cd OpenShell
# Point your agent here — it will discover the skills in .agents/skills/ automatically
```

Your agent can load skills for CLI usage (`openshell-cli`), cluster troubleshooting (`debug-openshell-cluster`), inference troubleshooting (`debug-inference`), policy generation (`generate-sandbox-policy`), and more. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full skills table.

## Built With Agents

OpenShell is developed using the same agent-driven workflows it enables. The `.agents/skills/` directory contains workflow automation that powers the project's development cycle:

- **Spike and build:** Investigate a problem with `create-spike`, then implement it with `build-from-issue` once a human approves.
- **Triage and route:** Community issues are assessed with `triage-issue`, classified, and routed into the spike-build pipeline.
- **Security review:** `review-security-issue` produces a severity assessment and remediation plan. `fix-security-issue` implements it.
- **Policy authoring:** `generate-sandbox-policy` creates YAML policies from plain-language requirements or API documentation.

All implementation work is human-gated — agents propose plans, humans approve, agents build. See [AGENTS.md](AGENTS.md) for the full workflow chain documentation.

## NemoClaw Blueprint

This repository includes the **NemoClaw Blueprint** — the orchestration layer that configures OpenClaw agents inside OpenShell sandboxes with pre-built policy presets for popular integrations.

### GUI Dashboard

NemoClaw includes a full web-based dashboard that provides visual access to every CLI function. The dashboard runs as a Docker container and connects to the same `bin/lib` orchestration layer used by the CLI.

**Quick Start:**

```bash
# Start the dashboard (Docker)
docker compose up --build -d

# Or start directly with Node.js
cd gui && npm install && npm start
```

The dashboard is accessible at `http://localhost:3000` (or your LAN IP).

**Dashboard Pages:**

| Page | URL | Description |
| --- | --- | --- |
| Dashboard | `#/` | Sandbox card grid with live status, system health stats |
| Onboard | `#/onboard` | 5-step wizard: preflight → provider → credentials → model → create |
| Sandbox Detail | `#/sandbox/:name` | Status, logs, policy, workspace tabs for a single sandbox |
| Policies | `#/policies` | Toggle preset grid, baseline viewer, merge preview, validation |
| Inference | `#/inference` | Provider catalogue, credential vault, switch active provider |
| Workspace | `#/workspace` | Edit SOUL.md, USER.md, IDENTITY.md, AGENTS.md, MEMORY.md |
| Monitoring | `#/monitoring` | Live log streaming, network activity, operator approval queue |
| Deploy | `#/deploy` | Remote GPU deployment, Telegram bridge configuration |

**REST API:**

All GUI functions are also available as REST endpoints:

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/sandboxes` | GET | List all registered sandboxes |
| `/api/sandboxes` | POST | Create a new sandbox |
| `/api/sandboxes/:name` | GET | Sandbox detail with live status |
| `/api/sandboxes/:name` | DELETE | Destroy a sandbox |
| `/api/sandboxes/:name/logs` | GET (SSE) | Real-time log streaming |
| `/api/policies/presets` | GET | List available policy presets |
| `/api/policies/apply` | POST | Apply presets to a sandbox |
| `/api/policies/baseline` | GET | Get full baseline policy |
| `/api/policies/validate` | POST | Validate all policy files |
| `/api/inference/providers` | GET | Provider catalogue |
| `/api/inference/switch` | POST | Switch active inference provider |
| `/api/inference/credentials` | GET/POST | Manage credential vault |
| `/api/workspace/:sandbox/files` | GET | List workspace files |
| `/api/workspace/:sandbox/backup` | POST | Create workspace backup |
| `/api/system/preflight` | GET | Docker, OpenShell, port checks |
| `/api/system/health` | GET | System health status |

The `nemoclaw` CLI is the primary user-facing tool for sandbox lifecycle management.

```bash
# Onboard a new sandbox (interactive wizard)
nemoclaw onboard

# List registered sandboxes
nemoclaw list

# Connect to a sandbox
nemoclaw my-assistant connect

# Show sandbox status (supports --json for machine-readable output)
nemoclaw my-assistant status
nemoclaw my-assistant status --json

# Stream sandbox logs
nemoclaw my-assistant logs --follow

# Add policy presets to a running sandbox
nemoclaw my-assistant policy-add discord telegram

# List active and available policies
nemoclaw my-assistant policy-list

# Destroy a sandbox
nemoclaw my-assistant destroy

# Deploy to a remote GPU instance
nemoclaw deploy my-gpu-box
```

### Onboarding

The `nemoclaw onboard` wizard walks through:
1. **Preflight checks** — Docker, OpenShell CLI, port availability
2. **Provider selection** — NVIDIA, OpenAI, Anthropic, Gemini, Ollama, or custom endpoint
3. **Credential validation** — test API key against provider endpoint
4. **Model selection** — pick or accept the default model
5. **Sandbox creation** — create sandbox, apply baseline policy, configure inference route

### Policy Presets

Policy presets are curated network policies for common services. They define exactly which hosts, ports, HTTP methods, and URL paths are allowed — no more, no less.

| Preset | Description | Key Configuration |
| --- | --- | --- |
| `discord` | Discord API, gateway, CDN | WebSocket gateway uses CONNECT tunnel (`access: full`) |
| `telegram` | Telegram Bot API | REST with bot-scoped path rules |
| `slack` | Slack API, Socket Mode, webhooks | Socket Mode uses CONNECT tunnel |
| `docker` | Docker Hub, NVIDIA registry | Registry auth + pull/push |
| `pypi` | Python Package Index | Full access for pip/uv |
| `npm` | npm and Yarn registries | Full access for node tooling |
| `jira` | Jira and Atlassian Cloud | REST API + auth |
| `outlook` | Microsoft Graph + Outlook | Graph API + OAuth |
| `huggingface` | Hugging Face Hub, LFS, Inference | Hub + CDN + inference API |

### Managing Policies

```bash
# Via nemoclaw CLI (recommended)
nemoclaw my-assistant policy-add discord telegram
nemoclaw my-assistant policy-list

# Via manage-policies.js (advanced)
node bin/manage-policies.js list
node bin/manage-policies.js show discord
node bin/manage-policies.js validate
node bin/manage-policies.js merge discord slack
node bin/manage-policies.js apply <sandbox-name> discord telegram
```

### Workspace Backup & Restore

Workspace files (SOUL.md, USER.md, IDENTITY.md, AGENTS.md, MEMORY.md) persist across sandbox restarts but are permanently deleted when you run `nemoclaw <name> destroy`. Use the backup script to save and restore workspace state:

```bash
# Backup workspace
./scripts/backup-workspace.sh backup my-assistant

# Restore from most recent backup
./scripts/backup-workspace.sh restore my-assistant

# Restore from a specific timestamp
./scripts/backup-workspace.sh restore my-assistant 20260320-120000

# List available backups
./scripts/backup-workspace.sh list
```

Backups are saved to `~/.nemoclaw/backups/<sandbox>/<timestamp>/`.

### Interactive Walkthrough

Launch a split tmux session to see the sandbox and policy enforcement in action:

```bash
./scripts/walkthrough.sh my-assistant
```

This opens the OpenShell TUI (monitoring) on the left and an agent session on the right, demonstrating deny-by-default policy enforcement and operator approval flows.

### Policy Files

- **Baseline policy:** `nemoclaw-blueprint/policies/openclaw-sandbox.yaml` — deny-all with pre-approved endpoint groups
- **Presets:** `nemoclaw-blueprint/policies/presets/*.yaml` — per-integration additive policies
- **Blueprint:** `nemoclaw-blueprint/blueprint.yaml` — sandbox image, inference profiles, policy base

> **WebSocket Note:** Services that use WebSocket connections (Discord gateway, Slack Socket Mode) must use `access: full` (CONNECT tunnel) instead of `protocol: rest`. The proxy's HTTP idle timeout (~2 min) kills long-lived WebSocket connections; a CONNECT tunnel bypasses HTTP-level timeouts entirely.

## Getting Help

- **Questions and discussion:** [GitHub Discussions](https://github.com/NVIDIA/OpenShell/discussions)
- **Bug reports:** [GitHub Issues](https://github.com/NVIDIA/OpenShell/issues) — use the bug report template
- **Security vulnerabilities:** See [SECURITY.md](SECURITY.md) — do not use GitHub Issues
- **Agent-assisted help:** Clone the repo and use the agent skills in `.agents/skills/` for self-service diagnostics

## Learn More

- [Full Documentation](https://docs.nvidia.com/openshell/latest/index.html) — overview, architecture, tutorials, and reference
- [Quickstart](https://github.com/NVIDIA/OpenShell/blob/main/docs/get-started/quickstart.md) — detailed install and first sandbox walkthrough
- [GitHub Sandbox Tutorial](https://github.com/NVIDIA/OpenShell/blob/main/docs/tutorials/github-sandbox.md) — end-to-end scoped GitHub repo access
- [Architecture](https://github.com/NVIDIA/OpenShell/tree/main/architecture) — detailed architecture docs and design decisions
- [Support Matrix](https://github.com/NVIDIA/OpenShell/blob/main/docs/reference/support-matrix.md) — platforms, versions, and kernel requirements
- [Brev Launchable](https://brev.nvidia.com/launchable/deploy/now?launchableID=env-3Ap3tL55zq4a8kew1AuW0FpSLsg) — try OpenShell on cloud compute without local setup
- [Agent Instructions](AGENTS.md) — system prompt and workflow documentation for agent contributors

## Contributing

OpenShell is built agent-first — your agent is your first collaborator. Before opening issues or submitting code, point your agent at the repo and let it use the skills in `.agents/skills/` to investigate, diagnose, and prototype. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full agent skills table, contribution workflow, and development setup.

## License

This project is licensed under the [Apache License 2.0](https://github.com/NVIDIA/OpenShell/blob/main/LICENSE).
