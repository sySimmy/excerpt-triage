#!/bin/bash
# New machine setup script for Excerpt Triage
set -e
cd "$(dirname "$0")"

echo "=== Excerpt Triage Setup ==="
echo ""

# 1. Check .env.local
if [ ! -f .env.local ]; then
  echo "[!] .env.local not found, creating from .env.example..."
  cp .env.example .env.local
  echo "    Please edit .env.local to set your MINIMAX_API_KEY"
else
  echo "[ok] .env.local exists"
fi

# 2. Handle node_modules for iCloud compatibility
if [ -d node_modules ] && [ ! -L node_modules ]; then
  echo "[*] Converting node_modules to .nosync symlink (iCloud safe)..."
  mv node_modules node_modules.nosync
  ln -s node_modules.nosync node_modules
elif [ -L node_modules ]; then
  echo "[ok] node_modules is already a symlink"
fi

# 3. npm install
echo "[*] Installing dependencies..."
npm install

# 4. Handle .next for iCloud compatibility
if [ -d .next ] && [ ! -L .next ]; then
  echo "[*] Converting .next to .nosync symlink (iCloud safe)..."
  mv .next .next.nosync
  ln -s .next.nosync .next
elif [ -L .next ]; then
  echo "[ok] .next is already a symlink"
fi

# 5. Ensure .nosync directory for SQLite DB
mkdir -p .nosync

echo ""
echo "=== Setup complete ==="
echo "Run: npm run dev"
echo "Visit: http://localhost:3456"
