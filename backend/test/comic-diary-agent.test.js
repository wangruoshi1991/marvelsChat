import assert from "node:assert/strict";
import test from "node:test";

import {
  buildComicDiaryAgentResponse,
  normalizeComicDiaryAgentDraft,
} from "../src/comic-diary-service.js";
import { createStationComicDiary } from "../src/station-agent-repository.js";
import { stationComicDiaryRequestSchema } from "../src/schemas.js";

const diaryEntry = {
  id: "diary-1",
  title: "不能用这个日记标题补全模型结果",
  body: "傍晚沿着河边散步。",
};

function modelDraft(frameCount = 2) {
  return {
    title: "河边散步",
    summary: "傍晚的散步故事",
    frames: Array.from({ length: frameCount }, (_, index) => ({
      title: `河边见闻 ${index + 1}`,
      scene: "走到河边，看见晚霞。",
      caption: "",
      dialogue: "今天真安静。",
      mood: "平静",
      camera: "远景",
      mediaAssetIds: [],
    })),
  };
}

const invalidResponse = error => error.status === 502 && error.details.code === "COMIC_DIARY_INVALID_RESPONSE";
const normalize = (draft, options = {}) => normalizeComicDiaryAgentDraft(draft, {
  diaryEntry, mediaAssets: [{ id: "media-1" }], frameCount: 2, ...options,
});
const generate = (reply, options = {}) => buildComicDiaryAgentResponse({
  prompt: "整理散步故事", diaryEntry, frameCount: 2,
  modelStatus: { configured: true, model: "test-model" },
  runAgent: async () => ({ provider: "test", model: "test-model", reply }),
  ...options,
});

test("accepts complete storyboard fields and exact selected media references without rewriting text", () => {
  const input = modelDraft();
  input.title = " JavaScript 创作者的散步 ";
  input.frames[0].scene = "谈论 script 与 onload\n然后  慢慢走回河边。";
  input.frames[0].mediaAssetIds = ["media-1"];
  const draft = normalize(input, { style: "cute" });

  assert.equal(draft.source, "comic-diary-agent");
  assert.equal(draft.style, "cute");
  assert.equal(draft.title, "JavaScript 创作者的散步");
  assert.equal(draft.frames[0].scene, input.frames[0].scene);
  assert.deepEqual(draft.frames.map(frame => frame.index), [1, 2]);
  assert.deepEqual(draft.frames[0].mediaAssetIds, ["media-1"]);
  assert.deepEqual(draft.frames[1].mediaAssetIds, []);
  assert.deepEqual(draft.sourceRefs, { diaryEntryId: diaryEntry.id, mediaAssetIds: ["media-1"] });
});

test("only omitted comic options receive defaults at the HTTP and service boundaries", async () => {
  const body = stationComicDiaryRequestSchema.parse({ prompt: "整理散步故事" });
  assert.equal(body.style, "slice-of-life");
  assert.equal(body.frameCount, 4);
  const result = await generate(JSON.stringify(modelDraft(4)), { frameCount: undefined });
  assert.equal(result.draft.style, "slice-of-life");
  assert.equal(result.draft.frames.length, 4);
});

test("explicit invalid options are rejected before calling the model instead of clamped or replaced", async () => {
  let calls = 0;
  const runAgent = async () => { calls += 1; throw new Error("Model must not run"); };
  for (const options of [
    ...[0, 1, 9, -1, 2.5, "2", null, NaN].map(frameCount => ({ frameCount })),
    ...["unknown", "", null, 2].map(style => ({ style })),
  ]) {
    assert.equal(stationComicDiaryRequestSchema.safeParse({ prompt: "画漫画", ...options }).success, false);
    await assert.rejects(generate("", { ...options, runAgent }), error =>
      error.status === 400 && error.details.code === "COMIC_DIARY_INVALID_OPTIONS");
  }
  assert.equal(calls, 0);
  assert.equal(stationComicDiaryRequestSchema.safeParse({ prompt: "画漫画", unsupported: true }).success, false);
});

test("requires one complete JSON object and rejects fenced, mixed or concatenated model output", async () => {
  const json = JSON.stringify(modelDraft());
  for (const reply of [
    `\`\`\`json\n${json}\n\`\`\``, `这是结果：${json}`, `${json}\n已经完成`, `${json}${json}`,
    "[]", "null", "false", "{}", "", undefined,
  ]) {
    await assert.rejects(generate(reply), invalidResponse);
  }
  assert.equal((await generate(`\n${json}\n`)).draft.title, modelDraft().title);
});

