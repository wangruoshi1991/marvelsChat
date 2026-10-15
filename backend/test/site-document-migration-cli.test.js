import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runSiteDocumentMigrationCLI } from "../scripts/migrate-site-documents.js";

test("operator migration refuses invalid command, shared files, directories, symlinks and oversized plans before database access", async () => {
  await assert.rejects(runSiteDocumentMigrationCLI(["apply"]), /Usage/);
  await assert.rejects(runSiteDocumentMigrationCLI(["apply", "/tmp/a", "unexpected"]), /Usage/);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "site-document-cli-"));
  try {
    const file = path.join(dir, "plan.json");
    await fs.writeFile(file, "{}", { mode: 0o644 });
    await assert.rejects(runSiteDocumentMigrationCLI(["apply", file]), /private regular file/);
    await fs.chmod(file, 0o600);
    const link = path.join(dir, "link.json");
    await fs.symlink(file, link);
    await assert.rejects(runSiteDocumentMigrationCLI(["restore", link]), error => error.code === "ELOOP");
    await assert.rejects(runSiteDocumentMigrationCLI(["apply", dir]), /private regular file/);
    await fs.truncate(file, 16 * 1024 * 1024 + 1);
    await assert.rejects(runSiteDocumentMigrationCLI(["apply", file]), /private regular file/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
