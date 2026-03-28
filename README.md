# NemoClaw — AI Agent Sandbox Management Platform

<!-- start-badges -->
[![License](https://img.shields.io/badge/License-Apache_2.0-blue)](LICENSE)
[![Project Status](https://img.shields.io/badge/status-alpha-orange)](docs/about/release-notes.md)
<!-- end-badges -->

<!-- start-intro -->
NemoClaw is a web-based management platform for running sandboxed AI agents with policy-enforced security, multi-provider inference routing, and real-time monitoring. It provides a modern dashboard for deploying, managing, and chatting with AI agents running inside isolated [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) sandboxes.
<!-- end-intro -->

> **Origins**
>
> NemoClaw is built on [NVIDIA's NemoClaw](https://github.com/NVIDIA/NemoClaw), an open source reference stack for running [OpenClaw](https://openclaw.ai) agents safely inside OpenShell sandboxes. We've extended the original CLI-based tool into a full GUI-driven management platform with native gRPC integration, multi-provider inference, and a comprehensive web dashboard — while preserving the core sandbox security model that NVIDIA designed.

> **Alpha software**
>
> NemoClaw is in active development. Interfaces, APIs, and behavior may change without notice.

---

## Quick Start

### Prerequisites

| Dependency | Version |
|------------|---------|
| Linux | Ubuntu 22.04 LTS or later |
| Node.js | 20 or later |
| npm | 10 or later |
| Docker | Installed and running |
| [OpenShell](https://github.com/NVIDIA/OpenShell) | Installed |

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 vCPU | 4+ vCPU |
| RAM | 8 GB | 16 GB |
| Disk | 20 GB free | 40 GB free |

### Install and Launch

```bash
# Clone the repository
git clone https://github.com/<your-org>/NemoClaw.git
cd NemoClaw

# Install CLI globally
npm install -g .

# Launch the web dashboard
nemoclaw gui
```

The dashboard opens at `http://localhost:3000`. Use the **Onboard Wizard** to deploy your first sandboxed agent — no CLI commands required.

### Onboard Your First Agent

1. Open the dashboard and click **Onboard** in the sidebar.
2. Select an inference provider (NVIDIA Cloud, OpenRouter, Ollama, Gemini, vLLM, or NIM Local).
3. Enter your API key — it's stored in the credential vault and auto-filled on future deploys.
4. Name your sandbox and click **Deploy**.
5. Watch real-time deployment progress via SSE-streamed updates.

Once deployed, use the **Agent Chat** page (under Claws in the sidebar) to start chatting with your claw. Every response shows a **🔒 Sandboxed** or **⚠ Bypassed** badge so you can verify policy enforcement.

### CLI Quick Start

If you prefer the command line:

```bash
# Interactive setup wizard
nemoclaw onboard

# Connect to a running sandbox
nemoclaw my-assistant connect

# Check sandbox status
nemoclaw my-assistant status
```

Every command supports `--help`. Commands like `list`, `status`, and `policy-list` accept `--json` for scripted consumption.

<!-- start-quickstart-guide -->

### Uninstall

To remove NemoClaw and all resources:

```bash
nemoclaw uninstall
```

| Flag | Effect |
|--------------------|-----------------------------------------------------|
| `--yes` | Skip the confirmation prompt. |
| `--keep-openshell` | Leave the `openshell` binary installed. |
| `--delete-models` | Also remove NemoClaw-pulled Ollama models. |

<!-- end-quickstart-guide -->

---

## Architecture

NemoClaw communicates with the OpenShell gateway **exclusively via gRPC and HTTP** — the dashboard backend contains **zero CLI subprocess calls**. All sandbox lifecycle, inference routing, provider management, policy updates, log streaming, and agent execution use the same protobuf APIs that the gateway exposes.

```
┌─────────────────────────────────────────────────┐
│  Web Dashboard (React + Vite)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Onboard  │ │ Sandbox  │ │ Agent Chat       │ │
│  │ Wizard   │ │ Manager  │ │ Policy Editor    │ │
│  │ Log View │ │ Inference│ │ Denial Dashboard │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└──────────────────┬──────────────────────────────┘
                   │ REST / WebSocket / SSE
┌──────────────────▼──────────────────────────────┐
│  Express Backend (Node.js)                      │
│  ┌──────────────┐ ┌────────────┐ ┌────────────┐ │
│  │ grpcClient.js│ │ gateway    │ │ docker     │ │
│  │ (mTLS)       │ │ Health.js  │ │ Gateway.js │ │
│  └──────┬───────┘ └──────┬─────┘ └──────┬─────┘ │
└─────────┼────────────────┼──────────────┼───────┘
          │ gRPC (mTLS)    │ Health RPC   │ Unix socket
┌─────────▼────────────────▼──────────────▼───────┐
│  OpenShell Gateway                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Sandbox  │ │ Inference│ │ Policy           │ │
│  │ Manager  │ │ Router   │ │ Enforcer         │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Native gRPC Integration

| Operation | gRPC RPC | Description |
|-----------|----------|-------------|
| **Sandbox create** | `CreateSandbox` | Create sandboxes with typed `SandboxSpec` protobuf messages |
| **Sandbox delete** | `DeleteSandbox` | Clean sandbox teardown by name |
| **Sandbox list/get** | `ListSandboxes` / `GetSandbox` | Structured sandbox state with phase, conditions, and policy version |
| **Watch streams** | `WatchSandbox` (server-streaming) | Real-time status, logs, and events for deployment progress and log viewers |
| **Agent chat** | `ExecSandbox` + `inference.local` | Executes `curl` inside the sandbox targeting `inference.local`, which the sandbox proxy intercepts and routes through the embedded `openshell-router`. Auth and model are rewritten automatically. Falls back to direct LLM proxy with warning if ExecSandbox fails. |
| **Health checks** | gRPC `Health` + HTTP `/readyz` | Gateway liveness and readiness with version info |
| **Inference config** | `SetClusterInference` / `GetClusterInference` | Cluster-level inference routing (provider + model) |
| **Provider CRUD** | `CreateProvider` / `UpdateProvider` / `DeleteProvider` / `ListProviders` | Inference provider credential management |
| **Policy management** | `UpdateConfig` / `GetSandboxConfig` | Sandbox and global policy updates |
| **Draft policy** | `GetDraftPolicy` / `ApproveDraftChunk` / `RejectDraftChunk` | Automated policy recommendations from denial analysis |
| **Authentication** | mTLS | Client certificates from `~/.config/openshell/clusters/<name>/mtls/` |

### Backend Components

| Component | Purpose |
|-----------|---------|
| **`lib/grpcClient.js`** | Persistent gRPC channel with mTLS, typed async wrappers for all RPCs, provider type mapping, config key mapping, and idempotent deployment helpers |
| **`lib/gatewayHealth.js`** | Health monitoring via gRPC Health RPC and HTTP `/readyz` endpoint |
| **`services/dockerGateway.js`** | Direct Docker Engine API over Unix socket for container lifecycle (start/stop/inspect) |
| **`routes/claws.js`** | Claw lifecycle routes with gRPC `CreateSandbox` + `WatchSandbox` for SSE-streamed deployment |
| **`services/clawManager.js`** | Claw registry with gRPC-backed sandbox status enrichment and startup sync |
| **`server/proto/`** | OpenShell protobuf definitions (`openshell.proto`, `inference.proto`, `datamodel.proto`, `sandbox.proto`) |

---

## Inference

Inference requests from the agent never leave the sandbox directly. OpenShell intercepts every call and routes it to the configured provider.

| Provider | Model | Use Case |
|----------|-------|----------|
| NVIDIA Cloud | `nvidia/nemotron-3-super-120b-a12b` | Production. Requires an NVIDIA API key from [build.nvidia.com](https://build.nvidia.com). |
| Ollama | `llama3.3:latest`, etc. | Local or remote Ollama server. |
| OpenRouter | `google/gemini-3-flash-preview`, etc. | 200+ models via [openrouter.ai](https://openrouter.ai). Requires an API key. |
| Google Gemini | Gemini models | Direct Google AI access. Requires an API key. |
| vLLM | Auto-detected | High-performance local inference server. |
| NIM Local | `nvidia/nemotron-3-nano-30b-a3b` | On-premise NVIDIA NIM container. |

Configure providers through the **Inference Config** page in the dashboard, or during onboarding. API keys are persisted to a per-provider **credential vault** (`~/.nemoclaw/credentials.json`) — configure each provider's key once and all future deploys auto-fill from the vault.

---

## Protection Layers

The sandbox starts with a default policy that controls network egress and filesystem access:

| Layer | What it protects | When it applies |
|------------|-----------------------------------------------------|----------------------------|
| Network | Blocks unauthorized outbound connections. | Hot-reloadable at runtime. |
| Filesystem | Prevents reads/writes outside `/sandbox` and `/tmp`. | Locked at sandbox creation. |
| Process | Blocks privilege escalation and dangerous syscalls. | Locked at sandbox creation. |
| Inference | Reroutes model API calls to controlled backends. | Hot-reloadable at runtime. |

When the agent tries to reach an unlisted host, OpenShell blocks the request and surfaces it for operator approval.

---

## Configuring Sandbox Policy

The sandbox policy is defined in declarative YAML and enforced by the OpenShell runtime. NemoClaw ships a default policy that denies all network egress except explicitly listed endpoints.

Operators can customize the policy in two ways:

| Method | How | Scope |
|--------|-----|-------|
| **Dashboard** | Use the Policy Editor to view, apply, and edit YAML policies with OPA validation | Persists per sandbox |
| **Static** | Edit `openclaw-sandbox.yaml` and re-deploy | Persists across restarts |

NemoClaw includes preset policy files for common integrations such as PyPI, Docker Hub, Slack, and Jira in `nemoclaw-blueprint/policies/presets/`.

The **Denial Dashboard** surfaces AI-recommended policy changes from automated denial analysis. Review, approve, or reject draft policy chunks with confidence scores, rationale, and security notes.

---

## Extensions

NemoClaw includes a built-in **Extensions Catalog** for installing integrations into sandboxes. Extensions combine network policy presets, optional credential configuration, and optional in-sandbox package installation — all managed through the dashboard.

### Available Extensions

| Extension | Category | Requires Key | Installs Packages |
|-----------|----------|:------------:|:------------------:|
| Discord | Messaging | ✅ `DISCORD_BOT_TOKEN` | `discord.py` |
| Telegram | Messaging | ✅ `TELEGRAM_BOT_TOKEN` | `python-telegram-bot` |
| Slack | Messaging | ✅ `SLACK_BOT_TOKEN` | `slack-sdk` |
| Docker Hub | Dev Tools | — | — |
| Hugging Face | Dev Tools | ✅ `HF_TOKEN` | `huggingface-hub` |
| Jira | Productivity | ✅ `JIRA_API_TOKEN` | — |
| npm | Registry | — | — |
| PyPI | Registry | — | — |
| Outlook | Productivity | ✅ `MS_GRAPH_TOKEN` | — |

### How It Works

1. Open the **🧩 Extensions** page in the sidebar.
2. Select a target sandbox from the dropdown.
3. Browse extensions by category (Messaging, Dev Tools, Registries, Productivity).
4. Click **Install** — NemoClaw will:
   - Apply the network policy preset (allowing sandbox egress to the service's API)
   - Prompt for credentials if required (optional — can be skipped)
   - Securely inject the bot token into the daemon's environment and natively enable the channel via gRPC `UpdateConfig` calls — this persists across agent sessions.
   - Attempt to install packages via `ExecSandbox` — failures are reported as **advisory warnings** only; the extension is still considered installed if policy and credential steps succeed
5. To remove an extension, click **Uninstall** — the network policy is removed.

> **After install**: The configuration is persistently managed by the backend and synced via gRPC so the channel configuration remains active across restarts. No manual reconfiguration needed.

### Syncing an Already-Installed Extension

If a sandbox was set up before this mechanism was added, or if the gateway needs reconnecting, use the **sync-channel** API:

```bash
curl -X POST http://localhost:3000/api/extensions/sync-channel \
  -H 'Content-Type: application/json' \
  -d '{"extensionId":"discord","sandboxName":"<your-claw-name>"}'
```

This re-injects the stored bot token and restarts the gateway inside the sandbox so the new channel config takes effect.

### Adding Custom Extensions

Add entries to `nemoclaw-blueprint/extensions/registry.json` with the following fields:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `name` | Display name |
| `description` | Short description |
| `icon` | Emoji icon |
| `category` | `messaging`, `devtools`, `registry`, or `productivity` |
| `policyPreset` | Name of the YAML preset in `policies/presets/` |
| `credentialKey` | Env var name for the API token (or `null`) |
| `installCommands` | Array of shell commands to run inside the sandbox |

---

## Web Dashboard

NemoClaw's primary interface is a modern web dashboard for managing every aspect of the platform.

### Launch the Dashboard

```bash
nemoclaw gui
```

Opens at `http://localhost:3000`. Use `--port` to specify a different port.

### Dashboard Features

> **All operations are fully GUI-driven** — no CLI commands required.

| Feature | Description |
|---------|-------------|
| **Dashboard** | Sandbox overview with real-time health status, quick actions, and gateway Start/Stop control. A global gateway banner appears on every page when the gateway is offline. |
| **🐾 Claw Management** | Create, monitor, reconnect, and destroy multiple claw instances independently under one gateway |
| **Onboard Wizard** | Step-by-step GUI that deploys sandboxes via gRPC `CreateSandbox` + `WatchSandbox` with SSE-streamed progress. Provider and inference configuration saved locally for resilience. |
| **Sandbox Manager** | List, inspect, start/stop, and destroy sandboxes with confirmation dialog and live status badges |
| **💬 Claw Agent Chat** | Claw-centric chat interface routed through the sandbox via `ExecSandbox` gRPC. Workspace files (`SOUL.md`, `IDENTITY.md`, `USER.md`) and extension capabilities are injected into the system prompt. Every response displays a **🔒 Sandboxed** badge showing whether inference was policy-constrained. Also parses and visually displays the agent's internal reasoning/thinking process. |
| **Log Viewer** | Real-time log streaming via gRPC `WatchSandbox` with source and level filtering |
| **Policy Editor** | View, apply, and remove security policy presets per sandbox. Includes YAML editor with OPA rule validation. |
| **Inference Config** | Visual provider selection with persistent config, save/load, and test connection. API keys persisted to credential vault. |
| **⚖️ Denial Dashboard** | AI-recommended policy changes from denial analysis. Review, approve, or reject draft policy chunks with confidence scores and decision history. |
| **🛡️ Exec Approvals** | Real-time approve/deny queue for agent network/exec requests. Connects via WebSocket proxy to the OpenClaw gateway for live push notifications. |
| **⚡ Skills** | View all installed agent tools/skills with version, category, and requirements status. Click any skill to inspect its full configuration. |
| **🧩 Plugins** | Install (npm/path), enable/disable, and remove plugin packages from running sandboxes. |
| **🧠 Memory Search** | Full-text search over agent memory files with relevance scores. Trigger reindex on demand. |
| **⏰ Cron Scheduler** | Create, view, and delete scheduled agent tasks with cron expressions. Shows next/last run times. |
| **🔀 Gateway Lifecycle** | Dedicated gateway page with Start/Stop/Restart controls, container details, and health monitoring. Live health indicator in sidebar. |
| **🐳 Container Images** | Build custom sandbox images from Dockerfiles with real-time SSE-streamed build output. |
| **Port Manager** | Interactive port management with inline editing, save/reset, auto-resolve, and source tracking |
| **🧩 Extensions** | Browse and install integrations (Discord, Telegram, Slack, etc.) onto sandboxes with network policy, credential, and package management |
| **🔔 Live Updates** | WebSocket-powered real-time sandbox and claw status changes pushed to the dashboard |
| **📱 Responsive Design** | Fully responsive layout usable on phones, tablets, and desktops |

### Multi-Claw Management

NemoClaw supports running **multiple independent claw instances** under a single OpenShell gateway. Each claw has its own inference configuration, lifecycle, and monitoring.

| Concept | Description |
|---------|-------------|
| **Claw** | A named sandbox instance tracked by NemoClaw with its own config and lifecycle |
| **Gateway** | The OpenShell gateway that hosts one or more claws |
| **Registry** | Local metadata store (`~/.nemoclaw/claws.json`) that tracks claw config and state |
| **Sync** | Discovery process that cross-references the registry with live sandbox state |

#### Dashboard Claw Pages

| Page | Route | Description |
|------|-------|-------------|
| **All Claws** | `/claws` | Card grid with status badges, filtering, sync, and quick actions |
| **New Claw** | `/claws/new` | Deploy form with gateway selector, provider picker, and SSE-streamed progress |
| **Claw Detail** | `/claws/:id` | Six-tab detail view: Overview, Chat, Monitor, Logs, Config, Policy |

### API Endpoints

#### Claw Lifecycle

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/claws` | List all registered claws |
| `POST` | `/api/claws` | Create a new claw (SSE-streamed deployment) |
| `GET` | `/api/claws/:id` | Get a specific claw |
| `GET` | `/api/claws/:id/status` | Get claw status with sandbox cross-reference |
| `POST` | `/api/claws/:id/reconnect` | Reconnect to a running claw |
| `PUT` | `/api/claws/:id/config` | Update claw inference configuration |
| `DELETE` | `/api/claws/:id` | Destroy a claw |
| `POST` | `/api/claws/sync` | Sync registry with live sandbox state |
| `GET` | `/api/claws/gateways` | List available gateways |

#### Providers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/providers` | List all inference providers |
| `POST` | `/api/providers` | Create a new provider |
| `GET` | `/api/providers/:name` | Get a specific provider |
| `PUT` | `/api/providers/:name` | Update a provider |
| `DELETE` | `/api/providers/:name` | Delete a provider |

#### Gateway Lifecycle

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/gateway/status` | Gateway container status via Docker API |
| `POST` | `/api/gateway/start` | Start the gateway container |
| `POST` | `/api/gateway/stop` | Stop the gateway container |

#### Custom Image Builder

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/images` | List local container images |
| `POST` | `/api/images/build` | Build custom image (SSE-streamed output) |
| `DELETE` | `/api/images/:tag` | Remove a container image |

#### Policy Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/policies/:sandbox/config` | Get sandbox policy as YAML |
| `PUT` | `/api/policies/:sandbox/config` | Validate and apply policy from YAML |
| `POST` | `/api/policies/validate` | OPA rule validation (dry-run) |
| `GET` | `/api/policies/:sandbox/drafts` | Get pending draft policy chunks |
| `POST` | `/api/policies/drafts/approve` | Approve a draft chunk |
| `POST` | `/api/policies/drafts/reject` | Reject a draft chunk |
| `GET` | `/api/policies/:sandbox/drafts/history` | Decision history timeline |

#### Extensions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/extensions` | List all extensions with install status per sandbox |
| `GET` | `/api/extensions/:id` | Get a specific extension |
| `POST` | `/api/extensions/install` | Install an extension on a sandbox |
| `POST` | `/api/extensions/uninstall` | Remove an extension from a sandbox |
| `POST` | `/api/extensions/sync-channel` | Re-inject a stored bot token into the sandbox environment via gRPC `UpdateConfig`. Body: `{extensionId, sandboxName}`. Useful for backfilling or reconnecting the channel after the sandbox was created. |

#### Inference Routing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inference/routes` | Resolved inference routes with credential status |

### WebSocket Live Updates

The dashboard uses a WebSocket connection (`/ws`) to receive real-time status updates:

- **Sandbox status** — create, destroy, and status transitions pushed automatically
- **Gateway health** — connection state monitored and broadcast to all clients
- **Auto-reconnect** — exponential backoff on connection drop
- **Visual feedback** — sandbox cards flash with a green glow on status changes

### OpenClaw Gateway WebSocket Proxy

The dashboard exposes a bidirectional WebSocket proxy at `/api/sandbox/:name/proxy` that tunnels raw WebSocket frames to the **OpenClaw gateway daemon** (`ws://127.0.0.1:18789`) running inside the sandbox, via `ExecSandbox` gRPC stdin/stdout.

- **Auto-start**: The proxy automatically starts `openclaw gateway` inside the sandbox if it isn't already running.
- **Live Approvals**: The `ApprovalsList` component connects via this proxy to receive push notifications of agent exec/network requests in real time.
- **Transport**: A Node.js HTTP-Upgrade bridge script (using only builtins, no deps) runs inside the container, piping raw TCP frames over gRPC's binary `stdin`/`stdout`.

### Sandbox API Proxy Routes

All OpenClaw gateway API endpoints are proxied through the NemoClaw server, tunnelling `curl` calls inside the sandbox via `ExecSandbox`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sandbox/:name/approvals` | List pending exec/network approval requests |
| `POST` | `/api/sandbox/:name/approvals/:id/approve` | Approve an exec request |
| `POST` | `/api/sandbox/:name/approvals/:id/deny` | Deny an exec request |
| `GET` | `/api/sandbox/:name/sessions` | List agent sessions |
| `DELETE` | `/api/sandbox/:name/sessions/:id` | Terminate a session |
| `GET` | `/api/sandbox/:name/agents` | List agents running in the sandbox |
| `GET` | `/api/sandbox/:name/skills` | List installed agent skills/tools |
| `GET` | `/api/sandbox/:name/skills/:name` | Inspect a specific skill |
| `GET` | `/api/sandbox/:name/plugins` | List installed plugins |
| `POST` | `/api/sandbox/:name/plugins/install` | Install a plugin from npm/path |
| `POST` | `/api/sandbox/:name/plugins/:name/enable` | Enable a plugin |
| `POST` | `/api/sandbox/:name/plugins/:name/disable` | Disable a plugin |
| `DELETE` | `/api/sandbox/:name/plugins/:name` | Remove a plugin |
| `GET` | `/api/sandbox/:name/memory/search?q=` | Full-text search over agent memory |
| `POST` | `/api/sandbox/:name/memory/reindex` | Trigger memory reindex |
| `GET` | `/api/sandbox/:name/cron` | List cron jobs |
| `POST` | `/api/sandbox/:name/cron` | Create a cron job |
| `DELETE` | `/api/sandbox/:name/cron/:id` | Delete a cron job |
| `GET/POST` | `/api/sandbox/:name/browser/:sub` | Pass-through to browser automation API |

### Responsive Design

| Breakpoint | Target | Key Adaptations |
|------------|--------|-----------------|
| ≤480px | Phone | Single-column layout, stacked controls, hamburger menu |
| ≤768px | Tablet | Sidebar overlay with backdrop, two-column stats |
| ≤1024px | Small desktop | Adjusted card grids and provider layouts |

### Build the Dashboard

```bash
cd gui && npm install && npm run build
```

---

## Port Configuration

Ports are resolved in order: **Environment variable** → **Config file** → **Default**.

The web dashboard includes a full port manager at `http://localhost:3000/ports` with inline editing, source badges, save/reset, auto-resolve, and validation.

### Environment Variables

| Variable | Default | Service |
|----------|---------|---------|
| `NEMOCLAW_GATEWAY_PORT` | 8080 | OpenShell Gateway |
| `NEMOCLAW_DASHBOARD_PORT` | 18789 | NemoClaw Dashboard |
| `NEMOCLAW_VLLM_PORT` | 8000 | vLLM Server |
| `NEMOCLAW_OLLAMA_PORT` | 11434 | Ollama Server |
| `NEMOCLAW_GUI_PORT` | 3000 | Web Dashboard |

---

## Key Commands

### Host Commands (`nemoclaw`)

| Command | Description |
|--------------------------------------|--------------------------------------------------------|
| `nemoclaw gui` | Launch the web dashboard (primary interface). |
| `nemoclaw onboard` | Interactive setup wizard: gateway, providers, sandbox. |
| `nemoclaw <name> connect` | Open an interactive shell inside the sandbox. |
| `nemoclaw <name> status` | Show sandbox status, health, and inference config. |
| `nemoclaw <name> logs [--follow]` | View or stream sandbox logs. |
| `nemoclaw <name> destroy` | Stop and delete the sandbox. |
| `nemoclaw list [--json]` | List all registered sandboxes. |
| `nemoclaw start` / `stop` / `status` | Manage auxiliary services. |
| `openshell term` | Launch the OpenShell TUI for monitoring and approvals. |

---

## Origins & Acknowledgements

NemoClaw is built on top of [NVIDIA's NemoClaw](https://github.com/NVIDIA/NemoClaw), an open source reference stack originally released in March 2026. The original project provided:

- The `nemoclaw` CLI and blueprint system for sandbox orchestration
- Integration with NVIDIA OpenShell for sandboxed agent execution
- NVIDIA Nemotron model support via build.nvidia.com
- Declarative network and filesystem policy enforcement

We've extended the original into a full management platform by:

- Replacing all CLI subprocess calls with native **gRPC and HTTP API** integration
- Building a comprehensive **web dashboard** with React and Vite
- Adding **multi-provider inference** support (OpenRouter, Gemini, Ollama, vLLM, NIM)
- Implementing **multi-claw management** for running independent agent instances
- Adding **agent chat** routed through sandbox `inference.local` via `ExecSandbox` gRPC for policy-constrained inference
- Building a **denial dashboard** for AI-recommended policy approval
- Adding **gateway lifecycle management** with Docker Engine API integration
- Implementing a **credential vault** for persistent API key management
- Adding **custom image building** with SSE-streamed output
- Building a **real-time monitoring** system with WebSocket live updates
- Implementing an **extensions catalog** for installing integrations (Discord, Telegram, Slack, etc.) with network policies, credentials, and in-sandbox packages
- Implementing a **bidirectional WebSocket proxy** tunnelling the React frontend to the OpenClaw gateway daemon via gRPC `ExecSandbox` stdin/stdout for real-time agent tool-use approvals
- Building **feature parity** with the upstream NemoClaw reference implementation: exec approvals, skills viewer, plugin manager, memory search, and cron scheduler — all backed by the sandboxed OpenClaw gateway API

The core sandbox security model — Landlock, seccomp, network namespace isolation, and policy-enforced egress — remains as NVIDIA designed it.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
## Workspace Configuration (Files Tab)
Each Claw has an isolated workspace containing key identity and configuration files (`SOUL.md`, `IDENTITY.md`, `USER.md`). The NemoClaw dashboard now includes a "Files" tab in the Claw details view, allowing you to directly read and update these configuration files. Changes are instantly synchronized to the sandbox environment.
