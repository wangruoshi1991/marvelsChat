"""Restore fixed public test images without changing their source manifest."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
import urllib.parse
import urllib.request

MAX_BYTES = 30 * 1024 * 1024
ALLOWED_HOSTS = {"upload.wikimedia.org", "thumb.wikimedia.org", "raw.githubusercontent.com"}


def validate_url(url):
    if not isinstance(url, str):
        raise ValueError("下载地址必须是 HTTPS URL")
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS
            or parsed.port not in (None, 443) or parsed.username or parsed.password):
        raise ValueError(f"不允许的下载地址：{url}")
    return url


class PublicRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        validate_url(new_url)
        return super().redirect_request(request, response, code, message, headers, new_url)


def manifest_entries(sample):
    manifest = json.loads((sample / "SOURCES.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise ValueError("SOURCES.json 必须是包含 images 的对象")
    images = manifest.get("images")
    if not isinstance(images, list) or not images:
        raise ValueError("SOURCES.json 必须包含非空 images 列表")
    entries = []
    seen = set()
    for image in images:
        if not isinstance(image, dict):
            raise ValueError("images 中的每一项必须是对象")
        filename = image.get("file")
        if not isinstance(filename, str) or not filename or "\\" in filename:
            raise ValueError("来源记录缺少有效 file 路径")
        relative = PurePosixPath(filename)
        destination = (sample / filename).resolve()
        if (relative.is_absolute() or ".." in relative.parts
                or not destination.is_relative_to(sample) or destination == sample):
            raise ValueError(f"文件路径必须位于素材目录内：{filename}")
        if destination in seen:
            raise ValueError(f"来源清单包含重复路径：{filename}")
        seen.add(destination)
        checksum = image.get("sha256")
        if not isinstance(checksum, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", checksum):
            raise ValueError(f"{filename} 缺少有效 sha256，不能验证冻结素材")
        url = validate_url(image.get("download_url") or image.get("source_url"))
        entries.append((filename, destination, checksum.lower(), url))
    return entries


def matches(path, checksum):
    if not path.is_file() or path.stat().st_size > MAX_BYTES:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest() == checksum


def download(destination, checksum, url, opener):
    request = urllib.request.Request(url, headers={
        "User-Agent": "MiaoxunPhotoPOC/0.1 (fixed public test sample; attribution retained)",
    })
    with opener.open(request, timeout=45) as response:
        validate_url(response.geturl())
        size = response.headers.get("Content-Length")
        if size is not None and int(size) > MAX_BYTES:
            raise ValueError("文件超过 30 MB 上限")
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("文件超过 30 MB 上限")
    if hashlib.sha256(data).hexdigest() != checksum:
        raise ValueError("下载内容的 SHA-256 与冻结清单不符，未覆盖现有文件")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".sample-", delete=False) as output:
            temporary = Path(output.name)
            output.write(data)
        os.replace(temporary, destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description="按冻结清单下载并校验公开测试照片，不重新搜索图库。")
    parser.add_argument("--sample", choices=("public-library", "fixtures"), default="public-library")
    parser.add_argument("--verify-only", action="store_true", help="只校验本地文件，不下载")
    args = parser.parse_args()
    sample = (Path(__file__).resolve().parent / args.sample).resolve()
    try:
        entries = manifest_entries(sample)
    except (OSError, ValueError, TypeError) as error:
        print(f"来源清单错误：{error}", file=sys.stderr)
        return 1
    opener = urllib.request.build_opener(PublicRedirectHandler())
    failures = 0
    for filename, destination, checksum, url in entries:
        try:
            if matches(destination, checksum):
                print(f"已校验 {filename}")
            elif args.verify_only:
                raise ValueError("文件缺失或 SHA-256 不符")
            else:
                download(destination, checksum, url, opener)
                print(f"已下载并校验 {filename}")
        except (OSError, ValueError) as error:
            failures += 1
            print(f"失败 {filename}：{error}", file=sys.stderr)
    print(f"完成：{len(entries) - failures}/{len(entries)} 张符合冻结清单。")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
