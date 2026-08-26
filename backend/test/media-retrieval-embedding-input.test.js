import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  buildVisualEmbeddingInput,
  verifyVisualEmbeddingInput,
} = await import("../src/media-retrieval-embedding-input.js");

test("the trusted embedding boundary makes every unclassified identity-like span exact-only", () => {
  const exactOnlyQueries = [
    "Alice wearing a yellow dress",
    "周杰伦穿黄色衣服",
  ];

  for (const rawQuery of exactOnlyQueries) {
    const input = buildVisualEmbeddingInput({
      rawQuery,
      candidate: {
        visualQuery: rawQuery,
        identityTerms: [],
        parseConfidence: "high",
      },
    });
    assert.equal(input.mode, "exact-only", rawQuery);
    assert.equal(input.text, "", rawQuery);
    assert.equal(input.identityTerms.length > 0, true, rawQuery);
    assert.throws(() => verifyVisualEmbeddingInput(input), /embedding input is not visual-safe/i, rawQuery);
  }

  for (const rawQuery of ["celebrity Taylor Swift wearing yellow", "叫周杰伦的人穿黄色衣服"]) {
    const input = buildVisualEmbeddingInput({
      rawQuery,
      candidate: { visualQuery: rawQuery, identityTerms: [], parseConfidence: "high" },
    });
    assert.equal(input.mode, "exact-only", rawQuery);
    assert.equal(input.text, "", rawQuery);
    assert.equal(input.identityTerms.length > 0, true, rawQuery);
    assert.throws(() => verifyVisualEmbeddingInput(input), /embedding input is not visual-safe/i, rawQuery);
  }
});

