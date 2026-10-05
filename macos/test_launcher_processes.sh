#!/bin/bash
set -eu

source "$(dirname "$0")/launcher-processes.sh"
TEST_DIR="$(mktemp -d)"
owned_pid=""
other_pid=""
# The scratch sandbox cannot inspect process command lines; substitute that one
# system call while exercising real PIDs, signals, and PID files.
process_command() {
  kill -0 "$1" 2>/dev/null || return 1
  if [ "$1" = "$owned_pid" ]; then printf 'bash %s/owned.sh\n' "$TEST_DIR"
  elif [ "$1" = "$other_pid" ]; then printf 'sleep 30\n'
  else return 1
  fi
}
cleanup() {
  [ -z "$owned_pid" ] || kill "$owned_pid" 2>/dev/null || true
  [ -z "$other_pid" ] || kill "$other_pid" 2>/dev/null || true
  rm -r "$TEST_DIR"
}
trap cleanup EXIT

# The saved number must refer to the expected command, not merely a live PID.
sleep 30 & other_pid=$!
printf '%s\n' "$other_pid" > "$TEST_DIR/service.pid"
if managed_pid "$TEST_DIR/service.pid" "$TEST_DIR/owned.sh" >/dev/null; then exit 1; fi
stop_managed_pid "$TEST_DIR/service.pid" "$TEST_DIR/owned.sh"
kill -0 "$other_pid"
test ! -f "$TEST_DIR/service.pid"

printf '#!/bin/bash\nwhile :; do sleep 1; done\n' > "$TEST_DIR/owned.sh"
bash "$TEST_DIR/owned.sh" & owned_pid=$!
printf '%s\n' "$owned_pid" > "$TEST_DIR/service.pid"
for attempt in {1..20}; do
  managed_pid "$TEST_DIR/service.pid" "$TEST_DIR/owned.sh" >/dev/null && break
  sleep 0.1
done
test "$(managed_pid "$TEST_DIR/service.pid" "$TEST_DIR/owned.sh")" = "$owned_pid"
stop_managed_pid "$TEST_DIR/service.pid" "$TEST_DIR/owned.sh"
wait "$owned_pid" 2>/dev/null || true
test ! -f "$TEST_DIR/service.pid"
if kill -0 "$owned_pid" 2>/dev/null; then exit 1; fi
echo 'Mac launcher process ownership checks passed'
