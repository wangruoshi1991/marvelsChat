import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../../scripts/check-source-syntax.mjs", import.meta.url));

for (const [extension, valid, invalid] of [
  ["js", "const value = 1;\n", "const value = ;\n"],
  ["sh", "true\n", "if then\n"],
]) {
  test(`syntax checks reject an invalid second .${extension} file in a nested directory`, async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "miaoxun-syntax-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await mkdir(path.join(directory, "nested"));
    const first = path.join(directory, `first.${extension}`);
    const second = path.join(directory, "nested", `second.${extension}`);
    await writeFile(first, valid);
    await writeFile(second, invalid);

    const rejected = spawnSync(process.execPath, [checker, directory], { encoding: "utf8" });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /second\./);

    await writeFile(second, valid);
    const accepted = spawnSync(process.execPath, [checker, directory, first], { encoding: "utf8" });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /Syntax checked 2 files/);
  });
}
