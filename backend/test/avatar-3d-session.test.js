import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  avatarCsrfCookieName,
  avatarSessionCookieName,
  createAvatar3dSessionService,
  getAvatarCsrfToken,
  requireAvatarHttps,
} = await import("../src/avatar-3d-session.js");

const userRow = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  login_name: "person",
  email: "person@example.com",
  phone_number: null,
  display_name: "Person",
  ai_id: "123456789012",
  role: "user",
  admin_permissions: [],
  status: "active",
  presence_mode: "online",
  created_at: "2026-07-17T00:00:00.000Z",
};

const request = ({ method = "POST", headers = {}, cookie = "" } = {}) => ({
  method,
  get(name) {
    const lower = name.toLowerCase();
    if (lower === "cookie") return cookie;
    return headers[lower] || "";
  },
});

const invoke = (middleware, req) => new Promise((resolve) => {
  middleware(req, {}, (error) => resolve(error || null));
});

test("Web login returns secure cookies without exposing the session token", async () => {
  const service = createAvatar3dSessionService({
    findUser: async () => userRow,
    verifyPassword: async () => true,
    createSession: async () => ({
      token: "private-session-token",
      expiresAt: "2026-08-17T00:00:00.000Z",
    }),
    markLogin: async () => {},
    randomToken: () => "csrf-token-abcdefghijklmnopqrstuvwxyz",
  });

  const result = await service.createAvatarWebSession({
    identifier: "person@example.com",
    password: "Password1",
  });

  assert.equal(result.sessionToken, undefined);
  const { cookies, ...publicResult } = result;
  assert.equal(JSON.stringify(publicResult).includes("private-session-token"), false);
  assert.equal(result.csrfToken, "csrf-token-abcdefghijklmnopqrstuvwxyz");
  assert.equal(result.user.email, "person@example.com");
  const sessionCookie = cookies.find((value) => value.startsWith(`${avatarSessionCookieName}=`));
  const csrfCookie = cookies.find((value) => value.startsWith(`${avatarCsrfCookieName}=`));
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /SameSite=Strict/);
  assert.match(sessionCookie, /Path=\/api\/avatar-3d/);
  assert.match(csrfCookie, /Secure/);
  assert.match(csrfCookie, /SameSite=Strict/);
  assert.doesNotMatch(csrfCookie, /HttpOnly/);
});

test("cookie authentication populates the same request fields as Bearer auth", async () => {
  const calls = [];
  const service = createAvatar3dSessionService({
    getSession: async (token) => {
      calls.push(token);
      return { sessionId: "session-id", user: { id: userRow.id } };
    },
  });
  const req = request({
    cookie: `${avatarSessionCookieName}=opaque-cookie-token`,
    headers: { "x-forwarded-proto": "https" },
  });

  const error = await invoke(service.authenticateAvatarWeb, req);

  assert.equal(error, null);
  assert.deepEqual(calls, ["opaque-cookie-token"]);
  assert.equal(req.sessionId, "session-id");
  assert.equal(req.user.id, userRow.id);
});

test("avatar Web authentication and login reject non-HTTPS requests", async () => {
  const service = createAvatar3dSessionService({
    getSession: async () => ({ sessionId: "session-id", user: { id: userRow.id } }),
  });
  const insecure = request({ cookie: `${avatarSessionCookieName}=opaque-cookie-token` });

  assert.equal((await invoke(service.authenticateAvatarWeb, insecure))?.status, 426);
  assert.equal((await invoke(requireAvatarHttps, insecure))?.status, 426);
  assert.equal(await invoke(requireAvatarHttps, request({
    headers: { "x-forwarded-proto": "https" },
  })), null);
});

test("CSRF requires matching cookie, header, and same HTTPS origin for mutations", async () => {
  const service = createAvatar3dSessionService();
  const token = "csrf-token-abcdefghijklmnopqrstuvwxyz";
  const valid = request({
    headers: {
      "x-csrf-token": token,
      origin: "https://8.153.167.11",
      host: "8.153.167.11",
      "x-forwarded-proto": "https",
    },
    cookie: `${avatarCsrfCookieName}=${token}`,
  });
  assert.equal(await invoke(service.requireAvatarCsrf, valid), null);

  const missing = request({
    headers: {
      origin: "https://8.153.167.11",
      host: "8.153.167.11",
      "x-forwarded-proto": "https",
    },
    cookie: `${avatarCsrfCookieName}=${token}`,
  });
  assert.equal((await invoke(service.requireAvatarCsrf, missing))?.status, 403);

  const crossOrigin = request({
    headers: {
      "x-csrf-token": token,
      origin: "https://attacker.example",
      host: "8.153.167.11",
      "x-forwarded-proto": "https",
    },
    cookie: `${avatarCsrfCookieName}=${token}`,
  });
  assert.equal((await invoke(service.requireAvatarCsrf, crossOrigin))?.status, 403);

  const getRequest = request({ method: "GET" });
  assert.equal(await invoke(service.requireAvatarCsrf, getRequest), null);
});

test("logout revokes the session before clearing both cookies", async () => {
  const calls = [];
  const service = createAvatar3dSessionService({
    revokeSession: async (sessionId) => calls.push(sessionId),
  });

  const result = await service.clearAvatarWebSession({ sessionId: "session-id" });

  assert.deepEqual(calls, ["session-id"]);
  assert.equal(result.cookies.length, 2);
  for (const cookie of result.cookies) assert.match(cookie, /Max-Age=0/);
});

test("authenticated bootstrap can return the CSRF cookie after a page reload", () => {
  const token = "csrf-token-after-reload";
  const req = request({
    cookie: `unrelated=value; ${avatarCsrfCookieName}=${encodeURIComponent(token)}`,
  });

  assert.equal(getAvatarCsrfToken(req), token);
  assert.equal(getAvatarCsrfToken(request()), "");
});
