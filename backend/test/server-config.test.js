import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCorsOrigin,
  parseTrustProxyHops,
  validateAdminBootstrapConfig,
  createMediaGenerationConfig,
} from "../src/config.js";

test("image generation defaults closed and never inherits another model's credentials", () => {
  assert.deepEqual(createMediaGenerationConfig({ NEW_API_KEY: "text-secret", NEW_API_MODEL: "text-model", DASHSCOPE_API_KEY: "avatar-secret", MEDIA_RETRIEVAL_DASHSCOPE_API_KEY: "retrieval-secret" }), {
    enabled: false, provider: "", apiBaseUrl: "", apiKey: "", imageModel: "", timeoutMs: 90000,
  });
});

test("image generation accepts only an explicit HTTPS base without embedded secrets", () => {
  assert.equal(createMediaGenerationConfig({ MEDIA_GENERATION_API_BASE_URL: "https://images.example.test/v1/" }).apiBaseUrl, "https://images.example.test/v1");
  for (const value of ["http://images.example.test/v1", "https://user:private@images.example.test/v1", "https://images.example.test/v1?api_key=private", "https://images.example.test/v1#private", "https://images.example.test/v1?", "https://images.example.test/v1#", "not-a-url"]) {
    assert.throws(() => createMediaGenerationConfig({ MEDIA_GENERATION_API_BASE_URL: value }), error => {
      assert.equal(error.message.includes("private"), false);
      return error.message.includes("MEDIA_GENERATION_API_BASE_URL");
    });
  }
  assert.throws(() => createMediaGenerationConfig({ MEDIA_GENERATION_ENABLED: "maybe" }), /MEDIA_GENERATION_ENABLED/);
  assert.throws(() => createMediaGenerationConfig({ MEDIA_GENERATION_TIMEOUT_MS: "1.5" }), /MEDIA_GENERATION_TIMEOUT_MS/);
  assert.throws(() => createMediaGenerationConfig({ MEDIA_GENERATION_TIMEOUT_MS: "0" }), /MEDIA_GENERATION_TIMEOUT_MS/);
});

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
