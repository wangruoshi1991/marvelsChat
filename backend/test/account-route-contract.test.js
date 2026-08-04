import assert from "node:assert/strict";
import test from "node:test";

import { registerAccountRoutes } from "../src/routes/account-routes.js";

test("account deletion route is authenticated and requires explicit confirmation", async () => {
  let route = null;
  const authenticate = (_req, _res, next) => next();
  const app = {
    delete: (path, ...handlers) => {
      route = { path, handlers };
    },
  };
  const calls = [];
  registerAccountRoutes(app, {
    authenticate,
    asyncHandler: (handler) => handler,
    service: {
      deleteAccount: async (input) => {
        calls.push(input);
        return { deleted: true };
      },
    },
  });

  assert.equal(route.path, "/api/account");
  assert.equal(route.handlers[0], authenticate);
  const handler = route.handlers.at(-1);
  const response = {
    json: (body) => {
      response.body = body;
    },
  };
  await assert.rejects(
    () => handler(
      { body: { password: "Password1", confirmation: "wrong" }, user: { id: "user-1" } },
      response,
    ),
    (error) => error?.name === "ZodError",
  );
  await handler(
    { body: { password: "Password1", confirmation: "DELETE" }, user: { id: "user-1" } },
    response,
  );

  assert.deepEqual(calls, [{ userId: "user-1", password: "Password1" }]);
  assert.deepEqual(response.body, { data: { deleted: true } });
});
