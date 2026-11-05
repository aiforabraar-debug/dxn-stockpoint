#!/usr/bin/env bash
# Local DXN Stockpoint API for Android (Termux/PRoot) and any Linux box.
#
#   ./scripts/android-server.sh start          # install (first run) + run 24/7
#   ./scripts/android-server.sh start --tunnel # also expose a quick Cloudflare URL
#   ./scripts/android-server.sh status
#   ./scripts/android-server.sh url
#   ./scripts/android-server.sh stop
#   ./scripts/android-server.sh install        # reset SQLite + PIN 2468
#   ./scripts/android-server.sh install-boot   # Termux:Boot hook
#
# The API and the web app are served from the same origin, so the browser and
# Android client avoid the InfinityFree challenge. Data lives in
# ~/.dxn-stockpoint/dxn.sqlite by default.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/$(basename -- "${BASH_SOURCE[0]}")"
DATA_DIR="${DXN_DATA_DIR:-$HOME/.dxn-stockpoint}"
RUNTIME="$DATA_DIR/api"
DB_PATH="$DATA_DIR/dxn.sqlite"
PORT="${DXN_PORT:-8099}"
PIN="${DXN_SHOP_PIN:-2468}"

mkdir -p "$DATA_DIR"

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

find_php() {
  local candidate
  for candidate in "${DXN_PHP:-}" php php83; do
    [ -n "$candidate" ] || continue
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

PHP_BIN="$(find_php || true)"
[ -n "$PHP_BIN" ] || die "PHP 8.1+ not found. Termux: pkg install php php-sqlite3. Alpine: apk add php83 php83-pdo_sqlite."
"$PHP_BIN" -r 'exit(extension_loaded("pdo_sqlite") ? 0 : 1);' >/dev/null 2>&1 \
  || die "PHP is missing pdo_sqlite. Termux: pkg install php-sqlite3. Alpine: apk add php83-pdo_sqlite."

gen_hex() { "$PHP_BIN" -r 'echo bin2hex(random_bytes('$1'));'; }

SECRETS_FILE="$DATA_DIR/secrets.env"
if [ -f "$SECRETS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
  set +a
fi
ADMIN_KEY="${DXN_ADMIN_KEY:-${ADMIN_KEY:-$(gen_hex 24)}}"
INSTALL_KEY="${DXN_INSTALL_KEY:-${INSTALL_KEY:-$(gen_hex 12)}}"
TOKEN_SECRET="${DXN_TOKEN_SECRET:-${TOKEN_SECRET:-$(gen_hex 32)}}"
umask 077
cat > "$SECRETS_FILE" <<EOF
ADMIN_KEY=$ADMIN_KEY
INSTALL_KEY=$INSTALL_KEY
TOKEN_SECRET=$TOKEN_SECRET
EOF
chmod 600 "$SECRETS_FILE"

export DXN_DATA_DIR="$DATA_DIR"
export DXN_PORT="$PORT"
export DXN_SHOP_PIN="$PIN"
export DXN_DRIVER=sqlite
export DXN_DB_PATH="$DB_PATH"
export DXN_ADMIN_KEY="$ADMIN_KEY"
export DXN_INSTALL_KEY="$INSTALL_KEY"
export DXN_TOKEN_SECRET="$TOKEN_SECRET"
export DXN_ALLOWED_ORIGINS='*'

find_cloudflared() {
  local candidate
  for candidate in "${DXN_CLOUDFLARED:-}" cloudflared \
    "$ROOT/.tooling/cloudflared" "/workspace/dxn-api-live/cloudflared"; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

write_router() {
  cat > "$RUNTIME/public/router.php" <<'PHP'
<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($path === '/install.php') {
    require __DIR__ . '/install.php';
    return true;
}

if ($path === '/' || $path === '/app') {
    header('Location: /app/');
    return true;
}

if ($path === '/app/') {
    readfile(__DIR__ . '/app/index.html');
    return true;
}

$file = __DIR__ . $path;
if ($path !== '/' && is_file($file) && strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'php') {
    return false;
}

require __DIR__ . '/index.php';
return true;
PHP
}

sync_code() {
  mkdir -p "$DATA_DIR" "$RUNTIME" "$RUNTIME/config" "$RUNTIME/storage"

  # Preserve the installed marker across code updates.
  local was_installed=0
  [ -f "$RUNTIME/config/installed.lock" ] && was_installed=1

  cp -a "$ROOT/api/." "$RUNTIME/"
  rm -f "$RUNTIME/config/config.php"
  if [ "$was_installed" = 1 ]; then
    touch "$RUNTIME/config/installed.lock"
  else
    rm -f "$RUNTIME/config/installed.lock"
  fi

  cat > "$RUNTIME/config/config.php" <<PHP
<?php
return [
    'driver' => 'sqlite',
    'db' => ['path' => '$DB_PATH'],
    'admin_key' => '$ADMIN_KEY',
    'token_secret' => '$TOKEN_SECRET',
    'install_key' => '$INSTALL_KEY',
    'allowed_origins' => '*',
    'timezone' => 'Asia/Dhaka',
    'debug' => false,
    'version' => '2.2.0',
];
PHP

  if [ -d "$ROOT/docs" ]; then
    mkdir -p "$RUNTIME/public/app"
    cp -a "$ROOT/docs/." "$RUNTIME/public/app/"
    rm -f "$RUNTIME/public/app/DEPLOYMENT.md" "$RUNTIME/public/app/.ftp-state"*.json
  fi

  write_router
}

ensure_installed() {
  if [ -f "$RUNTIME/config/installed.lock" ] && [ -f "$DB_PATH" ]; then
    return 0
  fi
  log "Installing SQLite database at $DB_PATH …"
  "$PHP_BIN" "$RUNTIME/bin/install.php" --pin="$PIN" >> "$DATA_DIR/install.log" 2>&1 \
    || die "install failed; see $DATA_DIR/install.log"
}

is_running() {
  [ -f "$DATA_DIR/supervisor.pid" ] && kill -0 "$(cat "$DATA_DIR/supervisor.pid")" 2>/dev/null
}

lan_ips() {
  { hostname -I 2>/dev/null || true
    ip -4 addr show 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1
    ifconfig 2>/dev/null | awk '/inet /{print $2}' | sed 's/addr://'
  } | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^127\.' | sort -u || true
}

print_urls() {
  log ""
  log "API:  http://127.0.0.1:$PORT/api/v1/health"
  log "App:  http://127.0.0.1:$PORT/app/"
  lan_ips | while read -r ip; do
    log "LAN:  http://$ip:$PORT/  (Android Settings → Server URL: http://$ip:$PORT/)"
  done
  if [ -f "$DATA_DIR/tunnel.url" ]; then
    log "Tunnel: $(cat "$DATA_DIR/tunnel.url")"
  fi
  log "PIN:  $PIN"
  log ""
}

status() {
  if is_running; then
    log "supervisor: running (pid $(cat "$DATA_DIR/supervisor.pid"))"
  else
    log "supervisor: stopped"
  fi

  local health
  health="$("$PHP_BIN" -r 'echo @file_get_contents("http://127.0.0.1:'"$PORT"'/api/v1/health");' 2>/dev/null || true)"
  if [ -n "$health" ]; then
    log "health: $health"
  else
    log "health: no answer on port $PORT"
  fi
  print_urls
  log "secrets: $SECRETS_FILE"
}

start_tunnel() {
  local cf
  cf="$(find_cloudflared || true)"
  if [ -z "$cf" ]; then
    log "cloudflared not found; skipping tunnel. Set DXN_CLOUDFLARED=/path/to/cloudflared."
    return 0
  fi
  : > "$DATA_DIR/tunnel.log"
  rm -f "$DATA_DIR/tunnel.url"
  nohup "$SCRIPT" __tunnel "$cf" >> "$DATA_DIR/tunnel-supervisor.log" 2>&1 &
  echo $! > "$DATA_DIR/tunnel.pid"

  local i
  for i in $(seq 1 40); do
    if [ -s "$DATA_DIR/tunnel.url" ]; then
      log "Tunnel: $(cat "$DATA_DIR/tunnel.url")"
      return 0
    fi
    sleep 1
  done
  log "tunnel is still starting; check $DATA_DIR/tunnel.log"
}

run_tunnel() {
  local cf="$1"
  trap 'kill "${TPID:-0}" 2>/dev/null || true; exit 0' TERM INT
  while :; do
    "$cf" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >> "$DATA_DIR/tunnel.log" 2>&1 &
    TPID=$!
    local i url
    for i in $(seq 1 60); do
      url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$DATA_DIR/tunnel.log" 2>/dev/null | tail -1 || true)"
      if [ -n "$url" ]; then
        printf '%s\n' "$url" > "$DATA_DIR/tunnel.url"
        break
      fi
      sleep 1
    done
    wait "$TPID" 2>/dev/null || true
    sleep 5
  done
}

run_supervisor() {
  sync_code
  ensure_installed

  local php_pid=0
  trap 'kill "$php_pid" 2>/dev/null || true; exit 0' TERM INT

  while :; do
    "$PHP_BIN" -S "0.0.0.0:$PORT" -t "$RUNTIME/public" "$RUNTIME/public/router.php" \
      >> "$DATA_DIR/server.log" 2>&1 &
    php_pid=$!
    echo "$php_pid" > "$DATA_DIR/server.pid"
    wait "$php_pid" 2>/dev/null || true
    sleep 2
  done
}

stop_all() {
  local name pidfile pid
  for name in supervisor server tunnel; do
    pidfile="$DATA_DIR/$name.pid"
    [ -f "$pidfile" ] || continue
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    rm -f "$pidfile"
  done
  command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock || true
  log "stopped"
}

install_boot() {
  local boot_dir="$HOME/.termux/boot"
  mkdir -p "$boot_dir"
  cat > "$boot_dir/dxn-server" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock 2>/dev/null || true
exec "$ROOT/scripts/android-server.sh" start >> "$DATA_DIR/boot.log" 2>&1
EOF
  chmod +x "$boot_dir/dxn-server"
  log "Installed $boot_dir/dxn-server (requires Termux:Boot)."
}

case "${1:-start}" in
  start)
    if is_running; then
      log "already running"
      status
      exit 0
    fi
    command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
    nohup "$SCRIPT" __run >> "$DATA_DIR/supervisor.log" 2>&1 &
    echo $! > "$DATA_DIR/supervisor.pid"
    sleep 2
    if [ "${2:-}" = "--tunnel" ] || [ "${DXN_TUNNEL:-0}" = "1" ]; then
      start_tunnel
    fi
    status
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    sleep 1
    exec "$0" start "${2:-}"
    ;;
  status)
    status
    ;;
  url)
    [ -f "$DATA_DIR/tunnel.url" ] && cat "$DATA_DIR/tunnel.url" || log "no tunnel URL"
    ;;
  install)
    sync_code
    "$PHP_BIN" "$RUNTIME/bin/install.php" --pin="$PIN" --fresh >> "$DATA_DIR/install.log" 2>&1 \
      || die "install failed; see $DATA_DIR/install.log"
    log "installed $DB_PATH with PIN $PIN"
    ;;
  logs)
    tail -n 80 "$DATA_DIR/server.log" 2>/dev/null || true
    tail -n 40 "$DATA_DIR/install.log" 2>/dev/null || true
    tail -n 40 "$DATA_DIR/tunnel.log" 2>/dev/null || true
    ;;
  install-boot)
    install_boot
    ;;
  __run)
    run_supervisor
    ;;
  __tunnel)
    run_tunnel "$2"
    ;;
  *)
    sed -n '12,25p' "$0"
    exit 1
    ;;
esac