test("a harmless visual query remains bound, hash-verified, and embedding-eligible", () => {
  const input = buildVisualEmbeddingInput({
    rawQuery: "yellow dress on a beach",
    candidate: {
      visualQuery: "yellow dress on a beach",
      identityTerms: [],
      parseConfidence: "high",
    },
  });

  assert.equal(input.mode, "visual");
  assert.equal(input.text, "visual-v2 color=yellow;clothing=dress;scene=beach");
  assert.match(input.textHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(verifyVisualEmbeddingInput(input), input);
});

test("an omitted internal parser candidate keeps deterministic controlled visual replay eligible", () => {
  const input = buildVisualEmbeddingInput({ rawQuery: "yellow dress on a beach" });

  assert.equal(input.mode, "visual");
  assert.equal(input.text, "visual-v2 color=yellow;clothing=dress;scene=beach");
  assert.deepEqual(verifyVisualEmbeddingInput(input), input);
});

test("parser identity terms are an additive final-boundary veto and retain only provable raw spans", () => {
  const covered = buildVisualEmbeddingInput({
    rawQuery: "Summer yellow dress",
    candidate: {
      visualQuery: "yellow dress",
      identityTerms: [" Summer ", "Summer"],
      parseConfidence: "high",
    },
  });

  assert.equal(covered.mode, "exact-only");
  assert.equal(covered.text, "");
  assert.deepEqual(covered.identityTerms, ["Summer"]);
  assert.equal(covered.reasonCode, "parser-identity-veto");
  assert.throws(() => verifyVisualEmbeddingInput(covered), /embedding input is not visual-safe/i);

  const unprovable = buildVisualEmbeddingInput({
    rawQuery: "yellow dress on a beach",
    candidate: {
      visualQuery: "yellow dress on a beach",
      identityTerms: ["Not in this query"],
      parseConfidence: "high",
    },
  });

  assert.equal(unprovable.mode, "exact-only");
  assert.equal(unprovable.text, "");
  assert.deepEqual(unprovable.identityTerms, []);
  assert.equal(unprovable.reasonCode, "parser-identity-unverifiable");
  assert.throws(() => verifyVisualEmbeddingInput(unprovable), /embedding input is not visual-safe/i);
});

test("an explicitly supplied malformed parser candidate is never embedding-eligible", () => {
  const malformedCandidates = [
    {
      label: "string identityTerms",
      candidate: { visualQuery: "yellow dress", identityTerms: "Summer", parseConfidence: "high" },
    },
    {
      label: "missing identityTerms",
      candidate: { visualQuery: "yellow dress", parseConfidence: "high" },
    },
    {
      label: "mixed-type identityTerms",
      candidate: { visualQuery: "yellow dress", identityTerms: ["Summer", 7], parseConfidence: "high" },
    },
  ];

  for (const { label, candidate } of malformedCandidates) {
    const input = buildVisualEmbeddingInput({
      rawQuery: "yellow dress on a beach",
      candidate,
    });
    assert.equal(input.mode, "exact-only", label);
    assert.equal(input.text, "", label);
    assert.deepEqual(input.identityTerms, [], label);
    assert.equal(input.reasonCode, "parser-candidate-unverifiable", label);
    assert.throws(() => verifyVisualEmbeddingInput(input), /embedding input is not visual-safe/i, label);
  }
});

test("the final boundary rejects a forged hash or identity-bearing visual payload", () => {
  const input = buildVisualEmbeddingInput({
    rawQuery: "yellow dress on a beach",
    candidate: { visualQuery: "yellow dress on a beach", identityTerms: [], parseConfidence: "high" },
  });

  assert.throws(
    () => verifyVisualEmbeddingInput({ ...input, text: "Alice wearing yellow" }),
    /embedding input/i,
  );
  assert.throws(
    () => verifyVisualEmbeddingInput({ ...input, textHash: "0".repeat(64) }),
    /embedding input/i,
  );
});

test("the final boundary fails closed for parser-missed personal references in every sentence position", () => {
  const parserMissedIdentityQueries = [
    "Taylor Swift wearing yellow", // sentence start
    "a photo of Taylor Swift wearing yellow", // sentence middle
    "yellow dress worn by Alice", // sentence end
    "find the yellow dress with Alice", // after a preposition
    "照片里周杰伦穿黄色衣服", // Chinese contextual reference
    "Summer wearing yellow", // season homonym in subject role
    "Brown wearing yellow dress", // color homonym in subject role
    "Park wearing yellow", // scene homonym in subject role
    "Standing wearing yellow dress", // action homonym in subject role
    "Dress wearing yellow", // clothing homonym in subject role
    "夏天穿黄色衣服", // Chinese season homonym in subject role
  ];

  for (const rawQuery of parserMissedIdentityQueries) {
    const input = buildVisualEmbeddingInput({
      rawQuery,
      candidate: { visualQuery: rawQuery, identityTerms: [], parseConfidence: "high" },
    });
    assert.equal(input.mode, "exact-only", rawQuery);
    assert.equal(input.text, "", rawQuery);
    assert.throws(() => verifyVisualEmbeddingInput(input), /embedding input is not visual-safe/i, rawQuery);
  }
});

test("typed visual serialization covers every raw span and never serializes unclassified names", () => {
  const unclassifiedIdentityQueries = [
    "find taylor swift wearing yellow",
    "a photo of alice wearing yellow",
    "照片里小明穿黄色衣服",
    "照片里欧阳娜娜穿黄色衣服",
    "黄色衣服的周杰伦",
    "find TAYLOR Swift wearing yellow",
  ];

  for (const rawQuery of unclassifiedIdentityQueries) {
    const input = buildVisualEmbeddingInput({
      rawQuery,
      candidate: { visualQuery: "yellow dress", identityTerms: [], parseConfidence: "high" },
    });
    assert.equal(input.mode, "exact-only", rawQuery);
    assert.equal(input.text, "", rawQuery);
    assert.equal(input.identityTerms.length > 0, true, rawQuery);
  }

  const safe = buildVisualEmbeddingInput({
    rawQuery: "yellow dress on a beach",
    candidate: { visualQuery: "untrusted free-form text", identityTerms: [], parseConfidence: "high" },
  });
  assert.equal(safe.mode, "visual");
  assert.equal(safe.kind, "media-retrieval-typed-visual-embedding-v2");
  assert.match(safe.ontologyVersion, /^media-retrieval-visual-ontology-v\d+$/);
  assert.match(safe.coverageDigest, /^[a-f0-9]{64}$/);
  assert.equal(safe.text, "visual-v2 color=yellow;clothing=dress;scene=beach");
  assert.deepEqual(verifyVisualEmbeddingInput(safe), safe);
});
