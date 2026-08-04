import assert from "node:assert/strict";
import test from "node:test";

import { parseTrustProxyHops } from "../src/config.js";

test("trust proxy configuration accepts only a bounded hop count", () => {
  assert.equal(parseTrustProxyHops(undefined), 0);
  assert.equal(parseTrustProxyHops("0"), 0);
  assert.equal(parseTrustProxyHops("1"), 1);
  assert.throws(() => parseTrustProxyHops("true"), /TRUST_PROXY_HOPS/);
  assert.throws(() => parseTrustProxyHops("-1"), /TRUST_PROXY_HOPS/);
  assert.throws(() => parseTrustProxyHops("11"), /TRUST_PROXY_HOPS/);
});
