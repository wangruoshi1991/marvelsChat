import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Package tracked HEAD files and build frontend output in a clean temp source.
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

const output = mkdtempSync(join(tmpdir(), 'miaoxun-release-'));
let artifactReady = false;
process.on('exit', () => {
  if (!artifactReady) rmSync(output, { force: true, recursive: true });
});
const runtime = join(output, 'runtime');
const buildSource = join(output, 'build-source');
const npmUserConfig = join(output, 'empty.npmrc');
mkdirSync(runtime);
mkdirSync(buildSource);
writeFileSync(npmUserConfig, '');
const runtimeInputs = [
  'backend/src', 'backend/database',
  'backend/package.json', 'backend/package-lock.json',
  'agents',
  'agents/package.json', 'agents/registry.js', 'agents/chat-history.js', 'agents/workspace-contribution.js', 'agents/specialist-dispatch.js',
  'shared/package.json', 'shared/agent-catalog.js', 'shared/site-document.js', 'shared/media-retrieval-public-contract.js', 'shared/ui-preferences.js', 'shared/legacy-ui-preferences.js',
  'backend/scripts/admin-bootstrap.js',
  'backend/scripts/legacy-publishing-backfill.js',
  'backend/scripts/avatar-3d-backfill-mobile-models.js',
  'backend/scripts/check-ai-task-operations.js',
  'backend/scripts/check-chat-attachment-operations.js',
  'backend/scripts/check-ui-preference-upgrade.js',
  'backend/scripts/db-migrate.js',
  'backend/scripts/migrate-site-documents.js',
  'scripts/harden-production-release.sh',
  'deploy/docker-compose.prod.yml',
  'deploy/marvels-chat-backend.service.example',
  'deploy/marvels-chat-ai-task-worker.service.example',
  'deploy/marvels-chat-database-backup.service.example',
  'deploy/marvels-chat-database-backup.timer.example',
  'deploy/marvels-chat-media-retrieval-worker.service.example',
  'deploy/miaoxun-admin-location.nginx.example',
  'deploy/miaoxun-database-backup.env.example',
  'deploy/miaoxun-postgresql.conf',
  'deploy/miaoxun-postgresql.pg_hba.conf',
  'deploy/miaoxun-prod.env.example',
];
const frontendInputs = ['admin', 'avatar-web'];
const inputs = [...runtimeInputs, ...frontendInputs];
const excludedNames = new Set(['node_modules', '.git', '.DS_Store', 'storage']);
const trackedTree = execFileSync('git', ['ls-tree', '-rz', '--full-tree', 'HEAD', '--', ...inputs], {
  cwd: root,
});
const trackedFiles = trackedTree.toString('utf8').split('\0').filter(Boolean).map(entry => {
  const separator = entry.indexOf('\t');
  const [mode, type, object] = entry.slice(0, separator).split(' ');
  const path = entry.slice(separator + 1);
  const parts = path.split('/');
  if (type !== 'blob' || mode === '120000') throw new Error(`Runtime inputs cannot contain symlinks: ${path}`);
  const isRuntimeAgentFile = path === 'agents/package.json' ||
    path === 'agents/registry.js' || path === 'agents/chat-history.js' ||
    path === 'agents/workspace-contribution.js' || path === 'agents/specialist-dispatch.js' ||
    (parts.length === 2 && path.startsWith('agents/') && path.endsWith('.agent.js'));
  if (path.startsWith('agents/') && !isRuntimeAgentFile) return null;
  if (parts.some(part => excludedNames.has(part) || part.startsWith('.env') || part.startsWith('._'))) return null;
  return { mode, object, path };
}).filter(Boolean);
const runtimeBackendScripts = new Set([
  'start', 'worker:media-retrieval', 'worker:ai-tasks', 'ops:ai-tasks', 'ops:chat-attachments', 'ops:ui-preference-upgrade',
  'db:migrate', 'admin:bootstrap', 'ops:legacy-publishing-backfill', 'avatar3d:backfill-mobile',
]);
for (const file of trackedFiles) {
  const sourceRoot = frontendInputs.some(input => file.path.startsWith(`${input}/`))
    ? buildSource
    : runtime;
  const target = join(sourceRoot, file.path);
  mkdirSync(dirname(target), { recursive: true });
  let contents = execFileSync('git', ['cat-file', 'blob', file.object], { cwd: root });
  if (file.path === 'backend/package.json') {
    const packageJson = JSON.parse(contents.toString('utf8'));
    packageJson.scripts = Object.fromEntries(
      Object.entries(packageJson.scripts).filter(([name]) => runtimeBackendScripts.has(name)),
    );
    contents = Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`);
  } else if (file.path === 'agents/package.json') {
    const packageJson = JSON.parse(contents.toString('utf8'));
    contents = Buffer.from(`${JSON.stringify({
      name: packageJson.name,
      version: packageJson.version,
      private: packageJson.private,
      type: packageJson.type,
      exports: packageJson.exports,
      engines: packageJson.engines,
    }, null, 2)}\n`);
  }
  writeFileSync(target, contents, { mode: file.mode === '100755' ? 0o755 : 0o644 });
}
const buildEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    ['CI', 'HOME', 'PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE'].includes(key),
  ),
);
for (const workspace of frontendInputs) {
  const cwd = join(buildSource, workspace);
  execFileSync('npm', [
    'ci', '--no-audit', '--no-fund', `--userconfig=${npmUserConfig}`, '--globalconfig=/dev/null',
  ], {
    cwd,
    env: buildEnv,
    stdio: 'inherit',
  });
  execFileSync('npm', ['run', 'build'], { cwd, env: buildEnv, stdio: 'inherit' });
}
for (const [source, target] of [
  ['admin/dist', 'admin'],
  ['avatar-web/dist', 'avatar-web/dist'],
]) {
  if (!existsSync(join(buildSource, source, 'index.html'))) throw new Error(`Build ${source} before packaging.`);
  cpSync(join(buildSource, source), join(runtime, target), { recursive: true });
}
rmSync(buildSource, { force: true, recursive: true });
rmSync(npmUserConfig, { force: true });
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
      buildCommands: frontendInputs.flatMap(workspace => [
        `npm --prefix ${workspace} ci --no-audit --no-fund --userconfig=<empty-temp-file> --globalconfig=/dev/null`,
        `npm --prefix ${workspace} run build`,
      ]),
      frontendBuildEnvironment: 'system allowlist only; no VITE_*, NODE_OPTIONS or npm config variables',
      runtimePackageProjection: {
        backendScripts: [...runtimeBackendScripts].sort(),
        agentPackageFields: ['name', 'version', 'private', 'type', 'exports', 'engines'],
      },
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
artifactReady = true;
console.log(JSON.stringify({ id, archive, sha256, files: files.length }));
