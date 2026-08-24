#!/bin/bash
# SessionStart-hook — bereidt een Claude Code (web) sessie voor op echt testwerk.
#
# Doet bewust alleen het goedkope, altijd-nodige deel:
#   1. npm-dependencies installeren (zonder deze werkt geen tsc, vitest of eslint)
#   2. de Docker-randvoorwaarden klaarzetten voor de lokale Supabase-teststack
#
# De stack zelf start NIET automatisch — dat kost minuten en is niet elke sessie
# nodig. Draai hem wanneer je de app echt wilt gebruiken:
#     bash scripts/dev/test-stack.sh --dev
# Zie docs/dev/lokale-teststack.md.
#
# De hook mag een sessie nooit blokkeren: alles is best-effort en eindigt op 0.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "${BASH_SOURCE[0]}")/../..}" || exit 0

# Alleen in de remote/cloud-omgeving; lokaal beheert de ontwikkelaar dit zelf.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "[session-start] dependencies installeren"
npm install --no-audit --no-fund || echo "[session-start] npm install faalde — doe het handmatig"

# Docker-daemon draait niet vanzelf in deze container, en de gebruikelijke
# registries zijn hier onbereikbaar: Docker Hub weigert anonieme pulls vanaf het
# gedeelde proxy-IP (429) en de layer-CDN's van ghcr.io en AWS ECR geven 403.
# Google's Docker Hub-mirror werkt wel; die zetten we als registry-mirror.
if command -v dockerd >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  echo "[session-start] docker klaarzetten"
  mkdir -p /etc/docker
  if ! grep -q "mirror.gcr.io" /etc/docker/daemon.json 2>/dev/null; then
    echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
  fi
  nohup dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 20); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 \
    && echo "[session-start] docker draait" \
    || echo "[session-start] docker kwam niet op — zie /tmp/dockerd.log"
fi

echo "[session-start] klaar. Teststack starten: bash scripts/dev/test-stack.sh --dev"
exit 0
