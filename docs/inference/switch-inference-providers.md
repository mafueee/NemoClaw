---
title:
  page: "Switch NemoClaw Inference Providers"
  nav: "Switch Inference Providers"
description: "Configure and switch between inference providers via the dashboard or CLI."
keywords: ["switch nemoclaw inference provider", "multi-provider inference routing"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "inference_routing"]
content:
  type: how_to
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Switch Inference Providers

Change the active inference provider or model at runtime. No sandbox restart required.

## Prerequisites

- A running NemoClaw sandbox.
- The web dashboard running (`nemoclaw gui`) or the OpenShell CLI on your `PATH`.

## Switch via the Dashboard (Recommended)

1. Open the dashboard and navigate to **Inference Config** in the sidebar.
2. Select a provider from the visual provider picker.
3. Enter the model name and API key (if required). API keys are persisted in the credential vault — you only need to enter them once.
4. Click **Save** to apply the configuration.
5. Use the **Test Connection** button to verify the provider is reachable.

The **Routing Transparency** panel shows the resolved inference route, matched protocol, and credential status.

## Switch via the CLI

Set the provider and model using the OpenShell CLI:

```console
$ openshell inference set --provider nvidia-nim --model nvidia/nemotron-3-super-120b-a12b
```

Verify the change:

```console
$ nemoclaw <name> status
```

## Supported Providers

| Provider | Key | Example Model | API Key Required |
|----------|-----|---------------|------------------|
| NVIDIA Cloud | `nvidia-nim` | `nvidia/nemotron-3-super-120b-a12b` | Yes — from [build.nvidia.com](https://build.nvidia.com) |
| OpenRouter | `openrouter` | `google/gemini-3-flash-preview` | Yes — from [openrouter.ai/keys](https://openrouter.ai/keys) |
| Google Gemini | `gemini` | Gemini models | Yes — from Google AI Studio |
| Ollama | `ollama` | `llama3.3:latest` | No |
| vLLM | `vllm` | Auto-detected | No |
| NIM Local | `nim-local` | `nvidia/nemotron-3-nano-30b-a3b` | No |

### Provider Notes

- **OpenRouter** defaults to `google/gemini-3-flash-preview` when no model is specified.
- **Ollama** supports connecting to remote servers — set the endpoint URL in the dashboard.
- **vLLM** and **NIM Local** require a running server on the configured endpoint.
- **NVIDIA Cloud** supports all Nemotron models listed on build.nvidia.com.

## Credential Vault

API keys are persisted to `~/.nemoclaw/credentials.json`, organized by provider. Once configured, keys are:

- **Auto-filled** on future deploys and provider switches
- **Restored** into `process.env` on server restart
- **Validated** for format before saving

To update a key, simply re-enter it in the dashboard's Inference Config page.

## Available NVIDIA Cloud Models

| Model ID | Label | Context Window | Max Output |
|---|---|---|---|
| `nvidia/nemotron-3-super-120b-a12b` | Nemotron 3 Super 120B | 131,072 | 8,192 |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | Nemotron Ultra 253B | 131,072 | 4,096 |
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | Nemotron Super 49B v1.5 | 131,072 | 4,096 |
| `nvidia/nemotron-3-nano-30b-a3b` | Nemotron 3 Nano 30B | 131,072 | 4,096 |

## Related Topics

- [Inference Profiles](../reference/inference-profiles.md) for full profile configuration details.
- [Architecture](../reference/architecture.md) for how inference routing works at the gRPC level.
