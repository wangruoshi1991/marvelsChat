import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  avatarCartoonInstruction,
  buildWanxCreateRequest,
  createWanxAdapter,
  normalizeWanxTask,
} = await import("../src/avatar-3d-wanx.js");

const runtime = {
  wanxBaseUrl: "https://llm-workspace.cn-beijing.maas.aliyuncs.com",
  apiKey: "private-dashscope-key",
  workspaceId: "llm-workspace",
  wanxModel: "wanx2.1-imageedit",
  timeoutMs: 60000,
};

test("Wanx request creates exactly one neutral cartoon reference", () => {
  assert.equal(avatarCartoonInstruction, "将照片中的人物转换为精致的三维潮玩人物风格，保留可识别的脸部特征、发型、服装款式和主色，全身完整入镜，自然站立，正面视角，纯色干净背景，不添加文字、水印、道具或其他人物。");
  assert.deepEqual(buildWanxCreateRequest({
    imageUrl: "https://files.example/front.jpg",
    runtime,
  }), {
    model: "wanx2.1-imageedit",
    input: {
      function: "stylization_all",
      prompt: avatarCartoonInstruction,
      base_image_url: "https://files.example/front.jpg",
    },
    parameters: { n: 1 },
  });
});

test("Wanx submission uses the workspace endpoint once", async () => {
  const calls = [];
  const adapter = createWanxAdapter({
    runtime,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        output: { task_id: "wanx-task-123", task_status: "PENDING" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await adapter.submitWanxStyleJob({
    imageUrl: "https://files.example/front.jpg",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${runtime.wanxBaseUrl}/api/v1/services/aigc/image2image/image-synthesis`);
  assert.equal(calls[0].options.headers["X-DashScope-Async"], "enable");
  assert.equal(calls[0].options.headers["X-DashScope-WorkSpace"], runtime.workspaceId);
  assert.equal(result.taskId, "wanx-task-123");
  assert.equal(JSON.stringify(result).includes(runtime.apiKey), false);
});

test("Wanx timeout remains active while the response body is read", async () => {
  const adapter = createWanxAdapter({
    runtime: { ...runtime, timeoutMs: 5 },
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      json: () => new Promise((resolve, reject) => {
        const delayedBody = setTimeout(() => resolve({
          output: { task_id: "late-task", task_status: "PENDING" },
        }), 25);
        signal.addEventListener("abort", () => {
          clearTimeout(delayedBody);
          reject(new Error("aborted"));
        }, { once: true });
      }),
    }),
  });

  await assert.rejects(
    () => adapter.submitWanxStyleJob({ imageUrl: "https://files.example/front.jpg" }),
    (error) => error?.details?.code === "WANX_SUBMISSION_UNKNOWN",
  );
});

test("Wanx success exposes one image URL and no raw prompt", () => {
  const result = normalizeWanxTask({
    output: {
      task_id: "wanx-task-123",
      task_status: "SUCCEEDED",
      results: [
        { url: "https://result.example/avatar.png", orig_prompt: "private" },
        { url: "https://result.example/should-not-be-used.png" },
      ],
    },
    usage: { image_count: 1 },
  });

  assert.deepEqual(result, {
    state: "succeeded",
    taskId: "wanx-task-123",
    providerStatus: "SUCCEEDED",
    progress: 100,
    imageUrl: "https://result.example/avatar.png",
    usageCount: 1,
    errorCode: null,
  });
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("Wanx moderation and account failures map to safe product codes", () => {
  const moderation = normalizeWanxTask({
    output: {
      task_id: "wanx-task-123",
      task_status: "FAILED",
      code: "DataInspectionFailed",
      message: "provider raw moderation detail",
    },
  });
  assert.equal(moderation.errorCode, "AVATAR_PHOTO_REJECTED");
  assert.equal(JSON.stringify(moderation).includes("provider raw"), false);

  const permission = normalizeWanxTask({
    output: {
      task_id: "wanx-task-123",
      task_status: "FAILED",
      code: "Arrearage",
    },
  });
  assert.equal(permission.errorCode, "PROVIDER_UNAVAILABLE");
});
