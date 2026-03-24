// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "cli",
          include: ["test/**/*.test.js"],
          exclude: ["**/node_modules/**", "**/.claude/**"],
        },
      },
      {
        test: {
          name: "plugin",
          include: ["nemoclaw/src/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "gui",
          include: ["gui/src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: [path.resolve(__dirname, "gui/src/test/setup.ts")],
          deps: {
            optimizer: {
              web: {
                include: ["@testing-library/jest-dom"],
              },
            },
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["nemoclaw/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
