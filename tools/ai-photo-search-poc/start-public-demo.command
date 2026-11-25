#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  echo "请先运行 start.command 准备环境。"
  exit 1
fi
export PHOTO_SEARCH_DATA="$PWD/.data-public-demo"
export PHOTO_SEARCH_SOURCES="$PWD/tests/public-library/SOURCES.json"
echo "公开图库测试相册：http://127.0.0.1:8766"
echo "此相册与个人相册分开保存。按 Control-C 停止。"
exec .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8766
