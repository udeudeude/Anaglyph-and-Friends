#!/bin/bash
# Shared by the Start and Stop app bundles. A PID file alone is not proof that
# the process still belongs to this checkout: macOS can reuse process IDs.

process_command() {
  /bin/ps -ww -p "$1" -o command= 2>/dev/null
}

managed_pid() {
  local file="$1" marker="$2" pid command_line
  [ -f "$file" ] || return 1
  IFS= read -r pid < "$file" || return 1
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  command_line="$(process_command "$pid")" || return 1
  case "$command_line" in
    *"$marker"*) printf '%s\n' "$pid" ;;
    *) return 1 ;;
  esac
}

stop_managed_pid() {
  local file="$1" marker="$2" pid attempt
  if pid="$(managed_pid "$file" "$marker")"; then
    kill "$pid" 2>/dev/null || true
    for attempt in {1..20}; do
      managed_pid "$file" "$marker" >/dev/null || break
      sleep 0.1
    done
    if managed_pid "$file" "$marker" >/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  # A stale PID file is safe to discard; an unrelated process is never killed.
  [ ! -f "$file" ] || rm "$file"
}
