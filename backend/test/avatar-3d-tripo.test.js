import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  buildTripoCreateRequest,
  createTripoAdapter,
  normalizeTripoTask,
} = await import("../src/avatar-3d-tripo.js");

const runtime = {
  baseUrl: "https://dashscope.aliyuncs.com",
  apiKey: "private-dashscope-key",
  workspaceId: "llm-workspace",
  tripoModel: "Tripo/Tripo-H3.1",
  timeoutMs: 60000,
};

const photos = [
  { view: "front", url: "https://files.example/front.jpg", mimeType: "image/jpeg" },
  { view: "left", url: "https://files.example/left.png", mimeType: "image/png" },
  { view: "back", url: "https://files.example/back.jpg", mimeType: "image/jpeg" },
  { view: "right", url: "https://files.example/right.png", mimeType: "image/png" },
];

test("single front photo maps to Tripo image input with fixed standard quality", () => {
  assert.deepEqual(buildTripoCreateRequest({ photos: photos.slice(0, 1), runtime }), {
    model: "Tripo/Tripo-H3.1",
    input: { image: photos[0].url },
    parameters: {
      geometry_quality: "standard",
      texture_quality: "standard",
      pbr: true,
      texture: true,
    },
  });
});

test("two to four views map to the fixed front-left-back-right array with gaps", () => {
  const request = buildTripoCreateRequest({
    photos: [photos[0], photos[2]],
    runtime,
  });

  assert.deepEqual(request.input.images, [
    { type: "jpeg", file_token: photos[0].url },
    {},
    { type: "jpeg", file_token: photos[2].url },
    {},
  ]);
  assert.equal("image" in request.input, false);
});

test("Tripo submission sends one async request and returns only controlled fields", async () => {
  const calls = [];
  const adapter = createTripoAdapter({
    runtime,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        output: { task_id: "task-123", task_status: "PENDING" },
        request_id: "request-123",
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await adapter.submitTripoJob({ photos: photos.slice(0, 1) });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${runtime.baseUrl}/api/v1/services/aigc/video-generation/3d-generation`);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${runtime.apiKey}`);
  assert.equal(calls[0].options.headers["X-DashScope-Async"], "enable");
  assert.deepEqual(result, {
    state: "processing",
    taskId: "task-123",
    providerStatus: "PENDING",
    progress: 10,
    pbrModelUrl: null,
    renderedImageUrl: null,
    usageCount: 0,
    errorCode: null,
  });
  assert.equal(JSON.stringify(result).includes(runtime.apiKey), false);
  assert.equal("raw" in result, false);
});

test("Tripo task normalization exposes GLB and preview only on success", () => {
  const result = normalizeTripoTask({
    output: {
      task_id: "task-123",
      task_status: "SUCCEEDED",
      results: [{
        pbr_model_url: "https://result.example/model.glb",
        rendered_image_url: "https://result.example/preview.webp",
        orig_prompt: "private prompt",
      }],
    },
    usage: { count: 1, "3d_task_type": "image-to-3d" },
    request_id: "request-private",
  });

  assert.deepEqual(result, {
    state: "succeeded",
    taskId: "task-123",
    providerStatus: "SUCCEEDED",
    progress: 100,
    pbrModelUrl: "https://result.example/model.glb",
    renderedImageUrl: "https://result.example/preview.webp",
    usageCount: 1,
    errorCode: null,
  });
  assert.equal(JSON.stringify(result).includes("private prompt"), false);
  assert.equal(JSON.stringify(result).includes("request-private"), false);
});

test("Tripo failure and unknown states become safe failures", () => {
  const failed = normalizeTripoTask({
    output: {
      task_id: "task-123",
      task_status: "FAILED",
      code: "InternalError",
      message: "provider raw failure",
    },
  });
  assert.equal(failed.state, "failed");
  assert.equal(failed.errorCode, "TRIPO_GENERATION_FAILED");
  assert.equal(JSON.stringify(failed).includes("provider raw failure"), false);

  const unknown = normalizeTripoTask({ output: { task_id: "task-123", task_status: "UNKNOWN" } });
  assert.equal(unknown.state, "failed");

  const missingResult = normalizeTripoTask({
    output: { task_id: "task-123", task_status: "SUCCEEDED", results: [] },
  });
  assert.equal(missingResult.state, "failed");
  assert.equal(missingResult.errorCode, "TRIPO_RESULT_MISSING");
});
