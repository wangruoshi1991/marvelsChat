#!/bin/zsh
set -e
cd "$(dirname "$0")"
if ! command -v uv >/dev/null 2>&1; then
  echo "需要安装 uv 才能准备运行环境：https://docs.astral.sh/uv/"
  exit 1
fi
if [[ ! -x .venv/bin/python ]]; then
  uv venv --python 3.12 .venv
fi
if [[ ! -f .venv/.photo-search-ready ]] || [[ requirements.lock.txt -nt .venv/.photo-search-ready ]]; then
  uv pip install --python .venv/bin/python -r requirements.lock.txt
  touch .venv/.photo-search-ready
fi
echo "相册检索已启动。请打开 http://127.0.0.1:8765"
echo "照片保存在本机；按 Control-C 停止。"
exec .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8765
