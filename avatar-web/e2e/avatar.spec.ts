import { expect, test, type Page, type Route } from "@playwright/test";
import { createAvatarGlb, photoPng } from "./fixtures/avatarFixture";

const now = "2026-07-21T04:00:00.000Z";
const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const referenceSetId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const modelId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const user = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  displayName: "测试用户",
  email: "person@example.com",
};
const feature = {
  enabled: true,
  generationAvailable: true,
  dailyLimit: 3,
  retentionDays: 7,
  costVersion: "2026-07-21",
  defaultQualityPreset: "ultra",
  referenceGenerationEstimatedCostFen: 200,
  qualityPresets: [
    {
      id: "standard",
      label: "标准",
      description: "标准几何与高清纹理",
      estimatedCostFen: 280,
    },
    {
      id: "ultra",
      label: "精细",
      description: "高精度几何与高清纹理",
      estimatedCostFen: 420,
    },
  ],
};

type JobStatus =
  | "queued_references" | "submitting_references" | "processing_references"
  | "persisting_references" | "awaiting_reference_confirmation"
  | "queued_3d" | "submitting_3d" | "processing_3d" | "persisting"
  | "succeeded" | "failed" | "quality_failed" | "cancelled" | "submission_unknown";

const makeJob = (status: JobStatus, qualityPreset: "standard" | "ultra" = "ultra") => ({
  id: jobId,
  userId: user.id,
  style: "realistic" as const,
  qualityPreset,
  generationMode: "face_first_multiview" as const,
  referenceSetId,
  status,
  progress: status === "awaiting_reference_confirmation"
    ? 100
    : status === "persisting" ? 95 : 42,
  photoCount: 1,
  acceptedCostVersion: feature.costVersion,
  estimatedCostFen: qualityPreset === "standard" ? 280 : 420,
  stylePreviewId: null,
  modelId: ["persisting", "succeeded"].includes(status) ? modelId : null,
  errorCode: null,
  createdAt: now,
  updatedAt: now,
  finishedAt: null,
});

const referenceSet = {
  id: referenceSetId,
  jobId,
  status: "awaiting_confirmation",
  expectedImageCount: 4,
  actualImageCount: 4,
  usageImageCount: 4,
  costVersion: feature.costVersion,
  estimatedCostFen: 200,
  confirmedAt: null,
  createdAt: now,
  updatedAt: now,
};

const referenceImages = (["front", "left", "back", "right"] as const).map(
  (view, sequenceIndex) => ({
    id: `reference-${view}`,
    referenceSetId,
    jobId,
    view,
    sequenceIndex,
    mimeType: "image/png",
    byteSize: photoPng.length,
    width: 640,
    height: 800,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }),
);

const avatarModel = {
  id: modelId,
  jobId,
  title: "我的写实 3D 形象",
  status: "active",
  byteSize: 1648,
  thumbnailAvailable: false,
  interactiveAvailable: true,
  createdAt: now,
  updatedAt: now,
};

interface MockOptions {
  authenticated?: boolean;
  activeJob?: ReturnType<typeof makeJob> | null;
  models?: typeof avatarModel[];
  dailyRemaining?: number;
  pollErrorOnce?: boolean;
}

const json = (route: Route, data: unknown, status = 200) => route.fulfill({
  status,
  contentType: "application/json",
  body: JSON.stringify(data),
  headers: { "x-request-id": "e2e-request" },
});

