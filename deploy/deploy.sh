#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy the currently checked-out revision. Pulling from Git is deliberately
# separate so a deploy never changes the working copy unexpectedly.
REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
DEPLOY_DIR=${DEPLOY_DIR:-/opt/gokite}
SERVICE_NAME=${SERVICE_NAME:-gokite}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8787/api/health}
WAIT_SECONDS=${WAIT_SECONDS:-120}

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

cd "$REPO_ROOT"

command -v node >/dev/null || die "node is required for preflight checks"
command -v rsync >/dev/null || die "rsync is required"
command -v curl >/dev/null || die "curl is required"

if [[ -n "$(git status --porcelain)" ]]; then
  die "working tree is dirty; commit or stash changes before deploying"
fi

log "preflight: $(git rev-parse --short HEAD)"
node --check src/server.js
node - <<'NODE'
const spots = require('./src/spots');
if (!spots.length) throw new Error('no spots configured');
console.log(`[deploy] preflight: ${spots.length} spots configured`);
NODE

log "syncing to $DEPLOY_DIR"
sudo mkdir -p "$DEPLOY_DIR"
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude '.env*' \
  --exclude '*.log' \
  "$REPO_ROOT/" "$DEPLOY_DIR/"
sudo chown -R gokite:gokite "$DEPLOY_DIR"

log "installing systemd unit"
sudo cp "$DEPLOY_DIR/deploy/gokite.service" "/etc/systemd/system/$SERVICE_NAME.service"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME" >/dev/null

log "restarting $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

log "waiting for forecast health (up to ${WAIT_SECONDS}s)"
deadline=$((SECONDS + WAIT_SECONDS))
until response=$(curl --fail --silent --show-error "$HEALTH_URL"); do
  if (( SECONDS >= deadline )); then
    sudo systemctl status "$SERVICE_NAME" --no-pager || true
    sudo journalctl -u "$SERVICE_NAME" -n 50 --no-pager || true
    die "health check did not become ready: $HEALTH_URL"
  fi
  sleep 3
done

printf '%s\n' "$response"
log "deployment healthy"
