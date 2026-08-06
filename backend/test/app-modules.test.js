import assert from "node:assert/strict";
import test from "node:test";

import { buildAppModules } from "../src/repositories.js";

test("bootstrap module status follows implemented product contracts", () => {
  const modules = buildAppModules({
    profile: {},
    ownedAgents: [],
    registeredAgents: [],
  });

  for (const key of ["search", "privacy", "posts", "social", "publish"]) {
    assert.equal(modules[key].status, "connected", `${key} must be connected`);
  }

  assert.deepEqual(modules.social.needs, ["trust_scores", "interaction_events"]);
  assert.deepEqual(modules.publish.needs, ["content_moderation", "post_audits"]);
});