test("rejects missing required model fields without inventing titles, summary or frame content", () => {
  for (const field of ["title", "summary", "frames"]) {
    const draft = modelDraft();
    delete draft[field];
    assert.throws(() => normalize(draft), invalidResponse, `missing ${field}`);
  }
  for (const field of ["title", "scene", "caption", "dialogue", "mood", "camera", "mediaAssetIds"]) {
    const draft = modelDraft();
    delete draft.frames[0][field];
    assert.throws(() => normalize(draft), invalidResponse, `missing frame ${field}`);
  }
  for (const field of ["title", "summary"]) {
    for (const value of ["", "  ", null, 12]) {
      const draft = modelDraft();
      draft[field] = value;
      assert.throws(() => normalize(draft), invalidResponse);
    }
  }
  const blankFrame = modelDraft();
  blankFrame.frames[0].title = " ";
  assert.throws(() => normalize(blankFrame), invalidResponse);
  const emptyFrame = modelDraft();
  Object.assign(emptyFrame.frames[0], { scene: "", caption: "", dialogue: "" });
  assert.throws(() => normalize(emptyFrame), invalidResponse);
});

test("rejects extra model fields and wrong frame counts rather than shortening the result", () => {
  assert.throws(() => normalize({ ...modelDraft(), debug: "internal" }), invalidResponse);
  const draft = modelDraft();
  draft.frames[0].index = 1;
  assert.throws(() => normalize(draft), invalidResponse);
  for (const count of [0, 1, 3, 9]) {
    assert.throws(() => normalize(modelDraft(count)), invalidResponse);
  }
});

test("rejects oversized or unsafe text without truncating or sanitizing it into success", () => {
  for (const [field, length] of [["title", 121], ["summary", 281]]) {
    const draft = modelDraft();
    draft[field] = "长".repeat(length);
    assert.throws(() => normalize(draft), invalidResponse);
  }
  for (const [field, length] of [["title", 81], ["scene", 221], ["caption", 221], ["dialogue", 161], ["mood", 41], ["camera", 41]]) {
    const draft = modelDraft();
    draft.frames[0][field] = "长".repeat(length);
    assert.throws(() => normalize(draft), invalidResponse);
  }
  for (const value of ["<img src='x'>", "<script>alert(1)</script>", "隐藏\u0007字符", "\u000b开头", 12, null]) {
    const draft = modelDraft();
    draft.frames[0].scene = value;
    assert.throws(() => normalize(draft), invalidResponse);
  }
});

test("rejects unselected, duplicate, excessive and malformed media references", () => {
  for (const mediaAssetIds of [
    ["media-1", "other-user-media"], ["media-1", "media-1"], "media-1", null, [12], [{}], [""],
    ["media-1", "media-2", "media-3", "media-4", "media-5"],
  ]) {
    const draft = modelDraft();
    draft.frames[0].mediaAssetIds = mediaAssetIds;
    assert.throws(() => normalize(draft, {
      mediaAssets: Array.from({ length: 5 }, (_, index) => ({ id: `media-${index + 1}` })),
    }), invalidResponse);
  }
});

test("runs the registered comic plan with the access check before returning a storyboard", async () => {
  const calls = [];
  const result = await generate(JSON.stringify(modelDraft()), {
    prompt: "改成两格漫画",
    user: { id: "user-1" },
    beforeModelCall: async () => calls.push("access-check"),
    style: "manga",
    runAgent: async input => {
      calls.push(input);
      await input.beforeModelCall();
      return {
        provider: "test", model: "requested-planning-model", servedModel: "served-planning-model",
        reply: JSON.stringify(modelDraft()), tokenUsage: { total: 10 }, latencyMs: 12,
      };
    },
  });

  assert.equal(calls[0].agentId, "comic-diary");
  assert.equal(calls[0].mode, "plan");
  assert.equal(calls[1], "access-check");
  assert.match(calls[0].input, /生成 2 格黑白漫画分镜/);
  assert.equal(Object.hasOwn(calls[0].appContext.stationContent, "fileAssets"), false);
  assert.equal(Object.hasOwn(result.draft.sourceRefs, "fileAssetIds"), false);
  assert.equal(result.draft.frames.length, 2);
  assert.equal(result.model.model, "requested-planning-model");
  assert.equal(result.model.servedModel, "served-planning-model");
});

test("persistence rejects an invalid comic title before SQL instead of assigning a generic title", async () => {
  let queries = 0;
  const query = async () => { queries += 1; return []; };
  for (const title of [undefined, null, "", " ", 12, "长".repeat(121)]) {
    await assert.rejects(createStationComicDiary({ userId: "user-1", title }, query), error =>
      error.status === 500 && error.details.code === "INVALID_COMIC_DIARY_TITLE");
  }
  assert.equal(queries, 0);
});
