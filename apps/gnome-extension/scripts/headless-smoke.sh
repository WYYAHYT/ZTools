#!/usr/bin/env bash

set -euo pipefail

readonly extension_uuid="ztools-previous-focus@ztools"
readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly extension_source="$repository_root/apps/gnome-extension/$extension_uuid"
readonly isolated_root="$(mktemp -d /tmp/ztools-gnome-headless.XXXXXX)"
readonly isolated_home="$isolated_root/home"
readonly isolated_data="$isolated_root/data"
readonly isolated_config="$isolated_root/config"
readonly isolated_cache="$isolated_root/cache"
readonly isolated_runtime="$isolated_root/runtime"
readonly extension_target="$isolated_data/gnome-shell/extensions/$extension_uuid"

mkdir -p \
  "$isolated_home/Desktop" \
  "$extension_target" \
  "$isolated_config" \
  "$isolated_cache" \
  "$isolated_runtime"
chmod 700 "$isolated_runtime"
cp \
  "$extension_source/metadata.json" \
  "$extension_source/extension.js" \
  "$extension_source/dbus-server.js" \
  "$extension_source/focus-state-machine.mjs" \
  "$extension_target/"
ln -s "$repository_root/node_modules" "$isolated_root/node_modules"

export HOME="$isolated_home"
export XDG_DATA_HOME="$isolated_data"
export XDG_CONFIG_HOME="$isolated_config"
export XDG_CACHE_HOME="$isolated_cache"
export XDG_RUNTIME_DIR="$isolated_runtime"

shell_pid=""
shell_generation=0
restart_client_pid=""

start_shell() {
  shell_generation=$((shell_generation + 1))
  gnome-shell \
    --headless \
    --virtual-monitor=800x600 \
    --wayland-display=ztools-test \
    --mode=ubuntu >"$isolated_root/gnome-shell-$shell_generation.log" 2>&1 &
  shell_pid=$!
}

stop_shell() {
  if [[ -z "$shell_pid" ]]; then
    return
  fi
  kill "$shell_pid" 2>/dev/null || true
  for _attempt in $(seq 1 20); do
    if ! kill -0 "$shell_pid" 2>/dev/null; then
      wait "$shell_pid" 2>/dev/null || true
      shell_pid=""
      return
    fi
    sleep 0.1
  done
  kill -KILL "$shell_pid" 2>/dev/null || true
  wait "$shell_pid" 2>/dev/null || true
  shell_pid=""
}

print_shell_log() {
  sed -n '1,240p' "$isolated_root/gnome-shell-$shell_generation.log" >&2
}

cleanup() {
  if [[ -n "$restart_client_pid" ]]; then
    kill "$restart_client_pid" 2>/dev/null || true
    wait "$restart_client_pid" 2>/dev/null || true
    restart_client_pid=""
  fi
  stop_shell
  rm -rf -- "$isolated_root"
}
trap cleanup EXIT

start_shell

shell_ready=false
for _attempt in $(seq 1 100); do
  extension_list="$(timeout 1s gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.ListExtensions \
    --timeout 1 2>/dev/null || true)"
  if [[ "$extension_list" == *"$extension_uuid"* ]]; then
    shell_ready=true
    break
  fi
  if ! kill -0 "$shell_pid" 2>/dev/null; then
    print_shell_log
    exit 1
  fi
  sleep 0.1
done
if [[ "$shell_ready" != true ]]; then
  print_shell_log
  exit 1
fi

readonly enable_response="$(timeout 2s gdbus call \
  --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Extensions.EnableExtension \
  --timeout 1 \
  "$extension_uuid")"
if [[ "$enable_response" != "(true,)" ]]; then
  printf 'enable-response=%s\n' "$enable_response" >&2
  exit 1
fi

extension_ready=false
for _attempt in $(seq 1 40); do
  if timeout 1s gdbus introspect \
    --session \
    --dest com.ztools.ZToolsPreviousFocus \
    --object-path /com/ztools/ZToolsPreviousFocus >"$isolated_root/introspection.txt" 2>/dev/null; then
    extension_ready=true
    break
  fi
  if ! kill -0 "$shell_pid" 2>/dev/null; then
    print_shell_log
    exit 1
  fi
  sleep 0.1
done

if [[ "$extension_ready" != true ]] ||
  ! rg -q "RestorePreviousFocus" "$isolated_root/introspection.txt"; then
  gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.ListExtensions >&2 || true
  gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionInfo \
    "$extension_uuid" >&2 || true
  gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionErrors \
    "$extension_uuid" >&2 || true
  print_shell_log
  exit 1
