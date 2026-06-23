#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> pull latest"
git pull --ff-only origin main

echo "==> build frontend with subpath base"
( cd frontend && rm -rf /tmp/fg-build \
  && FEYNGRAPH_FRONTEND_BASE=/feynmangraph/ npx vite build --outDir /tmp/fg-build --emptyOutDir )
grep -q "/feynmangraph/assets" /tmp/fg-build/index.html \
  || { echo "ABORT: build is missing the /feynmangraph/ base"; exit 1; }

echo "==> swap in new build (rollback at feyngraph/data/frontend.bak)"
rm -rf feyngraph/data/frontend.bak
mv feyngraph/data/frontend feyngraph/data/frontend.bak
mv /tmp/fg-build feyngraph/data/frontend

echo "==> restart service"
sudo systemctl restart feynmangraph
sleep 2
systemctl is-active --quiet feynmangraph \
  || { echo "FAIL: service not active — check 'journalctl -u feynmangraph'"; exit 1; }

echo "==> verify"
curl -s -o /dev/null -w "  /api/health -> %{http_code}\n" https://gammaloop.hirschi.lu/feynmangraph/api/health
echo "done -> https://gammaloop.hirschi.lu/feynmangraph/"
