import crypto from "crypto";
import { config } from "./config.js";
import { query, withTransaction } from "./db.js";
import { createPlainToken, hashToken, sessionExpiryDate } from "./auth.js";
import { HttpError } from "./http-error.js";
import { createAiId } from "./ai-id.js";
import { createAvatarConfig } from "./avatar-service.js";
import { buildAgentReadiness } from "./agent-readiness-service.js";
import {
  listNotificationsForUser,
  markNotificationRead,
  markNotificationsRead,
  unreadNotificationCount,
} from "./notification-service.js";
import {
  getProfileForUser,
  getProfileVisibility,
  getStationContentForUser,
} from "./station-repository.js";
import { listSearchHistory } from "./search-repository.js";
import {
  displayInitial,
  mapAgentRun,
  normalizeDisplayName,
  normalizeEmail,
  normalizeLoginName,
  normalizeOnlineUserIds,
  normalizePhoneNumber,
  normalizePresenceMode,
  parseJson,
  publicUser,
  toIso,
} from "./repository-mappers.js";
import {
  listMessagesForThreads,
  listThreadsForUser,
} from "./message-repository.js";
import { listRelationshipProfiles } from "./social-repository.js";

export {
  listNotificationsForUser,
  markNotificationRead,
  markNotificationsRead,
  unreadNotificationCount,
  publicUser,
};

async function countUsers() {
  const rows = await query("SELECT COUNT(*) AS total FROM users");
  return Number(rows[0]?.total || 0);
}

export async function findUserByEmail(email) {
  const rows = await query("SELECT * FROM users WHERE email = ? LIMIT 1", [normalizeEmail(email)]);
  return rows[0] || null;
}

export async function findUserByPhoneNumber(phoneNumber) {
  const rows = await query("SELECT * FROM users WHERE phone_number = ? LIMIT 1", [
    normalizePhoneNumber(phoneNumber),
  ]);
  return rows[0] || null;
}

export async function findUserByLoginIdentifier(identifier) {
  const normalized = normalizeLoginName(identifier);
  const phoneNumber = normalizePhoneNumber(identifier);
  const rows = await query(
    `SELECT *
    FROM users
    WHERE email = ? OR login_name = ? OR lower(display_name) = ? OR phone_number = ?
    LIMIT 1`,
    [normalized, normalized, normalized, phoneNumber],
  );
  return rows[0] || null;
}

export async function findUserByDisplayName(displayName) {
  const rows = await query("SELECT * FROM users WHERE lower(display_name) = ? LIMIT 1", [
    normalizeDisplayName(displayName),
  ]);
  return rows[0] || null;
}

export async function getUserById(userId) {
  const rows = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] ? publicUser(rows[0]) : null;
}

export async function getRawUserById(userId) {
  const rows = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] || null;
}

