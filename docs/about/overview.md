---
title:
  page: "NemoClaw Overview — AI Agent Sandbox Management Platform"
  nav: "Overview"
description: "NemoClaw is a web-based management platform for running sandboxed AI agents with policy-enforced security, multi-provider inference, and real-time monitoring."
keywords: ["nemoclaw overview", "ai agent sandbox platform", "openshell dashboard", "multi-provider inference"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "sandboxing", "inference_routing", "nemoclaw", "dashboard"]
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

# Overview

```{include} ../_includes/alpha-statement.md
```

NemoClaw is a web-based management platform for running sandboxed AI agents safely. It wraps [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) with a modern dashboard, native gRPC integration, and multi-provider inference routing — giving you full control over agent deployment, security policy, and monitoring from a single browser tab.

NemoClaw is built on [NVIDIA's NemoClaw](https://github.com/NVIDIA/NemoClaw), an open source reference stack originally designed to simplify running [OpenClaw](https://openclaw.ai) agents inside OpenShell sandboxes. We've extended the original CLI-based tool into a complete management platform while preserving the core security model that NVIDIA designed.

## Capabilities

| Capability | Description |
|-----------|-------------|
| **Web Dashboard** | Full GUI for sandbox lifecycle, inference config, policy management, agent chat, and real-time monitoring — no CLI required |
| **Native gRPC Integration** | All operations use OpenShell's protobuf APIs directly — zero CLI subprocess calls |
| **Multi-Provider Inference** | Route agent traffic through NVIDIA Cloud, OpenRouter, Google Gemini, Ollama, vLLM, or NIM Local |
| **Multi-Claw Management** | Run multiple independent agent instances under a single gateway with per-claw config and monitoring |
| **Sandbox Security** | OpenShell sandboxes with Landlock, seccomp, network namespace isolation, and declarative policy enforcement |
| **Agent Chat** | Browser-based chat with server-side LLM proxy, multi-turn memory, and persistent credentials |
| **Policy Automation** | Denial dashboard with AI-recommended policy changes, confidence scores, and approval workflows |
| **Gateway Lifecycle** | Start, stop, and restart the OpenShell gateway from the dashboard with real-time health monitoring |
| **Credential Vault** | Per-provider API key persistence — configure once, auto-fill on every deploy |

## Challenge

Autonomous AI agents can make arbitrary network requests, access the host filesystem, and call any inference endpoint. Without guardrails, this creates security, cost, and compliance risks that grow as agents run unattended. Managing these guardrails via CLI commands is tedious and error-prone.

## What NemoClaw Provides

| Benefit | Description |
|---------|-------------|
| **GUI-driven management** | Every operation — sandbox creation, policy editing, inference config, agent interaction — is available through the web dashboard |
| **Sandboxed execution** | Every agent runs inside an OpenShell sandbox with Landlock, seccomp, and network namespace isolation |
| **Multi-provider inference** | Choose from six inference providers with transparent routing, persistent credentials, and runtime switching |
| **Declarative policies** | Egress rules defined in YAML with visual editor, OPA validation, and AI-recommended policy updates |
| **Real-time monitoring** | WebSocket-powered live status updates, log streaming via gRPC, and gateway health indicators |
| **Native API integration** | Direct gRPC communication with the OpenShell gateway for reliable, high-performance operations |

## Use Cases

| Use Case | Description |
|----------|-------------|
| **Development sandbox** | Deploy and iterate on agents in a locked-down environment with instant dashboard feedback |
| **Always-on assistant** | Run an OpenClaw assistant with controlled network access, multi-turn chat, and operator-approved egress |
| **Multi-agent setup** | Run multiple independent agents under one gateway, each with its own inference config and security policy |
| **Policy prototyping** | Use the denial dashboard and YAML editor to iteratively build and validate security policies |

## Next Steps

- [How It Works](../about/how-it-works.md) to understand the platform architecture.
- [Quickstart](../get-started/quickstart.md) to install NemoClaw and launch the dashboard.
- [Switch Inference Providers](../inference/switch-inference-providers.md) to configure multi-provider inference.
- [Architecture](../reference/architecture.md) for the full technical reference.
