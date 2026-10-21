import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import express from "express";
import { query, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { registerAppRoutes } from "../src/routes/app-routes.js";
import { registerAITaskRoutes } from "../src/routes/ai-task-routes.js";
import { registerStationSiteRoutes } from "../src/routes/station-site-routes.js";
import { messageSchema } from "../src/schemas.js";
import { messageRequestFingerprint } from "../src/message-request.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { createMessageTaskExecutor, submitAlbumMessageTask } from "../src/ai-message-task-service.js";
import { createSiteTaskService } from "../src/ai-site-task-service.js";
import { createAITaskRunner } from "../src/ai-task-runner.js";
import * as repository from "../src/ai-task-repository.js";
import { getAgent } from "../../agents/registry.js";
import {
  addMessageToThreadOnce,
  completeAgentMessageOnce,
} from "../src/message-repository.js";

const enabled = process.env.RUN_AI_TASK_INTEGRATION === "1";
const integration = (name, work) =>
  test(
    name,
    {
      skip:
        !enabled &&
        "Set RUN_AI_TASK_INTEGRATION=1 with a migrated disposable PostgreSQL database",
    },
    work,
  );
const owner = crypto.randomUUID();
const outsider = crypto.randomUUID();
const threadId = crypto.randomUUID();
const butlerThreadId = crypto.randomUUID();
const albumId = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("hex");
const otherToken = crypto.randomBytes(32).toString("hex");
const albumScopes = (await getAgent("album-manager")).permissions;
const siteScopes = (await getAgent("site-builder")).permissions;
const butlerScopes = (await getAgent("miaoxun-butler")).permissions;
let server;
let origin;
let syncRuntime = async () => {
  throw new Error("Unexpected synchronous runtime call in task tests");
};
const logger = { error() {} };

before(async () => {
  if (!enabled) return;
  const [db] = await query("SELECT current_database() AS name");
  assert.match(
    db.name,
    /_migration_test$/,
    "Never use a product database for this suite",
  );
  for (const [id, authToken, suffix] of [
    [owner, token, "owner"],
    [outsider, otherToken, "outsider"],
  ]) {
    await query(
      `INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?, ?, 'test-only', ?, ?)`,
      [
        id,
        `${id}@example.invalid`,
        `Task ${suffix} ${id.slice(0, 8)}`,
        String(crypto.randomInt(100000000000, 999999999999)),
      ],
    );
    await query(
      "INSERT INTO user_profiles (user_id,nickname,avatar_text) VALUES (?, ?, 'T')",
      [id, `Task ${suffix}`],
    );
    await query(
      `INSERT INTO auth_sessions (id,user_id,token_hash,expires_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [crypto.randomUUID(), id, hashToken(authToken)],
    );
  }
  await query(
    "INSERT INTO chat_threads (id,user_id,title,agent_id,kind) VALUES (?, ?, 'Album task test', 'album-manager', 'agent')",
    [threadId, owner],
  );
  await query(
    "INSERT INTO chat_threads (id,user_id,title,agent_id,kind) VALUES (?, ?, 'Butler test', 'miaoxun-butler', 'agent')",
    [butlerThreadId, owner],
  );
  await query(
    "INSERT INTO station_albums (id,user_id,title) VALUES (?, ?, 'Task context album')",
    [albumId, owner],
  );
  await query(
    "INSERT INTO user_agents (user_id,agent_id,enabled,granted_scopes) VALUES (?, 'album-manager', true, ?::jsonb), (?, 'site-builder', true, ?::jsonb)",
    [
      owner,
      JSON.stringify(albumScopes),
      owner,
      JSON.stringify(siteScopes),
    ],
  );
  await query(
    "INSERT INTO user_agents (user_id,agent_id,enabled,granted_scopes) VALUES (?, 'miaoxun-butler', true, ?::jsonb)",
    [owner, JSON.stringify(butlerScopes)],
  );
  await query(
    "INSERT INTO media_retrieval_profiles (user_id,index_state,consent_version,consent_granted_at) VALUES (?, 'enabled', 'media-retrieval-consent-v1', CURRENT_TIMESTAMP)",
    [owner],
  );
  const app = express();
  app.use(express.json());
  const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
  registerMessageRoutes(app, {
    authenticate,
    asyncHandler,
    getOnlineUserIds: () => [],
    sendRealtimeToUser() {},
    runAgentRuntime: (options) => syncRuntime(options),
  });
  registerAppRoutes(app, {
    authenticate,
    asyncHandler,
    getOnlineUserIds: () => [],
    sendPresenceChanged() {},
  });
  registerAITaskRoutes(app, { authenticate, asyncHandler });
  registerStationSiteRoutes(app, { authenticate, asyncHandler });
  app.use(createRequestErrorHandler({ production: true, logger }));
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  if (!enabled) return;
  await query("DELETE FROM ai_tasks WHERE user_id = ?", [owner]);
  await query("DELETE FROM chat_messages WHERE user_id = ?", [owner]);
  await query("DELETE FROM station_site_drafts WHERE user_id = ?", [owner]);
  await query(
    "UPDATE user_profiles SET station_config = '{}'::jsonb, bio = '' WHERE user_id = ?",
    [owner],
  );
  await query("UPDATE user_agents SET enabled = true WHERE user_id = ?", [
    owner,
  ]);
  for (const agentId of ["album-manager", "site-builder", "miaoxun-butler"]) {
    await query("UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = ?",
      [JSON.stringify((await getAgent(agentId)).permissions), owner, agentId]);
  }
});

after(async () => {
  if (!enabled) return;
  await new Promise((resolve) => server?.close(resolve));
  await query("DELETE FROM users WHERE id IN (?, ?)", [owner, outsider]);
  await closeDatabase();
});

const request = async (path, body, authToken = token, contract = "1") => {
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "X-Miaoxun-App-Build": "45",
      ...(contract === null
        ? {}
        : {
            "X-Miaoxun-AI-Contract": contract,
            "X-Miaoxun-Site-Document": "2",
            "X-Miaoxun-Agent-Workspace": "6",
          }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return {
    status: response.status,
    ...(typeof payload === "object" ? payload : { text: payload }),
  };
};
// These fixtures represent tasks accepted before professional conversations
// moved to direct workspaces. The retained admission service creates real rows;
// all subsequent reads/retries still exercise the current HTTP replay path.
const admitAndReplayLegacyAlbum = async (extra = {}) => {
  const body = messageSchema.parse({ content: "Find selected media", clientMessageId: crypto.randomUUID(), ...extra });
  const agent = await getAgent("album-manager");
  const accepted = await submitAlbumMessageTask({ user: { id: owner, displayName: "Owner" },
    thread: { id: threadId, agentId: agent.key }, body,
    requestFingerprint: messageRequestFingerprint(body), replyMetadata: {},
    agentAccess: { agent, grantedScopes: agent.permissions } });
  return { ...await request(`/api/threads/${threadId}/messages`, body), legacyAdmissionCreated: !accepted.reused };
};

integration("App addition rejects a partial declaration without changing existing access or creating a conversation", async () => {
  const before = await query("SELECT enabled, granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = 'site-builder'", [owner]);
  const response = await fetch(`${origin}/api/me/agents/site-builder`, { method: "PATCH", headers: {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json",
  }, body: JSON.stringify({ enabled: true, grantedScopes: ["profile:read"] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.details.code, "AGENT_FULL_ACCESS_REQUIRED");
  assert.deepEqual(await query("SELECT enabled, granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = 'site-builder'", [owner]), before);
  assert.equal((await query("SELECT id FROM chat_threads WHERE user_id = ? AND agent_id = 'site-builder'", [owner])).length, 0);
  assert.equal((await query("SELECT id FROM ai_tasks WHERE user_id = ?", [owner])).length, 0);
});

integration("a queued Album task stops when a declared non-search permission is removed", async () => {
  const accepted = await admitAndReplayLegacyAlbum();
  assert.equal(accepted.status, 200);
  assert.equal(accepted.legacyAdmissionCreated, true);
  await query("UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'album-manager'",
    [JSON.stringify(albumScopes.filter(scope => scope !== "station:write")), owner]);
  let modelCalls = 0;
  const runner = createAITaskRunner({ executors: { agent_message: createMessageTaskExecutor({
    runAgentRuntime: async () => { modelCalls++; assert.fail("must not call the model"); },
  }) }, logger });
  assert.equal(await runner.runOnce(), true);
  assert.equal(modelCalls, 0);
  const task = await repository.getAITask({ userId: owner, taskId: accepted.data.task.id });
  assert.equal(task.status, "failed");
  assert.equal(task.error.code, "AI_ACCESS_REVOKED");
  assert.equal((await query("SELECT id FROM chat_messages WHERE thread_id = ? AND sender_type = 'agent'", [threadId])).length, 0);
});
const assertPublicMessages = (messages) => {
  const publicFields = ["id", "threadId", "senderType", "senderName", "content", "metadata", "clientMessageId", "deletedAt", "recalledAt", "createdAt"];
  const publicMetadata = ["senderUserId", "butlerContextReset", "assistSource", "replyTo", "contextRefs", "butlerClarification", "agentWorkspace", "albumAssistant"];
  for (const message of messages) {
    assert.deepEqual(Object.keys(message).sort(), [...publicFields].sort());
    assert.ok(Object.keys(message.metadata).every(key => publicMetadata.includes(key)));
    assert.doesNotMatch(JSON.stringify(message.metadata), /requestFingerprint|provider|tokenUsage|taskId|errorCode|recalledByUserId|retrievalRunIds|inputMessageId/);
  }
};
const fakeDraft = {
  source: "model",
  model: { provider: "test-only", configured: true, missing: [] },
  draft: {
    language: "zh",
    title: "Integration draft",
    theme: "clean",
    summary: "Test-only draft",
    sections: [
      {
        type: "hero",
        title: "Test heading",
        subtitle: "",
        body: "Test body",
        assetIds: [],
        diaryEntryIds: [],
        actions: [],
      },
    ],
  },
};

integration(
  "old or unsupported AI clients are rejected before messages, tasks, drafts, replay or model calls",
  async () => {
    const albumBody = {
      content: "Old client input",
      clientMessageId: crypto.randomUUID(),
    };
    for (const contract of [null, "0", "2"]) {
      for (const [path, body] of [
        [`/api/threads/${threadId}/messages`, albumBody],
        [
          `/api/threads/${butlerThreadId}/messages`,
          {
            ...albumBody,
            contextRefs: [{ kind: "station-album", id: albumId }],
          },
        ],
        [
          "/api/station/site-drafts",
          { prompt: "Old site client", apply: false },
        ],
        [
          "/api/station/site-drafts",
          {
            prompt: "New body without contract",
            idempotencyKey: crypto.randomUUID(),
          },
        ],
        [`/api/station/site-drafts/${crypto.randomUUID()}/apply`, {}],
      ]) {
        const response = await request(path, body, token, contract);
        assert.equal(response.status, 426);
        assert.equal(response.error.details.code, "AI_CLIENT_UPDATE_REQUIRED");
      }
    }
    for (const table of ["chat_messages", "ai_tasks", "station_site_drafts"]) {
      assert.equal(
        (await query(`SELECT id FROM ${table} WHERE user_id = ?`, [owner]))
          .length,
        0,
      );
    }
    let calls = 0;
    const runner = createAITaskRunner({
      executors: {
        agent_message: async () => {
          calls++;
        },
        site_draft: async () => {
          calls++;
        },
      },
      logger,
    });
    assert.equal(await runner.runOnce(), false);
    assert.equal(calls, 0);

    const accepted = await admitAndReplayLegacyAlbum(albumBody);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.legacyAdmissionCreated, true);
    const replay = await request(
      `/api/threads/${threadId}/messages`,
      albumBody,
      token,
      null,
    );
    assert.equal(replay.status, 426);
    const rejectedDecision = await request(
      `/api/tasks/${accepted.data.task.id}/decision`,
      {
        revision: accepted.data.task.revision,
        operation: "cancel",
      },
      token,
      null,
    );
    assert.equal(rejectedDecision.status, 426);
    assert.equal(
      (await request(`/api/tasks/${accepted.data.task.id}`)).data.status,
      "queued",
    );
    assert.equal(
      (await query("SELECT id FROM chat_messages WHERE user_id = ?", [owner]))
        .length,
      1,
    );
    assert.equal(
      (await query("SELECT id FROM ai_tasks WHERE user_id = ?", [owner]))
        .length,
      1,
    );
  },
);

integration(
  "production no-reference message keys replay after upgrade without another message or model call",
  async () => {
    const clientMessageId = crypto.randomUUID();
    const content = "Persisted before the task upgrade";
    const requestFingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify([content, null]))
      .digest("hex");
    const { message } = await addMessageToThreadOnce({
      userId: owner,
      threadId: butlerThreadId,
      senderType: "user",
      senderName: "Owner",
      content,
      clientMessageId,
      metadata: { source: "app", requestFingerprint },
    });
    const completed = await completeAgentMessageOnce({
      userId: owner,
      threadId: butlerThreadId,
      inputMessageId: message.id,
      agentId: "miaoxun-butler",
      senderName: "Butler",
      content: "Saved production reply",
      metadata: { provider: "test-only" },
      status: "success",
      provider: "test-only",
      latencyMs: 1,
    });
    syncRuntime = async () => {
      assert.fail("An old message replay must not dispatch another model call");
    };
    for (const contextRefs of [undefined, []]) {
      const response = await request(
        `/api/threads/${butlerThreadId}/messages`,
        { content, clientMessageId, ...(contextRefs ? { contextRefs } : {}) },
        token,
        null,
      );
      assert.equal(response.status, 200);
      assert.deepEqual(
        response.data.messages.map((item) => item.id),
        [message.id, completed.outputMessage.id],
      );
    }
    const changed = await request(`/api/threads/${butlerThreadId}/messages`, {
      content,
      clientMessageId,
      contextRefs: [{ kind: "station-album", id: albumId }],
    });
    assert.equal(changed.status, 409);
    assert.equal(
      (await query("SELECT id FROM chat_messages WHERE user_id = ?", [owner]))
        .length,
      2,
    );
    assert.equal(
      (await query("SELECT id FROM ai_tasks WHERE user_id = ?", [owner]))
        .length,
      0,
    );
  },
);

for (const mode of ["chat", "task"]) {
  integration(`${mode} replay never restores deleted messages or starts another model call`, async () => {
    const selectedThreadId = mode === "task" ? threadId : butlerThreadId;
    const body = { content: "A request with a saved reply", clientMessageId: crypto.randomUUID() };
    let modelCalls = 0;
    syncRuntime = async () => { modelCalls++; assert.fail("Completed chat must not call the model again"); };
    let input;
    let output;
    let task;
    let runner;
    if (mode === "task") {
      const accepted = await admitAndReplayLegacyAlbum(body);
      assert.equal(accepted.status, 200);
      assert.equal(accepted.legacyAdmissionCreated, true);
      input = accepted.data.messages[0];
      task = accepted.data.task;
      runner = createAITaskRunner({ executors: { agent_message: createMessageTaskExecutor({
        runAgentRuntime: async (options) => {
          modelCalls++;
          await options.beforeModelCall();
          return { reply: "A saved task reply", provider: "test-only", latencyMs: 1 };
        },
      }) }, logger });
      assert.equal(await runner.runOnce(), true);
      const completed = await request(`/api/threads/${selectedThreadId}/messages`, body);
      assert.equal(completed.status, 200);
      output = completed.data.messages[1];
    } else {
      ({ message: input } = await addMessageToThreadOnce({
        userId: owner, threadId: selectedThreadId, senderType: "user", senderName: "Owner",
        ...body, metadata: { source: "app", requestFingerprint: crypto.createHash("sha256")
          .update(JSON.stringify([body.content, null])).digest("hex") },
      }));
      ({ outputMessage: output } = await completeAgentMessageOnce({
        userId: owner, threadId: selectedThreadId, inputMessageId: input.id,
        agentId: "miaoxun-butler", senderName: "Butler", content: "A saved chat reply",
        metadata: { provider: "test-only" }, status: "success", provider: "test-only", latencyMs: 1,
      }));
    }
    const storedBefore = await query("SELECT id, output_message_id FROM agent_runs WHERE input_message_id = ?", [input.id]);
    const callsBefore = modelCalls;
    const remove = async (messageId) => {
      const response = await fetch(`${origin}/api/threads/${selectedThreadId}/messages/${messageId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 200);
    };
    await remove(output.id);
    // A completed result stays terminal even after the stale-message deadline.
    await query("UPDATE chat_messages SET created_at = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id = ?", [input.id]);
    const replay = await request(`/api/threads/${selectedThreadId}/messages`, body);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.data.messages.map(message => message.id), [input.id]);
    assertPublicMessages(replay.data.messages);
    if (task) {
      assert.equal(replay.data.task.id, task.id);
      assert.equal(replay.data.task.status, "succeeded");
      assert.equal(await runner.runOnce(), false);
    }
    await remove(input.id);
    const deletedInput = await request(`/api/threads/${selectedThreadId}/messages`, body);
    assert.equal(deletedInput.status, 409);
    assert.equal(deletedInput.error.details.code, "MESSAGE_DELETED");
    assert.equal(deletedInput.data, undefined);
    assert.equal(modelCalls, callsBefore);
    assert.deepEqual(await query("SELECT id, output_message_id FROM agent_runs WHERE input_message_id = ?", [input.id]), storedBefore);
    assert.equal((await query("SELECT id FROM chat_messages WHERE user_id = ?", [owner])).length, 2);
    const history = await request(`/api/threads/${selectedThreadId}/messages`);
    assert.equal(history.status, 200);
    assert.deepEqual(history.data, []);
  });
}

