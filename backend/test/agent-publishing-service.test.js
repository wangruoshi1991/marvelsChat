import assert from "node:assert/strict";
import test from "node:test";
import { createAgentPublishingService } from "../src/agent-publishing-service.js";
import { computeProductContractHash } from "../src/product-catalog-repository.js";
import { computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";

const identity = {
  key: "demo-agent", avatarKind: "agent-mark", displayName: "演示", description: "真实注册能力", mark: "演", shape: "circle",
  colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: false,
  source: "registry", updatedAt: "2026-10-29T00:00:00.000Z",
};
const demoContractHash = computeAgentReleaseContractHash({ key: "demo-agent", version: "1.0.0", permissions: ["messages:read"], identity });
const productIdentity = {
  key: "demo-product", avatarKind: "agent-mark", displayName: "演示产品", description: "", mark: "产", shape: "circle",
  colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: false, source: "admin", updatedAt: "2026-10-29T00:00:00.000Z",
};

test("release review fails closed for missing identity and readiness", async () => {
  const service = createAgentPublishingService({
    releaseRepository: {
      getAgentRelease: async () => ({ id: "r1", readiness: { ready: false, missing: ["NEW_API_KEY"] }, declaredScopes: [], identity: null }),
      transition: async () => assert.fail("must not transition an unready release"),
    },
    recordAudit: async () => assert.fail("must not audit a rejected transition"),
  });
  await assert.rejects(() => service.reviewRelease({ releaseId: "r1", actorUserId: "u1" }), (error) => error.details?.code === "IDENTITY_INCOMPLETE");
});

test("product publication requires every dependency to be published, ready and complete", async () => {
  const service = createAgentPublishingService({
    productRepository: { getProduct: async () => {
      const product = { id: "p1", productKey: "demo-product", version: "1.0.0", displayName: productIdentity.displayName, description: productIdentity.description, identity: productIdentity, supportedPlatforms: ["ios"], dependencies: [{ agentKey: "demo-agent", agentReleaseId: "r1", version: "1.0.0", scopes: ["messages:read"], contractHash: demoContractHash, releaseStatus: "review", readiness: { ready: true }, declaredScopes: ["messages:read"], registryDeclaredScopes: ["messages:read"], registryStatus: "registered", registryVersion: "1.0.0", identity }] };
      return { ...product, contractHash: computeProductContractHash(product) };
    }, transitionProduct: async () => assert.fail("must not publish a blocked product") },
  });
  await assert.rejects(() => service.publishProduct({ productId: "p1", actorUserId: "u1" }), (error) => error.details?.code === "PRODUCT_DEPENDENCY_GATE_FAILED");
});

test("product publication accepts an operator identity snapshot when runtime version and scopes are current", async () => {
  let transitioned = false;
  const service = createAgentPublishingService({
    productRepository: {
      getProduct: async () => ({
        id: "p1",
        productKey: "demo-product",
        version: "1.0.0",
        displayName: productIdentity.displayName,
        description: productIdentity.description,
        identity: productIdentity,
        supportedPlatforms: ["ios"],
        contractHash: computeProductContractHash({ productKey: "demo-product", version: "1.0.0", displayName: productIdentity.displayName, description: productIdentity.description, identity: productIdentity, supportedPlatforms: ["ios"], dependencies: [{ agentKey: "demo-agent", agentReleaseId: "r1", version: "1.0.0", scopes: ["messages:read"], contractHash: demoContractHash }] }),
        dependencies: [{
          agentReleaseId: "r1",
          agentKey: "demo-agent",
          version: "1.0.0",
          scopes: ["messages:read"],
          releaseStatus: "published",
          readiness: { ready: true },
          declaredScopes: ["messages:read"],
          registryDeclaredScopes: ["messages:read"],
          registryStatus: "registered",
          registryVersion: "1.0.0",
          // The registry hash is based on the code identity. The release
          // identity can be operator-curated and therefore has a distinct
          // presentation contract hash.
          registryContractHash: "0".repeat(64),
          contractHash: demoContractHash,
          identity,
        }],
      }),
      transitionProduct: async () => { transitioned = true; return { id: "p1", status: "published" }; },
    },
    recordAudit: async () => {},
  });
  await service.publishProduct({ productId: "p1", actorUserId: "u1" });
  assert.equal(transitioned, true);
});

test("product publication rejects a stale product contract hash", async () => {
  let transitioned = false;
  const service = createAgentPublishingService({
    productRepository: {
      getProduct: async () => ({
        id: "p1",
        productKey: "demo-product",
        version: "1.0.0",
        displayName: "演示产品",
        description: "",
        identity: { key: "demo-product", avatarKind: "agent-mark", displayName: "演示产品", description: "", mark: "演", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: false, source: "admin", updatedAt: "2026-10-29T00:00:00.000Z" },
        supportedPlatforms: ["ios"],
        contractHash: "a".repeat(64),
        dependencies: [{ agentKey: "demo-agent", agentReleaseId: "r1", version: "1.0.0", scopes: ["messages:read"], contractHash: demoContractHash, releaseStatus: "published", readiness: { ready: true }, declaredScopes: ["messages:read"], registryDeclaredScopes: ["messages:read"], registryStatus: "registered", registryVersion: "1.0.0", identity }],
      }),
      transitionProduct: async () => { transitioned = true; },
    },
  });
  await assert.rejects(
    () => service.publishProduct({ productId: "p1", actorUserId: "u1" }),
    (error) => error.details?.code === "PRODUCT_CONTRACT_STALE",
  );
  assert.equal(transitioned, false);
});

test("repeated release publication delegates to an idempotent transition", async () => {
  let calls = 0;
  const service = createAgentPublishingService({
    getReadiness: async () => ({ "demo-agent": { configured: true, missingEnv: [] } }),
    listRegisteredAgents: async () => [{ key: "demo-agent", version: "1.0.0", permissions: ["messages:read"] }],
    releaseRepository: {
      getAgentRelease: async () => ({ id: "r1", agentKey: "demo-agent", version: "1.0.0", contractHash: demoContractHash, readiness: { ready: true, missing: [] }, declaredScopes: ["messages:read"], identity }),
      transition: async () => { calls += 1; return { id: "r1", catalogStatus: "published" }; },
    },
    recordAudit: async () => {},
  });
  await service.publishRelease({ releaseId: "r1", actorUserId: "u1", requestId: "same" });
  await service.publishRelease({ releaseId: "r1", actorUserId: "u1", requestId: "same" });
  assert.equal(calls, 2);
});

test("release publication rejects a stale scope declaration after registry changes", async () => {
  const service = createAgentPublishingService({
    listRegisteredAgents: async () => [{ key: "demo-agent", version: "1.0.0", permissions: ["profile:read"] }],
    releaseRepository: {
      getAgentRelease: async () => ({ id: "r1", agentKey: "demo-agent", version: "1.0.0", contractHash: demoContractHash, readiness: { ready: true, missing: [] }, declaredScopes: ["messages:read"], identity }),
      transition: async () => assert.fail("must not publish a stale scope release"),
    },
  });
  await assert.rejects(
    service.publishRelease({ releaseId: "r1", actorUserId: "u1" }),
    (error) => error.details?.code === "REGISTRY_SCOPES_STALE",
  );
});
