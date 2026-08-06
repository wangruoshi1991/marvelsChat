import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  buildWanMultiviewCreateRequest,
  createWanMultiviewAdapter,
  normalizeWanMultiviewTask,
} = await import("../src/avatar-3d-wan-multiview.js");

const runtime = {
  wanBaseUrl: "https://llm-workspace.cn-beijing.maas.aliyuncs.com",
  apiKey: "private-dashscope-key",
  wanMultiviewModel: "wan2.7-image-pro",
  timeoutMs: 60000,
};

const imageUrl = "https://files.example/front.jpg?signature=signed";
const prompt = "Create four controlled full-body reference views.";

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { "content-type": "application/json" },
});

const safeErrorText = (error) => JSON.stringify({
  message: error?.message,
  details: error?.details,
});

test("Wan multiview request matches the wan2.7 async generation contract", async () => {
  const calls = [];
  const adapter = createWanMultiviewAdapter({
    runtime,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        output: { task_id: "wan-task-123", task_status: "PENDING" },
        request_id: "request-submit-123",
      });
    },
  });

  const result = await adapter.submitWanMultiviewJob({ imageUrl, prompt });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `${runtime.wanBaseUrl}/api/v1/services/aigc/image-generation/generation`,
  );
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(calls[0].options.headers, {
    "Content-Type": "application/json",
    Authorization: `Bearer ${runtime.apiKey}`,
    "X-DashScope-Async": "enable",
  });
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    model: "wan2.7-image-pro",
    input: {
      messages: [{
        role: "user",
        content: [{ image: imageUrl }, { text: prompt }],
      }],
    },
    parameters: {
      size: "2K",
      n: 4,
      enable_sequential: true,
      watermark: false,
    },
  });
  assert.deepEqual(result, {
    state: "processing",
    taskId: "wan-task-123",
    providerStatus: "PENDING",
    progress: 10,
    imageUrls: [],
    usageCount: 0,
    requestId: "request-submit-123",
    errorCode: null,
  });
  assert.equal(JSON.stringify(result).includes(runtime.apiKey), false);
  assert.equal(JSON.stringify(result).includes(prompt), false);
});

test("Wan multiview builder defaults to wan2.7-image-pro", () => {
  assert.deepEqual(buildWanMultiviewCreateRequest({ imageUrl, prompt, runtime: {} }), {
    model: "wan2.7-image-pro",
    input: {
      messages: [{
        role: "user",
        content: [{ image: imageUrl }, { text: prompt }],
      }],
    },
    parameters: {
      size: "2K",
      n: 4,
      enable_sequential: true,
      watermark: false,
    },
  });
});

test("Wan multiview rejects non-HTTPS images and invalid prompts before fetch", async () => {
  let fetchCount = 0;
  const adapter = createWanMultiviewAdapter({
    runtime,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("fetch must not run");
    },
  });
  const invalidInputs = [
    { imageUrl: "http://files.example/front.jpg", prompt, code: "INVALID_IMAGE_URL" },
    { imageUrl: "not-a-url", prompt, code: "INVALID_IMAGE_URL" },
    { imageUrl, prompt: "", code: "INVALID_MULTIVIEW_PROMPT" },
    { imageUrl, prompt: "   ", code: "INVALID_MULTIVIEW_PROMPT" },
    { imageUrl, prompt: "x".repeat(5001), code: "INVALID_MULTIVIEW_PROMPT" },
  ];

  for (const input of invalidInputs) {
    await assert.rejects(
      () => adapter.submitWanMultiviewJob(input),
      (error) => {
        assert.equal(error?.status, 400);
        assert.deepEqual(error?.details, { code: input.code });
        const serialized = safeErrorText(error);
        assert.equal(serialized.includes(runtime.apiKey), false);
        if (input.prompt) assert.equal(serialized.includes(input.prompt), false);
        return true;
      },
    );
  }

  assert.doesNotThrow(() => buildWanMultiviewCreateRequest({
    imageUrl,
    prompt: "x".repeat(5000),
    runtime,
  }));
  assert.equal(fetchCount, 0);
});

test("Wan multiview normalizes PENDING and RUNNING as processing", () => {
  assert.deepEqual(normalizeWanMultiviewTask({
    output: { task_id: "pending-task", task_status: "PENDING" },
    request_id: "pending-request",
  }), {
    state: "processing",
    taskId: "pending-task",
    providerStatus: "PENDING",
    progress: 10,
    imageUrls: [],
    usageCount: 0,
    requestId: "pending-request",
    errorCode: null,
  });
  assert.deepEqual(normalizeWanMultiviewTask({
    output: { task_id: "running-task", task_status: "running" },
    request_id: "running-request",
  }), {
    state: "processing",
    taskId: "running-task",
    providerStatus: "RUNNING",
    progress: 60,
    imageUrls: [],
    usageCount: 0,
    requestId: "running-request",
    errorCode: null,
  });
});

