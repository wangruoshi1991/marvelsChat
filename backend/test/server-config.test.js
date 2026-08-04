import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCorsOrigin,
  parseTrustProxyHops,
  validateAdminBootstrapConfig,
} from "../src/config.js";

test("trust proxy configuration accepts only a bounded hop count", () => {
  assert.equal(parseTrustProxyHops(undefined), 0);
  assert.equal(parseTrustProxyHops("0"), 0);
  assert.equal(parseTrustProxyHops("1"), 1);
  assert.throws(() => parseTrustProxyHops("true"), /TRUST_PROXY_HOPS/);
  assert.throws(() => parseTrustProxyHops("-1"), /TRUST_PROXY_HOPS/);
  assert.throws(() => parseTrustProxyHops("11"), /TRUST_PROXY_HOPS/);
});

test("production CORS requires one explicit HTTP origin", () => {
  assert.equal(
    parseCorsOrigin("https://api.example.com/", { production: true }),
    "https://api.example.com",
  );
  assert.equal(parseCorsOrigin("false", { production: true }), false);
  assert.throws(
    () => parseCorsOrigin("true", { production: true }),
    /explicit origin/,
  );
  assert.throws(
    () => parseCorsOrigin("https://api.example.com/path", { production: true }),
    /absolute HTTP\(S\) origin/,
  );
  assert.throws(
    () => parseCorsOrigin("https://one.example,https://two.example", { production: true }),
    /absolute HTTP\(S\) origin/,
  );
});

test("production admin bootstrap rejects implicit privilege grants", () => {
  const base = {
    production: true,
    allowedEmails: [],
    firstUserIsAdmin: false,
    defaultAccountEnabled: false,
    defaultAccountPassword: "",
  };
  assert.doesNotThrow(() => validateAdminBootstrapConfig(base));
  assert.throws(
    () => validateAdminBootstrapConfig({ ...base, firstUserIsAdmin: true }),
    /CREATE_FIRST_USER_AS_ADMIN/,
  );
  assert.throws(
    () => validateAdminBootstrapConfig({
      ...base,
      allowedEmails: ["admin@example.com"],
    }),
    /contact verification/,
  );
  assert.throws(
    () => validateAdminBootstrapConfig({
      ...base,
      defaultAccountEnabled: true,
      defaultAccountPassword: "change-this-password",
    }),
    /DEFAULT_ADMIN_PASSWORD/,
  );
  assert.doesNotThrow(() => validateAdminBootstrapConfig({
    ...base,
    defaultAccountEnabled: true,
    defaultAccountPassword: "Z9!f4qL2#v7sN8@k",
  }));
});