async function installApiMock(page: Page, options: MockOptions = {}) {
  let authenticated = options.authenticated ?? true;
  let activeJob = options.activeJob ?? null;
  let models = [...(options.models || [])];
  let photoSequence = 0;
  let failPoll = Boolean(options.pollErrorOnce);
  const jobBodies: Array<Record<string, unknown>> = [];
  const confirmationBodies: Array<Record<string, unknown>> = [];
  const calls = {
    confirmReferences: 0,
    rejectReferences: 0,
    deleteModel: 0,
    modelFile: 0,
  };
  const quota = {
    dailyUsed: options.dailyRemaining === 0 ? 3 : 0,
    dailyRemaining: options.dailyRemaining ?? 3,
    hasActiveJob: Boolean(activeJob),
  };

  const bootstrap = () => ({
    user,
    csrfToken: "csrf-e2e",
    feature,
    quota: { ...quota, hasActiveJob: Boolean(activeJob) },
    jobs: activeJob ? [activeJob] : [],
    activeJob,
    models,
  });

  await page.route("https://uploads.invalid/**", (route) => route.fulfill({ status: 200 }));
  await page.route("**/api/avatar-3d/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === "/api/avatar-3d/session" && method === "POST") {
      authenticated = true;
      await json(route, { data: { user, csrfToken: "csrf-e2e" } });
      return;
    }
    if (path === "/api/avatar-3d/session" && method === "DELETE") {
      authenticated = false;
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === "/api/avatar-3d/bootstrap" && method === "GET") {
      if (!authenticated) {
        await json(route, { error: { message: "Unauthorized", requestId: "login-required" } }, 401);
      } else {
        await json(route, { data: bootstrap() });
      }
      return;
    }
    if (!authenticated) {
      await json(route, { error: { message: "Unauthorized", requestId: "login-required" } }, 401);
      return;
    }
    if (path === "/api/avatar-3d/photos" && method === "POST") {
      photoSequence += 1;
      const body = request.postDataJSON() as {
        originalFilename: string;
        mimeType: string;
        byteSize: number;
      };
      const photoId = `00000000-0000-4000-8000-${String(photoSequence).padStart(12, "0")}`;
      await json(route, {
        data: {
          photo: {
            id: photoId,
            jobId: null,
            view: null,
            originalFilename: body.originalFilename,
            mimeType: body.mimeType,
            byteSize: body.byteSize,
            width: null,
            height: null,
            status: "uploading",
            quality: null,
            errorCode: null,
            createdAt: now,
            updatedAt: now,
          },
          upload: {
            method: "PUT",
            url: `https://uploads.invalid/${photoId}`,
            headers: { "Content-Type": body.mimeType },
            expiresAt: now,
          },
        },
      }, 201);
      return;
    }
    if (/\/photos\/[^/]+\/complete$/.test(path) && method === "POST") {
      const photoId = path.split("/").at(-2)!;
      await json(route, { data: {
        id: photoId,
        jobId: null,
        view: null,
        originalFilename: "face.png",
        status: "ready",
        mimeType: "image/png",
        byteSize: photoPng.length,
        width: 640,
        height: 800,
        quality: {
          level: "advisory",
          canContinue: true,
          suggestions: ["清晰展示五官会更接近本人"],
        },
        errorCode: null,
        createdAt: now,
        updatedAt: now,
      } });
      return;
    }
    if (/\/photos\/[^/]+$/.test(path) && method === "DELETE") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === "/api/avatar-3d/jobs" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      jobBodies.push(body);
      activeJob = makeJob("queued_references");
      await json(route, {
        data: {
          created: true,
          job: activeJob,
          referenceSet: { ...referenceSet, status: "queued" },
        },
      }, 201);
      return;
    }
    if (/\/jobs\/[^/]+\/references\/confirm$/.test(path) && method === "POST") {
      calls.confirmReferences += 1;
      const body = request.postDataJSON() as Record<string, unknown>;
      confirmationBodies.push(body);
      const quality = body.qualityPreset === "standard" ? "standard" : "ultra";
      activeJob = makeJob("queued_3d", quality);
      await json(route, {
        data: {
          job: activeJob,
          referenceSet: { ...referenceSet, status: "accepted", confirmedAt: now },
        },
      });
      return;
    }
    if (/\/jobs\/[^/]+\/references\/reject$/.test(path) && method === "POST") {
      calls.rejectReferences += 1;
      const cancelled = makeJob("cancelled");
      activeJob = null;
      await json(route, { data: cancelled });
      return;
    }
    if (/\/jobs\/[^/]+\/references\/(front|left|back|right)\/file$/.test(path) && method === "GET") {
      await route.fulfill({ status: 200, contentType: "image/png", body: photoPng });
      return;
    }
    if (/\/jobs\/[^/]+\/references$/.test(path) && method === "GET") {
      await json(route, { data: { referenceSet, images: referenceImages } });
      return;
    }
    if (/\/jobs\/[^/]+$/.test(path) && method === "GET") {
      if (failPoll) {
        failPoll = false;
        await json(route, {
          error: {
            message: "sensitive provider detail",
            requestId: "request-safe-42",
          },
        }, 503);
      } else if (activeJob) {
        await json(route, { data: activeJob });
      } else {
        await json(route, { error: { message: "Not found", requestId: "missing" } }, 404);
      }
      return;
    }
    if (/\/models\/[^/]+\/file$/.test(path) && method === "GET") {
      calls.modelFile += 1;
      await route.fulfill({
        status: 200,
        contentType: "model/gltf-binary",
        body: createAvatarGlb(),
      });
      return;
    }
    if (/\/models\/[^/]+\/thumbnail$/.test(path) && method === "GET") {
      await route.fulfill({ status: 200, contentType: "image/png", body: photoPng });
      return;
    }
    if (/\/models\/[^/]+$/.test(path) && method === "DELETE") {
      calls.deleteModel += 1;
      models = [];
      await route.fulfill({ status: 204 });
      return;
    }
    await json(route, { error: { message: "Mock route missing", requestId: "mock-missing" } }, 404);
  });

  return {
    jobBodies,
    confirmationBodies,
    calls,
    setActiveJob(job: ReturnType<typeof makeJob> | null) {
      activeJob = job;
    },
  };
}

