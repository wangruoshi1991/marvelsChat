"""Explicit LAN sharing of the public sample, bound only to a physical IPv4."""
from __future__ import annotations

import ipaddress
import os
from pathlib import Path
import re
import subprocess
import sys


def physical_addresses():
    hardware = subprocess.check_output(["/usr/sbin/networksetup", "-listallhardwareports"], text=True)
    candidates = []
    for block in hardware.split("\n\n"):
        match = re.search(r"^Device: (en\d+)$", block, re.M)
        if not match:
            continue
        interface = match.group(1)
        info = subprocess.check_output(["/sbin/ifconfig", interface], text=True)
        if "status: active" not in info:
            continue
        address = re.search(r"\binet (\d+\.\d+\.\d+\.\d+) netmask (0x[0-9a-f]+)", info)
        if not address:
            continue
        ip = ipaddress.IPv4Address(address.group(1))
        if ip.is_loopback or ip.is_link_local:
            continue
        mask = ipaddress.IPv4Address(int(address.group(2), 16))
        network = ipaddress.ip_network(f"{ip}/{mask}", strict=False)
        label = re.search(r"^Hardware Port: (.+)$", block, re.M).group(1)
        candidates.append((str(ip), str(network), interface, label))
    return candidates


def main():
    root = Path(__file__).resolve().parent
    candidates = physical_addresses()
    preferred = os.environ.get("PHOTO_SEARCH_LAN_IP")
    if preferred:
        candidates = [candidate for candidate in candidates if candidate[0] == preferred]
    if not candidates:
        raise SystemExit("没有找到可用的局域网地址。请连接Wi-Fi或网线，再重新启动。")
    address, network, interface, label = candidates[0]
    environment = os.environ.copy()
    environment.update({
        "PHOTO_SEARCH_DATA": str(root / ".data-public-demo"),
        "PHOTO_SEARCH_SOURCES": str(root / "tests/public-library/SOURCES.json"),
        "PHOTO_SEARCH_ALLOWED_HOSTS": address,
        "PHOTO_SEARCH_LAN_CIDR": network,
    })
    print(f"局域网测试相册已选择 {label}（{interface}）", flush=True)
    print(f"其他电脑在浏览器打开：http://{address}:8766", flush=True)
    print(f"允许访问的网段：{network}", flush=True)
    print("共享的是公开测试相册；导入、反馈与清空会影响所有访问者。", flush=True)
    if os.environ.get("PHOTO_SEARCH_BACKGROUND") == "1":
        print("后台服务运行中；双击 stop-lan-demo.command 停止共享。", flush=True)
    else:
        print("保持此窗口打开；按 Control-C 停止局域网访问。", flush=True)
    os.chdir(root)
    os.execve(sys.executable, [sys.executable, "-m", "uvicorn", "app:app", "--host", address,
                              "--port", "8766", "--no-proxy-headers"], environment)


if __name__ == "__main__":
    main()
