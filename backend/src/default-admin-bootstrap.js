import crypto from "crypto";
import { createAiId } from "./ai-id.js";
import { hashPassword } from "./auth.js";
import { ensureInitialDefaultButlerPublication } from "./default-butler-publication.js";
import { ensureDefaultButlerAccess } from "./repositories.js";

const adminPermissions = JSON.stringify(["*"]);

async function ensureAdminProfile(connection, { userId, displayName }) {
  await connection.execute(
    `INSERT INTO user_profiles
      (user_id, nickname, avatar_text, bio, community, activity_area, miao_points)
    VALUES (?, ?, '妙', '妙讯管理平台默认账号。', '', '', 0)
    ON CONFLICT (user_id) DO NOTHING`,
    [userId, displayName],
  );
  await connection.execute(
    `INSERT INTO profile_visibility (user_id)
    VALUES (?)
    ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

export async function bootstrapDefaultAdmin(connection, defaultAdmin, { initializeDefaultButler = false, readiness = null } = {}) {
  if (initializeDefaultButler) {
    await ensureInitialDefaultButlerPublication(connection, {
      ...(readiness ? { readiness } : {}),
    });
  }
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

    await ensureAdminProfile(connection, {
      userId,
      displayName: defaultAdmin.displayName,
    });
    await ensureDefaultButlerAccess({ userId, connection });
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
  await ensureAdminProfile(connection, {
    userId,
    displayName: defaultAdmin.displayName,
  });
  await ensureDefaultButlerAccess({ userId, connection });
  return { created: true, userId };
}
