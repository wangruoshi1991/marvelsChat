import assert from "node:assert/strict";
import test from "node:test";
import { buildMediaSearchMatcher } from "../src/media-text-search.js";
import { stationMediaAssetSchema, stationMediaTagsSchema } from "../src/schemas.js";

test("literal media search matches only stored filenames, captions and explicit tags", () => {
  const asset = { originalFilename: "Trip-001.JPG", caption: "海边合影", tags: ["New York", "朋友"] };
  const before = structuredClone(asset);
  assert.equal(buildMediaSearchMatcher("trip 海边 new york")(asset), true);
  assert.equal(buildMediaSearchMatcher("咖啡")(asset), false);
  assert.equal(buildMediaSearchMatcher("旅行")(asset), false);
  assert.equal(buildMediaSearchMatcher("朋友 陌生场景")(asset), false);
  assert.equal(buildMediaSearchMatcher("")(asset), true);
  assert.deepEqual(asset, before);
});

test("every supplied search term is required instead of discarding terms after eight", () => {
  const matcher = buildMediaSearchMatcher("a b c d e f g h missing");
  assert.equal(matcher({ caption: "a b c d e f g h" }), false);
  assert.equal(matcher({ caption: "a b c d e f g h missing" }), true);
});

test("upload metadata does not infer tags and explicit tags retain punctuation and internal spaces", () => {
  const upload = stationMediaAssetSchema.parse({ originalFilename: "上海_滨江_咖啡.jpg", caption: "周末旅行" });
  assert.deepEqual(upload.tags, []);
  const tags = ["New York", "C++", "旅行 (2026)", "<背景>"];
  assert.deepEqual(stationMediaAssetSchema.parse({ tags }).tags, tags);
  assert.deepEqual(stationMediaTagsSchema.parse({ tags }).tags, tags);
  assert.throws(() => stationMediaTagsSchema.parse({ tags: ["x".repeat(41)] }));
  assert.throws(() => stationMediaTagsSchema.parse({ tags: Array.from({ length: 13 }, () => "tag") }));
});
