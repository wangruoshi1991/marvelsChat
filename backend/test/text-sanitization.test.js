import assert from "node:assert/strict";
import test from "node:test";

import { replaceControlCharacters } from "../src/text-sanitization.js";

test("control character sanitization preserves text and replaces unsafe bytes", () => {
  assert.equal(
    replaceControlCharacters("first\u0000second\nthird\u007flast"),
    "first second third last",
  );
});

test("control character sanitization accepts empty values", () => {
  assert.equal(replaceControlCharacters(null), "");
  assert.equal(replaceControlCharacters(undefined), "");
});
