#!/bin/bash
# SessionStart hook: installeer dependencies zodat tsc/lint/tests (en de
# pre-push hook) in de container kunnen draaien. Alleen in een remote
# (Claude Code op het web) sessie; lokaal heb je je eigen node_modules.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Idempotent en niet-interactief. `npm install` (niet `ci`) zodat de
# container-cache na afloop hergebruikt wordt bij een volgende sessie.
echo "→ Installing dependencies (npm install)…"
npm install --no-audit --no-fund

echo "✓ Dependencies installed."