integration(
  "legacy album admission remains atomic/idempotent and HTTP replay preserves worker completion and owner checks",
  async () => {
    const clientMessageId = crypto.randomUUID();
    const [first, repeat] = await Promise.all([
      admitAndReplayLegacyAlbum({ clientMessageId }),
      admitAndReplayLegacyAlbum({ clientMessageId }),
    ]);
    assert.deepEqual([first.status, repeat.status], [200, 200]);
    assert.deepEqual([first.legacyAdmissionCreated, repeat.legacyAdmissionCreated].sort(), [false, true]);
    const task = first.data.task;
    assert.equal(task.id, repeat.data.task.id);
    assert.equal(first.data.messages[0].metadata.taskId, undefined);
    assertPublicMessages(first.data.messages);
    assertPublicMessages(repeat.data.messages);
    assert.equal(
      (await request(`/api/threads/${threadId}/messages`, { clientMessageId, content: "Changed request" })).status,
      409,
    );
    assert.equal(
      (await request(`/api/tasks/${task.id}`, undefined, otherToken)).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/api/tasks?threadId=${threadId}&kind=agent_message`,
          undefined,
          otherToken,
        )
      ).data.length,
      0,
    );
    let calls = 0;
    const executor = createMessageTaskExecutor({
      runAgentRuntime: async (options) => {
        calls++;
        await options.beforeModelCall();
        return {
          reply: "Test-only response",
          provider: "test-only",
          latencyMs: 1,
          tokenUsage: { prompt: 1, completion: 1, total: 2 },
        };
      },
    });
    const runner = createAITaskRunner({
      executors: { agent_message: executor },
      logger,
    });
    assert.equal(await runner.runOnce(), true);
    assert.equal(await runner.runOnce(), false);
    assert.equal(calls, 1);
    const recovered = (await request(`/api/tasks/${task.id}`)).data;
    assert.equal(recovered.status, "succeeded");
    assert.equal(recovered.artifacts[0].kind, "message");
    const history = (await request(`/api/threads/${threadId}/messages`)).data;
    assert.equal(history.length, 2);
    assertPublicMessages(history);
    const replay = await admitAndReplayLegacyAlbum({ clientMessageId });
    assert.equal(replay.data.messages.length, 2);
    assert.equal(replay.data.task.status, "succeeded");
    assertPublicMessages(replay.data.messages);
    const events = (await request(`/api/tasks/${task.id}/events?limit=2`)).data;
    assert.equal(events.hasMore, true);
    assert.deepEqual(
      events.events.map((event) => event.sequence),
      [1, 2],
    );
    const rest = (
      await request(
        `/api/tasks/${task.id}/events?afterSequence=${events.nextSequence}`,
      )
    ).data;
    assert.equal(rest.events.at(-1).status, "succeeded");
    assert.doesNotMatch(
      JSON.stringify(recovered),
      /claimToken|clientContext|requestHash/,
    );
  },
);

integration(
  "history, sync and bootstrap return the same public workflow metadata while repository diagnostics stay private",
  async () => {
    const inputMessageId = crypto.randomUUID();
    const references = [{ kind: "station-album", id: albumId, title: "Selected album", version: "a".repeat(64) }];
    const clarification = { inputMessageId, contextRefs: references, source: { currentPage: "second-floor.albums" } };
    const submitted = await addMessageToThreadOnce({
      userId: owner,
      threadId: butlerThreadId,
      senderType: "user",
      senderName: "Owner",
      content: "Continue this selected album",
      clientMessageId: crypto.randomUUID(),
      metadata: { source: "app", requestFingerprint: "internal-fingerprint", contextRefs: references, butlerClarification: clarification },
    });
    const completed = await completeAgentMessageOnce({
      userId: owner,
      threadId: butlerThreadId,
      inputMessageId: submitted.message.id,
      agentId: "miaoxun-butler",
      senderName: "Butler",
      content: "What should the page include?",
      metadata: { provider: "internal-provider", tokenUsage: { total: 3 }, errorCode: "INTERNAL_DIAGNOSTIC", butlerClarification: clarification },
      status: "success",
      provider: "test-only",
      latencyMs: 1,
    });
    const [storedReply] = await query("SELECT metadata FROM chat_messages WHERE id = ?", [completed.outputMessage.id]);
    assert.equal(storedReply.metadata.provider, "internal-provider");
    assert.equal(storedReply.metadata.butlerClarification.inputMessageId, inputMessageId);
    const history = (await request(`/api/threads/${butlerThreadId}/messages`)).data;
    const incremental = (await request(`/api/threads/${butlerThreadId}/messages?after=1970-01-01T00:00:00.000Z`)).data;
    const sync = (await request("/api/app/sync")).data.messagesByThread[butlerThreadId];
    const bootstrap = (await request("/api/app/bootstrap")).data.messagesByThread[butlerThreadId];
    for (const messages of [history, incremental, sync, bootstrap]) {
      assertPublicMessages(messages);
      assert.equal(messages.length, 2);
      assert.equal(messages[0].metadata.persistedByApp, undefined);
      assert.deepEqual(messages.at(-1).metadata.butlerClarification, { contextRefs: references, source: clarification.source });
      assert.equal(messages[0].clientMessageId, submitted.message.clientMessageId);
    }
    assert.deepEqual(incremental, history);
    assert.deepEqual(sync, history);
    assert.deepEqual(bootstrap, history);
  },
);

integration(
  "album chat rejects an incomplete grant and retains real history after full addition",
  async () => {
    try {
    await query(
      "UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'album-manager'",
      [JSON.stringify(albumScopes.filter(scope => scope !== "messages:read")), owner],
    );
    const insertTurn = (senderType, content) =>
      query(
        "INSERT INTO chat_messages (id,user_id,thread_id,sender_type,sender_name,content) VALUES (?, ?, ?, ?, ?, ?)",
        [
          crypto.randomUUID(),
          owner,
          threadId,
          senderType,
          senderType === "user" ? "Owner" : "Album agent",
          content,
        ],
      );
    await insertTurn("user", "Older question without history permission");
    await insertTurn("agent", "Older private response");
    const observed = [];
    const executor = createMessageTaskExecutor({
      runAgentRuntime: async (options) => {
        observed.push(
          options.messages.map((message) => ({
            senderType: message.senderType,
            content: message.content,
          })),
        );
        await options.beforeModelCall();
        return {
          reply: "Test-only response",
          provider: "test-only",
          latencyMs: 1,
        };
      },
    });
    const runner = createAITaskRunner({
      executors: { agent_message: executor },
      logger,
    });

    const denied = await request(`/api/threads/${threadId}/messages`, { content: "Find selected media", clientMessageId: crypto.randomUUID() });
    assert.equal(denied.status, 403);
    assert.equal(denied.error.details.code, "AI_ACCESS_REVOKED");
    assert.equal(await runner.runOnce(), false);
    assert.deepEqual(observed, []);

    await query(
      "UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'album-manager'",
      [JSON.stringify(albumScopes), owner],
    );
    await insertTurn("user", "Earlier authorized request");
    await insertTurn("agent", "Earlier authorized response");
    await admitAndReplayLegacyAlbum({ content: "Current authorized question" });
    assert.equal(await runner.runOnce(), true);
    assert.ok(
      observed[0].some(
        (message) => message.content === "Earlier authorized request",
      ),
    );
    assert.ok(
      observed[0].some(
        (message) => message.content === "Earlier authorized response",
      ),
    );
    assert.equal(observed[0].at(-1).content, "Earlier authorized response");
    assert.equal(observed[0].some(message => message.content === "Current authorized question"), false);
    } finally {
      await query(
        "UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'album-manager'",
        [JSON.stringify(albumScopes), owner],
      );
    }
  },
);

integration(
  "queued cancellation is idempotent; running cancellation and late completion are fenced",
  async () => {
    const queued = (await admitAndReplayLegacyAlbum()).data.task;
    const decision = { revision: queued.revision, operation: "cancel" };
    const cancelled = await request(
      `/api/tasks/${queued.id}/decision`,
      decision,
    );
    assert.equal(cancelled.data.status, "cancelled");
    assert.equal(
      (await request(`/api/tasks/${queued.id}/decision`, decision)).data
        .revision,
      cancelled.data.revision,
    );
    assert.equal(await repository.claimAITask(), null);
    const next = (await admitAndReplayLegacyAlbum()).data.task;
    const running = await repository.claimAITask();
    assert.equal(running.id, next.id);
    assert.equal(
      (
        await request(`/api/tasks/${next.id}/decision`, {
          operation: "cancel",
          revision: running.revision,
        })
      ).status,
      409,
    );
    await query(
      "UPDATE ai_tasks SET lease_until = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = ?",
      [running.id],
    );
    assert.equal(await repository.recoverInterruptedAITasks(), 1);
    let committed = false;
    await assert.rejects(
      repository.finishAITask({
        taskId: running.id,
        claimToken: running.claimToken,
        status: "succeeded",
        phase: "completed",
        complete: async () => {
          committed = true;
        },
      }),
      (error) => error.status === 409,
    );
    assert.equal(committed, false);
    assert.equal(
      (await request(`/api/tasks/${next.id}`)).data.status,
      "interrupted",
    );
  },
);

integration(
  "revoked Agent and edited references stop queued execution before any provider call",
  async () => {
    const contextRefs = [
      { kind: "station-album", id: albumId, title: "Client title ignored" },
    ];
    const queued = (await admitAndReplayLegacyAlbum({ contextRefs })).data.task;
    assert.equal(queued.contextRefs[0].title, "Task context album");
    await query(
      "UPDATE station_albums SET description = 'Changed context' WHERE id = ?",
      [albumId],
    );
    let calls = 0;
    const executor = createMessageTaskExecutor({
      runAgentRuntime: async () => {
        calls++;
        throw new Error("must not reach provider");
      },
    });
    const runner = createAITaskRunner({
      executors: { agent_message: executor },
      logger,
    });
    await runner.runOnce();
    assert.equal(
      (await request(`/api/tasks/${queued.id}`)).data.error.code,
      "AI_CONTEXT_CHANGED",
    );
    const revoked = (await admitAndReplayLegacyAlbum()).data.task;
    await query(
      "UPDATE user_agents SET enabled = false WHERE user_id = ? AND agent_id = 'album-manager'",
      [owner],
    );
    await runner.runOnce();
    assert.equal(
      (await request(`/api/tasks/${revoked.id}`)).data.error.code,
      "AI_ACCESS_REVOKED",
    );
    assert.equal(calls, 0);
  },
);

integration(
  "site draft uses the same task contract and approval applies atomically exactly once",
  async () => {
    const body = {
      prompt: "A test-only landing page",
      idempotencyKey: crypto.randomUUID(),
    };
    const queued = await request("/api/station/site-drafts", body);
    assert.equal(queued.status, 202);
    assert.equal(
      (await request("/api/station/site-drafts", body)).data.task.id,
      queued.data.task.id,
    );
    assert.equal(
      (
        await request("/api/station/site-drafts", {
          ...body,
          prompt: "Different",
        })
      ).status,
      409,
    );
    assert.equal(
      (await request("/api/station/site-drafts", { ...body, apply: true }))
        .status,
      400,
    );
    let calls = 0;
    const service = createSiteTaskService({
      generate: async () => {
        calls++;
        return fakeDraft;
      },
    });
    const runner = createAITaskRunner({
      executors: { site_draft: service.executeSiteTask },
      logger,
    });
    await runner.runOnce();
    assert.equal(await runner.runOnce(), false);
    const pending = (await request(`/api/tasks/${queued.data.task.id}`)).data;
    assert.equal(pending.status, "awaiting_confirmation");
    assert.equal(calls, 1);
    assert.equal((await request("/api/station/site-drafts")).data.length, 1);
    const [profile] = await query(
      "SELECT station_config FROM user_profiles WHERE user_id = ?",
      [owner],
    );
    assert.equal(profile.station_config.siteDraftId, undefined);
    const decision = {
      revision: pending.revision,
      operation: "confirm",
      approvalId: pending.approval.id,
    };
    const confirmations = await Promise.all([
      request(`/api/tasks/${pending.id}/decision`, decision),
      request(`/api/tasks/${pending.id}/decision`, decision),
    ]);
    assert.deepEqual(
      confirmations.map((value) => value.status),
      [200, 200],
    );
    assert.equal(confirmations[0].data.revision, pending.revision + 1);
    assert.equal(confirmations[1].data.revision, pending.revision + 1);
    const [applied] = await query(
      "SELECT station_config FROM user_profiles WHERE user_id = ?",
      [owner],
    );
    assert.equal(applied.station_config.siteDraftId, pending.approval.draftId);
    assert.equal(
      (
        await request(`/api/tasks/${pending.id}/decision`, {
          ...decision,
          approvalId: crypto.randomUUID(),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          `/api/station/site-drafts/${pending.approval.draftId}/apply`,
          {},
        )
      ).status,
      426,
    );
  },
);

integration(
  "site confirmation refuses newer user edits and revoked scope without overwriting the profile",
  async () => {
    const queued = (
      await request("/api/station/site-drafts", {
        prompt: "A test-only draft",
        idempotencyKey: crypto.randomUUID(),
      })
    ).data.task;
    const service = createSiteTaskService({ generate: async () => fakeDraft });
    await createAITaskRunner({
      executors: { site_draft: service.executeSiteTask },
      logger,
    }).runOnce();
    const pending = (await request(`/api/tasks/${queued.id}`)).data;
    const decision = {
      revision: pending.revision,
      operation: "confirm",
      approvalId: pending.approval.id,
    };
    await query(
      "UPDATE user_profiles SET bio = 'User changed this' WHERE user_id = ?",
      [owner],
    );
    assert.equal(
      (await request(`/api/tasks/${queued.id}/decision`, decision)).status,
      409,
    );
    await query(
      "UPDATE user_agents SET enabled = false WHERE user_id = ? AND agent_id = 'site-builder'",
      [owner],
    );
    assert.equal(
      (await request(`/api/tasks/${queued.id}/decision`, decision)).status,
      403,
    );
    const [profile] = await query(
      "SELECT bio, station_config FROM user_profiles WHERE user_id = ?",
      [owner],
    );
    assert.equal(profile.bio, "User changed this");
    assert.equal(profile.station_config.siteDraftId, undefined);
    assert.equal(
      (await request(`/api/tasks/${queued.id}`)).data.status,
      "awaiting_confirmation",
    );
  },
);

integration(
  "synchronous Agent references are re-authorized before dispatch and result commit",
  async () => {
    const sourceId = crypto.randomUUID();
    await query(
      "INSERT INTO chat_messages (id,user_id,thread_id,sender_type,sender_name,content) VALUES (?, ?, ?, 'user', 'Owner', 'Selected source')",
      [sourceId, owner, butlerThreadId],
    );
    let calls = 0;
    syncRuntime = async (options) => {
      await options.beforeModelCall();
      calls++;
      await query(
        "UPDATE chat_messages SET recalled_at = CURRENT_TIMESTAMP WHERE id = ?",
        [sourceId],
      );
      return {
        reply: JSON.stringify({
          type: "reply",
          reply: "Do not deliver revoked context",
        }),
        provider: "test-only",
        latencyMs: 1,
      };
    };
    const result = await request(`/api/threads/${butlerThreadId}/messages`, {
      content: "Review selected source",
      clientMessageId: crypto.randomUUID(),
      contextRefs: [{ kind: "chat-message", id: sourceId }],
    });
    assert.equal(result.status, 201);
    assert.equal(calls, 1);
    assert.match(result.data.messages.at(-1).content, /未交付结果/);
    assert.doesNotMatch(JSON.stringify(result), /Do not deliver revoked/);
    assert.equal(
      (
        await request(`/api/threads/${butlerThreadId}/messages`, {
          content: "Try again",
          contextRefs: [{ kind: "chat-message", id: sourceId }],
        })
      ).status,
      404,
    );
  },
);

integration(
  "album references require explicit butler access before creating a message and preserve the selected scope on retry",
  async () => {
    let calls = 0;
    let dispatched;
    await query(
      "UPDATE station_albums SET title = 'Task context album', description = '' WHERE id = ?",
      [albumId],
    );
    syncRuntime = async (options) => {
      await options.beforeModelCall();
      calls++;
      dispatched = options;
      return {
        reply: JSON.stringify({
          type: "reply",
          reply: "The selected album is available",
        }),
        provider: "test-only",
        latencyMs: 1,
      };
    };
    const input = {
      content: "Help me understand the selected album",
      clientMessageId: crypto.randomUUID(),
      clientContext: {
        currentPage: "second-floor.albums",
        language: "zh",
        appearance: "light",
      },
      contextRefs: [
        {
          kind: "station-album",
          id: albumId,
          title: "Untrusted client display title",
        },
      ],
    };
    await query(
      "UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'miaoxun-butler'",
      [
        JSON.stringify(["profile:read", "messages:read", "agents:invoke"]),
        owner,
      ],
    );
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const denied = await request(
          `/api/threads/${butlerThreadId}/messages`,
          input,
        );
        assert.equal(denied.status, 403);
        assert.equal(denied.error.details.code, "AI_ACCESS_REVOKED");
      }
      assert.equal(calls, 0);
      assert.equal(
        (await query("SELECT id FROM chat_messages WHERE user_id = ?", [owner]))
          .length,
        0,
      );
      await query(
        "UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'miaoxun-butler'",
        [
          JSON.stringify(butlerScopes),
          owner,
        ],
      );
      const accepted = await request(
        `/api/threads/${butlerThreadId}/messages`,
        input,
      );
      assert.equal(accepted.status, 201);
      assert.equal(accepted.data.messages[0].content, input.content);
      assert.equal(
        accepted.data.messages[0].metadata.contextRefs[0].id,
        albumId,
      );
      assert.equal(
        accepted.data.messages[0].metadata.contextRefs[0].title,
        "Task context album",
      );
      assert.equal(
        accepted.data.messages.at(-1).content,
        "The selected album is available",
      );
      assert.equal(dispatched.mode, "dispatch");
      assert.equal(
        dispatched.appContext.client.currentPage,
        "second-floor.albums",
      );
      assert.deepEqual(dispatched.appContext.resolvedReferences, [
        {
          kind: "station-album",
          id: albumId,
          title: "Task context album",
          description: "",
        },
      ]);
      assert.equal(calls, 1);
      assert.equal(
        (await request(`/api/threads/${butlerThreadId}/messages`, input))
          .status,
        200,
      );
      assert.equal(calls, 1);
    } finally {
      await query(
        "UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'miaoxun-butler'",
        [JSON.stringify(butlerScopes), owner],
      );
    }
  },
);

integration(
  "ordinary comic and site messages select their own dispatch from executable definitions rather than registry DTOs",
  async () => {
    const calls = [];
    syncRuntime = async (options) => {
      calls.push({ agentId: options.agentId, mode: options.mode });
      await options.beforeModelCall();
      return {
        reply: JSON.stringify({ type: "reply", reply: "Discuss the idea in ordinary language" }),
        provider: "test-only",
        latencyMs: 1,
      };
    };
    for (const agentId of ["comic-diary", "site-builder"]) {
      const selectedThread = crypto.randomUUID();
      await query(
        "INSERT INTO chat_threads (id,user_id,title,agent_id,kind) VALUES (?, ?, 'Conversation regression', ?, 'agent')",
        [selectedThread, owner, agentId],
      );
      await query(
        "INSERT INTO user_agents (user_id,agent_id,enabled,granted_scopes) VALUES (?, ?, true, ?::jsonb) ON CONFLICT (user_id,agent_id) DO NOTHING",
        [owner, agentId, JSON.stringify((await getAgent(agentId)).permissions)],
      );
      const response = await request(
        `/api/threads/${selectedThread}/messages`,
        { content: "Discuss this idea", clientMessageId: crypto.randomUUID() },
      );
      assert.equal(response.status, 201);
      assert.equal(
        response.data.messages.at(-1).content,
        "Discuss the idea in ordinary language",
      );
      assert.deepEqual(response.data.messages.at(-1).metadata.agentDispatch, { version: 1, kind: "reply" });
    }
    assert.deepEqual(calls, [
      { agentId: "comic-diary", mode: "dispatch" },
      { agentId: "site-builder", mode: "dispatch" },
    ]);
  },
);
