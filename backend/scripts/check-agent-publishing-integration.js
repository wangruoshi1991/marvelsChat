import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import crypto from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "Set DATABASE_URL to a migrated integration test database");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname), "Publishing integration requires a loopback disposable database");
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

  const releaseDetail = await request(`/api/admin/agent-releases/${release.id}`, { token });
  assert.equal(releaseDetail.release.id, release.id);
  assert.equal(releaseDetail.release.catalogStatus, "published");
  assert.deepEqual(releaseDetail.history.map((item) => item.toStatus), ["draft", "review", "published"]);
  const association = releaseDetail.products.find((item) => item.id === product.id);
  assert.ok(association, "Release detail omitted its associated product");
  assert.equal(association.productKey, productBody.productKey);
  assert.equal(association.displayName, productBody.displayName);
  assert.equal(association.status, "published");

  const productDetail = await request(`/api/admin/products/${product.id}`, { token });
  assert.equal(productDetail.product.id, product.id);
  assert.equal(productDetail.product.status, "published");
  assert.deepEqual(productDetail.history.map((item) => item.toStatus), ["draft", "review", "published"]);
  assert.deepEqual(productDetail.entitlementSummary, []);

  for (const resource of ["agent-releases", "products", "tasks"]) {
    await request(`/api/admin/${resource}/${crypto.randomUUID()}`, { token, status: 404 });
    await request(`/api/admin/${resource}/not-a-uuid`, { token, status: 400 });
    await request(`/api/admin/${resource}/${product.id}`, { status: 401 });
  }

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
  const enabledDetail = await request(`/api/admin/products/${product.id}`, { token });
  assert.deepEqual(enabledDetail.entitlementSummary, [{ status: "enabled", count: 1 }]);
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

    // Only synthetic data enters this isolated database. No worker is started,
    // so task metadata verification cannot dispatch a provider request.
    const privateText = `private-admin-http-${suffix}`;
    const failure = { code: "PROVIDER_UNAVAILABLE", message: privateText, response: { prompt: privateText } };
    const taskIds = {};
    for (const taskStatus of ["failed", "interrupted", "running", "queued"]) {
      const id = crypto.randomUUID();
      taskIds[taskStatus] = id;
      await verify.query(`INSERT INTO ai_tasks
        (id,user_id,kind,agent_id,agent_version,status,phase,input,error,idempotency_key,request_hash,claim_token,lease_until)
        VALUES ($1,$2,'site_draft',$3,$4,$5,$6,$7,$8,$9,repeat('a',64),$10,$11)`, [
        id, login.user.id, release.agentKey, release.version, taskStatus,
        taskStatus === "running" ? "generating" : taskStatus,
        JSON.stringify({ prompt: privateText }), JSON.stringify(failure), `task-${taskStatus}-${suffix}`,
        taskStatus === "running" ? crypto.randomUUID() : null,
        taskStatus === "running" ? new Date(Date.now() + 60000) : null,
      ]);
    }
    await verify.query(`INSERT INTO ai_task_events(task_id,user_id,sequence,payload)
      SELECT $1,$2,sequence,jsonb_build_object('status','failed','phase','failed','errorCode','PROVIDER_UNAVAILABLE')
      FROM generate_series(1,201) AS sequence`, [taskIds.failed, login.user.id]);

    const workspaceId = crypto.randomUUID();
    const nodeId = crypto.randomUUID();
    await verify.query("BEGIN");
    try {
      await verify.query(`INSERT INTO agent_workspaces
        (id,user_id,goal,status,coordinator_version,source,context_refs,authority,input,limits,deadline_at,summary,question,approval,error,idempotency_key,request_hash)
        VALUES ($1,$2,$3,'waiting_input','http-fixture','{"page":"miao","module":null}','[]','{}',$4,'{"deadlineSeconds":300}',clock_timestamp()+interval '5 minutes',$3,$3,$4,$5,$6,repeat('b',64))`, [
        workspaceId, login.user.id, privateText, JSON.stringify({ text: privateText }), JSON.stringify(failure), `workspace-${suffix}`,
      ]);
      await verify.query(`INSERT INTO agent_workspace_rounds(workspace_id,user_id,round_number,instruction,status)
        VALUES ($1,$2,1,$3,'waiting_input')`, [workspaceId, login.user.id, privateText]);
      await verify.query(`INSERT INTO agent_workspace_nodes
        (id,workspace_id,user_id,node_key,agent_id,agent_version,capability,goal,status,summary,error)
        VALUES ($1,$2,$3,'http-fixture',$4,$5,'site.compose',$6,'failed',$6,$7)`, [
        nodeId, workspaceId, login.user.id, release.agentKey, release.version, privateText, JSON.stringify(failure),
      ]);
      await verify.query("COMMIT");
    } catch (error) {
      await verify.query("ROLLBACK");
      throw error;
    }

    const taskList = await request("/api/admin/tasks?limit=200", { token });
    assert.equal(JSON.stringify(taskList).includes(privateText), false, "Task list leaked synthetic private input or provider response");
    for (const [taskStatus, id] of Object.entries(taskIds)) {
      const detail = await request(`/api/admin/tasks/${id}`, { token });
      assert.equal(detail.type, "ai_task");
      assert.equal(detail.status, taskStatus);
      assert.equal(detail.failureCode, "PROVIDER_UNAVAILABLE");
      assert.equal(JSON.stringify(detail).includes(privateText), false, "Task detail leaked synthetic private input or provider response");
      assert.deepEqual(detail.allowedOperations, taskStatus === "failed" ? ["retry"] : taskStatus === "queued" ? ["cancel"] : []);
      assert.equal(detail.eventKind, "status_events");
      assert.equal(detail.eventsTruncated, taskStatus === "failed");
      assert.equal(detail.events.length, taskStatus === "failed" ? 200 : 0);
      if (taskStatus === "failed") assert.equal(detail.events[199].sequence, 200);
      for (const field of ["input", "error", "summary", "question", "approval"]) {
        assert.equal(Object.hasOwn(detail, field), false, `Task detail must omit ${field}`);
      }
    }
    const workspaceDetail = await request(`/api/admin/tasks/${workspaceId}`, { token });
    assert.equal(workspaceDetail.type, "agent_workspace");
    assert.equal(workspaceDetail.eventKind, "workspace_nodes");
    assert.equal(workspaceDetail.eventsTruncated, false);
    assert.deepEqual(workspaceDetail.allowedOperations, ["cancel"]);
    assert.equal(workspaceDetail.events[0].id, nodeId);
    assert.equal(workspaceDetail.events[0].errorCode, "PROVIDER_UNAVAILABLE");
    assert.equal(JSON.stringify(workspaceDetail).includes(privateText), false, "Workspace metadata leaked synthetic private text");
    for (const field of ["input", "goal", "summary", "question", "approval", "error"]) {
      assert.equal(Object.hasOwn(workspaceDetail, field), false, `Workspace detail must omit ${field}`);
    }

    const register = (name) => request("/api/auth/register", {
      method: "POST", status: 201,
      body: { contactType: "email", email: `${name}-${suffix}@example.invalid`, displayName: name, password: adminPassword },
    });
    const user = await register("HttpOrdinaryUser");
    const restricted = await register("HttpReadOnlyAdmin");
    await verify.query("UPDATE users SET role='admin', admin_permissions='[\"admin:access\",\"users:read\"]'::jsonb WHERE id=$1", [restricted.user.id]);
    await request("/api/admin/overview", { token: restricted.session.token });
    for (const restrictedToken of [user.session.token, restricted.session.token]) {
      for (const route of [
        `/api/admin/tasks/${taskIds.failed}`, `/api/admin/agent-releases/${release.id}`, `/api/admin/products/${product.id}`,
      ]) await request(route, { token: restrictedToken, status: 403 });
    }
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
  console.log("Agent publishing HTTP integration passed: registry sync, release review/publish, product submit/publish, explicit consent, idempotent replay, bootstrap, sync, entitlement, user_agents, chat thread projection, product revocation; real release/product/task details, status history, product associations, entitlement counts, UUID validation, missing records, 401/403 boundaries, task operation capabilities, event truncation and private-input/provider-response redaction.");
} finally {
  backend.kill("SIGTERM");
  await once(backend, "exit").catch(() => undefined);
}
