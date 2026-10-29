import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const defaultDatabaseDirectory = fileURLToPath(
  new URL("../database/", import.meta.url),
);

export async function loadMigrationFiles({
  databaseDirectory = defaultDatabaseDirectory,
} = {}) {
  const entries = await fs.readdir(databaseDirectory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftRevision = Number.parseInt(left.match(/^\d+/)?.[0] || "", 10);
      const rightRevision = Number.parseInt(right.match(/^\d+/)?.[0] || "", 10);
      if (Number.isFinite(leftRevision) && Number.isFinite(rightRevision) && leftRevision !== rightRevision) {
        return leftRevision - rightRevision;
      }
      return left.localeCompare(right);
    });

  return Promise.all(
    filenames.map(async (filename) => ({
      filename,
      sql: await fs.readFile(path.join(databaseDirectory, filename), "utf8"),
    })),
  );
}
