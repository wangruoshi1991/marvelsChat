import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import pg from "pg";
import { config } from "../src/config.js";
import { createConnectionAdapter } from "../src/db.js";
import { hashPassword } from "../src/auth.js";
import { createAiId, formatAiId } from "../src/ai-id.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const databaseDir = path.join(backendDir, "database");

const { Client } = pg;
const defaultAdmin = config.defaultAdmin;

const assertDatabaseName = (database) => {
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error("POSTGRES_DATABASE can only contain letters, numbers, or _.");
  }
};

async function createDatabaseIfNeeded() {
  assertDatabaseName(config.db.database);
  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: "postgres",
  });

  await client.connect();
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
    config.db.database,
  ]);
  if (!existing.rows.length) {
    await client.query(`CREATE DATABASE "${config.db.database}"`);
  }
  await client.end();
}

async function ensureLoginNameColumn(connection) {
  await connection.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS login_name VARCHAR(80) UNIQUE");
  await connection.query("CREATE INDEX IF NOT EXISTS idx_users_login_name ON users (login_name)");
}

async function ensurePhoneNumberColumn(connection) {
  await connection.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32) UNIQUE");
  await connection.query("CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users (phone_number)");
}

async function ensureAdminPermissionsColumn(connection) {
  await connection.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_permissions JSONB NOT NULL DEFAULT '[]'::jsonb");
}

async function ensurePresenceModeColumn(connection) {
  await connection.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS presence_mode VARCHAR(20) NOT NULL DEFAULT 'online'
  `);
  await connection.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_users_presence_mode'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT chk_users_presence_mode
          CHECK (presence_mode IN ('online', 'offline', 'hidden'));
      END IF;
    END $$
  `);
  await connection.query("CREATE INDEX IF NOT EXISTS idx_users_presence_mode ON users (presence_mode)");
}

async function ensureDirectFriendThreadColumns(connection) {
  await connection.query("ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS peer_user_id CHAR(36)");
  await connection.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_threads_peer_user'
      ) THEN
        ALTER TABLE chat_threads
          ADD CONSTRAINT fk_threads_peer_user
          FOREIGN KEY (peer_user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;
    END $$
  `);
  await connection.query("CREATE INDEX IF NOT EXISTS idx_threads_peer_user ON chat_threads (peer_user_id)");
  await connection.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_threads_direct_peer
      ON chat_threads (user_id, peer_user_id)
      WHERE peer_user_id IS NOT NULL
  `);
}

async function ensureAiIdSequence(connection) {
  await connection.query(`
    CREATE SEQUENCE IF NOT EXISTS users_ai_id_seq
      START WITH 1
      INCREMENT BY 1
      MINVALUE 1
      MAXVALUE 999999
      NO CYCLE
  `);
  const [sequenceRows] = await connection.execute("SELECT last_value, is_called FROM users_ai_id_seq");
  const [countRows] = await connection.execute("SELECT COUNT(*) AS total FROM users");
  const sequenceLastValue = Number(sequenceRows[0]?.last_value || 1);
  const sequenceIssuedValue = sequenceRows[0]?.is_called ? sequenceLastValue : sequenceLastValue - 1;
  const userCount = Number(countRows[0]?.total || 0);
  const issuedValue = Math.max(sequenceIssuedValue, userCount);
  await connection.execute("SELECT setval('users_ai_id_seq', ?, ?)", [
    Math.max(issuedValue, 1),
    issuedValue > 0,
  ]);
}

async function migrateLegacyAiIds(connection) {
  const [rows] = await connection.execute(
    `SELECT id, email, phone_number, ai_id
    FROM users
    ORDER BY created_at ASC, id ASC`,
  );

  for (const [index, user] of rows.entries()) {
    const sequenceValue = index + 1;
    const expectedAiId = formatAiId(sequenceValue, {
      email: user.email,
      phoneNumber: user.phone_number,
    });
    const hasNewFormat = /^\d{12}$/.test(String(user.ai_id || ""));
    const hasExpectedSequence = String(user.ai_id || "").startsWith(String(sequenceValue).padStart(6, "0"));
    if (hasNewFormat && hasExpectedSequence) {
      continue;
    }
    await connection.execute("UPDATE users SET ai_id = ? WHERE id = ?", [expectedAiId, user.id]);
  }

  const issuedValue = rows.length;
  await connection.execute("SELECT setval('users_ai_id_seq', ?, ?)", [
    Math.max(issuedValue, 1),
    issuedValue > 0,
  ]);
}

