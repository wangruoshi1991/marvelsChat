import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nginx = readFileSync(
  new URL("../../deploy/miaoxun-admin-location.nginx.example", import.meta.url),
  "utf8",
);

test("admin Nginx template applies the required browser security headers", () => {
  assert.match(nginx, /location \^~ \/admin\//);
  for (const header of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
  ]) {
    assert.match(nginx, new RegExp(`add_header ${header} .* always;`));
  }
  assert.match(nginx, /frame-ancestors 'none'/);
  assert.match(nginx, /script-src 'self'/);
  assert.match(nginx, /connect-src 'self'/);
});
