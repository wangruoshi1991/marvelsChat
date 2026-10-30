import assert from "node:assert/strict";
import test from "node:test";

import { buildBackfillPlan, validateBackfillPlan } from "../scripts/legacy-publishing-backfill.js";

const agent = (key, permissions = ["messages:read"]) => ({
  key,
  name: key === "miaoxun-butler" ? "妙讯管家" : "普通 Agent",
  version: "1.2.3",
  description: "真实 Agent",
  permissions,
  identity: {
    avatarKind: "agent-mark",
    mark: key === "miaoxun-butler" ? "妙" : "普",
    shape: "squircle",
    colors: { background: "#123456", foreground: "#ffffff", accent: "#abcdef" },
  },
});

const catalog = (key, published = true) => ({
  agent_id: key,
  display_name: key === "miaoxun-butler" ? "妙讯管家" : "普通 Agent",
  description: "真实 Agent",
  identity_mark: key === "miaoxun-butler" ? "妙" : "普",
  identity_shape: "squircle",
  identity_colors: { background: "#123456", foreground: "#ffffff", accent: "#abcdef" },
  status: published ? "published" : "unpublished",
  updated_at: "2026-10-30T00:00:00.000Z",
});

test("legacy backfill preserves Butler account defaults and gates ordinary grants for reconsent", () => {
  const plan = buildBackfillPlan({
    agents: [agent("miaoxun-butler", ["messages:read"]), agent("ordinary-agent")],
    catalogs: [catalog("miaoxun-butler"), catalog("ordinary-agent")],
    grants: [
      { user_id: "user-butler", agent_id: "miaoxun-butler", enabled: true, granted_scopes: ["messages:read"], alias: "妙讯管家" },
      { user_id: "user-ordinary", agent_id: "ordinary-agent", enabled: true, granted_scopes: ["messages:read"], alias: "普通 Agent" },
      { user_id: "user-disabled", agent_id: "ordinary-agent", enabled: false, granted_scopes: [], alias: "普通 Agent" },
    ],
    readiness: {
      "miaoxun-butler": { configured: true, missingEnv: [], capabilityNeeds: [] },
      "ordinary-agent": { configured: true, missingEnv: [], capabilityNeeds: [] },
    },
    now: "2026-10-30T00:00:00.000Z",
  });

  const butler = plan.find((item) => item.agentKey === "miaoxun-butler");
  assert.equal(butler.release.status, "published");
  assert.equal(butler.product.status, "published");
  assert.equal(butler.entitlements[0].status, "enabled");

  const ordinary = plan.find((item) => item.agentKey === "ordinary-agent");
  assert.equal(ordinary.release.status, "published");
  assert.equal(ordinary.product.status, "published");
  assert.equal(ordinary.entitlements.find((row) => row.userId === "user-ordinary").status, "reconsent_required");
  assert.equal(ordinary.entitlements.find((row) => row.userId === "user-disabled").status, "disabled");
});

test("legacy backfill keeps a stale ordinary entry out of discovery", () => {
  const plan = buildBackfillPlan({
    agents: [agent("ordinary-agent")],
    catalogs: [catalog("ordinary-agent")],
    grants: [{ user_id: "user-ordinary", agent_id: "ordinary-agent", enabled: true, granted_scopes: ["messages:read"], alias: null }],
    readiness: { "ordinary-agent": { configured: false, missingEnv: ["NEW_API_KEY"], capabilityNeeds: [] } },
  });
  assert.equal(plan[0].release.status, "review");
  assert.equal(plan[0].product.status, "draft");
  assert.equal(plan[0].entitlements[0].status, "reconsent_required");
});

test("legacy backfill fails closed when the identity contract is incomplete", () => {
  const plan = buildBackfillPlan({
    agents: [agent("ordinary-agent")],
    catalogs: [{ ...catalog("ordinary-agent"), identity_colors: {} }],
    grants: [{ user_id: "user-ordinary", agent_id: "ordinary-agent", enabled: true, granted_scopes: ["messages:read"], alias: null }],
    readiness: { "ordinary-agent": { configured: true, missingEnv: [], capabilityNeeds: [] } },
  });
  const item = plan[0];
  assert.equal(item.release.contractHash, null);
  assert.equal(item.product, null);
  assert.equal(item.entitlements[0].status, "reconsent_required");
  assert.throws(() => validateBackfillPlan(plan), /blocked before any write/);
});
