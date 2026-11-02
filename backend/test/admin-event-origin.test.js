import assert from "node:assert/strict";
import test from "node:test";
import { registerEventRoutes } from "../src/routes/event-routes.js";

test("client events cannot impersonate administrative audit operations", async () => {
  let handler;
  registerEventRoutes({ post: (_path, ...handlers) => { handler = handlers.at(-1); } }, { authenticate: () => {}, asyncHandler: (value) => value });
  for (const eventType of ["admin.agent.release.publish", "admin.user.create", "ADMIN:operation", "admin"]) {
    await assert.rejects(handler({ body: { eventType, payload: {} }, user: { id: "ordinary-user" } }, {}),
      (error) => error.status === 400 && error.details.code === "EVENT_TYPE_RESERVED");
  }
});
