import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import crypto from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "Set DATABASE_URL to a migrated integration test database");
const database = new pg.Client({ connectionString: databaseUrl });
try {
  await database.connect();
  const { rows } = await database.query("SELECT current_database() AS name");
  assert.match(rows[0].name, /_migration_test$/, "Refusing to write outside a migration test database");
  const users = await database.query("SELECT COUNT(*)::int AS count FROM users");
  assert.equal(users.rows[0].count, 0, "Agent publishing integration requires an empty disposable database");
} finally {
  await database.end();
}

const suffix = crypto.randomBytes(6).toString("hex");
const adminLogin = `publishing-admin-${suffix}`;
const adminEmail = `${adminLogin}@example.invalid`;
const adminPassword = `Isolated-${crypto.randomBytes(24).toString("hex")}-9a`;
const modelEnv = {
  // These values only make readiness deterministic. The test never sends a
  // model request and the host is deliberately non-routable.
  NEW_API_BASE_URL: "https://integration.invalid",
  NEW_API_KEY: `integration-only-${suffix}`,
  NEW_API_MODEL: "integration-only",
  MEDIA_RETRIEVAL_ENABLED: "false",
  MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED: "false",
  AVATAR_3D_ENABLED: "false",
  AVATAR_3D_PROVIDER_CALLS_ENABLED: "false",
};

const portProbe = net.createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const baseEnv = {
  ...process.env,
  ...modelEnv,
  MIAOXUN_DOTENV_ENABLED: "false",
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: String(port),
  CREATE_FIRST_USER_AS_ADMIN: "false",
  ADMIN_EMAILS: "",
};
const backendDir = fileURLToPath(new URL("..", import.meta.url));

const run = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: backendDir, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = `${output}${chunk}`.slice(-16000); });
  child.once("error", reject);
  child.once("exit", (code, signal) => code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(" ")} exited ${code ?? signal}\n${output}`)));
});

await run(process.execPath, ["scripts/admin-bootstrap.js"], {
  ...baseEnv,
  DEFAULT_ADMIN_ENABLED: "true",
  DEFAULT_ADMIN_PASSWORD: adminPassword,
  DEFAULT_ADMIN_LOGIN: adminLogin,
  DEFAULT_ADMIN_EMAIL: adminEmail,
  DEFAULT_ADMIN_DISPLAY_NAME: "隔离发布验证管理员",
});

const backend = spawn(process.execPath, ["src/server.js"], {
  cwd: backendDir,
  env: { ...baseEnv, DEFAULT_ADMIN_ENABLED: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
for (const stream of [backend.stdout, backend.stderr]) stream.on("data", (chunk) => { serverLog = `${serverLog}${chunk}`.slice(-16000); });

async function request(route, { method = "GET", token, body, headers = {}, status = 200 } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const payload = response.status === 204 ? null : await response.json();
  assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(payload)}`);
  return payload?.data ?? payload;
}

const waitForReady = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (backend.exitCode !== null) throw new Error(`Backend exited before readiness: ${serverLog}`);
    try {
      if ((await request("/api/health")).ok) return;
    } catch {
      // The listener may not have started yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Backend did not become ready: ${serverLog}`);
};

