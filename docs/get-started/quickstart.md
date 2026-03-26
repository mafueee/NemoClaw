---
title:
  page: "NemoClaw Quickstart — Install, Launch, and Deploy Your First Agent"
  nav: "Quickstart"
description: "Install NemoClaw, launch the dashboard, and deploy your first sandboxed agent."
keywords: ["nemoclaw quickstart", "install nemoclaw dashboard sandbox"]
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

# Quickstart

```{include} ../_includes/alpha-statement.md
```

Follow these steps to install NemoClaw, launch the dashboard, and deploy your first sandboxed agent.

:::{note}
NemoClaw creates a fresh OpenClaw instance inside the sandbox during onboarding.
:::

```{include} ../../README.md
:start-after: <!-- start-quickstart-guide -->
:end-before: <!-- end-quickstart-guide -->
```

### Next Steps

- [Switch inference providers](../inference/switch-inference-providers.md) to use a different model or endpoint.
- [Approve or deny network requests](../network-policy/approve-network-requests.md) when the agent tries to reach external hosts.
- [Customize the network policy](../network-policy/customize-network-policy.md) to pre-approve trusted domains.
- [Deploy to a remote GPU instance](../deployment/deploy-to-remote-gpu.md) for always-on operation.
- [Monitor sandbox activity](../monitoring/monitor-sandbox-activity.md) through the OpenShell TUI.

### Troubleshooting

If you run into issues during installation or onboarding, refer to the [Troubleshooting guide](../reference/troubleshooting.md) for common error messages and resolution steps.
