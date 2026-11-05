import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getAgent, listAgents } from "../../agents/registry.js";
import {
  applyUIPreferencePatch,
  normalizeUIPreferences,
  sanitizeUIPreferencePatch,
  UI_PREFERENCE_SURFACES,
  UI_ORDERABLE_MODULES,
  unsupportedUIPreferencePaths,
} from "../../shared/ui-preferences.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { runAgent } from "./agent-runtime.js";
import { listRegisteredAgentsWithCatalogue } from "./agent-catalog-repository.js";
import {
  assertAgentAvailable,
  assertCurrentAgentAccess,
  assertAgentProductEntitlement,
  buildAgentAppContext,
} from "./ai-agent-access.js";
import { getAgentContextForUser, createUsageEvent } from "./repositories.js";
import { readAppUIPreferences, writeAppUIPreferences } from "./ui-preferences-app-store.js";
import { parseJson } from "./repository-mappers.js";

const UI_AGENT_ID = "ui-agent";
const PREVIEW_TTL_MS = 10 * 60 * 1000;

const fail = (status, code, message, details = undefined) => {
  throw new HttpError(status, message, { code, ...details });
};

const json = (value) => JSON.stringify(value);

const hasGlobalPreference = patch => Object.hasOwn(patch, "fontScale") || Object.hasOwn(patch, "density");

function requiredAffectedSurfaces(patch) {
  return new Set([
    ...(hasGlobalPreference(patch) ? UI_PREFERENCE_SURFACES : []),
    ...Object.keys(patch.surfaces || {}),
    ...Object.keys(patch.layout || {}),
    ...Object.keys(patch.hiddenModules || {}),
    ...Object.keys(patch.components || {}),
    ...Object.keys(patch.gestures || {}).map(gesture => gesture.startsWith("messages.")
      ? "messages" : gesture.startsWith("miao.") ? "miao" : "secondFloor"),
  ]);
}

function validAffectedSurfaces(patch, affectedSurfaces) {
  return Array.isArray(affectedSurfaces) &&
    affectedSurfaces.every(surface => UI_PREFERENCE_SURFACES.includes(surface)) &&
    [...requiredAffectedSurfaces(patch)].every(surface => affectedSurfaces.includes(surface));
}