try {
  await waitForReady();
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { identifier: adminLogin, password: adminPassword },
  });
  const token = login.session.token;

  const releases = await request("/api/admin/agent-releases", { token });
  const release = releases.find((item) => item.agentKey === "site-builder");
  assert.ok(release, "Registry sync did not create the site-builder release");
  assert.equal(release.catalogStatus, "draft");

  await request(`/api/admin/agent-releases/${release.id}/review`, {
    method: "POST", token, headers: { "Idempotency-Key": `release-review-${suffix}` },
  });
  const publishedRelease = await request(`/api/admin/agent-releases/${release.id}/publish`, {
    method: "POST", token, headers: { "Idempotency-Key": `release-publish-${suffix}` },
  });
  assert.equal(publishedRelease.catalogStatus, "published");

  const productBody = {
    productKey: `publishing-product-${suffix}`,
    version: "1.0.0",
    displayName: "隔离发布产品",
    description: "仓库内发布链路验证产品",
    identity: {
      key: `publishing-product-${suffix}`,
      avatarKind: "agent-mark",
      displayName: "隔离发布产品",
      description: "仓库内发布链路验证产品",
      mark: "验",
      shape: "rounded",
      colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" },
      published: false,
      source: "integration-test",
      updatedAt: "2026-10-29T00:00:00.000Z",
    },
    supportedPlatforms: ["ios"],
    dependencies: [{
      agentKey: release.agentKey,
      agentReleaseId: release.id,
      version: release.version,
      scopes: release.declaredScopes,
    }],
    status: "draft",
  };
  const product = await request("/api/admin/products", { method: "POST", token, body: productBody, status: 201 });
  await request(`/api/admin/products/${product.id}/submit`, {
    method: "POST", token, headers: { "Idempotency-Key": `product-submit-${suffix}` },
  });
  const publishedProduct = await request(`/api/admin/products/${product.id}/publish`, {
    method: "POST", token, headers: { "Idempotency-Key": `product-publish-${suffix}` },
  });
  assert.equal(publishedProduct.status, "published");

  const consentKey = `product-consent-${suffix}`;
  const entitlement = await request(`/api/me/products/${product.id}/enable`, {
    method: "POST",
    token,
    headers: { "Idempotency-Key": consentKey },
    body: { consent: true, consentVersion: "integration-v1", grantedScopes: release.declaredScopes },
    status: 201,
  });
  const replay = await request(`/api/me/products/${product.id}/enable`, {
    method: "POST",
    token,
    headers: { "Idempotency-Key": consentKey },
    body: { consent: true, consentVersion: "integration-v1", grantedScopes: release.declaredScopes },
    status: 201,
  });
  assert.equal(replay.id, entitlement.id, "Consent replay created a second entitlement");
  await request(`/api/me/products/${product.id}/enable`, {
    method: "POST",
    token,
    headers: { "Idempotency-Key": consentKey },
    body: { consent: true, consentVersion: "different-consent", grantedScopes: release.declaredScopes },
    status: 409,
  });

  const bootstrap = await request("/api/app/bootstrap", { token });
  assert.ok(bootstrap.products.some((item) => item.id === product.id && item.status === "published"));
  assert.ok(bootstrap.entitlements.some((item) => item.id === entitlement.id && item.status === "enabled"));
  assert.ok(bootstrap.agents.owned.some((item) => item.id === release.agentKey && item.enabled));
  assert.equal(typeof bootstrap.catalogRevision, "string");

  const sync = await request(`/api/app/sync?updatedAfter=${encodeURIComponent("2030-01-01T00:00:00.000Z")}`, { token });
  assert.deepEqual(sync.threads, []);
  assert.ok(sync.products.some((item) => item.id === product.id && item.status === "published"));
  assert.ok(sync.entitlements.some((item) => item.id === entitlement.id && item.status === "enabled"));
  assert.ok(sync.agents.owned.some((item) => item.id === release.agentKey && item.enabled));
  assert.equal(sync.catalogRevision, bootstrap.catalogRevision);

  const verify = new pg.Client({ connectionString: databaseUrl });
  await verify.connect();
  try {
    const { rows } = await verify.query(`
      SELECT e.status AS entitlement_status, ua.enabled AS agent_enabled, COUNT(t.id)::int AS thread_count
      FROM user_entitlements e
      JOIN user_agents ua ON ua.user_id = e.user_id AND ua.agent_id = $2
      LEFT JOIN chat_threads t ON t.user_id = e.user_id AND t.agent_id = $2
      WHERE e.id = $1
      GROUP BY e.status, ua.enabled`, [entitlement.id, release.agentKey]);
    assert.deepEqual(rows[0], { entitlement_status: "enabled", agent_enabled: true, thread_count: 1 });
  } finally {
    await verify.end();
  }

  const revoked = await request(`/api/me/products/${product.id}/enable`, {
    method: "DELETE",
    token,
    headers: { "Idempotency-Key": `product-revoke-${suffix}` },
  });
  assert.equal(revoked.id, entitlement.id);
  assert.equal(revoked.status, "disabled");
  const afterRevoke = await request("/api/app/bootstrap", { token });
  assert.ok(afterRevoke.entitlements.some((item) => item.id === entitlement.id && item.status === "disabled"));
  assert.equal(afterRevoke.agents.owned.some((item) => item.id === release.agentKey), false);
  console.log("Agent publishing HTTP integration passed: registry sync, release review/publish, product submit/publish, explicit consent, idempotent replay, bootstrap, sync, entitlement, user_agents, chat thread projection and product revocation.");
} finally {
  backend.kill("SIGTERM");
  await once(backend, "exit").catch(() => undefined);
}
