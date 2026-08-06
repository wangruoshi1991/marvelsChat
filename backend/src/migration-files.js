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
    .sort();

  return Promise.all(
    filenames.map(async (filename) => ({
      filename,
      sql: await fs.readFile(path.join(databaseDirectory, filename), "utf8"),
    })),
  );
}
