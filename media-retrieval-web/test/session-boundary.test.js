import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("private media pilot does not persist bearer sessions in browser storage", async () => {
  const source = await fs.readFile(path.join(webDirectory, "src", "main.js"), "utf8");

  assert.equal(/\bsessionStorage\b/.test(source), false);
  assert.equal(/\blocalStorage\b/.test(source), false);
});
