#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Workspace backup and restore for NemoClaw sandboxes.
# Uses `openshell sandbox download/upload` to transfer workspace files.
#
# Usage:
#   ./scripts/backup-workspace.sh backup <sandbox>                 Backup workspace
#   ./scripts/backup-workspace.sh restore <sandbox> [timestamp]    Restore workspace
#   ./scripts/backup-workspace.sh list                             List backups
#   ./scripts/backup-workspace.sh --help                           Show this help

set -euo pipefail

BACKUP_BASE="${HOME}/.nemoclaw/backups"

# Workspace files to back up — matches the official NemoClaw documentation.
WORKSPACE_FILES=(
  "SOUL.md"
  "USER.md"
  "IDENTITY.md"
  "AGENTS.md"
  "MEMORY.md"
)
WORKSPACE_DIRS=(
  "memory/"
)

WORKSPACE_ROOT="/sandbox/.openclaw/workspace"

usage() {
  cat <<'EOF'
NemoClaw Workspace Backup & Restore

Usage:
  backup-workspace.sh backup <sandbox>                 Backup workspace files
  backup-workspace.sh restore <sandbox> [timestamp]    Restore from backup
  backup-workspace.sh list [sandbox]                   List available backups
  backup-workspace.sh --help                           Show this help

Files backed up:
  SOUL.md, USER.md, IDENTITY.md, AGENTS.md, MEMORY.md, memory/

Backups are saved to: ~/.nemoclaw/backups/<sandbox>/<timestamp>/
EOF
}

info() { echo "==> $*"; }
warn() { echo "⚠ $*" >&2; }
err()  { echo "✗ $*" >&2; }

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

check_openshell() {
  if ! command -v openshell &>/dev/null; then
    err "OpenShell CLI not found. Install it and ensure it's on your PATH."
    exit 1
  fi
}

check_sandbox() {
  local sandbox="$1"
  # Try to list sandbox — if it fails, sandbox isn't running
  if ! openshell sandbox list 2>/dev/null | grep -q "$sandbox"; then
    warn "Sandbox '$sandbox' may not be running. Proceeding anyway."
  fi
}

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

do_backup() {
  local sandbox="${1:?Sandbox name required}"
  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local backup_dir="${BACKUP_BASE}/${sandbox}/${timestamp}"

  check_openshell
  check_sandbox "$sandbox"

  info "Backing up workspace from sandbox '$sandbox'..."
  mkdir -p "$backup_dir"

  local count=0

  # Back up individual files
  for file in "${WORKSPACE_FILES[@]}"; do
    local src="${WORKSPACE_ROOT}/${file}"
    info "  Downloading ${file}..."
    if openshell sandbox download "$sandbox" "$src" "${backup_dir}/" 2>/dev/null; then
      count=$((count + 1))
    else
      warn "  Could not download ${file} (may not exist yet)"
    fi
  done

  # Back up directories
  for dir in "${WORKSPACE_DIRS[@]}"; do
    local src="${WORKSPACE_ROOT}/${dir}"
    local dest="${backup_dir}/${dir}"
    info "  Downloading ${dir}..."
    mkdir -p "$dest"
    if openshell sandbox download "$sandbox" "$src" "$dest" 2>/dev/null; then
      count=$((count + 1))
    else
      warn "  Could not download ${dir} (may not exist yet)"
    fi
  done

  echo ""
  if [[ $count -gt 0 ]]; then
    info "Backup saved to ${backup_dir} (${count} items)"
    echo ""
    ls -la "$backup_dir"
  else
    err "No files were backed up. Is the sandbox running?"
    rmdir "$backup_dir" 2>/dev/null || true
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

do_restore() {
  local sandbox="${1:?Sandbox name required}"
  local timestamp="${2:-}"

  check_openshell
  check_sandbox "$sandbox"

  local sandbox_backups="${BACKUP_BASE}/${sandbox}"

  if [[ ! -d "$sandbox_backups" ]]; then
    err "No backups found for sandbox '$sandbox'"
    exit 1
  fi

  # If no timestamp given, use the most recent
  if [[ -z "$timestamp" ]]; then
    timestamp="$(ls -1 "$sandbox_backups" | sort -r | head -1)"
    if [[ -z "$timestamp" ]]; then
      err "No backup timestamps found for '$sandbox'"
      exit 1
    fi
    info "Using most recent backup: ${timestamp}"
  fi

  local backup_dir="${sandbox_backups}/${timestamp}"
  if [[ ! -d "$backup_dir" ]]; then
    err "Backup directory not found: ${backup_dir}"
    echo "Available backups:"
    ls -1 "$sandbox_backups" 2>/dev/null || echo "  (none)"
    exit 1
  fi

  info "Restoring workspace to sandbox '$sandbox' from ${timestamp}..."

  local count=0

  # Restore individual files
  for file in "${WORKSPACE_FILES[@]}"; do
    local src="${backup_dir}/${file}"
    if [[ -f "$src" ]]; then
      info "  Uploading ${file}..."
      if openshell sandbox upload "$sandbox" "$src" "${WORKSPACE_ROOT}/"; then
        count=$((count + 1))
      else
        warn "  Failed to upload ${file}"
      fi
    fi
  done

  # Restore directories
  for dir in "${WORKSPACE_DIRS[@]}"; do
    local src="${backup_dir}/${dir}"
    if [[ -d "$src" ]]; then
      info "  Uploading ${dir}..."
      if openshell sandbox upload "$sandbox" "$src" "${WORKSPACE_ROOT}/${dir}"; then
        count=$((count + 1))
      else
        warn "  Failed to upload ${dir}"
      fi
    fi
  done

  echo ""
  if [[ $count -gt 0 ]]; then
    info "Restored ${count} items to sandbox '$sandbox'"
  else
    err "No files were restored."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

do_list() {
  local sandbox="${1:-}"

  if [[ ! -d "$BACKUP_BASE" ]]; then
    echo "No backups found at ${BACKUP_BASE}"
    return
  fi

  if [[ -n "$sandbox" ]]; then
    # List backups for a specific sandbox
    local sandbox_dir="${BACKUP_BASE}/${sandbox}"
    if [[ ! -d "$sandbox_dir" ]]; then
      echo "No backups for sandbox '$sandbox'"
      return
    fi
    echo ""
    echo "Backups for '${sandbox}':"
    echo "─────────────────────────────────────────────"
    for ts in $(ls -1 "$sandbox_dir" | sort -r); do
      local file_count
      file_count=$(find "${sandbox_dir}/${ts}" -type f | wc -l)
      echo "  ${ts}  (${file_count} files)"
    done
    echo ""
  else
    # List all sandboxes with backups
    echo ""
    echo "Available backups:"
    echo "─────────────────────────────────────────────"
    for sb_dir in "$BACKUP_BASE"/*/; do
      if [[ -d "$sb_dir" ]]; then
        local sb_name
        sb_name="$(basename "$sb_dir")"
        local backup_count
        backup_count=$(ls -1 "$sb_dir" 2>/dev/null | wc -l)
        local latest
        latest="$(ls -1 "$sb_dir" | sort -r | head -1)"
        echo "  ${sb_name}: ${backup_count} backup(s), latest: ${latest:-n/a}"
      fi
    done
    echo ""
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  if [[ $# -eq 0 ]] || [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    usage
    exit 0
  fi

  local command="$1"
  shift

  case "$command" in
    backup)
      do_backup "$@"
      ;;
    restore)
      do_restore "$@"
      ;;
    list)
      do_list "$@"
      ;;
    *)
      err "Unknown command: ${command}"
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
