---
title:
  page: "NemoClaw Architecture — gRPC Backend, React Dashboard, and OpenShell Integration"
  nav: "Architecture"
description: "Technical reference for NemoClaw's gRPC-native backend, React dashboard, and OpenShell gateway integration."
keywords: ["nemoclaw architecture", "nemoclaw grpc backend dashboard"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "sandboxing", "grpc", "dashboard", "inference_routing"]
content:
  type: reference
  difficulty: intermediate
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Architecture

NemoClaw is composed of three main layers: a React dashboard (built with Vite), an Express backend with native gRPC bindings, and the NVIDIA OpenShell gateway that manages sandbox lifecycle, inference routing, and policy enforcement.

## System Overview

```{mermaid}
flowchart LR
    USER["Browser"] -->|HTTP / WS| DASH["React Dashboard<br/>(Vite)"]
    DASH -->|REST / SSE / WS| API["Express Backend"]
    API -->|gRPC mTLS| GW["OpenShell Gateway"]
    API -->|Unix socket| DOCK["Docker Engine"]
    GW -->|sandbox create<br/>watch, policy| SB["Sandbox<br/>(OpenClaw Agent)"]
    GW -->|inference route| PROV["Inference Provider"]

    classDef nv fill:#76b900,stroke:#333,color:#fff
    class DASH,API,GW,SB nv
```

## Dashboard Frontend

The dashboard is a React application built with Vite and TypeScript. It provides the primary user interface for all NemoClaw operations.

```text
gui/
├── src/
│   ├── components/
│   │   ├── dashboard/       Dashboard home with sandbox overview and gateway status
│   │   ├── chat/            Agent chat interface with multi-turn conversation
│   │   ├── onboard/         Onboard wizard with SSE-streamed deployment progress
│   │   ├── sandboxes/       Sandbox list, detail view, and lifecycle controls
│   │   ├── claws/           Multi-claw management — list, create, detail views
│   │   ├── policies/        Policy editor with YAML view and OPA validation
│   │   ├── inference/       Inference config with provider selection and routing transparency
│   │   ├── images/          Container image builder and library
│   │   ├── logs/            Real-time log viewer with source/level filtering
│   │   ├── gateway/         Gateway lifecycle management (start/stop/restart)
│   │   ├── ports/           Port configuration manager
│   │   └── denials/         Denial dashboard with draft policy approval
│   ├── App.tsx              Router and layout with sidebar navigation
│   └── index.css            Design system tokens and global styles
├── index.html               Application entry point
├── vite.config.ts           Vite build configuration
└── package.json             Dependencies and build scripts
```

## Express Backend

The backend is an Express.js server that serves the dashboard, provides REST API endpoints, manages WebSocket connections, and communicates with the OpenShell gateway via gRPC.

```text
gui/server/
├── index.js                  Server entry point — Express app, WebSocket, route registration
├── lib/
│   ├── grpcClient.js         Persistent gRPC channel with mTLS, typed async wrappers
│   └── gatewayHealth.js      Health monitoring via gRPC Health RPC and HTTP /readyz
├── services/
│   ├── clawManager.js        Claw registry with gRPC-backed status enrichment
│   └── dockerGateway.js      Docker Engine API over Unix socket for container lifecycle
├── routes/
│   ├── claws.js              Claw lifecycle (CRUD, deploy, reconnect, sync)
│   ├── sandboxes.js          Sandbox lifecycle (list, get, start, stop, destroy)
│   ├── policies.js           Policy management (YAML editor, OPA validation, drafts)
│   ├── inference.js          Inference config (providers, routing transparency)
│   ├── images.js             Container image builder and library
│   ├── chat.js               Agent chat with server-side LLM proxy
│   ├── gateway.js            Gateway start/stop/status via Docker API
│   ├── logs.js               Log streaming via gRPC WatchSandbox
│   └── ports.js              Port configuration management
└── proto/
    ├── openshell.proto        OpenShell gateway service definitions
    ├── inference.proto        Inference routing service definitions
    ├── datamodel.proto        Shared data model messages
    └── sandbox.proto          Sandbox-specific messages
```