test("Wan multiview extracts two to four HTTPS images from successful choices", () => {
  for (const imageCount of [2, 3, 4]) {
    const urls = Array.from(
      { length: imageCount },
      (_, index) => `https://results.example/view-${index + 1}.png`,
    );
    const result = normalizeWanMultiviewTask({
      output: {
        task_id: `success-${imageCount}`,
        task_status: "SUCCEEDED",
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "raw provider message must stay private" },
                { type: "image", image: "http://results.example/insecure.png" },
              ],
            },
          },
          ...urls.map((url) => ({
            message: { content: [{ type: "image", image: url }] },
          })),
        ],
      },
      usage: { image_count: imageCount },
      request_id: `success-request-${imageCount}`,
    });

    assert.deepEqual(result, {
      state: "succeeded",
      taskId: `success-${imageCount}`,
      providerStatus: "SUCCEEDED",
      progress: 100,
      imageUrls: urls,
      usageCount: imageCount,
      requestId: `success-request-${imageCount}`,
      errorCode: null,
    });
    assert.equal(JSON.stringify(result).includes("raw provider message"), false);
  }
});

test("Wan multiview returns at most four HTTPS result URLs", () => {
  const urls = Array.from(
    { length: 5 },
    (_, index) => `https://results.example/view-${index + 1}.png`,
  );
  const result = normalizeWanMultiviewTask({
    output: {
      task_id: "success-five",
      task_status: "SUCCEEDED",
      choices: urls.map((url) => ({
        message: { content: [{ type: "image", image: url }] },
      })),
    },
    usage: { image_count: 5 },
  });

  assert.equal(result.state, "succeeded");
  assert.deepEqual(result.imageUrls, urls.slice(0, 4));
  assert.equal(result.usageCount, 5);
});

test("Wan multiview marks successful Provider tasks with fewer than two images incomplete", () => {
  for (const urls of [[], ["https://results.example/only-view.png"]]) {
    const result = normalizeWanMultiviewTask({
      output: {
        task_id: "incomplete-task",
        task_status: "SUCCEEDED",
        choices: [
          ...urls.map((url) => ({
            message: { content: [{ type: "image", image: url }] },
          })),
          {
            message: {
              content: [
                { type: "image", image: "http://results.example/insecure.png" },
                { type: "text", text: "raw provider failure detail" },
              ],
            },
          },
        ],
      },
      usage: { image_count: urls.length },
      request_id: "incomplete-request",
    });

    assert.deepEqual(result, {
      state: "failed",
      taskId: "incomplete-task",
      providerStatus: "SUCCEEDED",
      progress: 100,
      imageUrls: urls,
      usageCount: urls.length,
      requestId: "incomplete-request",
      errorCode: "REFERENCE_SET_INCOMPLETE",
    });
    assert.equal(JSON.stringify(result).includes("raw provider failure"), false);
  }
});

test("Wan multiview maps FAILED, CANCELED, and unknown states to safe product codes", () => {
  const cases = [
    {
      payload: {
        output: {
          task_id: "moderation-task",
          task_status: "FAILED",
          code: "DataInspectionFailed",
          message: "raw moderation detail",
        },
      },
      providerStatus: "FAILED",
      errorCode: "AVATAR_PHOTO_REJECTED",
    },
    {
      payload: {
        output: { task_id: "account-task", task_status: "FAILED", code: "Arrearage" },
      },
      providerStatus: "FAILED",
      errorCode: "PROVIDER_UNAVAILABLE",
    },
    {
      payload: {
        output: { task_id: "failed-task", task_status: "FAILED", code: "InternalError" },
      },
      providerStatus: "FAILED",
      errorCode: "REFERENCE_GENERATION_FAILED",
    },
    {
      payload: {
        output: { task_id: "canceled-task", task_status: "CANCELED", message: "raw cancel" },
      },
      providerStatus: "CANCELED",
      errorCode: "REFERENCE_GENERATION_CANCELED",
    },
    {
      payload: {
        output: { task_id: "unknown-task", task_status: "provider-private-state" },
        message: "raw top-level message",
      },
      providerStatus: "UNKNOWN",
      errorCode: "REFERENCE_GENERATION_FAILED",
    },
  ];

  for (const { payload, providerStatus, errorCode } of cases) {
    const result = normalizeWanMultiviewTask(payload);
    assert.equal(result.state, "failed");
    assert.equal(result.providerStatus, providerStatus);
    assert.equal(result.progress, 100);
    assert.deepEqual(result.imageUrls, []);
    assert.equal(result.errorCode, errorCode);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("raw"), false);
    assert.equal(serialized.includes("DataInspectionFailed"), false);
    assert.equal(serialized.includes("Arrearage"), false);
    assert.equal(serialized.includes("InternalError"), false);
    assert.equal(serialized.includes("provider-private-state"), false);
  }
});

