import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryRateLimiter } from "../src/rate-limit-service.js";

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