const photoFile = (name: string) => ({ name, mimeType: "image/png", buffer: photoPng });

test("logs in with an existing Miaoxun account without browser storage", async ({ page }, testInfo) => {
  await installApiMock(page, { authenticated: false });
  await page.goto("/avatar/");
  await page.getByLabel("账号").fill("person@example.com");
  await page.getByLabel("密码").fill("Password1");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByText("创建个人形象")).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("login-workspace.png"), fullPage: true });
});

test("creates a face-first job from one usable photo and controlled brief", async ({ page }) => {
  const mock = await installApiMock(page);
  await page.goto("/avatar/");
  await page.getByLabel("正面脸照").setInputFiles(photoFile("face.png"));
  await expect(page.getByText(/照片.*继续|照片可用/)).toBeVisible();
  await page.getByRole("button", { name: "修长" }).click();
  await page.getByLabel("服装方向").selectOption("sport");
  await page.getByLabel("补充要求").fill("蓝白色运动套装，整体自然自信");
  await page.getByRole("checkbox", { name: /照片使用授权/ }).check();
  await page.getByRole("checkbox", { name: /同意 AI 根据描述补全/ }).check();
  await expect(page.getByText("预计 ¥2.00")).toBeVisible();
  await page.getByRole("button", { name: "生成四视图" }).click();
  await expect(page.getByRole("dialog")).toContainText("此步骤只生成四视图");
  await page.getByRole("button", { name: "确认并生成四视图" }).click();

  await expect.poll(() => mock.jobBodies.length).toBe(1);
  expect(mock.jobBodies[0]).toMatchObject({
    generationMode: "face_first_multiview",
    bodyShape: "slender",
    pose: "natural",
    outfit: "sport",
    userDescription: "蓝白色运动套装，整体自然自信",
    qualityPreset: "ultra",
    acceptedPhotoRights: true,
    acceptedAdultSubject: true,
    acceptedFaceCompletion: true,
    acceptedReferenceCostVersion: feature.costVersion,
  });
  expect(mock.jobBodies[0].photoId).toMatch(/^00000000-/);
  expect(mock.jobBodies[0]).not.toHaveProperty("photos");
  await expect(page.getByRole("heading", { name: "正在准备四视图" })).toBeVisible();
});

test("reviews all four views and explicitly selects 3D quality", async ({ page }, testInfo) => {
  const mock = await installApiMock(page, {
    activeJob: makeJob("awaiting_reference_confirmation"),
  });
  await page.goto("/avatar/");

  await expect(page.getByAltText("正面四视图")).toBeVisible();
  await expect(page.getByRole("button", { name: /查看/ })).toHaveCount(4);
  await page.getByRole("button", { name: "查看右侧" }).click();
  await expect(page.getByAltText("右侧四视图")).toBeVisible();
  await expect(page.getByText("预计 ¥4.20")).toBeVisible();
  await page.getByRole("button", { name: "标准" }).click();
  await expect(page.getByText("预计 ¥2.80")).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("four-view-confirmation.png"), fullPage: true });
  await page.getByRole("button", { name: "确认四视图并生成 3D" }).click();

  await expect.poll(() => mock.calls.confirmReferences).toBe(1);
  expect(mock.confirmationBodies[0]).toEqual({
    referenceSetId,
    qualityPreset: "standard",
    acceptedCostVersion: feature.costVersion,
    accepted: true,
  });
  await expect(page.getByRole("heading", { name: "正在准备 3D 生成" })).toBeVisible();
});

