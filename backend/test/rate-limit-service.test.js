import assert from "node:assert/strict";
import test from "node:test";
import {
  createInMemoryRateLimiter,
  createRateLimitMiddleware,
} from "../src/rate-limit-service.js";

test("rate limiter isolates keys and resets after its window", () => {
  let now = 1_000;
  const limiter = createInMemoryRateLimiter({
    limit: 2,
    windowMs: 1_000,
    now: () => now,
  });

  assert.equal(limiter.check("user-a").limited, false);
  assert.equal(limiter.check("user-a").limited, false);
  assert.equal(limiter.check("user-a").limited, true);
  assert.equal(limiter.check("user-b").limited, false);

  now = 2_001;
  assert.deepEqual(limiter.check("user-a"), {
    limited: false,
    limit: 2,
    remaining: 1,
    resetAt: 3_001,
    retryAfterSeconds: 0,
  });
});

test("rate limiter keeps the anonymous bucket bounded", () => {
  const limiter = createInMemoryRateLimiter({
    limit: 1,
    windowMs: 10_000,
    now: () => 5_000,
  });

  assert.equal(limiter.check("").limited, false);
  assert.equal(limiter.check("").limited, true);
});

test("rate limiter evicts expired and oldest buckets at the configured bound", () => {
  let now = 5_000;
  const limiter = createInMemoryRateLimiter({
    limit: 1,
    windowMs: 10_000,
    maxBuckets: 2,
    now: () => now,
  });

  limiter.check("first");
  limiter.check("second");
  assert.equal(limiter.size(), 2);

  limiter.check("third");
  assert.equal(limiter.size(), 2);
  assert.equal(limiter.check("first").limited, false);

  now = 15_001;
  limiter.check("expired");
  assert.equal(limiter.size(), 1);
});

test("rate limit middleware supports custom subjects", () => {
  const limiter = createInMemoryRateLimiter({
    limit: 1,
    windowMs: 10_000,
    now: () => 5_000,
  });
  const middleware = createRateLimitMiddleware({
    action: "auth.login",
    limiter,
    keyGenerator: (req) => `${req.ip}:${req.body.identifier}`,
  });
  const headers = {};
  const res = {
    set: (name, value) => {
      headers[name] = value;
    },
  };
  const req = { ip: "127.0.0.1", body: { identifier: "tester" } };

  let firstError = null;
  middleware(req, res, (error) => {
    firstError = error || null;
  });
  assert.equal(firstError, null);

  let secondError = null;
  middleware(req, res, (error) => {
    secondError = error || null;
  });
  assert.equal(secondError.status, 429);
  assert.equal(headers["Retry-After"], "10");
});
