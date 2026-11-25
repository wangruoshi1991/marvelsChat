"""Manage the LAN demo independently of a terminal, for this macOS login."""
from __future__ import annotations

import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

from lan_launcher import physical_addresses

ROOT = Path(__file__).resolve().parent
RUN = ROOT / ".run"
LABEL = "local.mx.photo-search.lan"
DOMAIN = f"gui/{os.getuid()}"
TARGET = f"{DOMAIN}/{LABEL}"
PLIST = RUN / "lan-service.plist"
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def launchctl(*args):
    return subprocess.run(["/bin/launchctl", *args], text=True, capture_output=True)


def healthy(url):
    try:
        with HTTP.open(url + "/api/status", timeout=2) as response:
            return json.load(response).get("network_mode") == "lan"
    except (OSError, ValueError, urllib.error.URLError):
        return False


def stop():
    if launchctl("print", TARGET).returncode == 0:
        result = launchctl("bootout", TARGET)
        if result.returncode:
            raise SystemExit(f"停止服务失败：{result.stderr.strip()}")


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "start"
    if action == "stop":
        stop()
        print("局域网后台服务已停止。相册和模型文件保留。")
        return
    if action != "start":
        raise SystemExit("用法：lan_service.py start|stop")

    candidates = physical_addresses()
    preferred = os.environ.get("PHOTO_SEARCH_LAN_IP")
    if preferred:
        candidates = [candidate for candidate in candidates if candidate[0] == preferred]
    if not candidates:
        raise SystemExit("没有找到可用的局域网地址。请连接Wi-Fi或网线，再重新启动。")
    url = f"http://{candidates[0][0]}:8766"
    loaded = launchctl("print", TARGET).returncode == 0
    if not (loaded and healthy(url)):
        if loaded:
            stop()
        RUN.mkdir(exist_ok=True)
        environment = {"PYTHONUNBUFFERED": "1", "PHOTO_SEARCH_BACKGROUND": "1"}
        if preferred:
            environment["PHOTO_SEARCH_LAN_IP"] = preferred
        configuration = {
            "Label": LABEL,
            "ProgramArguments": [str(ROOT / ".venv/bin/python"), str(ROOT / "lan_launcher.py")],
            "WorkingDirectory": str(ROOT),
            "EnvironmentVariables": environment,
            "RunAtLoad": True,
            "KeepAlive": True,
            "ThrottleInterval": 15,
            "StandardOutPath": str(RUN / "lan-service.log"),
            "StandardErrorPath": str(RUN / "lan-service-error.log"),
        }
        PLIST.write_bytes(plistlib.dumps(configuration))
        PLIST.chmod(0o600)
        result = launchctl("bootstrap", DOMAIN, str(PLIST))
        if result.returncode:
            raise SystemExit(f"启动后台服务失败：{result.stderr.strip()}")
        deadline = time.monotonic() + 30
        while not healthy(url):
            if time.monotonic() >= deadline:
                raise SystemExit(f"服务尚未就绪。请查看 {RUN / 'lan-service-error.log'}")
            time.sleep(0.5)
    print(f"局域网测试相册已在后台运行：{url}")
    print("可以关闭启动窗口；请让这台Mac保持开机、联网和唤醒。")
    print("重新登录或重启Mac后，再双击 start-lan-demo.command。")
    print("停止共享：双击 stop-lan-demo.command。")


if __name__ == "__main__":
    main()