test("Wan multiview status query uses the encoded task endpoint", async () => {
  const calls = [];
  const adapter = createWanMultiviewAdapter({
    runtime,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        output: { task_id: "task/with spaces", task_status: "RUNNING" },
        request_id: "status-request",
      });
    },
  });

  const result = await adapter.fetchWanMultiviewJob({ taskId: "task/with spaces" });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `${runtime.wanBaseUrl}/api/v1/tasks/task%2Fwith%20spaces`,
  );
  assert.equal(calls[0].options.method, "GET");
  assert.deepEqual(calls[0].options.headers, {
    "Content-Type": "application/json",
    Authorization: `Bearer ${runtime.apiKey}`,
  });
  assert.equal(result.providerStatus, "RUNNING");
  assert.equal(result.requestId, "status-request");
});

test("Wan multiview submission without a task ID is safely ambiguous", async () => {
  const adapter = createWanMultiviewAdapter({
    runtime,
    fetchImpl: async () => jsonResponse({
      output: {
        task_status: "PENDING",
        message: `raw ${prompt} ${runtime.apiKey}`,
      },
      request_id: "request-without-task",
    }),
  });

  await assert.rejects(
    () => adapter.submitWanMultiviewJob({ imageUrl, prompt }),
    (error) => {
      assert.equal(error?.status, 502);
      assert.deepEqual(error?.details, {
        provider: "wan-multiview",
        code: "WAN_MULTIVIEW_SUBMISSION_UNKNOWN",
      });
      const serialized = safeErrorText(error);
      assert.equal(serialized.includes(prompt), false);
      assert.equal(serialized.includes(runtime.apiKey), false);
      assert.equal(serialized.includes("raw"), false);
      return true;
    },
  );
});

test("Wan multiview HTTP failures expose only safe product codes", async () => {
  const adapter = createWanMultiviewAdapter({
    runtime,
    fetchImpl: async () => jsonResponse({
      code: "InvalidApiKey",
      message: `raw ${prompt} ${runtime.apiKey}`,
    }, 401),
  });

  await assert.rejects(
    () => adapter.submitWanMultiviewJob({ imageUrl, prompt }),
    (error) => {
      assert.equal(error?.status, 502);
      assert.deepEqual(error?.details, {
        provider: "wan-multiview",
        code: "PROVIDER_UNAVAILABLE",
      });
      const serialized = safeErrorText(error);
      assert.equal(serialized.includes(prompt), false);
      assert.equal(serialized.includes(runtime.apiKey), false);
      assert.equal(serialized.includes("InvalidApiKey"), false);
      assert.equal(serialized.includes("raw"), false);
      return true;
    },
  );
});

test("Wan multiview HTTP failures emit a minimal sanitized operations diagnostic", async () => {
  const entries = [];
  const adapter = createWanMultiviewAdapter({
    runtime,
    logger: { error: (entry) => entries.push(entry) },
    fetchImpl: async () => jsonResponse({
      code: "Model.AccessDenied",
      message: `raw ${prompt} ${runtime.apiKey}`,
    }, 403),
  });

  await assert.rejects(
    () => adapter.submitWanMultiviewJob({ imageUrl, prompt }),
    (error) => error?.details?.code === "PROVIDER_UNAVAILABLE",
  );

  assert.deepEqual(entries, [{
    type: "avatar_3d_provider_http_error",
    provider: "wan-multiview",
    operation: "submit_references",
    httpStatus: 403,
    providerCode: "Model.AccessDenied",
    productCode: "PROVIDER_UNAVAILABLE",
  }]);
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes(prompt), false);
  assert.equal(serialized.includes(runtime.apiKey), false);
  assert.equal(serialized.includes("raw"), false);
  assert.equal(serialized.includes(imageUrl), false);
});

