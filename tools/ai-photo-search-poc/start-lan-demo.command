#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  echo "请先运行 start.command 准备运行环境。"
  exit 1
fi
exec .venv/bin/python lan_service.py start
