import assert from "node:assert/strict";
import test from "node:test";
import { agentChatHistory } from "../chat-history.js";

test("conversation history preserves a prior identical user turn and both roles", () => {
  assert.deepEqual(agentChatHistory([
    { id: "earlier-user", senderType: "user", content: "再找一次" },
    { id: "earlier-agent", senderType: "agent", content: "请补充范围。" },
    { id: "latest-prior-user", senderType: "user", content: "再找一次" },
  ]), [
    { role: "user", content: "再找一次" },
    { role: "assistant", content: "请补充范围。" },
    { role: "user", content: "再找一次" },
  ]);
});

test("conversation history excludes withdrawn turns and metadata without rewriting content", () => {
  const structuredDraft = JSON.stringify({ title: "故事草稿", frames: [{ caption: "在公园见面" }] });
  assert.deepEqual(agentChatHistory([
    { senderType: "user", content: "withdrawn", recalledAt: "2026-10-14T00:00:00Z" },
    { senderType: "agent", content: "deleted", deletedAt: "2026-10-14T00:00:00Z" },
    { senderType: "agent", content: structuredDraft, metadata: { provider: "private-provider", taskId: "private-task" } },
  ]), [{ role: "assistant", content: structuredDraft }]);
});

test("conversation history keeps the latest ten visible turns in chronological order", () => {
  const messages = Array.from({ length: 12 }, (_, index) => ({ senderType: index % 2 ? "agent" : "user", content: `turn-${index}` }));
  const history = agentChatHistory(messages);
  assert.equal(history.length, 10);
  assert.equal(history[0].content, "turn-2");
  assert.equal(history.at(-1).content, "turn-11");
});
