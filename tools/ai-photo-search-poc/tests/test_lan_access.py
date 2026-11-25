"""Exercise access boundaries without downloading a model or touching an album."""
import asyncio
import ipaddress
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
temporary = tempfile.TemporaryDirectory(prefix="photo-lan-test-")
os.environ["PHOTO_SEARCH_DATA"] = temporary.name
os.environ.pop("PHOTO_SEARCH_LAN_CIDR", None)
os.environ.pop("PHOTO_SEARCH_ALLOWED_HOSTS", None)
os.environ.pop("PHOTO_SEARCH_SOURCES", None)

import app as application
from starlette.requests import Request
from starlette.responses import JSONResponse


class AccessTests(unittest.TestCase):
    def setUp(self):
        application.ALLOWED_HOSTS = {"localhost", "127.0.0.1", "testserver"}
        application.LAN_NETWORK = None

    def request(self, host, peer="127.0.0.1", origin=None, forwarded=None):
        headers = [(b"host", host.encode())]
        if origin is not None:
            headers.append((b"origin", origin.encode()))
        if forwarded:
            headers.append((b"x-forwarded-for", forwarded.encode()))
        scope = {"type": "http", "method": "GET", "scheme": "http", "path": "/api/status",
                 "query_string": b"", "headers": headers, "client": (peer, 12345), "server": ("localhost", 8766)}
        async def endpoint(request):
            return JSONResponse({"ok": True})
        return asyncio.run(application.allowed_access(Request(scope), endpoint))

    def lan(self):
        application.ALLOWED_HOSTS.add("192.168.2.7")
        application.LAN_NETWORK = ipaddress.ip_network("192.168.2.0/24")

    def test_local_defaults(self):
        self.assertEqual(self.request("127.0.0.1:8766").status_code, 200)
        self.assertEqual(self.request("192.168.2.7:8766").status_code, 403)

    def test_same_subnet_can_open_same_origin(self):
        self.lan()
        self.assertEqual(self.request("192.168.2.7:8766", "192.168.2.20", "http://192.168.2.7:8766").status_code, 200)

    def test_other_subnet_cannot_spoof_forwarded_address(self):
        self.lan()
        self.assertEqual(self.request("192.168.2.7:8766", "10.0.0.2", forwarded="192.168.2.20").status_code, 403)

    def test_cross_site_and_unknown_host_rejected(self):
        self.lan()
        self.assertEqual(self.request("192.168.2.7:8766", "192.168.2.20", "https://other.example").status_code, 403)
        self.assertEqual(self.request("other.example:8766", "192.168.2.20").status_code, 403)


if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        temporary.cleanup()
