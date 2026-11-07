#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# DXN Stockpoint — Member Login & PV Distribution build script
# Runs: PHP lint → API smoke test → (optional) InfinityFree deploy
# =============================================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_SRC="$ROOT/api/src"
API_PUBLIC="$ROOT/api/public"
ERRORS=0

log()  { printf '\033[1;34m[build]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m  %s\n' "$*"; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n' "$*"; ERRORS=$((ERRORS+1)); }

cd "$ROOT"

# ── 1. PHP syntax check (skipped if php not installed) ───────────────────────
if command -v php >/dev/null 2>&1; then
  log "PHP lint: api/src/*.php api/src/Controllers/*.php api/public/index.php"
  for f in \
    "$API_SRC/Auth.php" \
    "$API_SRC/Controllers/MemberAuthController.php" \
    "$API_SRC/Controllers/MemberController.php" \
    "$API_SRC/Controllers/PVDistributionController.php" \
    "$API_SRC/Store.php" \
    "$API_SRC/Schema.php" \
    "$API_PUBLIC/index.php"; do
    if [ -f "$f" ]; then
      if php -l "$f" >/dev/null 2>&1; then
        ok "lint $f"
      else
        fail "lint $f"
        php -l "$f"
      fi
    else
      fail "missing $f"
    fi
  done
else
  log "php not installed — skipping lint (run on a machine with PHP)"
fi

# ── 2. API smoke test (SQLite) ───────────────────────────────────────────────
log "API smoke test: scripts/test-api.mjs"
if [ -f scripts/test-api.mjs ]; then
  if node scripts/test-api.mjs >/tmp/member-pv-smoke.log 2>&1; then
    ok "smoke test passed"
  else
    fail "smoke test failed"
    tail -40 /tmp/member-pv-smoke.log
  fi
else
  fail "scripts/test-api.mjs not found"
fi

# ── 3. Optional: InfinityFree deploy ─────────────────────────────────────────
if [ "${DXN_DEPLOY:-0}" = "1" ]; then
  log "Deploying to InfinityFree via GitHub Actions"
  echo "Push to main and the api-deploy.yml workflow handles FTP + auto-install."
else
  log "Skipping deploy (set DXN_DEPLOY=1 to push after merge)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
if [ "$ERRORS" -gt 0 ]; then
  fail "Build failed with $ERRORS error(s)"
  exit 1
fi
ok "Member login + PV distribution build complete"
