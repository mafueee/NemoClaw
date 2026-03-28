#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# NemoClaw interactive walkthrough — launches a split tmux session with the
# OpenShell TUI on the left and an agent session on the right.

set -euo pipefail

SANDBOX_NAME="${1:-}"
SESSION_NAME="nemoclaw-walkthrough"

usage() {
  cat <<'EOF'
NemoClaw Interactive Walkthrough

Launch a split tmux session to demonstrate the NemoClaw sandbox and policy
enforcement architecture.

Usage:
  walkthrough.sh [sandbox-name]    Start the walkthrough
  walkthrough.sh --help            Show this help

Layout:
  Left pane:  openshell term (TUI monitoring)
  Right pane: Agent session inside sandbox

Prerequisites:
  - tmux installed
  - OpenShell CLI on PATH
  - A running NemoClaw sandbox
EOF
}

info() { echo "==> $*"; }
err()  { echo "Error: $*" >&2; }

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if ! command -v tmux &>/dev/null; then
  err "tmux is required for the walkthrough."
  echo "  Install with: sudo apt install tmux"
  exit 1
fi

if ! command -v openshell &>/dev/null; then
  err "OpenShell CLI not found on PATH."
  echo "  Install OpenShell first: https://docs.nvidia.com/openshell/latest/"
  exit 1
fi

if [[ -z "$SANDBOX_NAME" ]]; then
  info "Detecting running sandboxes..."
  SANDBOX_LIST=$(openshell sandbox list --json 2>/dev/null || echo "[]")

  if command -v jq &>/dev/null; then
    FIRST_SANDBOX=$(echo "$SANDBOX_LIST" | jq -r '.[0].name // empty' 2>/dev/null)
  else
    FIRST_SANDBOX=$(echo "$SANDBOX_LIST" | grep -o '"name":"[^"]*"' | head -1 | sed 's/"name":"//;s/"//')
  fi

  if [[ -z "$FIRST_SANDBOX" ]]; then
    err "No running sandboxes found."
    echo "  Create one with: nemoclaw onboard"
    echo "  Or specify: ./scripts/walkthrough.sh <sandbox-name>"
    exit 1
  fi

  SANDBOX_NAME="$FIRST_SANDBOX"
  info "Using sandbox: ${SANDBOX_NAME}"
fi

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  info "Killing existing walkthrough session..."
  tmux kill-session -t "$SESSION_NAME"
fi

info "Starting NemoClaw walkthrough for sandbox '${SANDBOX_NAME}'..."
echo ""
echo "  NemoClaw Interactive Walkthrough"
echo "  Left pane:  openshell term (TUI monitoring)"
echo "  Right pane: Agent session inside sandbox"
echo "  Ctrl+B, d to detach | tmux a -t ${SESSION_NAME} to re-attach"
echo ""

sleep 1

tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50 \
  "openshell term"

tmux split-window -h -t "$SESSION_NAME" \
  "echo '  Connecting to sandbox: ${SANDBOX_NAME}'; echo ''; echo '  Try running commands to see the network policy in action:'; echo '  curl -sS https://api.github.com/zen'; echo '  curl -sS https://httpbin.org/get  # should be blocked'; echo ''; openshell sandbox connect ${SANDBOX_NAME}"

tmux select-layout -t "$SESSION_NAME" even-horizontal

tmux attach-session -t "$SESSION_NAME"
