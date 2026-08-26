import assert from "node:assert/strict";
import test from "node:test";

const {
  createDescriptorProvenance,
  createEmbeddingProvenance,
  assertIndexingProvenance,
  assertMatchingEmbeddingSpace,
  embeddingSpaceHashFor,
} = await import("../src/media-retrieval-provenance.js");

const descriptor = (configuration = { promptVersion: "descriptor-v1" }) =>
  createDescriptorProvenance({
    modelId: "caption-model",
    modelVersion: "2026-08",
    configuration,
  });

const embedding = (configuration = { outputType: "dense" }) =>
  createEmbeddingProvenance({
    modelId: "embedding-model",
    modelVersion: "2026-08",
    dimension: 1024,
    normalization: "provider-native-dense-v1",
    configuration,
  });

test("indexing provenance is canonical, versioned, and validates its persisted facts", () => {
  const descriptorProvenance = descriptor({ promptVersion: "descriptor-v1", provider: "test" });
  const embeddingProvenance = embedding({ provider: "test", outputType: "dense" });

  const verified = assertIndexingProvenance({ descriptorProvenance, embeddingProvenance });
  assert.deepEqual(verified.descriptorProvenance, descriptorProvenance);
  assert.deepEqual(verified.embeddingProvenance, embeddingProvenance);
  assert.match(embeddingSpaceHashFor(embeddingProvenance), /^[a-f0-9]{64}$/);

  assert.throws(
    () => assertIndexingProvenance({
      descriptorProvenance,
      embeddingProvenance: { ...embeddingProvenance, dimension: 512 },
    }),
    /provenance/i,
  );
});

test("embedding-space equality requires model, version, dimension, normalization, and configuration hash", () => {
  const actual = embedding({ provider: "test", outputType: "dense" });
  assert.doesNotThrow(() => assertMatchingEmbeddingSpace(actual, actual));
  assert.throws(
    () => assertMatchingEmbeddingSpace(actual, embedding({ provider: "other", outputType: "dense" })),
    /embedding space/i,
  );
  assert.throws(
    () => assertMatchingEmbeddingSpace(actual, { ...actual, normalization: "l2-v1" }),
    /provenance/i,
  );
});
