---
title:
  page: "How NemoClaw Works — Dashboard, gRPC, and Sandbox Lifecycle"
  nav: "How It Works"
description: "Learn how NemoClaw combines a web dashboard with native gRPC integration to manage sandboxed AI agents through the OpenShell gateway."
keywords: ["how nemoclaw works", "nemoclaw architecture dashboard grpc"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "sandboxing", "inference_routing", "grpc", "dashboard"]
content:
  type: concept
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# How NemoClaw Works

NemoClaw provides a web dashboard and Express backend that communicates directly with the NVIDIA OpenShell gateway via gRPC and HTTP APIs. This page explains the key concepts at a high level.

## How It Fits Together

The platform has three layers: a React dashboard for users, a Node.js backend with native gRPC bindings, and the OpenShell gateway that manages sandboxes, inference, and policy.

```{mermaid}
flowchart TB
    subgraph Dashboard["Web Dashboard (React)"]
        ONBOARD["Onboard Wizard"]
        SANDBOX["Sandbox Manager"]
        CHAT["Agent Chat"]
        POLICY["Policy Editor"]
        LOGS["Log Viewer"]
        DENIAL["Denial Dashboard"]
    end

    subgraph Backend["Express Backend (Node.js)"]
        GRPC["grpcClient.js<br/>(mTLS)"]
        HEALTH["gatewayHealth.js"]
        DOCKER["dockerGateway.js"]
    end

    subgraph Gateway["OpenShell Gateway"]
        SBMGR["Sandbox Manager"]
        INFR["Inference Router"]
        POLENG["Policy Enforcer"]
    end

    subgraph Sandbox["OpenShell Sandbox"]
        AGENT["OpenClaw Agent"]
        INF["Inference (routed)"]
        NET["Network Policy"]
        FS["Filesystem Isolation"]
    end

    Dashboard -->|REST / WS / SSE| Backend
    GRPC -->|gRPC mTLS| Gateway
    HEALTH -->|Health RPC| Gateway
    DOCKER -->|Unix socket| Gateway
    Gateway --> Sandbox

    classDef nv fill:#76b900,stroke:#333,color:#fff
    classDef nvLight fill:#e6f2cc,stroke:#76b900,color:#1a1a1a
    classDef nvDark fill:#333,stroke:#76b900,color:#fff
    classDef nvMid fill:#4a7a00,stroke:#333,color:#fff

    class ONBOARD,SANDBOX,CHAT,POLICY,LOGS,DENIAL nvDark
    class GRPC,HEALTH,DOCKER nvMid
    class SBMGR,INFR,POLENG nv
    class AGENT nv
    class INF,NET,FS nvLight

    style Dashboard fill:none,stroke:#76b900,stroke-width:2px,color:#1a1a1a
    style Backend fill:none,stroke:#4a7a00,stroke-width:2px,color:#1a1a1a
    style Gateway fill:#f5faed,stroke:#76b900,stroke-width:2px,color:#1a1a1a
    style Sandbox fill:#f5faed,stroke:#76b900,stroke-width:2px,color:#1a1a1a
```

## Design Principles

Native API integration
: The backend communicates with the OpenShell gateway exclusively through gRPC and HTTP. There are zero CLI subprocess calls — all operations use typed protobuf messages and structured responses.

Dashboard-first
: Every operation — sandbox creation, policy editing, inference configuration, agent chat — is available from the web dashboard without touching the terminal.

Credential persistence
: API keys are stored in a per-provider credential vault (`~/.nemoclaw/credentials.json`) and automatically restored on server restart.

Idempotent deployments
: The gRPC client includes helpers for idempotent operations — `ensureProvider` handles type conflicts via delete+recreate, and `ensureSandbox` handles duplicate sandbox names gracefully.

Built on OpenShell
: NemoClaw does not replace OpenShell — it provides a management layer on top of it. The core security model (Landlock, seccomp, network namespaces, policy enforcement) is entirely OpenShell's work.

## Sandbox Lifecycle

When you deploy a new claw from the dashboard:

1. The **Onboard Wizard** collects provider, model, API key, and sandbox name.
2. The backend calls `ensureProvider` to create or update the inference provider via gRPC `CreateProvider` / `UpdateProvider`.
3. The backend calls `CreateSandbox` with a typed `SandboxSpec` protobuf message.
4. A `WatchSandbox` gRPC stream delivers real-time progress events, which are forwarded to the dashboard via SSE.
5. Once the sandbox reaches `Running` phase, the claw is registered in `~/.nemoclaw/claws.json`.

The same lifecycle applies from the CLI via `nemoclaw onboard`.

## Inference Routing

Inference requests from the agent never leave the sandbox directly. OpenShell intercepts every inference call and routes it to the provider configured in the gateway.

NemoClaw supports six inference providers, configurable from the dashboard's **Inference Config** page:

- **NVIDIA Cloud** — Nemotron models via build.nvidia.com
- **OpenRouter** — 200+ models (defaults to `google/gemini-3-flash-preview`)
- **Google Gemini** — Direct Google AI access
- **Ollama** — Local or remote Ollama server
- **vLLM** — High-performance local inference
- **NIM Local** — On-premise NVIDIA NIM container

The provider type mapping in `grpcClient.js` translates NemoClaw provider keys to gateway-supported gRPC types, and the config key mapping ensures API keys are passed under the correct environment variable names.

## Network and Filesystem Policy

The sandbox starts with a default policy defined in `openclaw-sandbox.yaml`. This policy controls which network endpoints the agent can reach and which filesystem paths it can access.

- **Network**: Only endpoints listed in the policy are allowed. When the agent tries to reach an unlisted host, OpenShell blocks the request. The **Denial Dashboard** surfaces blocked requests with AI-recommended policy changes for operator review.
- **Filesystem**: The agent can write to `/sandbox` and `/tmp`. All other system paths are read-only.
- **Policy Editor**: The dashboard includes a YAML editor with line numbers and OPA rule validation for editing policies directly.

## Agent Chat

The Agent Chat page provides a browser-based conversational interface that calls the configured LLM provider's OpenAI-compatible `/v1/chat/completions` API directly from the server. Features include:

- **Multi-turn memory** — per-session conversation history (capped at 50 messages, 30-minute TTL)
- **Credential restoration** — API keys from the credential vault are automatically injected
- **Actionable errors** — authentication failures, provider unreachability, and missing keys return recovery links

## Next Steps

- Follow the [Quickstart](../get-started/quickstart.md) to launch the dashboard and deploy your first agent.
- Refer to the [Architecture](../reference/architecture.md) for the full technical structure.
- Refer to [Switch Inference Providers](../inference/switch-inference-providers.md) for provider configuration details.