fi

node_modules/.bin/esbuild \
  apps/desktop/scripts/gnome-transport-smoke.ts \
  --bundle \
  --format=esm \
  --platform=node \
  --target=node24 \
  --outfile="$isolated_root/gnome-transport-smoke.mjs" >/dev/null
readonly transport_response="$(timeout 6s node "$isolated_root/gnome-transport-smoke.mjs")"
if [[ "$transport_response" != "main-transport=host-not-foreground" ]]; then
  printf '%s\n' "$transport_response" >&2
  exit 1
fi

readonly request='{"protocolVersion":1,"sessionNonce":"headless_transport_nonce_1234567890","sequence":1,"deadlineUnixMs":4102444800000}'
readonly replay_response="$(timeout 2s gdbus call \
  --session \
  --dest com.ztools.ZToolsPreviousFocus \
  --object-path /com/ztools/ZToolsPreviousFocus \
  --method com.ztools.ZToolsPreviousFocus.RestorePreviousFocus \
  --timeout 1 \
  "$request")"

if [[ "$replay_response" != *'"result":"protocol-rejected"'* ]]; then
  printf '%s\n' "$replay_response" >&2
  exit 1
fi

readonly first_epoch="$(sed -n 's/.*"extensionEpoch":"\([A-Za-z0-9_-]*\)".*/\1/p' <<<"$replay_response")"
if [[ -z "$first_epoch" ]]; then
  printf '%s\n' "$replay_response" >&2
  exit 1
fi

readonly disable_response="$(timeout 2s gdbus call \
  --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Extensions.DisableExtension \
  --timeout 1 \
  "$extension_uuid")"
if [[ "$disable_response" != "(true,)" ]]; then
  printf 'disable-response=%s\n' "$disable_response" >&2
  exit 1
fi
for _attempt in $(seq 1 40); do
  if ! timeout 1s gdbus introspect \
    --session \
    --dest com.ztools.ZToolsPreviousFocus \
    --object-path /com/ztools/ZToolsPreviousFocus >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
if timeout 1s gdbus introspect \
  --session \
  --dest com.ztools.ZToolsPreviousFocus \
  --object-path /com/ztools/ZToolsPreviousFocus >/dev/null 2>&1; then
  exit 1
fi
sleep 0.25

readonly reenable_response="$(timeout 2s gdbus call \
  --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Extensions.EnableExtension \
  --timeout 1 \
  "$extension_uuid")"
if [[ "$reenable_response" != "(true,)" ]]; then
  printf 'reenable-response=%s\n' "$reenable_response" >&2
  exit 1
fi
reenable_ready=false
for _attempt in $(seq 1 40); do
  if timeout 1s gdbus introspect \
    --session \
    --dest com.ztools.ZToolsPreviousFocus \
    --object-path /com/ztools/ZToolsPreviousFocus >/dev/null 2>&1; then
    reenable_ready=true
    break
  fi
  sleep 0.1
done
if [[ "$reenable_ready" != true ]]; then
  gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionInfo \
    "$extension_uuid" >&2 || true
  gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionErrors \
    "$extension_uuid" >&2 || true
  exit 1
fi

readonly post_restart_request='{"protocolVersion":1,"sessionNonce":"headless_restart_nonce_1234567890","sequence":1,"deadlineUnixMs":4102444800000}'
readonly post_restart_response="$(timeout 2s gdbus call \
  --session \
  --dest com.ztools.ZToolsPreviousFocus \
  --object-path /com/ztools/ZToolsPreviousFocus \
  --method com.ztools.ZToolsPreviousFocus.RestorePreviousFocus \
  --timeout 1 \
  "$post_restart_request")"
readonly restarted_epoch="$(sed -n 's/.*"extensionEpoch":"\([A-Za-z0-9_-]*\)".*/\1/p' <<<"$post_restart_response")"
if [[ "$post_restart_response" != *'"result":"host-not-foreground"'* ||
  -z "$restarted_epoch" || "$restarted_epoch" == "$first_epoch" ]]; then
  printf '%s\n' "$post_restart_response" >&2
  exit 1
fi

node_modules/.bin/esbuild \
  apps/desktop/scripts/gnome-shell-restart-smoke.ts \
  --bundle \
  --format=esm \
  --platform=node \
  --target=node24 \
  --outfile="$isolated_root/gnome-shell-restart-smoke.mjs" >/dev/null
