import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import { closeDatabase, getPool, query, withTransaction } from "../src/db.js";
import {
  getThreadForUser,
  listAgentHistoryBeforeInput,
  listThreadIdsUpdatedSince,
  listThreadsForUser,
  markThreadReadForUser,
} from "../src/message-repository.js";

const enabled = process.env.RUN_WORKSPACE_THREAD_ACTIVITY_INTEGRATION === "1";
const integration = (name, work) => test(name, {
  skip: !enabled && "Set RUN_WORKSPACE_THREAD_ACTIVITY_INTEGRATION=1 with a migrated disposable loopback *_migration_test database",
}, work);
const owner = crypto.randomUUID(), outsider = crypto.randomUUID();
const threads = Object.fromEntries(["comic-diary", "video-production", "miaoxun-butler", "unrelated"].map(agent => [agent, crypto.randomUUID()]));
const otherThread = crypto.randomUUID();
const privateText = "PRIVATE_WORKSPACE_TEXT_NEVER_BELONGS_IN_THREAD_PREVIEW";
const timestamp = second => `2026-11-06T01:00:${String(second).padStart(2, "0")}.000Z`;
let workspaceId, nodeId;

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_migration_test"));
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  for (const userId of [owner, outsider]) {
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'isolated-only',?,?)",
      [userId, `${userId}@example.invalid`, `Thread activity ${userId.slice(0, 8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
  }
});

beforeEach(async () => {
  if (!enabled) return;
  await query("DELETE FROM agent_workspaces WHERE user_id IN (?,?)", [owner, outsider]);
  await query("DELETE FROM chat_threads WHERE user_id IN (?,?)", [owner, outsider]);
  for (const [agentId, threadId] of Object.entries(threads)) {
    await query("INSERT INTO chat_threads(id,user_id,title,kind,agent_id,created_at,updated_at) VALUES(?,?,'Activity fixture','agent',?,?::timestamptz,?::timestamptz)",
      [threadId, owner, agentId, timestamp(0), timestamp(0)]);
  }
  await query("INSERT INTO chat_threads(id,user_id,title,kind,agent_id,created_at,updated_at) VALUES(?,?,'Other activity fixture','agent','comic-diary',?::timestamptz,?::timestamptz)",
    [otherThread, outsider, timestamp(0), timestamp(0)]);
  workspaceId = crypto.randomUUID(); nodeId = crypto.randomUUID();
});

after(async () => {
  if (!enabled) return;
  await query("DELETE FROM users WHERE id IN (?,?)", [owner, outsider]);
  await closeDatabase();
});

const node = (agentId = "comic-diary", overrides = {}) => ({
  id: nodeId, key: "story", agentId, capability: "comic.storyboard", status: "succeeded", second: 2, ...overrides,
});

async function workspace(nodes = [node()], { userId = owner, status = "running", second = 2 } = {}) {
  await withTransaction(async connection => {
    await connection.query(`INSERT INTO agent_workspaces
      (id,user_id,goal,status,coordinator_version,source,context_refs,authority,input,limits,deadline_at,
       summary,idempotency_key,request_hash,created_at,updated_at)
      VALUES(?,?,?,?,'fixture','{"page":"miao","module":"task"}','[]','{}','{}','{"deadlineSeconds":600}',
       clock_timestamp()+INTERVAL '10 minutes',?,?,?,?::timestamptz,?::timestamptz)`,
    [workspaceId, userId, privateText, status, privateText, crypto.randomUUID(), "a".repeat(64), timestamp(1), timestamp(second)]);
    await connection.query(`INSERT INTO agent_workspace_rounds(workspace_id,user_id,round_number,instruction,status,created_at)
      VALUES(?,?,1,?,'running',?::timestamptz)`, [workspaceId, userId, privateText, timestamp(1)]);
    for (const item of nodes) await connection.query(`INSERT INTO agent_workspace_nodes
      (id,workspace_id,user_id,node_key,agent_id,agent_version,capability,goal,status,summary,result,
       claim_token,lease_until,created_at,updated_at)
      VALUES(?,?,?,?,?,'fixture',?,?,?,?,?::jsonb,?,?::timestamptz,?::timestamptz,?::timestamptz)`,
    [item.id, workspaceId, userId, item.key, item.agentId, item.capability, privateText, item.status, privateText,
      JSON.stringify(item.result ?? { artifact: { kind: "text_result", title: privateText, content: privateText } }),
      item.status === "running" ? crypto.randomUUID() : null,
      item.status === "running" ? timestamp(59) : null, timestamp(1), timestamp(item.second)]);
  });
}

const message = (content, second, { sender = "user", metadata = {}, threadId = threads["comic-diary"], id = crypto.randomUUID() } = {}) => query(
  `INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content,metadata,created_at)
   VALUES(?,?,?,?,'Fixture',?,?::jsonb,?::timestamptz)`, [id, owner, threadId, sender, content, JSON.stringify(metadata), timestamp(second)],
).then(() => id);
const findThread = async agentId => (await listThreadsForUser(owner)).find(thread => thread.agentId === agentId);
const linked = () => ({ workspaceContext: { id: workspaceId, revision: 1, currentRound: 1, nodeId } });

integration("existing same-Agent threads project real contributions without copying private content or creating messages", async () => {
  await message("旧的普通对话", 1);
  await workspace([node(), node("no-existing-thread", { id: crypto.randomUUID(), key: "unlisted" })]);
  const projected = await findThread("comic-diary");
  assert.equal(projected.id, threads["comic-diary"]);
  assert.equal(projected.lastContent, "协作贡献已完成");
  assert.equal(projected.lastMessageAt, timestamp(2));
  assert.equal(projected.updatedAt, timestamp(2));
  assert.equal(projected.unreadCount, 0, "Activity projection cannot manufacture unread counts without a durable read cursor");
  assert.doesNotMatch(JSON.stringify(projected), new RegExp(privateText));
  assert.equal((await query("SELECT count(*)::int AS n FROM chat_messages WHERE user_id=?", [owner]))[0].n, 1);
  assert.equal((await query("SELECT count(*)::int AS n FROM chat_threads WHERE user_id=?", [owner]))[0].n, 4);
  assert.equal((await getThreadForUser(owner, projected.id)).lastContent, projected.lastContent);
  assert.equal((await getThreadForUser(outsider, otherThread)).lastContent, "");
  assert.equal(await getThreadForUser(outsider, projected.id), null);
  assert.equal((await query("SELECT id FROM agent_workspace_nodes WHERE workspace_id=? AND id=?", [workspaceId, nodeId]))[0].id, nodeId);
});

integration("contribution states stay fixed and activity never changes persisted chat unread counts", async () => {
  await workspace();
  for (const [status, expected] of Object.entries({ queued: "协作贡献等待执行", running: "协作贡献正在处理", succeeded: "协作贡献已完成", failed: "协作贡献失败", interrupted: "协作贡献已中断", cancelled: "协作贡献已取消" })) {
    await query("UPDATE agent_workspace_nodes SET status=?,claim_token=?,lease_until=?::timestamptz WHERE id=?",
      [status, status === "running" ? crypto.randomUUID() : null, status === "running" ? timestamp(59) : null, nodeId]);
    assert.equal((await findThread("comic-diary")).lastContent, expected);
  }
  await query("UPDATE chat_threads SET unread_count=3 WHERE id=?", [threads["comic-diary"]]);
  assert.equal((await findThread("comic-diary")).unreadCount, 3);
  await markThreadReadForUser(owner, threads["comic-diary"]);
  assert.equal((await findThread("comic-diary")).unreadCount, 0);
});

integration("thread previews choose the latest actual chat or activity and retain pin order", async () => {
  await workspace([node(), node("video-production", { id: crypto.randomUUID(), key: "script", capability: "video.script", status: "queued", second: 3 })], { second: 3 });
  await message("更新的普通对话", 4);
  const rows = await listThreadsForUser(owner);
  assert.equal(rows[0].id, threads["comic-diary"]);
  assert.equal(rows[0].lastContent, "更新的普通对话");
  assert.equal(rows[1].id, threads["video-production"]);
  assert.equal(rows[1].lastContent, "协作贡献等待执行");
  await query("UPDATE chat_threads SET pinned=true WHERE id=?", [threads.unrelated]);
  assert.equal((await listThreadsForUser(owner))[0].id, threads.unrelated);
});

integration("workspace-only authorization waiting changes Agent previews and incremental sync without touching threads", async () => {
  const coordinator = node("miaoxun-butler", { id: crypto.randomUUID(), key: "coordinate", capability: "workspace.coordinate", result: { decision: {
    type: "request_access", summary: privateText, requirements: [{ agentId: "video-production", reason: "authorization_required" }],
  } } });
  await workspace([node(), coordinator]);
  assert.deepEqual(await listThreadIdsUpdatedSince(owner, timestamp(3)), []);
  await query("UPDATE agent_workspaces SET status='waiting_input',question=?,updated_at=?::timestamptz WHERE id=?", [privateText, timestamp(5), workspaceId]);
  const ids = await listThreadIdsUpdatedSince(owner, timestamp(4));
  assert.deepEqual([...ids].sort(), [threads["comic-diary"], threads["miaoxun-butler"]].sort());
  for (const agentId of ["comic-diary", "miaoxun-butler"]) {
    const projected = await findThread(agentId);
    assert.equal(projected.lastContent, "协作任务等待授权");
    assert.equal(projected.lastMessageAt, timestamp(5));
    assert.equal(projected.updatedAt, timestamp(5));
    assert.doesNotMatch(JSON.stringify(projected), new RegExp(privateText));
  }
  assert.deepEqual(await listThreadIdsUpdatedSince(outsider, timestamp(4)), []);
  assert.equal((await query("SELECT updated_at FROM chat_threads WHERE id=?", [threads["comic-diary"]]))[0].updated_at.toISOString(), timestamp(0));
  await query(`UPDATE agent_workspace_nodes SET result=jsonb_set(result,'{decision,requirements,0,reason}','"new_task_required"')
    WHERE id=?`, [coordinator.id]);
  assert.equal((await findThread("comic-diary")).lastContent, "协作任务需要重新发起");
});

integration("fixed waiting clarification and confirmation state do not expose questions or results", async () => {
  await workspace([node(), node("miaoxun-butler", { id: crypto.randomUUID(), key: "coordinate", capability: "workspace.coordinate", result: { decision: { type: "clarify", question: privateText } } })]);
  await query("UPDATE agent_workspaces SET status='waiting_input',question=?,updated_at=?::timestamptz WHERE id=?", [privateText, timestamp(4), workspaceId]);
  assert.equal((await findThread("comic-diary")).lastContent, "协作任务等待补充信息");
  await query("UPDATE agent_workspaces SET status='awaiting_confirmation',approval='{}',updated_at=?::timestamptz WHERE id=?", [timestamp(5), workspaceId]);
  assert.equal((await findThread("comic-diary")).lastContent, "协作任务等待确认");
});

integration("node-only state changes enter incremental sync while unrelated conversations remain untouched", async () => {
  await workspace();
  assert.deepEqual(await listThreadIdsUpdatedSince(owner, timestamp(3)), []);
  await query("UPDATE agent_workspace_nodes SET status='interrupted',updated_at=?::timestamptz WHERE id=?", [timestamp(4), nodeId]);
  assert.deepEqual(await listThreadIdsUpdatedSince(owner, timestamp(3)), [threads["comic-diary"]]);
  const projected = await getThreadForUser(owner, threads["comic-diary"]);
  assert.equal(projected.lastContent, "协作贡献已中断");
  assert.equal(projected.lastMessageAt, timestamp(4));
  assert.equal(projected.updatedAt, timestamp(4));
  assert.deepEqual(await listThreadIdsUpdatedSince(owner, timestamp(3)), [threads["comic-diary"]], "Repeated sync is a stable projection, not another event insertion");
  assert.equal((await query("SELECT count(*)::int AS n FROM chat_messages WHERE user_id=?", [owner]))[0].n, 0);
});

integration("later rounds cannot redate an earlier Agent contribution as new activity", async () => {
  await workspace();
  await withTransaction(async connection => {
    await connection.query(`INSERT INTO agent_workspace_rounds(workspace_id,user_id,round_number,instruction,base_result_node_id,status,created_at)
      VALUES(?,?,2,?,?,'running',?::timestamptz)`, [workspaceId, owner, privateText, nodeId, timestamp(5)]);
    await connection.query("UPDATE agent_workspaces SET current_round=2,updated_at=?::timestamptz WHERE id=?", [timestamp(5), workspaceId]);
  });
  const projected = await findThread("comic-diary");
  assert.equal(projected.lastMessageAt, timestamp(2));
  assert.equal(projected.lastContent, "协作贡献已完成");
  assert.deepEqual(await listThreadIdsUpdatedSince(owner, timestamp(4)), []);
});

integration("selected-contribution discussion previews remain safe even when user input quotes a private result", async () => {
  await workspace();
  await message(privateText, 4, { metadata: linked() });
  assert.equal((await findThread("comic-diary")).lastContent, "正在讨论协作成果");
  await message("服务端固定回复占位", 5, { sender: "agent", metadata: { ...linked(), workspaceContributionDiscussion: { reply: privateText } } });
  const reply = await findThread("comic-diary");
  assert.equal(reply.lastContent, "协作讨论已回复");
  assert.doesNotMatch(JSON.stringify(reply), new RegExp(privateText));
  await message("独立的新话题", 6);
  assert.equal((await findThread("comic-diary")).lastContent, "独立的新话题");
});

integration("ordinary Agent history never includes or crosses a selected contribution discussion boundary", async () => {
  await workspace();
  await message("过往普通会话不得跨贡献边界", 1);
  const selectedInput = await message(privateText, 2, { metadata: linked() });
  await message("协作讨论回复", 3, { sender: "agent", metadata: { ...linked(), workspaceContributionDiscussion: { reply: privateText } } });
  const followupId = await message("新的普通话题", 4);
  const ordinaryInput = await message("继续普通话题", 5);
  assert.deepEqual(await listAgentHistoryBeforeInput(owner, threads["comic-diary"], selectedInput), []);
  const history = await listAgentHistoryBeforeInput(owner, threads["comic-diary"], ordinaryInput);
  assert.deepEqual(history.map(item => item.id), [followupId]);
  assert.doesNotMatch(JSON.stringify(history), new RegExp(privateText));
  await query("UPDATE chat_messages SET deleted_at=clock_timestamp() WHERE metadata->'workspaceContext'->>'nodeId'=? AND user_id=?", [nodeId, owner]);
  assert.deepEqual((await listAgentHistoryBeforeInput(owner, threads["comic-diary"], ordinaryInput)).map(item => item.id), [followupId],
    "Deleting the selected discussion must not resurrect earlier ordinary context");
});

integration("activity queries retain a valid owner-Agent index and inspect waiting decisions only after selecting one activity", async () => {
  await workspace([
    node(),
    node("comic-diary", { id: crypto.randomUUID(), key: "story-two", second: 3 }),
    node("miaoxun-butler", { id: crypto.randomUUID(), key: "coordinate", capability: "workspace.coordinate", result: { decision: {
      type: "request_access", requirements: [{ reason: "authorization_required" }],
    } } }),
  ], { second: 3 });
  const [index] = await query(`SELECT indexes.indexdef, index_state.indisvalid, index_state.indisready
    FROM pg_indexes indexes
    JOIN pg_class index_relation ON index_relation.relname = indexes.indexname
    JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace AND namespace.nspname = indexes.schemaname
    JOIN pg_index index_state ON index_state.indexrelid = index_relation.oid
    WHERE indexes.schemaname='public' AND indexes.indexname='idx_agent_workspace_nodes_owner_agent_updated'`);
  assert.match(index?.indexdef ?? "", /\(user_id, agent_id, updated_at DESC, id DESC\)/);
  assert.equal(index.indisvalid, true);
  assert.equal(index.indisready, true);

  // Capture the exact production query while still executing it against PG.
  // Planner choices depend on the disposable database's other tests/stats, so
  // verify index availability separately and inspect actual work rather than
  // asserting that one particular index wins on this three-node fixture.
  const pool = await getPool(), originalQuery = pool.query;
  let statement;
  pool.query = function(sql, parameters) {
    statement = { sql, parameters };
    return originalQuery.call(this, sql, parameters);
  };
  try { await listThreadsForUser(owner); } finally { pool.query = originalQuery; }
  const walk = plan => [plan, ...(plan.Plans ?? []).flatMap(walk)];
  const explain = () => withTransaction(async connection => {
    const rows = await connection.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.sql}`, statement.parameters);
    return rows[0]["QUERY PLAN"][0];
  });
  const normal = await explain();
  for (const plan of walk(normal.Plan).filter(item => item.Alias === "coordinator")) {
    assert.equal(plan["Actual Loops"], 0, "Running workspaces do not need authorization decisions");
  }
  await query("UPDATE agent_workspaces SET status='waiting_input',question=?,updated_at=?::timestamptz WHERE id=?", [privateText, timestamp(4), workspaceId]);
  const waiting = await explain();
  const coordinatorLoops = walk(waiting.Plan).filter(plan => plan.Alias === "coordinator").reduce((sum, plan) => sum + plan["Actual Loops"], 0);
  assert.ok(coordinatorLoops > 0 && coordinatorLoops <= 2,
    "The two participating Agent threads need at most one decision lookup each, regardless of planner memoization or multiple candidate nodes");
  console.log(JSON.stringify({ activityQueryPlan: {
    normalExecutionMs: normal["Execution Time"], waitingExecutionMs: waiting["Execution Time"],
    waitingCoordinatorLookups: coordinatorLoops, fixtureNodes: 3,
    activityScans: walk(normal.Plan).filter(plan => plan.Alias === "node").map(plan => ({
      type: plan["Node Type"], index: plan["Index Name"] ?? null,
      condition: plan["Index Cond"] ?? plan.Filter ?? null,
    })),
  } }));
});
