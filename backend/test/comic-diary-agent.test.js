import assert from "node:assert/strict";
import test from "node:test";

import {
  buildComicDiaryAgentResponse,
  normalizeComicDiaryAgentDraft,
} from "../src/comic-diary-service.js";

const diaryEntry = {
  id: "diary-1",
  title: "散步",
  body: "傍晚沿着河边散步。",
};

test("normalizes a comic diary Agent response and restricts media references", () => {
  const draft = normalizeComicDiaryAgentDraft(
    {
      title: "河边散步",
      summary: "傍晚的散步故事",
      frames: [
        { scene: "走到河边", mediaAssetIds: ["media-1", "other-user-media"] },
        { scene: "看见晚霞", dialogue: "今天真安静" },
      ],
    },
    {
      diaryEntry,
      mediaAssets: [{ id: "media-1" }],
      fileAssets: [],
      style: "cute",
      frameCount: 2,
    },
  );

  assert.equal(draft.source, "comic-diary-agent");
  assert.equal(draft.frames.length, 2);
  assert.deepEqual(draft.frames[0].mediaAssetIds, ["media-1"]);
});

test("runs the registered comic diary Agent before returning a storyboard", async () => {
  const calls = [];
  const result = await buildComicDiaryAgentResponse({
    prompt: "改成两格漫画",
    user: { id: "user-1" },
    diaryEntry,
    mediaAssets: [],
    fileAssets: [],
    style: "manga",
    frameCount: 2,
    modelStatus: { configured: true, model: "test-model" },
    runAgent: async (input) => {
      calls.push(input);
      return {
        provider: "test",
        reply: JSON.stringify({
          title: "散步漫画",
          summary: "两格分镜",
          frames: [{ scene: "河边" }, { scene: "晚霞" }],
        }),
        tokenUsage: { total: 10 },
        latencyMs: 12,
      };
    },
  });

  assert.equal(calls[0].agentId, "comic-diary");
  assert.equal(result.draft.frames.length, 2);
  assert.equal(result.model.model, "test-model");
});
