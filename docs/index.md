---
title:
  page: "NemoClaw Developer Guide"
  nav: "NemoClaw"
description: "NemoClaw is a web-based management platform for running sandboxed AI agents with policy-enforced security and multi-provider inference routing."
keywords: ["nemoclaw management platform", "openclaw sandbox management", "ai agent dashboard", "openshell gui"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "sandboxing", "inference_routing", "nemoclaw", "dashboard"]
content:
  type: get_started
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# NemoClaw

```{include} ../README.md
:start-after: <!-- start-badges -->
:end-before: <!-- end-badges -->
```

```{include} _includes/alpha-statement.md
```

NemoClaw is a web-based management platform for running sandboxed AI agents safely. Built on [NVIDIA's NemoClaw](https://github.com/NVIDIA/NemoClaw) and the [OpenShell](https://github.com/NVIDIA/OpenShell) runtime, it provides a modern dashboard for deploying, managing, and monitoring AI agents with policy-enforced security, multi-provider inference routing, and native gRPC integration. No CLI required.

## Get Started

Launch the dashboard and deploy your first sandboxed agent in minutes.

```{raw} html
<style>
.nc-term {
  background: #1a1a2e;
  border-radius: 8px;
  overflow: hidden;
  margin: 1.5em 0;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 0.875em;
  line-height: 1.8;
}
.nc-term-bar {
  background: #252545;
  padding: 10px 14px;
  display: flex;
  gap: 7px;
  align-items: center;
}
.nc-term-dot { width: 12px; height: 12px; border-radius: 50%; }
.nc-term-dot-r { background: #ff5f56; }
.nc-term-dot-y { background: #ffbd2e; }
.nc-term-dot-g { background: #27c93f; }
.nc-term-body { padding: 16px 20px; color: #d4d4d8; }
.nc-term-body .nc-ps { color: #76b900; user-select: none; }
.nc-hl { color: #76b900; font-weight: 600; }
.nc-cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: #d4d4d8;
  vertical-align: text-bottom;
  margin-left: 1px;
  animation: nc-blink 1s step-end infinite;
}
@keyframes nc-blink { 50% { opacity: 0; } }
</style>
<div class="nc-term">
  <div class="nc-term-bar">
    <span class="nc-term-dot nc-term-dot-r"></span>
    <span class="nc-term-dot nc-term-dot-y"></span>
    <span class="nc-term-dot nc-term-dot-g"></span>
  </div>
  <div class="nc-term-body">
    <div><span class="nc-ps">$ </span>npm install -g nemoclaw</div>
    <div><span class="nc-ps">$ </span>nemoclaw gui</div>
    <div>&nbsp;</div>
    <div><span class="nc-hl">Dashboard ready at http://localhost:3000</span></div>
  </div>
</div>
```

Use the **Onboard Wizard** in the dashboard to deploy your first sandboxed agent with SSE-streamed progress updates. Or proceed to the [Quickstart](get-started/quickstart.md) for step-by-step instructions.

---

## Explore

::::{grid} 2 2 3 3
:gutter: 3

:::{grid-item-card} About NemoClaw
:link: about/overview
:link-type: doc

Learn what NemoClaw does and how it extends NVIDIA's OpenShell platform.

+++
{bdg-secondary}`Concept`
:::

:::{grid-item-card} Quickstart
:link: get-started/quickstart
:link-type: doc

Install the platform and launch your first sandboxed agent from the dashboard.

+++
{bdg-secondary}`Tutorial`
:::

:::{grid-item-card} Architecture
:link: reference/architecture
:link-type: doc

gRPC-native backend, React dashboard, and OpenShell gateway integration.

+++
{bdg-secondary}`Reference`
:::

:::{grid-item-card} Commands
:link: reference/commands
:link-type: doc

CLI commands for managing sandboxes, launching the dashboard, and more.

+++
{bdg-secondary}`Reference`
:::

:::{grid-item-card} How It Works
:link: about/how-it-works
:link-type: doc

Dashboard, gRPC integration, sandbox lifecycle, and inference routing.

+++
{bdg-secondary}`Concept`
:::

:::{grid-item-card} Inference Providers
:link: inference/switch-inference-providers
:link-type: doc

Configure NVIDIA Cloud, OpenRouter, Gemini, Ollama, vLLM, or NIM Local.

+++
{bdg-secondary}`How-To`
:::

:::{grid-item-card} Network Policies
:link: reference/network-policies
:link-type: doc

Egress control, operator approval flow, and policy customization.

+++
{bdg-secondary}`Reference`
:::

:::{grid-item-card} Workspace Files
:link: workspace/workspace-files
:link-type: doc

Agent identity, memory, and configuration files that persist in the sandbox.

+++
{bdg-secondary}`Concept`
:::

:::{grid-item-card} How-To Guides
:link: inference/switch-inference-providers
:link-type: doc

Task-oriented guides for inference, deployment, and policy management.

+++
{bdg-secondary}`How-To`
:::

::::

```{toctree}
:hidden:

Home <self>
```

```{toctree}
:caption: About NemoClaw
:hidden:

Overview <about/overview>
How It Works <about/how-it-works>
Release Notes <about/release-notes>
```

```{toctree}
:caption: Get Started
:hidden:

Quickstart <get-started/quickstart>
```

```{toctree}
:caption: Inference
:hidden:

Switch Inference Providers <inference/switch-inference-providers>
```

```{toctree}
:caption: Network Policy
:hidden:

Approve or Deny Network Requests <network-policy/approve-network-requests>
Customize the Network Policy <network-policy/customize-network-policy>
```

```{toctree}
:caption: Deployment
:hidden:

Deploy to a Remote GPU Instance <deployment/deploy-to-remote-gpu>
Set Up the Telegram Bridge <deployment/set-up-telegram-bridge>
```

```{toctree}
:caption: Monitoring
:hidden:

Monitor Sandbox Activity <monitoring/monitor-sandbox-activity>
```

```{toctree}
:caption: Workspace
:hidden:

Workspace Files <workspace/workspace-files>
Back Up and Restore <workspace/backup-restore>
```

```{toctree}
:caption: Reference
:hidden:

Architecture <reference/architecture>
Commands <reference/commands>
Inference Profiles <reference/inference-profiles>
Network Policies <reference/network-policies>
Troubleshooting <reference/troubleshooting>
```

```{toctree}
:caption: Resources
:hidden:

resources/license
Discord <https://discord.gg/XFpfPv9Uvx>
```
