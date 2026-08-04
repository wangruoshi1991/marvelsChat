import crypto from "crypto";
import { createAiId } from "./ai-id.js";
import { hashPassword } from "./auth.js";

const adminScopes = JSON.stringify([
  "profile:read",
  "messages:read",
  "agents:invoke",
]);
const adminPermissions = JSON.stringify(["*"]);
const welcomeMessage =
  "欢迎来到妙讯。我会先承接你的消息、账号和小站能力，后续新的 Agent 会逐步接入这里。";

async function ensureAdminExperience(connection, { userId, displayName }) {
  await connection.execute(
    `INSERT INTO user_profiles
      (user_id, nickname, avatar_text, bio, community, activity_area, miao_points)
    VALUES (?, ?, '妙', '妙讯管理平台默认账号。', '', '', 0)
    ON CONFLICT (user_id) DO UPDATE
    SET nickname = EXCLUDED.nickname,
        avatar_text = EXCLUDED.avatar_text,
        bio = EXCLUDED.bio`,
    [userId, displayName],
  );
  await connection.execute(
    `INSERT INTO profile_visibility (user_id)
    VALUES (?)
    ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  await connection.execute(
    `INSERT INTO user_agents
      (user_id, agent_id, alias, enabled, granted_scopes)
    VALUES (?, 'miaoxun-butler', '妙讯管家', TRUE, ?::jsonb)
    ON CONFLICT (user_id, agent_id) DO UPDATE
    SET alias = EXCLUDED.alias,
        enabled = EXCLUDED.enabled,
        granted_scopes = EXCLUDED.granted_scopes`,
    [userId, adminScopes],
  );

  const [threadRows] = await connection.execute(
    `SELECT id
    FROM chat_threads
    WHERE user_id = ? AND agent_id = 'miaoxun-butler'
    ORDER BY created_at ASC
    LIMIT 1`,
    [userId],
  );
  const threadId = threadRows[0]?.id || crypto.randomUUID();

  if (threadRows.length) {
    await connection.execute(
      `UPDATE chat_threads
      SET title = '妙讯管家',
          status_text = '在线 · 管家中枢',
          avatar_text = '妙',
          kind = 'agent',
          pinned = TRUE
      WHERE id = ?`,
      [threadId],
    );
  } else {
    await connection.execute(
      `INSERT INTO chat_threads
        (id, user_id, title, status_text, avatar_text, agent_id, kind, pinned)
      VALUES (?, ?, '妙讯管家', '在线 · 管家中枢', '妙', 'miaoxun-butler', 'agent', TRUE)`,
      [threadId, userId],
    );
  }

  const [messageRows] = await connection.execute(
    `SELECT id
    FROM chat_messages
    WHERE thread_id = ?
      AND metadata ->> 'source' = 'default_admin_seed'
    ORDER BY created_at ASC
    LIMIT 1`,
    [threadId],
  );

  if (messageRows.length) {
    await connection.execute(
      `UPDATE chat_messages
      SET user_id = ?,
          sender_type = 'agent',
          sender_name = '妙讯管家',
          content = ?
      WHERE id = ?`,
      [userId, welcomeMessage, messageRows[0].id],
    );
  } else {
    await connection.execute(
      `INSERT INTO chat_messages
        (id, thread_id, user_id, sender_type, sender_name, content, metadata)
      VALUES (?, ?, ?, 'agent', '妙讯管家', ?, jsonb_build_object('source', 'default_admin_seed'))`,
      [crypto.randomUUID(), threadId, userId, welcomeMessage],
    );
  }
}

export async function bootstrapDefaultAdmin(connection, defaultAdmin) {
  const [rows] = await connection.execute(
    `SELECT id
    FROM users
    WHERE login_name = ? OR email = ?
    ORDER BY created_at ASC`,
    [defaultAdmin.loginName, defaultAdmin.email],
  );

  if (rows.length > 1) {
    throw new Error(
      "DEFAULT_ADMIN_LOGIN and DEFAULT_ADMIN_EMAIL belong to different accounts.",
    );
  }

  if (rows.length) {
    const userId = rows[0].id;
    if (defaultAdmin.resetPasswordOnBootstrap) {
      const passwordHash = await hashPassword(defaultAdmin.password);
      await connection.execute(
        `UPDATE users
        SET login_name = ?,
            email = ?,
            password_hash = ?,
            display_name = ?,
            role = 'admin',
            admin_permissions = ?::jsonb,
            status = 'active'
        WHERE id = ?`,
        [
          defaultAdmin.loginName,
          defaultAdmin.email,
          passwordHash,
          defaultAdmin.displayName,
          adminPermissions,
          userId,
        ],
      );
    } else {
      await connection.execute(
        `UPDATE users
        SET login_name = ?,
            email = ?,
            display_name = ?,
            role = 'admin',
            admin_permissions = ?::jsonb,
            status = 'active'
        WHERE id = ?`,
        [
          defaultAdmin.loginName,
          defaultAdmin.email,
          defaultAdmin.displayName,
          adminPermissions,
          userId,
        ],
      );
    }

    await ensureAdminExperience(connection, {
      userId,
      displayName: defaultAdmin.displayName,
    });
    return { created: false, userId };
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(defaultAdmin.password);
  const aiId = await createAiId(connection, {
    email: defaultAdmin.email,
    phoneNumber: null,
  });

  await connection.execute(
    `INSERT INTO users
      (id, login_name, email, password_hash, display_name, ai_id, role, admin_permissions, status)
    VALUES (?, ?, ?, ?, ?, ?, 'admin', ?::jsonb, 'active')`,
    [
      userId,
      defaultAdmin.loginName,
      defaultAdmin.email,
      passwordHash,
      defaultAdmin.displayName,
      aiId,
      adminPermissions,
    ],
  );
  await ensureAdminExperience(connection, {
    userId,
    displayName: defaultAdmin.displayName,
  });
  return { created: true, userId };
}
