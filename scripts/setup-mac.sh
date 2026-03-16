#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is required. Install it from https://brew.sh and rerun this script."
    exit 1
fi

echo "Installing macOS packages from Brewfile..."
brew bundle --file="$ROOT_DIR/Brewfile"

echo "Installing server dependencies..."
npm install --prefix "$ROOT_DIR/server"

echo "Installing web dependencies..."
npm install --prefix "$ROOT_DIR/web"

echo "Checking scanner visibility..."
if scanimage -L; then
    echo "Scanner detection completed."
else
    echo "scanimage could not list a scanner yet. Check USB connection and SANE support."
fi

echo "Setup finished."
echo "Start the backend with: npm run dev --prefix \"$ROOT_DIR/server\""
echo "Start the frontend with: npm run dev --prefix \"$ROOT_DIR/web\""

