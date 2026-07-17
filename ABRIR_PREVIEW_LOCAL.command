#!/bin/zsh
cd "$(dirname "$0")"
echo "Abrindo TechBoard+ em http://localhost:3030"
sleep 1
open "http://localhost:3030" >/dev/null 2>&1 &
PORT=3030 node scripts/static-preview-server.mjs
