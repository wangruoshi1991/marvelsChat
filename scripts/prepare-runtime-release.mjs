import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Package an explicit runtime allowlist, never .env, databases, credentials,
// node_modules, or the complete dirty working tree. Linux installs locked deps.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$/.test(id)) {
  throw new Error('Provide one explicit release identifier.');
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const worktreeStatus = git('status', '--porcelain=v1', '--untracked-files=all');
if (worktreeStatus) {
  throw new Error('Runtime releases require a clean, committed Git worktree.');
}
const head = git('rev-parse', 'HEAD');
const sourceTree = git('rev-parse', 'HEAD^{tree}');

for (const workspace of ['admin', 'avatar-web']) {
  rmSync(join(root, workspace, 'dist'), { force: true, recursive: true });
  execFileSync('npm', ['run', 'build'], {
    cwd: join(root, workspace),
    env: process.env,
    stdio: 'inherit',
  });
}

const output = mkdtempSync(join(tmpdir(), 'miaoxun-release-'));
const runtime = join(output, 'runtime');
mkdirSync(runtime);
const inputs = [
  'backend/src', 'backend/database', 'backend/scripts', 'backend/test',
  'backend/package.json', 'backend/package-lock.json',
  'agents', 'shared', 'scripts',
  'deploy/docker-compose.prod.yml',
  'deploy/marvels-chat-backend.service.example',
  'deploy/marvels-chat-database-backup.service.example',
  'deploy/marvels-chat-database-backup.timer.example',
  'deploy/marvels-chat-media-retrieval-worker.service.example',
  'deploy/miaoxun-admin-location.nginx.example',
  'deploy/miaoxun-database-backup.env.example',
  'deploy/miaoxun-postgresql.conf',
  'deploy/miaoxun-postgresql.pg_hba.conf',
  'deploy/miaoxun-prod.env.example',
];
const excludedNames = new Set(['node_modules', '.git', '.DS_Store', 'storage']);
const safeInput = source => {
  const parts = relative(root, source).split('/');
  if (parts.some(part => excludedNames.has(part) || part.startsWith('.env') || part.startsWith('._'))) return false;
  if (lstatSync(source).isSymbolicLink()) throw new Error('Runtime inputs cannot be symlinks.');
  return true;
};
for (const input of inputs) {
  mkdirSync(dirname(join(runtime, input)), { recursive: true });
  cpSync(join(root, input), join(runtime, input), { recursive: true, filter: safeInput });
}
for (const [source, target] of [['admin/dist', 'admin'], ['avatar-web/dist', 'avatar-web/dist']]) {
  if (!existsSync(join(root, source, 'index.html'))) throw new Error(`Build ${source} before packaging.`);
  cpSync(join(root, source), join(runtime, target), { recursive: true });
}
mkdirSync(join(runtime, 'backend/storage'));
const files = [];
function visit(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error('Runtime artifact cannot contain symlinks.');
    if (item.isDirectory()) visit(path);
    else files.push({ path: relative(runtime, path), sha256: createHash('sha256').update(readFileSync(path)).digest('hex') });
  }
}
visit(runtime);
writeFileSync(
  join(runtime, 'release-manifest.json'),
  JSON.stringify(
    {
      id,
      sourceHead: head,
      sourceTree,
      includesWorkingTreeChanges: false,
      buildCommands: ['npm --prefix admin run build', 'npm --prefix avatar-web run build'],
      files,
    },
    null,
    2,
  ) + '\n',
);
const archive = join(output, `${id}.tar.gz`);
execFileSync('tar', ['--no-xattrs', '-czf', archive, '-C', output, 'runtime'], {
  env: { ...process.env, COPYFILE_DISABLE: '1' },
});
const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
console.log(JSON.stringify({ id, archive, sha256, files: files.length }));
