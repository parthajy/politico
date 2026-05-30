#!/usr/bin/env bash
# Samvidya — one-command deploy to the DO droplet.
#
# Usage:  ./deploy.sh         # rsync, install, build, restart
#         ./deploy.sh --fast  # skip npm ci (use when only source files changed)
#
# Assumes your SSH key is in root@168.144.83.204:/root/.ssh/authorized_keys.

set -euo pipefail

DROPLET="root@168.144.83.204"
APP_DIR="/opt/samvidya"
FAST="${1:-}"

cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }

START=$(date +%s)

cyan "==> rsyncing project to $DROPLET:$APP_DIR"
rsync -az --delete \
  --exclude '.next' \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  --exclude 'mobile/android' \
  --exclude 'mobile/node_modules' \
  --exclude '.vercel' \
  ./ "$DROPLET:$APP_DIR/"

cyan "==> syncing .env.local → /opt/samvidya/.env"
if [ -f .env.local ]; then
  rsync -az .env.local "$DROPLET:$APP_DIR/.env"
else
  red "No .env.local found locally; remote .env unchanged."
fi

cyan "==> install + build on droplet"
if [ "$FAST" = "--fast" ]; then
  ssh "$DROPLET" "cd $APP_DIR && NODE_OPTIONS='--max-old-space-size=1536' npm run build" \
    | tail -20
else
  ssh "$DROPLET" "cd $APP_DIR && npm ci --no-audit --no-fund --loglevel=error && NODE_OPTIONS='--max-old-space-size=1536' npm run build" \
    | tail -20
fi

cyan "==> restart samvidya systemd unit"
ssh "$DROPLET" 'systemctl restart samvidya && sleep 3 && systemctl --no-pager status samvidya | head -10'

cyan "==> smoke test"
# / redirects to /login (signed-out) or /firm (signed-in), so a 3xx is healthy.
SMOKE=$(curl -sI http://168.144.83.204/ | head -1 || true)
if echo "$SMOKE" | grep -qE "20[0-9]|30[0-9]"; then
  green "✓ App responding at http://168.144.83.204/ ($SMOKE)"
else
  red "✗ App not responding cleanly: $SMOKE"
  exit 1
fi

DUR=$(( $(date +%s) - START ))
green "Done in ${DUR}s."
