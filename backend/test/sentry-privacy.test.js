import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeSentryEvent } from "../src/sentry-privacy.js";

test("Sentry events discard request bodies and redact URLs, tokens, and API keys", () => {
  const fakeApiKey = `sk-${"fakevalue1234"}`;
  const event = sanitizeSentryEvent({
    message: `failed https://oss.example.com/private.jpg?Signature=secret ${fakeApiKey}`,
    request: {
      url: `https://api.example.com/api/homepage-shares/${"a".repeat(43)}?token=secret`,
      headers: { authorization: "Bearer session-secret" },
      data: { prompt: "private prompt" },
      query_string: "token=secret",
    },
    user: { id: "user-1", email: "private@example.com", ip_address: "127.0.0.1" },
    exception: { values: [{ value: "Bearer hidden-session" }] },
    extra: { prompt: "private prompt" },
  });
  const serialized = JSON.stringify(event);

  assert.equal(serialized.includes("private prompt"), false);
  assert.equal(serialized.includes("session-secret"), false);
  assert.equal(serialized.includes("Signature=secret"), false);
  assert.equal(serialized.includes(fakeApiKey), false);
  assert.deepEqual(event.user, { id: "user-1" });
});