export ZTOOLS_SHELL_RESTART_READY="$isolated_root/shell-restart-ready"
export ZTOOLS_SHELL_RESTART_CONTINUE="$isolated_root/shell-restart-continue"
timeout 20s node "$isolated_root/gnome-shell-restart-smoke.mjs" \
  >"$isolated_root/shell-restart-client.log" 2>&1 &
restart_client_pid=$!

restart_client_ready=false
for _attempt in $(seq 1 100); do
  if [[ -f "$ZTOOLS_SHELL_RESTART_READY" ]]; then
    restart_client_ready=true
    break
  fi
  if ! kill -0 "$restart_client_pid" 2>/dev/null; then
    cat "$isolated_root/shell-restart-client.log" >&2
    exit 1
  fi
  sleep 0.05
done
if [[ "$restart_client_ready" != true ]]; then
  cat "$isolated_root/shell-restart-client.log" >&2
  exit 1
fi

readonly first_shell_pid="$shell_pid"
stop_shell
for _attempt in $(seq 1 40); do
  if ! timeout 1s gdbus introspect \
    --session \
    --dest com.ztools.ZToolsPreviousFocus \
    --object-path /com/ztools/ZToolsPreviousFocus >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
if timeout 1s gdbus introspect \
  --session \
  --dest com.ztools.ZToolsPreviousFocus \
  --object-path /com/ztools/ZToolsPreviousFocus >/dev/null 2>&1; then
  exit 1
fi

start_shell
if [[ "$shell_pid" == "$first_shell_pid" ]]; then
  printf 'shell PID did not rotate\n' >&2
  exit 1
fi
shell_ready=false
for _attempt in $(seq 1 100); do
  if timeout 1s gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.ListExtensions \
    --timeout 1 2>/dev/null | rg -q "$extension_uuid"; then
    shell_ready=true
    break
  fi
  if ! kill -0 "$shell_pid" 2>/dev/null; then
    print_shell_log
    exit 1
  fi
  sleep 0.1
done
if [[ "$shell_ready" != true ]]; then
  print_shell_log
  exit 1
fi

# A discovered extension is not necessarily active after a Shell process restart.
restart_enable_response="$(timeout 2s gdbus call \
  --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Extensions.EnableExtension \
  --timeout 1 \
  "$extension_uuid")"
if [[ "$restart_enable_response" != "(true,)" ]]; then
  printf 'restart-enable-response=%s\n' "$restart_enable_response" >&2
  gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionInfo \
    "$extension_uuid" >&2 || true
  gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionErrors \
    "$extension_uuid" >&2 || true
  cat "$isolated_root/shell-restart-client.log" >&2
  print_shell_log
  exit 1
fi

restart_extension_ready=false
for _attempt in $(seq 1 60); do
  if timeout 1s gdbus introspect \
    --session \
    --dest com.ztools.ZToolsPreviousFocus \
    --object-path /com/ztools/ZToolsPreviousFocus >/dev/null 2>&1; then
    restart_extension_ready=true
    break
  fi
  # Shell may discover an extension before its manager can complete the first enable request.
  if (( _attempt % 10 == 0 )); then
    timeout 2s gdbus call \
      --session \
      --dest org.gnome.Shell \
      --object-path /org/gnome/Shell \
      --method org.gnome.Shell.Extensions.EnableExtension \
      --timeout 1 \
      "$extension_uuid" >/dev/null 2>&1 || true
  fi
  if ! kill -0 "$shell_pid" 2>/dev/null; then
    print_shell_log
    exit 1
  fi
  sleep 0.1
done
if [[ "$restart_extension_ready" != true ]]; then
  gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionInfo \
    "$extension_uuid" >&2 || true
  gdbus call \
    --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionErrors \
    "$extension_uuid" >&2 || true
  cat "$isolated_root/shell-restart-client.log" >&2
  print_shell_log
  exit 1
fi

: >"$ZTOOLS_SHELL_RESTART_CONTINUE"
if ! wait "$restart_client_pid"; then
  cat "$isolated_root/shell-restart-client.log" >&2
  exit 1
fi
restart_client_pid=""
readonly shell_restart_response="$(cat "$isolated_root/shell-restart-client.log")"
if [[ "$shell_restart_response" != *"shell-restart=epoch-changed-session-revoked"* ]]; then
  printf '%s\n' "$shell_restart_response" >&2
  exit 1
fi

printf 'extension=%s\n' "$extension_uuid"
printf 'introspection=fixed-method-present\n'
printf '%s\n' "$transport_response"
printf 'replay=protocol-rejected\n'
printf 'disable=service-revoked\n'
printf 'reenable=epoch-rotated\n'
printf 'shell-restart=service-restored-old-client-revoked\n'
