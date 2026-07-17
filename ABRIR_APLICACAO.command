#!/bin/zsh
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "Iniciando TechBoard+ em http://localhost:3030"
echo "Nao feche esta janela enquanto estiver usando o sistema."
echo ""

export PORT=3030
export NODE_ENV=development
unset VITE_OAUTH_PORTAL_URL
unset VITE_APP_ID

(
  sleep 8
  open "http://localhost:3030"
) &

pnpm dev