export async function createUserWithDefaults({ email, phoneNumber = null, displayName, passwordHash, role }) {
  const normalizedPhoneNumber = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
  const normalizedEmail = normalizeEmail(
    email || (normalizedPhoneNumber ? `${normalizedPhoneNumber}@phone.miaoxun.local` : ""),
  );
  const userId = crypto.randomUUID();
  const threadId = crypto.randomUUID();
  const welcomeMessageId = crypto.randomUUID();
  const nickname = displayName.trim();
  const avatarText = displayInitial(nickname);

  await withTransaction(async (connection) => {
    const aiId = await createAiId(connection, {
      email: normalizedEmail,
      phoneNumber: normalizedPhoneNumber,
    });

    await connection.execute(
      `INSERT INTO users
        (id, email, phone_number, password_hash, display_name, ai_id, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [userId, normalizedEmail, normalizedPhoneNumber, passwordHash, nickname, aiId, role],
    );

    const avatarConfig = createAvatarConfig(`${aiId}:${normalizedEmail}:${normalizedPhoneNumber || ""}`);

    await connection.execute(
      `INSERT INTO user_profiles
        (user_id, nickname, avatar_text, avatar_config, bio, community, activity_area, miao_points)
      VALUES (?, ?, ?, ?::jsonb, '', '', '', 0)`,
      [userId, nickname, avatarText, JSON.stringify(avatarConfig)],
    );

    await connection.execute("INSERT INTO profile_visibility (user_id) VALUES (?)", [userId]);

    await connection.execute(
      `INSERT INTO user_agents
        (user_id, agent_id, alias, enabled, granted_scopes)
      VALUES (?, 'miaoxun-butler', '妙讯管家', TRUE, ?::jsonb)`,
      [
        userId,
        JSON.stringify(["profile:read", "messages:read", "agents:invoke"]),
      ],
    );

    await connection.execute(
      `INSERT INTO chat_threads
        (id, user_id, title, status_text, avatar_text, agent_id, kind, pinned)
      VALUES (?, ?, '妙讯管家', '在线 · 管家中枢', '妙', 'miaoxun-butler', 'agent', TRUE)`,
      [threadId, userId],
    );

    await connection.execute(
      `INSERT INTO chat_messages
        (id, thread_id, user_id, sender_type, sender_name, content, metadata)
      VALUES (?, ?, ?, 'agent', '妙讯管家', ?, jsonb_build_object('source', 'system_welcome'))`,
      [
        welcomeMessageId,
        threadId,
        userId,
        "欢迎来到妙讯。我会先承接你的消息、账号和小站能力，后续新的 Agent 会逐步接入这里。",
      ],
    );
  });

  return getUserById(userId);
}

export async function createManagedUser({
  email,
  displayName,
  passwordHash,
  role = "user",
  status = "active",
}) {
  const user = await createUserWithDefaults({ email, displayName, passwordHash, role });
  await query("UPDATE users SET status = ? WHERE id = ?", [status, user.id]);
  return getUserById(user.id);
}

export async function createSessionForUser(userId) {
  const token = createPlainToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = sessionExpiryDate();

  await query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)`,
    [sessionId, userId, hashToken(token), expiresAt],
  );

  return {
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function markLogin(userId) {
  await query("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [userId]);
}

export async function revokeSession(sessionId) {
  if (!sessionId) return;
  await query("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?", [sessionId]);
}

export async function revokeSessionsForUser(userId) {
  await query(
    `UPDATE auth_sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND revoked_at IS NULL`,
    [userId],
  );
}

export async function adminSessionSummary(userId) {
  const rows = await query(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked
    FROM auth_sessions
    WHERE user_id = ?`,
    [userId],
  );

  return {
    total: Number(rows[0]?.total || 0),
    active: Number(rows[0]?.active || 0),
    revoked: Number(rows[0]?.revoked || 0),
  };
}

export function parseAiIdFromScanPayload(payload) {
  const value = String(payload || "").trim();
  const match = value.match(/miaoxun:\/\/ai\/(\d{12})/) || value.match(/^(\d{12})$/);
  return match ? match[1] : "";
}

async function listOwnedAgents(userId, registeredAgents = []) {
  const rows = await query(
    `SELECT user_id, agent_id, alias, enabled, granted_scopes, created_at
    FROM user_agents
    WHERE user_id = ?
      AND enabled = TRUE
    ORDER BY created_at ASC`,
    [userId],
  );
  const registry = new Map(registeredAgents.map((agent) => [agent.key, agent]));

  return rows.map((row) => {
    const agent = registry.get(row.agent_id);
    return {
      id: row.agent_id,
      name: row.alias || agent?.name || row.agent_id,
      description: agent?.description || "",
      category: agent?.category || "",
      enabled: Boolean(row.enabled),
      grantedScopes: parseJson(row.granted_scopes, []),
      createdAt: toIso(row.created_at),
    };
  });
}

export async function listAgentAccessForUser(userId, registeredAgents = []) {
  const rows = await query(
    `SELECT user_id, agent_id, alias, enabled, granted_scopes, created_at, updated_at
    FROM user_agents
    WHERE user_id = ?
    ORDER BY created_at ASC`,
    [userId],
  );
  const access = new Map(rows.map((row) => [row.agent_id, row]));

  return registeredAgents.map((agent) => {
    const row = access.get(agent.key);
    return {
      id: agent.key,
      name: row?.alias || agent.name,
      description: agent.description || "",
      category: agent.category || "",
      enabled: Boolean(row?.enabled),
      grantedScopes: parseJson(row?.granted_scopes, []),
      createdAt: toIso(row?.created_at),
      updatedAt: toIso(row?.updated_at),
    };
  });
}

export async function setUserAgentAccess({
  userId,
  agent,
  enabled,
  alias = "",
  grantedScopes,
}) {
  const resolvedAlias = alias || agent.name || agent.key;
  const resolvedScopes = resolveAgentGrantedScopes(agent, grantedScopes);
  await query(
    `INSERT INTO user_agents
      (user_id, agent_id, alias, enabled, granted_scopes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, agent_id) DO UPDATE SET
      alias = EXCLUDED.alias,
      enabled = EXCLUDED.enabled,
      granted_scopes = EXCLUDED.granted_scopes,
      updated_at = CURRENT_TIMESTAMP`,
    [userId, agent.key, resolvedAlias, enabled, JSON.stringify(resolvedScopes)],
  );

  if (enabled) {
    const existingThreads = await query(
      "SELECT id FROM chat_threads WHERE user_id = ? AND agent_id = ? LIMIT 1",
      [userId, agent.key],
    );
    if (!existingThreads.length) {
      const threadId = crypto.randomUUID();
      const messageId = crypto.randomUUID();
      const avatarText = displayInitial(resolvedAlias);
      await withTransaction(async (connection) => {
        await connection.execute(
          `INSERT INTO chat_threads
            (id, user_id, title, status_text, avatar_text, agent_id, kind, pinned)
          VALUES (?, ?, ?, '在线 · Agent', ?, ?, 'agent', FALSE)`,
          [threadId, userId, resolvedAlias, avatarText, agent.key],
        );
        await connection.execute(
          `INSERT INTO chat_messages
            (id, thread_id, user_id, sender_type, sender_name, content, metadata)
          VALUES (?, ?, ?, 'agent', ?, ?, ?)`,
          [
            messageId,
            threadId,
            userId,
            resolvedAlias,
            `${resolvedAlias} 已接入当前账号。后续消息会从这里进入真实 Agent 调用链路。`,
            JSON.stringify({ source: "admin_agent_enable", agentId: agent.key }),
          ],
        );
      });
    } else {
      await query(
        "UPDATE chat_threads SET status_text = '在线 · Agent' WHERE user_id = ? AND agent_id = ?",
        [userId, agent.key],
      );
    }
  } else {
    await query(
      "UPDATE chat_threads SET status_text = '已停用' WHERE user_id = ? AND agent_id = ?",
      [userId, agent.key],
    );
  }

  return listAgentAccessForUser(userId, [agent]);
}

export function resolveAgentGrantedScopes(agent, requestedScopes) {
  const declaredScopes = Array.isArray(agent?.permissions) ? agent.permissions : [];
  const scopes = requestedScopes === undefined ? declaredScopes : requestedScopes;
  const unknownScopes = scopes.filter((scope) => !declaredScopes.includes(scope));
  if (unknownScopes.length) {
    throw new HttpError(400, `Unsupported Agent scopes: ${unknownScopes.join(", ")}`);
  }
  return Array.from(new Set(scopes));
}

export async function createUsageEvent({
  userId,
  eventType,
  targetType = null,
  targetId = null,
  payload = {},
  ipHash = null,
  userAgent = "",
}) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO usage_events
      (id, user_id, event_type, target_type, target_id, payload, ip_hash, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, eventType, targetType, targetId, JSON.stringify(payload), ipHash, userAgent],
  );
  return { id };
}

export async function createAgentRun(run) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO agent_runs
      (
        id, user_id, agent_id, thread_id, input_message_id, output_message_id,
        status, provider, latency_ms, token_prompt, token_completion, token_total,
        cost_cents, error_message, finished_at
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      id,
      run.userId,
      run.agentId,
      run.threadId,
      run.inputMessageId,
      run.outputMessageId || null,
      run.status,
      run.provider || "unknown",
      run.latencyMs ?? null,
      run.tokenPrompt ?? null,
      run.tokenCompletion ?? null,
      run.tokenTotal ?? null,
      run.costCents ?? null,
      run.errorMessage || null,
    ],
  );

  const rows = await query("SELECT * FROM agent_runs WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? mapAgentRun(rows[0]) : { id };
}

export async function getBootstrapForUser(user, registeredAgents, onlineUserIds = []) {
  const onlineIds = normalizeOnlineUserIds(onlineUserIds);
  const [
    context,
    threads,
    notifications,
    unreadNotices,
    profileVisibility,
    searchHistory,
    following,
    followers,
    friends,
  ] = await Promise.all([
    getAgentContextForUser(user, registeredAgents),
    listThreadsForUser(user.id, onlineIds),
    listNotificationsForUser(user.id),
    unreadNotificationCount(user.id),
    getProfileVisibility(user.id),
    listSearchHistory(user.id),
    listRelationshipProfiles(user.id, "following", 60, onlineIds),
    listRelationshipProfiles(user.id, "followers", 60, onlineIds),
    listRelationshipProfiles(user.id, "friends", 60, onlineIds),
  ]);
  const messagesByThread = await listMessagesForThreads(
    user.id,
    threads.map((thread) => thread.id),
  );

  return {
    source: "postgresql",
    serverTime: new Date().toISOString(),
    user,
    profile: context.profile,
    threads,
    messagesByThread,
    notices: notifications,
    unreadNoticeCount: unreadNotices,
    profileVisibility,
    searchHistory,
    relationships: {
      following,
      followers,
      friends,
    },
    stationContent: context.stationContent,
    modules: context.modules,
    agentReadiness: buildAgentReadiness(),
    agents: {
      registered: registeredAgents,
      owned: context.ownedAgents,
    },
  };
}

export async function updateUserPresenceMode(userId, presenceMode) {
  const normalized = normalizePresenceMode(presenceMode);
  const rows = await query(
    `UPDATE users
    SET presence_mode = ?
    WHERE id = ?
    RETURNING *`,
    [normalized, userId],
  );
  if (!rows.length) {
    throw new HttpError(404, "User not found");
  }
  return publicUser(rows[0]);
}

export async function getAgentContextForUser(user, registeredAgents = []) {
  const [profile, ownedAgents, stationContent] = await Promise.all([
    getProfileForUser(user.id),
    listOwnedAgents(user.id, registeredAgents),
    getStationContentForUser(user.id),
  ]);

  return {
    user,
    profile,
    ownedAgents,
    registeredAgents,
    stationContent,
    modules: buildAppModules({ profile, ownedAgents, registeredAgents }),
  };
}

export function buildAppModules({ profile, ownedAgents = [], registeredAgents = [] }) {
  const agentRegistered = (key) => registeredAgents.some((agent) => agent.key === key);
  const connected = (key, title, description, meta = {}) => ({
    key,
    title,
    status: "connected",
    label: "已接入",
    description,
    ...meta,
  });
  const pending = (key, title, description, needs = []) => ({
    key,
    title,
    status: "pending",
    label: "待接入",
    description,
    needs,
  });

  return {
    profile: connected("profile", "小站资料", "昵称、简介、社区和活动区域来自 user_profiles。", {
      counts: {
        miaoPoints: Number(profile?.miaoPoints || 0),
        following: Number(profile?.followingCount || 0),
        followers: Number(profile?.followersCount || 0),
        likes: Number(profile?.likesCount || 0),
        collections: Number(profile?.collectionsCount || 0),
      },
    }),
    messages: connected("messages", "妙讯会话", "会话与消息来自 chat_threads / chat_messages。"),
    notices: connected("notices", "通知", "通知来自 notifications 表中的社交与系统通知。"),
    agents: connected("agents", "AI伙伴", "已授权 Agent 来自 user_agents。", {
      enabledCount: ownedAgents.length,
      registeredCount: registeredAgents.length,
    }),
    aiQr: connected("ai-qr", "AI ID 动态码", "由真实 AI ID 在前端生成短效动态码。"),
    search: connected(
      "search",
      "搜索",
      "搜索记录来自 search_history；好友、会话和 Agent 使用真实同步数据检索。",
    ),
    points: connected("points", "妙点明细", "余额来自 user_profiles，明细来自 miao_point_ledger。"),
    privacy: connected(
      "privacy",
      "主页可见范围",
      "主页字段和内容可见范围由 profile_visibility 与内容 visibility 校验。",
    ),
    notifications: pending("notifications", "通知偏好", "通知由真实事件聚合，偏好配置表尚未接入。", [
      "notification_preferences",
    ]),
    createGroup: pending("createGroup", "创建群", "保留创建群入口，尚未接入群组与成员表。", [
      "groups",
      "group_members",
    ]),
    addFriend: connected("addFriend", "添加好友", "好友申请写入 social_requests，通知写入 notifications。"),
    scan: connected("scan", "扫码", "扫码结果经后端解析 AI ID 后打开公开主页。"),
    stationAvatar: connected(
      "station-avatar",
      "3D个人形象",
      "App 通过独立的3D形象流程读取 avatar_3d_models，不绑定 Agent 会话。",
    ),
    posts: connected(
      "posts",
      "我的动态",
      "动态来自 station_posts，媒体关联来自 station_post_media。",
    ),
    diary: agentRegistered("comic-diary")
      ? connected("diary", "个人日记", "漫画日记 Agent 已注册；手写日记来自 station_diary_entries，分镜草稿保存到 station_comic_diaries。", {
          needs: [
            "image_generation",
            "comic_rendering",
          ],
        })
      : connected("diary", "个人日记", "手写日记来自 station_diary_entries；Agent 生成和漫画分镜仍需单独接入。", {
          needs: [
            "generation_jobs",
            "diary_frames",
          ],
        }),
    video: agentRegistered("video-production")
      ? connected("video", "视频制作", "视频制作 Agent 已注册；视频脚本和镜头表保存到 station_video_drafts。", {
          needs: [
            "video_generation_provider",
            "render_queue",
            "asset_storage",
          ],
        })
      : pending("video", "视频制作", "保留视频制作入口，尚未接入脚本、镜头表和渲染任务。", [
          "video_production_agent",
          "station_video_drafts",
          "video_generation_provider",
        ]),
    album: agentRegistered("album-manager")
      ? connected("album", "个人相册", "相册管理 Agent 已注册；station_media_assets 支持标签、检索和相册整理建议。", {
          needs: [
            "storage_provider",
            "vision_captioning",
            "media_audits",
          ],
        })
      : connected("album", "个人相册", "相册元数据来自 station_albums，媒体资产来自 station_media_assets。", {
          needs: [
            "storage_provider",
            "upload_credentials",
            "media_audits",
          ],
        }),
    music: pending("music", "音乐菜单", "保留音乐菜单入口，尚未接入音乐偏好与外部授权。", [
      "music_items",
      "external_music_auth",
    ]),
    social: connected(
      "social",
      "社交网络",
      "关注、粉丝、好友关系和关系列表来自 social_relationships。",
      { needs: ["trust_scores", "interaction_events"] },
    ),
    outfits: connected("outfits", "今日穿搭", "穿搭记录来自 station_outfits，当前保存 avatar_config 快照；正式衣物素材库仍需接入。", {
      needs: [
        "wardrobe_assets",
        "asset_audits",
      ],
    }),
    files: agentRegistered("file-preprocessor")
      ? connected("files", "我的文件", "文件预处理 Agent 已注册；文本类文件可写入 file_assets 并生成摘要、标签和统计。", {
          needs: [
            "storage_provider",
            "memory_items",
            "document_parsers",
          ],
        })
      : pending("files", "我的文件", "保留文件入口，尚未接入云存储、记忆和资产归档。", [
          "file_assets",
          "memory_items",
          "storage_provider",
        ]),
    siteAgent: agentRegistered("site-builder")
      ? connected("site-agent", "建站 Agent", "site-builder Agent 已注册。")
      : pending("site-agent", "建站 Agent", "保留自然语言建站入口，尚未注册 site-builder Agent。", [
          "agents/site-builder.agent.js",
          "station_templates",
          "generation_jobs",
        ]),
    publish: connected(
      "publish",
      "发布动态",
      "发布内容写入 station_posts，图片和视频通过 station_media_assets 关联。",
      { needs: ["content_moderation", "post_audits"] },
    ),
  };
}

export async function determineUserRole(email) {
  if (config.adminEmails.includes(normalizeEmail(email))) return "admin";
  if (!config.createFirstUserAsAdmin) return "user";

  const total = await countUsers();
  return total === 0 ? "admin" : "user";
}

export const hashRequestIp = (ip) =>
  ip ? crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 32) : null;
