import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const ignoredDirectories = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const supportedExtensions = new Set([".js", ".mjs", ".cjs", ".sh"]);
const files = new Set();

async function collect(input) {
  const absolutePath = path.resolve(input);
  if ((await stat(absolutePath)).isDirectory()) {
    for (const entry of await readdir(absolutePath, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ignoredDirectories.has(entry.name)) continue;
      await collect(path.join(absolutePath, entry.name));
    }
  } else if (supportedExtensions.has(path.extname(absolutePath))) {
    files.add(absolutePath);
  }
}

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("Usage: node scripts/check-source-syntax.mjs <file-or-directory> [...]");
  process.exit(1);
}
for (const input of inputs) await collect(input);
if (!files.size) {
  console.error("No JavaScript or Bash files found in the requested paths.");
  process.exit(1);
}

for (const file of [...files].sort()) {
  const isShell = path.extname(file) === ".sh";
  const result = spawnSync(isShell ? "bash" : process.execPath, [isShell ? "-n" : "--check", file], {
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    console.error(`Syntax check failed: ${path.relative(process.cwd(), file)}`);
    if (result.error) console.error(result.error.message);
    process.exit(1);
  }
}
console.log(`Syntax checked ${files.size} files.`);
