import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("overview refresh effect does not return its Promise as React cleanup", async () => {
  const source = await readFile(new URL("../src/ResourcesPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useEffect\(load,\s*\[\]\)/);
  assert.match(source, /useEffect\(\(\)\s*=>\s*\{\s*load\(\);\s*\},\s*\[\]\)/);
});