const parseAgentReply = (reply) => {
  if (typeof reply !== "string" || !reply.trim())
    fail(502, "UI_AGENT_EMPTY_RESPONSE", "界面调整建议为空，请调整描述后重试。");
  let parsed;
  try {
    parsed = JSON.parse(reply);
  } catch {
    fail(
      502,
      "UI_AGENT_INVALID_RESPONSE",
      "界面调整建议无效，请调整描述后重试。",
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.keys(parsed).some(
      (key) => !["schemaVersion", "intent", "patch", "affectedSurfaces", "rationale"].includes(key),
    ) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.intent !== "string" ||
    !parsed.intent.trim() ||
    typeof parsed.rationale !== "string" ||
    !parsed.rationale.trim()
  ) {
    fail(502, "UI_AGENT_INVALID_RESPONSE", "界面调整建议无效，请调整描述后重试。");
  }
  let patch;
  try {
    patch = sanitizeUIPreferencePatch(parsed.patch);
  } catch {
    fail(502, "UI_AGENT_INVALID_RESPONSE", "界面调整建议无效，请调整描述后重试。");
  }
  if (!validAffectedSurfaces(patch, parsed.affectedSurfaces)) {
    fail(502, "UI_AGENT_INVALID_RESPONSE", "界面调整建议无效，请调整描述后重试。");
  }
  const affectedSurfaces = [...new Set(parsed.affectedSurfaces)];
  return {
    intent: parsed.intent.trim().slice(0, 240),
    rationale: parsed.rationale.trim().slice(0, 500),
    patch,
    affectedSurfaces,
  };
};

function effectivePreferences(preferences) {
  const result = structuredClone(preferences);
  const miaoActionIds = ["miao.taskCard.participants", "miao.taskCard.details"];
  const miaoControls = result.components.miao;
  const participantControl = miaoControls[miaoActionIds[0]] || {};
  const detailsControl = miaoControls[miaoActionIds[1]] || {};
  const participantSlot = participantControl.slot || result.layout.miao.buttonSlots.agentEntry;
  // RN only sorts actions inside the footer; a top-right participant action
  // has no order relationship with details. Details needs an explicit config.
  result.miaoFooterActions = miaoActionIds.filter(id => id === miaoActionIds[0]
    ? participantControl.visible !== false && participantSlot !== "topRight"
    : detailsControl.visible !== false && Object.keys(detailsControl).length > 0,
  ).sort((left, right) => {
    const leftIndex = miaoActionIds.indexOf(left);
    const rightIndex = miaoActionIds.indexOf(right);
    return ((miaoControls[left]?.order ?? leftIndex) - (miaoControls[right]?.order ?? rightIndex)) || leftIndex - rightIndex;
  });
  for (const surface of UI_PREFERENCE_SURFACES) {
    result.hiddenModules[surface].sort();
    const moduleOrder = result.layout[surface].moduleOrder;
    const rank = new Map(moduleOrder.map((module, index) => [module, index]));
    const hidden = new Set(result.hiddenModules[surface]);
    // RN sorts the available tools, not virtual containers such as toolTray.
    // Fixed publish/settings entries stay after this orderable catalogue, and
    // moving a hidden tool cannot change the currently visible sequence.
    result.layout[surface].moduleOrder = UI_ORDERABLE_MODULES[surface].filter(module => !hidden.has(module)).sort(
      (left, right) => (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER),
    );
    for (const [id, config] of Object.entries(result.components[surface])) {
      // A nonempty details configuration exposes an explicit card action in
      // RN, including when its scale and visibility equal semantic defaults.
      if (id === "miao.taskCard.details" && Object.keys(config).length && config.visible !== false)
        config.explicitEntry = true;
      if (surface === "miao" && miaoActionIds.includes(id)) delete config.order;
      if (config.visible === true) delete config.visible;
      if (config.sizeScale === 1) delete config.sizeScale;
      if (config.label === "") delete config.label;
      if (config.icon === "") delete config.icon;
      if (!Object.keys(config).length) delete result.components[surface][id];
    }
  }
  return result;
}

function assertPreferenceChange(current, next) {
  if (isDeepStrictEqual(effectivePreferences(current), effectivePreferences(next))) {
    fail(422, "UI_PREFERENCE_NO_CHANGE", "当前界面没有可应用的变化，请换一种方式描述需求。");
  }
}

async function authorizeUIAgent({ user, queryFn = query }) {
  const agent = await getAgent(UI_AGENT_ID);
  if (!agent) fail(503, "UI_AGENT_UNAVAILABLE", "UI Agent 尚未接入。 ");
  const registered = await listRegisteredAgentsWithCatalogue(
    await listAgents(),
  );
  const context = await getAgentContextForUser(user, registered);
  const access = assertAgentAvailable(context, UI_AGENT_ID);
  const productGrant = await assertAgentProductEntitlement({
    userId: user.id,
    agent: access.agent,
    queryFn,
  });
  return { agent: access.agent, access, context, productGrant };
}

async function lockUIAgentAuthorization({ authorization, queryFn }) {
  const grant = authorization?.productGrant;
  if (!grant?.productId || !grant?.productVersionId || !grant?.agentReleaseId)
    fail(403, "AI_ACCESS_REVOKED", "Agent 授权已变化，请重新确认。 ");
  const product = await queryFn("SELECT id FROM products WHERE id = ? FOR SHARE", [grant.productId]);
  if (!product.length) fail(403, "AI_ACCESS_REVOKED", "Agent 授权已变化，请重新确认。 ");
  try {
    // Registry sync takes registry locks before release locks. Do not wait for
    // either while holding a product lock: product editing uses release first.
    await queryFn(`SELECT r.agent_key FROM agent_registry r
      JOIN product_agent_dependencies d ON d.agent_key = r.agent_key
      WHERE d.product_version_id = ? ORDER BY r.agent_key FOR SHARE OF r NOWAIT`, [grant.productVersionId]);
    const releases = await queryFn(`SELECT r.id FROM agent_releases r
      JOIN product_agent_dependencies d ON d.agent_release_id = r.id
      WHERE d.product_version_id = ? ORDER BY r.id FOR SHARE OF r NOWAIT`, [grant.productVersionId]);
    if (!releases.some(row => String(row.id).trim() === grant.agentReleaseId))
      fail(403, "AI_ACCESS_REVOKED", "Agent 授权已变化，请重新确认。 ");
  } catch (error) {
    if (error.code === "55P03")
      fail(409, "UI_AGENT_AUTHORIZATION_CHANGING", "Agent 授权正在更新，请稍后重试。 ");
    throw error;
  }
}

export function createUIPreferenceService({
  run = runAgent,
  transaction = withTransaction,
  read = readAppUIPreferences,
  persist = writeAppUIPreferences,
  authorize = authorizeUIAgent,
  lockAuthorization = lockUIAgentAuthorization,
  revalidate = async ({ user, authorization, queryFn }) => {
    await assertCurrentAgentAccess({
      userId: user.id,
      agent: authorization.agent,
      grantedScopes: authorization.access.grantedScopes,
      contextRefs: [],
      queryFn,
      lock: true,
    });
    const current = await assertAgentProductEntitlement({ userId: user.id, agent: authorization.agent, queryFn });
    if (["productId", "productVersionId", "agentReleaseId", "contractHash"].some(key => current[key] !== authorization.productGrant[key]))
      fail(403, "AI_ACCESS_REVOKED", "Agent 授权已变化，请重新确认。 ");
  },
  dbQuery = query,
  recordEvent = createUsageEvent,
  now = () => Date.now(),
  idFactory = crypto.randomUUID,
  previewTtlMs = PREVIEW_TTL_MS,
} = {}) {
  const generate = async ({
    user,
    instruction,
    current,
    surface,
    authorization = null,
  }) => {
    const { agent, access, context } =
      authorization || (await authorize({ user }));
    const result = await run({
      agentId: agent.key,
      mode: "plan",
      input: instruction,
      user,
      appContext: {
        ...buildAgentAppContext(context, access, {
          currentPage: surface || "unknown",
          language: "zh",
        }),
        uiPreferences: current,
      },
    });
    return parseAgentReply(result.reply);
  };

  const prepare = async ({ user, instruction, surface = null }) => {
    // Authorize before reading the profile so an unavailable Agent cannot
    // reveal whether a profile exists or consume a model call.
    const authorization = await authorize({ user });
    const current = normalizeUIPreferences(await read(user.id));
    const generated = await generate({
      user,
      instruction,
      current,
      surface,
      authorization,
    });
    let next;
    try {
      next = applyUIPreferencePatch(current, generated.patch);
    } catch {
      fail(502, "UI_AGENT_INVALID_RESPONSE", "界面调整建议无效，请调整描述后重试。");
    }
    assertPreferenceChange(current, next);
    return { authorization, current, generated, next };
  };

  const previewDTO = row => {
    const data = parseJson(row.preview, {});
    const expired = row.status === "pending" && new Date(row.expires_at).getTime() <= now();
    return {
      ...data,
      id: row.id,
      status: row.undone_at ? "undone" : expired ? "expired" : row.status,
      baseRevision: Number(row.base_revision),
      expiresAt: new Date(row.expires_at).toISOString(),
      patch: parseJson(row.patch, {}),
    };
  };

  const assertPreviewInput = async (row, userId, queryFn, lock = false) => {
    if (!row.input_message_id) return;
    const input = await queryFn(`SELECT id FROM chat_messages
      WHERE id = ? AND user_id = ? AND sender_type = 'user'
        AND deleted_at IS NULL AND recalled_at IS NULL${lock ? " FOR SHARE" : ""}`,
    [row.input_message_id, userId]);
    if (!input.length) fail(404, "UI_PREFERENCE_INPUT_NOT_FOUND", "原消息已撤回或删除。 ");
  };

  const getPreview = async ({ user, previewId }) => {
    await authorize({ user });
    const rows = await dbQuery(
      "SELECT * FROM ui_preference_previews WHERE id = ? AND user_id = ?",
      [previewId, user.id],
    );
    if (!rows[0]) fail(404, "UI_PREFERENCE_PREVIEW_NOT_FOUND", "配置预览不存在。 ");
    await assertPreviewInput(rows[0], user.id, dbQuery);
    return previewDTO(rows[0]);
  };

  const lockAndRevalidate = async ({ user, authorization, queryFn }) => {
    await lockAuthorization({ authorization, queryFn });
    await queryFn("SELECT id FROM users WHERE id = ? FOR UPDATE", [user.id]);
    await revalidate({ user, authorization, queryFn });
  };

  const lockPreparedAuthorization = async ({ user, prepared, connection }) => {
    await lockAndRevalidate({ user, authorization: prepared.authorization, queryFn: connection.query.bind(connection) });
  };

  const persistPrepared = async ({ user, inputMessageId, threadId, prepared, connection }) => {
    if (!connection?.query || !inputMessageId || !threadId) {
      fail(400, "UI_PREFERENCE_INPUT_INVALID", "预览需要关联有效的用户消息和事务。 ");
    }
    const queryFn = connection.query.bind(connection);
    await lockAndRevalidate({ user, authorization: prepared.authorization, queryFn });
    const input = await queryFn(`SELECT id FROM chat_messages
      WHERE id = ? AND thread_id = ? AND user_id = ? AND sender_type = 'user'
        AND deleted_at IS NULL AND recalled_at IS NULL FOR UPDATE`, [inputMessageId, threadId, user.id]);
    if (!input.length) fail(404, "UI_PREFERENCE_INPUT_NOT_FOUND", "用户消息不存在。 ");
    const existing = await queryFn("SELECT * FROM ui_preference_previews WHERE input_message_id = ? AND user_id = ?", [inputMessageId, user.id]);
    if (existing[0]) return previewDTO(existing[0]);
    const current = await read(user.id, queryFn, true);
    if (current.revision !== prepared.current.revision) {
      fail(409, "UI_PREFERENCE_REVISION_CONFLICT", "配置版本已变化，请重新生成预览。 ");
    }
    const { generated, next } = prepared;
    const id = idFactory();
    const expiresAt = new Date(now() + previewTtlMs).toISOString();
    const snapshot = {
      schemaVersion: 1, baseRevision: current.revision, beforePreferences: current,
      preferences: next, intent: generated.intent, rationale: generated.rationale,
      affectedSurfaces: generated.affectedSurfaces,
    };
    const rows = await queryFn(`INSERT INTO ui_preference_previews
      (id, user_id, input_message_id, base_revision, patch, preview, expires_at)
      VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?) RETURNING *`,
    [id, user.id, inputMessageId, current.revision, json(generated.patch), json(snapshot), expiresAt]);
    await recordEvent({ userId: user.id, eventType: "ui.preferences.preview", targetType: "ui-preference-preview", targetId: id,
      payload: { baseRevision: current.revision, affectedSurfaces: generated.affectedSurfaces } }, queryFn);
    return previewDTO(rows[0]);
  };

  const preview = async ({ user, instruction, surface = null }) => {
    const { authorization, current, generated, next } = await prepare({ user, instruction, surface });
    const createdAt = now();
    const expiresAt = new Date(createdAt + previewTtlMs).toISOString();
    const id = idFactory();
    await transaction(async connection => {
      const queryFn = connection.query.bind(connection);
      await lockAndRevalidate({ user, authorization, queryFn });
      const latest = await read(user.id, queryFn, true);
      if (latest.revision !== current.revision)
        fail(409, "UI_PREFERENCE_REVISION_CONFLICT", "配置版本已变化，请重新生成预览。 ");
      await queryFn(
        `INSERT INTO ui_preference_previews
        (id, user_id, base_revision, patch, preview, expires_at)
       VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?)`,
        [
          id,
          user.id,
          current.revision,
          json(generated.patch),
          json({
            schemaVersion: 1,
            baseRevision: current.revision,
            beforePreferences: current,
            preferences: next,
            intent: generated.intent,
            rationale: generated.rationale,
            affectedSurfaces: generated.affectedSurfaces,
          }),
          expiresAt,
        ],
      );
      await recordEvent({
        userId: user.id,
        eventType: "ui.preferences.preview",
        targetType: "ui-preference-preview",
        targetId: id,
        payload: {
          baseRevision: current.revision,
          affectedSurfaces: generated.affectedSurfaces,
        },
      }, queryFn);
    });
    return {
      id,
      status: "pending",
      baseRevision: current.revision,
      expiresAt,
      patch: generated.patch,
      beforePreferences: current,
      preferences: next,
      intent: generated.intent,
      rationale: generated.rationale,
      affectedSurfaces: generated.affectedSurfaces,
    };
  };

  const confirm = async ({ user, previewId, baseRevision }) => {
    const authorization = await authorize({ user });
    const result = await transaction(async (connection) => {
      await lockAndRevalidate({ user, authorization, queryFn: connection.query.bind(connection) });
      const current = await read(user.id, connection.query.bind(connection), true);
      const rows = await connection.query(
        "SELECT * FROM ui_preference_previews WHERE id = ? AND user_id = ? FOR UPDATE",
        [previewId, user.id],
      );
      if (!rows[0])
        fail(404, "UI_PREFERENCE_PREVIEW_NOT_FOUND", "配置预览不存在。 ");
      const previewRow = rows[0];
      await assertPreviewInput(previewRow, user.id, connection.query.bind(connection), true);
      if (previewRow.status !== "pending")
        fail(
          409,
          "UI_PREFERENCE_PREVIEW_USED",
          "配置预览已经处理，不能重复确认。 ",
        );
      if (new Date(previewRow.expires_at).getTime() <= now()) {
        await connection.query(
          "UPDATE ui_preference_previews SET status = 'expired' WHERE id = ?",
          [previewId],
        );
        return { expired: true };
      }
      if (Number(previewRow.base_revision) !== baseRevision)
        fail(
          409,
          "UI_PREFERENCE_REVISION_CONFLICT",
          "配置版本已变化，请重新生成预览。 ",
        );
      if (current.revision !== baseRevision)
        fail(
          409,
          "UI_PREFERENCE_REVISION_CONFLICT",
          "配置版本已变化，请重新生成预览。 ",
        );
      let patch;
      let updated;
      try {
        patch = sanitizeUIPreferencePatch(parseJson(previewRow.patch, {}));
        // Earlier pending snapshots may understate a global change's scope.
        // Require a fresh preview instead of silently changing the disclosure.
        if (hasGlobalPreference(patch) &&
            !validAffectedSurfaces(patch, parseJson(previewRow.preview, {})?.affectedSurfaces))
          throw new Error("Stored global preference scope is incomplete.");
        updated = applyUIPreferencePatch(current, patch);
      } catch {
        fail(
          409,
          "UI_PREFERENCE_PREVIEW_UNSUPPORTED",
          "此预览包含当前客户端不支持的调整，请重新生成预览。 ",
        );
      }
      assertPreferenceChange(normalizeUIPreferences(current), updated);
      const next = {
        ...updated,
        revision: current.revision + 1,
      };
      const saved = await persist({
        userId: user.id,
        expectedRevision: baseRevision,
        preferences: next,
        queryFn: connection.query.bind(connection),
      });
      await connection.query(
        `UPDATE ui_preference_previews
         SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP,
             before_preferences = ?::jsonb, confirmed_revision = ?
         WHERE id = ?`,
        [json(current), next.revision, previewId],
      );
      await recordEvent(
        {
          userId: user.id,
          eventType: "ui.preferences.confirm",
          targetType: "ui-preference-preview",
          targetId: previewId,
          payload: { baseRevision, revision: next.revision },
        },
        connection.query.bind(connection),
      );
      return { status: "confirmed", previewId, preferences: saved };
    });
    if (result.expired) {
      fail(409, "UI_PREFERENCE_PREVIEW_EXPIRED", "配置预览已过期，请重新生成。 ");
    }
    return result;
  };

  const reset = async ({ user, baseRevision }) => {
    const authorization = await authorize({ user });
    return transaction(async (connection) => {
      await lockAndRevalidate({ user, authorization, queryFn: connection.query.bind(connection) });
      const current = await read(
        user.id,
        connection.query.bind(connection),
        true,
      );
      if (current.revision !== baseRevision)
        fail(
          409,
          "UI_PREFERENCE_REVISION_CONFLICT",
          "配置版本已变化，请刷新后重试。 ",
        );
      const next = {
        ...normalizeUIPreferences(null),
        revision: current.revision + 1,
      };
      const saved = await persist({
        userId: user.id,
        expectedRevision: baseRevision,
        preferences: next,
        queryFn: connection.query.bind(connection),
      });
      // A reset supersedes previews that were generated from the old revision.
      await connection.query(
        "UPDATE ui_preference_previews SET status = 'reset' WHERE user_id = ? AND status = 'pending'",
        [user.id],
      );
      await recordEvent(
        {
          userId: user.id,
          eventType: "ui.preferences.reset",
          targetType: "user",
          targetId: user.id,
          payload: { baseRevision, revision: next.revision },
        },
        connection.query.bind(connection),
      );
      return { status: "reset", preferences: saved };
    });
  };

  const undo = async ({ user, baseRevision }) => {
    const authorization = await authorize({ user });
    return transaction(async (connection) => {
      await lockAndRevalidate({ user, authorization, queryFn: connection.query.bind(connection) });
      const current = await read(
        user.id,
        connection.query.bind(connection),
        true,
      );
      if (current.revision !== baseRevision)
        fail(
          409,
          "UI_PREFERENCE_REVISION_CONFLICT",
          "配置版本已变化，请刷新后重试。 ",
        );

      const rows = await connection.query(
        `SELECT * FROM ui_preference_previews
         WHERE user_id = ? AND status = 'confirmed' AND undone_at IS NULL
         ORDER BY confirmed_at DESC NULLS LAST, created_at DESC
         LIMIT 1 FOR UPDATE`,
        [user.id],
      );
      const previewRow = rows[0];
      if (!previewRow)
        fail(
          409,
          "UI_PREFERENCE_UNDO_UNAVAILABLE",
          "没有可撤销的已确认界面调整。 ",
        );

      const preview = parseJson(previewRow.preview, {});
      const beforeValue =
        previewRow.before_preferences || preview.beforePreferences;
      if (!beforeValue)
        fail(
          409,
          "UI_PREFERENCE_UNDO_UNAVAILABLE",
          "最近一次界面调整没有可恢复的基线快照。 ",
        );
      const before = normalizeUIPreferences(beforeValue);
      if (unsupportedUIPreferencePaths(before).length)
        fail(409, "UI_PREFERENCE_UNDO_UNSUPPORTED", "之前的界面包含当前不支持的设置，请恢复默认或重新描述调整。 ");
      const next = { ...before, revision: current.revision + 1 };
      const saved = await persist({
        userId: user.id,
        expectedRevision: baseRevision,
        preferences: next,
        queryFn: connection.query.bind(connection),
      });
      const previewId = previewRow.id;
      await connection.query(
        "UPDATE ui_preference_previews SET undone_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'confirmed' AND undone_at IS NULL",
        [previewId],
      );
      await recordEvent(
        {
          userId: user.id,
          eventType: "ui.preferences.undo",
          targetType: "ui-preference-preview",
          targetId: previewId,
          payload: { baseRevision, revision: next.revision },
        },
        connection.query.bind(connection),
      );
      return { status: "undone", previewId, preferences: saved };
    });
  };

  return { preview, prepare, lockPreparedAuthorization, persistPrepared, getPreview, confirm, reset, undo };
}

export const uiPreferenceService = createUIPreferenceService();
export { parseAgentReply };