test("Wan multiview diagnostics discard unsafe provider codes", async () => {
  const entries = [];
  const adapter = createWanMultiviewAdapter({
    runtime,
    logger: { error: (entry) => entries.push(entry) },
    fetchImpl: async () => jsonResponse({
      code: `unsafe code ${prompt} ${runtime.apiKey}`,
      message: "raw provider detail",
    }, 500),
  });

  await assert.rejects(
    () => adapter.submitWanMultiviewJob({ imageUrl, prompt }),
    (error) => error?.details?.code === "REFERENCE_GENERATION_FAILED",
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].providerCode, "UNKNOWN");
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes(prompt), false);
  assert.equal(serialized.includes(runtime.apiKey), false);
  assert.equal(serialized.includes("raw"), false);
  assert.equal(serialized.includes(imageUrl), false);
});

test("Wan multiview maps credential HTTP statuses without relying on a response code", async () => {
  for (const status of [401, 403, 429]) {
    const adapter = createWanMultiviewAdapter({
      runtime,
      fetchImpl: async () => jsonResponse({ message: "raw provider detail" }, status),
    });

    await assert.rejects(
      () => adapter.submitWanMultiviewJob({ imageUrl, prompt }),
      (error) => error?.details?.code === "PROVIDER_UNAVAILABLE",
    );
  }
});

test("Wan multiview refuses insecure Provider configuration and empty task IDs", async () => {
  let fetchCount = 0;
  const insecureAdapter = createWanMultiviewAdapter({
    runtime: { ...runtime, wanBaseUrl: "http://provider.example" },
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("fetch must not run");
    },
  });
  await assert.rejects(
    () => insecureAdapter.submitWanMultiviewJob({ imageUrl, prompt }),
    (error) => error?.details?.code === "PROVIDER_UNAVAILABLE",
  );

  const wrongModelAdapter = createWanMultiviewAdapter({
    runtime: { ...runtime, wanMultiviewModel: "wan2.7-image" },
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("fetch must not run");
    },
  });
  await assert.rejects(
    () => wrongModelAdapter.submitWanMultiviewJob({ imageUrl, prompt }),
    (error) => error?.details?.code === "PROVIDER_UNAVAILABLE",
  );

  const adapter = createWanMultiviewAdapter({
    runtime,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("fetch must not run");
    },
  });
  await assert.rejects(
    () => adapter.fetchWanMultiviewJob({ taskId: "  " }),
    (error) => error?.status === 400 && error?.details?.code === "INVALID_PROVIDER_TASK_ID",
  );
  assert.equal(fetchCount, 0);
});

test("Wan multiview transport failures distinguish submission and status uncertainty", async () => {
  const adapter = createWanMultiviewAdapter({
    runtime,
    fetchImpl: async () => {
      throw new Error(`raw transport ${prompt} ${runtime.apiKey}`);
    },
  });

  await assert.rejects(
    () => adapter.submitWanMultiviewJob({ imageUrl, prompt }),
    (error) => {
      assert.deepEqual(error?.details, {
        provider: "wan-multiview",
        code: "WAN_MULTIVIEW_SUBMISSION_UNKNOWN",
      });
      assert.equal(safeErrorText(error).includes("raw transport"), false);
      return true;
    },
  );
  await assert.rejects(
    () => adapter.fetchWanMultiviewJob({ taskId: "wan-task-123" }),
    (error) => {
      assert.deepEqual(error?.details, {
        provider: "wan-multiview",
        code: "WAN_MULTIVIEW_STATUS_UNAVAILABLE",
      });
      assert.equal(safeErrorText(error).includes("raw transport"), false);
      return true;
    },
  );
});

test("Wan multiview timeout remains active while the response body is read", async () => {
  const adapter = createWanMultiviewAdapter({
    runtime: { ...runtime, timeoutMs: 5 },
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      json: () => new Promise((resolve, reject) => {
        const delayedBody = setTimeout(() => resolve({
          output: { task_id: "late-task", task_status: "PENDING" },
        }), 25);
        signal.addEventListener("abort", () => {
          clearTimeout(delayedBody);
          reject(new Error(`raw body ${prompt} ${runtime.apiKey}`));
        }, { once: true });
      }),
    }),
  });

  await assert.rejects(
    () => adapter.submitWanMultiviewJob({ imageUrl, prompt }),
    (error) => {
      assert.deepEqual(error?.details, {
        provider: "wan-multiview",
        code: "WAN_MULTIVIEW_SUBMISSION_UNKNOWN",
      });
      const serialized = safeErrorText(error);
      assert.equal(serialized.includes(prompt), false);
      assert.equal(serialized.includes(runtime.apiKey), false);
      assert.equal(serialized.includes("raw body"), false);
      return true;
    },
  );
});
