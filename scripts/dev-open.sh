#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "Starting scanner backend..."
npm run dev --prefix server > /tmp/scanner-server.log 2>&1 &
SERVER_PID=$!

echo "Starting scanner frontend..."
npm run dev --prefix web > /tmp/scanner-web.log 2>&1 &
WEB_PID=$!

cleanup() {
    kill "$SERVER_PID" "$WEB_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

for _ in {1..60}; do
    if curl -sf http://127.0.0.1:5173 >/dev/null 2>&1 || curl -sf http://localhost:5173 >/dev/null 2>&1; then
        echo "Opening browser at http://localhost:5173"
        open http://localhost:5173
        wait "$SERVER_PID" "$WEB_PID"
        exit 0
    fi
    sleep 1
done

echo "Frontend did not become ready within 60 seconds."
echo "Server log: /tmp/scanner-server.log"
echo "Web log: /tmp/scanner-web.log"
exit 1
