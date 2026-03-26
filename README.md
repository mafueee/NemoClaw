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
| **💬 Claw Agent Chat** | Claw-centric chat interface routed through the sandbox via `ExecSandbox` gRPC. Select a claw (not a raw sandbox) to chat with — the underlying sandbox name is resolved automatically. Every response displays a **🔒 Sandboxed** or **⚠ Bypassed** badge showing whether inference was policy-constrained. Falls back to direct LLM proxy with warning if transport fails. Also available as an embedded tab inside each Claw Detail page. |
| **Log Viewer** | Real-time log streaming via gRPC `WatchSandbox` with source and level filtering |
| **Policy Editor** | View, apply, and remove security policy presets per sandbox. Includes YAML editor with line numbers and OPA rule validation. |
| **Inference Config** | Visual provider selection with persistent config, save/load, and test connection. API keys persisted to a per-provider credential vault. Includes Routing Transparency panel. |
| **⚖️ Denial Dashboard** | AI-recommended policy changes from denial analysis. Review, approve, or reject draft policy chunks with confidence scores and decision history. |
| **🔀 Gateway Lifecycle** | Dedicated gateway page with Start/Stop/Restart controls, container details, and health monitoring. Live health indicator in sidebar. |
| **🐳 Container Images** | Build custom sandbox images from Dockerfiles with real-time SSE-streamed build output. |
| **Port Manager** | Interactive port management with inline editing, save/reset, auto-resolve, and source tracking |
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

The core sandbox security model — Landlock, seccomp, network namespace isolation, and policy-enforced egress — remains as NVIDIA designed it.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
