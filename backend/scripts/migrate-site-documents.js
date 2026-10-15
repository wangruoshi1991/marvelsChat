import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, withTransaction } from "../src/db.js";
import { applySiteDocumentMigration, planSiteDocumentMigration } from "../src/site-document-migration.js";

export async function runSiteDocumentMigrationCLI(args) {
  const [operation, file, ...extra] = args;
  if (!["plan", "apply", "restore"].includes(operation) || !file || extra.length) {
    throw new Error("Usage: node backend/scripts/migrate-site-documents.js plan|apply|restore /restricted/path/plan.json");
  }
  if (operation === "plan") {
    const plan = await withTransaction(async connection => {
      await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      // Resources use SHARE row locks for exact snapshots; a read-only transaction
      // cannot acquire them. This migration planner uses one repeatable-read snapshot.
      const readOnlyAdapter = { query: (sql, params) => connection.query(sql.replace(/ FOR SHARE\b/g, ""), params) };
      return planSiteDocumentMigration(readOnlyAdapter);
    });
    const handle = await fs.open(file, "wx", 0o600);
    try { await handle.writeFile(`${JSON.stringify(plan, null, 2)}\n`); await handle.sync(); }
    finally { await handle.close(); }
    const directory = await fs.open(path.dirname(file), constants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
    return { operation, ...plan.summary, planHash: plan.planHash };
  }
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  let plan;
  try {
    const stat = await handle.stat();
    const maximum = 16 * 1024 * 1024;
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > maximum) {
      throw new Error("Migration plan must be a private regular file (0600), at most 16 MiB.");
    }
    const bytes = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maximum || length !== stat.size) throw new Error("Migration plan changed or exceeded its size bound.");
    plan = JSON.parse(bytes.subarray(0, length).toString("utf8"));
  } finally { await handle.close(); }
  return { operation, ...await withTransaction(connection => applySiteDocumentMigration(connection, plan, { restore: operation === "restore" })) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runSiteDocumentMigrationCLI(process.argv.slice(2)))); }
  catch (error) { console.error(error.code || "SITE_MIGRATION_FAILED"); process.exitCode = 1; }
  finally { await closeDatabase(); }
}
