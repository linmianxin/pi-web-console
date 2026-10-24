#!/usr/bin/env bash
# 一键启动脚本（macOS / Linux）
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  Pi 控制台正在启动..."
echo "  浏览器访问 http://localhost:8000"
echo "  按 Ctrl+C 停止服务"
echo "============================================"

PORT=${PORT:-8000}
if command -v open >/dev/null 2>&1; then
  ( sleep 2; open "http://localhost:${PORT}" ) &
elif command -v xdg-open >/dev/null 2>&1; then
  ( sleep 2; xdg-open "http://localhost:${PORT}" ) &
fi

node server.mjs