async function ensureDefaultAdmin(connection) {
  if (!defaultAdmin.enabled) return;

  const ensureAdminExperience = async (userId) => {
    await connection.execute(
      `UPDATE user_profiles
      SET nickname = ?, avatar_text = '妙', bio = '妙讯管理平台默认账号。'
      WHERE user_id = ?`,
      [defaultAdmin.displayName, userId],
    );
    await connection.execute(
      `UPDATE chat_threads
      SET status_text = '在线 · 管家中枢', avatar_text = '妙'
      WHERE user_id = ? AND agent_id = 'miaoxun-butler'`,
      [userId],
    );
    await connection.execute(
      `UPDATE chat_messages
      SET sender_type = 'agent',
          sender_name = '妙讯管家',
          content = '欢迎来到妙讯。我会先承接你的消息、账号和小站能力，后续新的 Agent 会逐步接入这里。',
          metadata = jsonb_build_object('source', 'default_admin_seed')
      WHERE user_id = ?
        AND metadata ->> 'source' = 'default_admin_seed'`,
      [userId],
    );
  };

  const [rows] = await connection.execute(
    "SELECT id, role FROM users WHERE login_name = ? OR email = ? LIMIT 1",
    [defaultAdmin.loginName, defaultAdmin.email],
  );

  if (rows.length) {
    if (defaultAdmin.resetPasswordOnMigrate) {
      const passwordHash = await hashPassword(defaultAdmin.password);
      await connection.execute(
        `UPDATE users
        SET login_name = ?, email = ?, password_hash = ?, display_name = ?, role = 'admin', admin_permissions = ?, status = 'active'
        WHERE id = ?`,
        [
          defaultAdmin.loginName,
          defaultAdmin.email,
          passwordHash,
          defaultAdmin.displayName,
          JSON.stringify(["*"]),
          rows[0].id,
        ],
      );
      await ensureAdminExperience(rows[0].id);
      return;
    }

    await connection.execute(
      `UPDATE users
      SET login_name = ?, email = ?, display_name = ?, role = 'admin', admin_permissions = ?, status = 'active'
      WHERE id = ?`,
      [defaultAdmin.loginName, defaultAdmin.email, defaultAdmin.displayName, JSON.stringify(["*"]), rows[0].id],
    );
    await ensureAdminExperience(rows[0].id);
    return;
  }

  const passwordHash = await hashPassword(defaultAdmin.password);
  const userId = crypto.randomUUID();
  const threadId = crypto.randomUUID();
  const welcomeMessageId = crypto.randomUUID();

  await connection.query("BEGIN");
  try {
    const aiId = await createAiId(connection, {
      email: defaultAdmin.email,
      phoneNumber: null,
    });

    await connection.execute(
      `INSERT INTO users
        (id, login_name, email, password_hash, display_name, ai_id, role, admin_permissions, status)
      VALUES (?, ?, ?, ?, ?, ?, 'admin', ?, 'active')`,
      [
        userId,
        defaultAdmin.loginName,
        defaultAdmin.email,
        passwordHash,
        defaultAdmin.displayName,
        aiId,
        JSON.stringify(["*"]),
      ],
    );

    await connection.execute(
      `INSERT INTO user_profiles
        (user_id, nickname, avatar_text, bio, community, activity_area, miao_points)
      VALUES (?, ?, '妙', '妙讯管理平台默认账号。', '', '', 0)`,
      [userId, defaultAdmin.displayName],
    );

    await connection.execute("INSERT INTO profile_visibility (user_id) VALUES (?)", [userId]);

    await connection.execute(
      `INSERT INTO user_agents
        (user_id, agent_id, alias, enabled, granted_scopes)
      VALUES (?, 'miaoxun-butler', '妙讯管家', TRUE, ?::jsonb)`,
      [userId, JSON.stringify(["profile:read", "messages:read", "agents:invoke"])],
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
      VALUES (?, ?, ?, 'agent', '妙讯管家', ?, jsonb_build_object('source', 'default_admin_seed'))`,
      [
        welcomeMessageId,
        threadId,
        userId,
        "欢迎来到妙讯。我会先承接你的消息、账号和小站能力，后续新的 Agent 会逐步接入这里。",
      ],
    );

    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  }
}

async function createClient() {
  const client = config.db.databaseUrl
    ? new Client({
        connectionString: config.db.databaseUrl,
      })
    : new Client({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
      });
  await client.connect();
  return client;
}

async function main() {
  if (!config.db.configured) {
    throw new Error(
      "PostgreSQL is not configured. Copy backend/.env.example to backend/.env and set POSTGRES_* values.",
    );
  }

  const migrationFiles = (await fs.readdir(databaseDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  if (!config.db.databaseUrl) {
    await createDatabaseIfNeeded();
  }

  const client = await createClient();
  const connection = createConnectionAdapter(client);

  for (const file of migrationFiles) {
    const sql = await fs.readFile(path.join(databaseDir, file), "utf8");
    await client.query(sql);
  }
  await ensureLoginNameColumn(connection);
  await ensurePhoneNumberColumn(connection);
  await ensureAdminPermissionsColumn(connection);
  await ensurePresenceModeColumn(connection);
  await ensureDirectFriendThreadColumns(connection);
  await ensureAiIdSequence(connection);
  await ensureDefaultAdmin(connection);
  await migrateLegacyAiIds(connection);
  await client.end();

  console.log(`PostgreSQL migration completed for ${config.db.database}.`);
  if (defaultAdmin.enabled) {
    console.log(`Default super admin ensured: ${defaultAdmin.loginName}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