### Key Backend Components

#### `grpcClient.js`

The central gRPC client that maintains a persistent mTLS connection to the OpenShell gateway. Key features:

- **mTLS authentication** — loads client certificates from `~/.config/openshell/clusters/<name>/mtls/`
- **Typed async wrappers** — `createSandbox()`, `deleteSandbox()`, `listSandboxes()`, `watchSandbox()`, etc.
- **Provider type mapping** (`mapProviderToGrpcType`) — translates NemoClaw provider keys (OpenRouter, Gemini, Ollama, vLLM) to gateway-supported gRPC types (`openai`, `nvidia`)
- **Config key mapping** (`mapProviderToConfigKey`) — translates provider keys to gateway-expected config keys (`OPENAI_BASE_URL`, `NVIDIA_BASE_URL`, etc.)
- **Idempotent helpers** — `ensureProvider` handles type conflicts via delete+recreate; `ensureSandbox` handles UNIQUE constraint violations

#### `gatewayHealth.js`

Monitors gateway liveness via gRPC Health RPC and HTTP `/readyz`. Reads gateway config from `~/.config/openshell/active_gateway` and `gateways/<name>/metadata.json`.

#### `dockerGateway.js`

Communicates with the Docker Engine API over the Unix socket for gateway container lifecycle (start, stop, inspect). Requires Docker API ≥ v1.44.

## OpenShell Gateway

NemoClaw does not replace the OpenShell gateway — it provides a management layer on top of it. The gateway handles:

- **Sandbox lifecycle** — container creation, teardown, and state management
- **Inference routing** — intercepting agent inference calls and routing to configured providers
- **Policy enforcement** — Landlock filesystem isolation, seccomp syscall filtering, network namespace egress control
- **Draft policies** — AI-recommended policy changes from denial analysis

### gRPC API Surface

| Operation | RPC | Description |
|-----------|-----|-------------|
| Sandbox create | `CreateSandbox` | Typed `SandboxSpec` protobuf messages |
| Sandbox delete | `DeleteSandbox` | Clean teardown by name |
| Sandbox list/get | `ListSandboxes` / `GetSandbox` | Structured state with phase and conditions |
| Watch streams | `WatchSandbox` | Server-streaming for real-time events |
| Inference config | `SetClusterInference` / `GetClusterInference` | Cluster-level routing |
| Provider CRUD | `Create/Update/Delete/ListProviders` | Provider credential management |
| Policy management | `UpdateConfig` / `GetSandboxConfig` | Policy updates |
| Draft policy | `GetDraftPolicy` / `ApproveDraftChunk` / `RejectDraftChunk` | Denial analysis |
| Health | `Health` + HTTP `/readyz` | Liveness and readiness |

## Sandbox Environment

The sandbox runs the OpenShell community container image. Inside the sandbox:

- OpenClaw runs with the NemoClaw plugin pre-installed
- Inference calls are routed through OpenShell to the configured provider
- Network egress is restricted by the baseline policy in `openclaw-sandbox.yaml`
- Filesystem access is confined to `/sandbox` and `/tmp` for read-write, with system paths read-only

## Inference Routing

```text
Agent (sandbox)  ──▶  OpenShell gateway  ──▶  Provider (NVIDIA / OpenRouter / Gemini / Ollama / vLLM / NIM)
```

The gateway intercepts all inference calls from the agent and routes them to whichever provider is configured. The provider type and credentials are managed via gRPC `CreateProvider` / `SetClusterInference` calls from the backend.

## Data Storage

| Path | Content |
|------|--------|
| `~/.nemoclaw/claws.json` | Claw registry — config, creation time, last connection |
| `~/.nemoclaw/credentials.json` | Per-provider API key vault |
| `~/.config/nemoclaw/ports.json` | Saved port configuration overrides |
| `~/.config/openshell/` | OpenShell gateway config, mTLS certs, cluster metadata |

## Related Topics

- [How It Works](../about/how-it-works.md) for the high-level overview
- [Commands](../reference/commands.md) for the CLI reference
- [Inference Profiles](../reference/inference-profiles.md) for provider configuration
