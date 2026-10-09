import assert from "node:assert/strict";
import test from "node:test";
import { descriptorSchema } from "../src/media-retrieval-policy.js";
import { mediaRetrievalParserResponseSchema } from "../src/media-retrieval-parser-response.js";
import { descriptorSystemPrompt, querySystemPrompt, rerankSystemPrompt, DESCRIPTOR_PROMPT_VERSION } from "../src/media-retrieval-prompts.js";

// These are deterministic contract checks, not evidence of live model quality.
test("versioned provider instructions use examples that satisfy the actual schemas", () => {
  const descriptorExample = descriptorSystemPrompt.match(/\{.*\}/)[0];
  const queryExample = querySystemPrompt.match(/\{[^{}]*\}/)[0];
  assert.equal(descriptorSchema.safeParse(JSON.parse(descriptorExample)).success, true);
  assert.equal(mediaRetrievalParserResponseSchema.safeParse(JSON.parse(queryExample)).success, true);
  assert.match(DESCRIPTOR_PROMPT_VERSION, /v5$/);
  assert.match(descriptorSystemPrompt, /4 to 8 simple English words, at most 80 characters/);
  assert.match(rerankSystemPrompt, /candidateKey/);
  assert.doesNotMatch(rerankSystemPrompt, /mediaAssetId/);
});