test("rejects a four-view set without starting 3D", async ({ page }) => {
  const mock = await installApiMock(page, {
    activeJob: makeJob("awaiting_reference_confirmation"),
  });
  await page.goto("/avatar/");
  await expect(page.getByAltText("正面四视图")).toBeVisible();
  await page.getByRole("button", { name: "不使用这组四视图" }).click();

  await expect.poll(() => mock.calls.rejectReferences).toBe(1);
  expect(mock.calls.confirmReferences).toBe(0);
  await expect(page.getByText("暂无 3D 模型")).toBeVisible();
});

test("shows the generated preview before requesting the model file", async ({ page }, testInfo) => {
  const mock = await installApiMock(page, { activeJob: makeJob("persisting") });
  await page.goto("/avatar/");

  await expect(page.getByRole("heading", { name: "预览已完成" })).toBeVisible();
  await expect(page.getByAltText("3D 形象生成预览")).toBeVisible();
  await expect(page.getByText("正在准备可旋转模型")).toBeVisible();
  expect(mock.calls.modelFile).toBe(0);
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("result-preview.png"), fullPage: true });
});

test("restores active work, shows only safe diagnostics, and enforces quota", async ({ page }) => {
  await installApiMock(page, {
    activeJob: makeJob("processing_references"),
    pollErrorOnce: true,
  });
  await page.goto("/avatar/");
  await expect(page.getByText("正在生成四视图")).toBeVisible();
  await page.reload();
  await expect(page.getByText("正在生成四视图")).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText(/request-safe-42/)).toBeVisible();
  await expect(page.getByText("sensitive provider detail")).toHaveCount(0);

  const quotaPage = await page.context().newPage();
  await installApiMock(quotaPage, { dailyRemaining: 0 });
  await quotaPage.goto("/avatar/");
  await expect(quotaPage.getByRole("button", { name: "今日次数已用完" })).toBeDisabled();
  await quotaPage.close();
});

test("renders a colored nonblank GLB and supports viewer controls and deletion", async ({ page }, testInfo) => {
  const mock = await installApiMock(page, { models: [avatarModel] });
  await page.goto("/avatar/");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-frame-radius", /.+/);
  await expect(page.getByText("正在加载模型")).toHaveCount(0);
  await page.waitForTimeout(120);

  const frame = await canvas.evaluate((element) => ({
    radius: Number(element.dataset.frameRadius),
    distance: Number(element.dataset.cameraDistance),
    aspect: Number(element.dataset.cameraAspect),
  }));
  expect(frame.radius).toBeGreaterThan(0);
  expect(frame.distance).toBeGreaterThan(frame.radius);
  expect(frame.aspect).toBeGreaterThan(0);

  const pixels = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2") || target.getContext("webgl");
    if (!gl) return { colored: 0, nonBackground: 0, total: 0 };
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const buffer = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    let colored = 0;
    let nonBackground = 0;
    for (let index = 0; index < buffer.length; index += 4) {
      const red = buffer[index];
      const green = buffer[index + 1];
      const blue = buffer[index + 2];
      const difference = Math.abs(red - 27) + Math.abs(green - 36) + Math.abs(blue - 34);
      if (buffer[index + 3] > 0 && difference > 30) nonBackground += 1;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 30) colored += 1;
    }
    return { colored, nonBackground, total: width * height };
  });
  expect(pixels.nonBackground).toBeGreaterThan(Math.max(500, pixels.total * 0.002));
  expect(pixels.colored).toBeGreaterThan(100);

  const overlap = await page.evaluate(() => {
    const toolbar = document.querySelector(".viewer-toolbar")?.getBoundingClientRect();
    const caption = document.querySelector(".viewer-caption")?.getBoundingClientRect();
    if (!toolbar || !caption) return true;
    return toolbar.left < caption.right
      && toolbar.right > caption.left
      && toolbar.top < caption.bottom
      && toolbar.bottom > caption.top;
  });
  expect(overlap).toBe(false);
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "重置视角" }).click();
  const supportsFullscreen = await page.evaluate(() => Boolean(document.documentElement.requestFullscreen));
  if (supportsFullscreen) {
    await page.getByRole("button", { name: "进入全屏" }).click();
    await expect(page.getByRole("button", { name: "退出全屏" })).toBeVisible();
    await page.getByRole("button", { name: "退出全屏" }).click();
  }
  await page.screenshot({ path: testInfo.outputPath("model-viewer.png"), fullPage: true });

  await page.getByRole("button", { name: "删除模型" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect.poll(() => mock.calls.deleteModel).toBe(1);
  await expect(page.getByText("暂无 3D 模型")).toBeVisible();
});
