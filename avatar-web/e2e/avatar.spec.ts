import { expect, test, type Page, type Route } from "@playwright/test";
import { createAvatarGlb, tinyPng } from "./fixtures/avatarFixture";

const now = "2026-07-17T04:00:00.000Z";
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
  costVersion: "2026-07-17",
  estimatedCostsFen: { realistic: 210, cartoon: 224 },
};

type JobStatus =
  | "queued_style" | "processing_style" | "awaiting_style_confirmation"
  | "queued_3d" | "submitting_3d" | "processing_3d" | "persisting"
  | "succeeded" | "failed" | "cancelled" | "submission_unknown";

const makeJob = (status: JobStatus, style: "realistic" | "cartoon" = "realistic") => ({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  userId: user.id,
  style,
  status,
  progress: status === "awaiting_style_confirmation" ? 100 : 42,
  photoCount: style === "realistic" ? 1 : 1,
  acceptedCostVersion: feature.costVersion,
  estimatedCostFen: style === "realistic" ? 210 : 224,
  stylePreviewId: status === "awaiting_style_confirmation"
    ? "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    : null,
  modelId: status === "succeeded" ? "dddddddd-dddd-4ddd-8ddd-dddddddddddd" : null,
  errorCode: null,
  createdAt: now,
  updatedAt: now,
  finishedAt: null,
});

const avatarModel = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  title: "我的写实 3D 形象",
  status: "active",
  byteSize: 1648,
  thumbnailAvailable: false,
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
  const calls = { confirm: 0, cancel: 0, deleteModel: 0 };
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
    const url = new URL(request.url());
    const path = url.pathname;
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
      const body = request.postDataJSON() as { originalFilename: string; mimeType: string; byteSize: number };
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
        status: "ready",
        mimeType: "image/png",
        byteSize: tinyPng.length,
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
      activeJob = makeJob(body.style === "cartoon" ? "queued_style" : "queued_3d", body.style as "realistic" | "cartoon");
      activeJob.photoCount = (body.photos as unknown[]).length;
      await json(route, { data: { created: true, job: activeJob } }, 201);
      return;
    }
    if (/\/jobs\/[^/]+\/confirm-style$/.test(path) && method === "POST") {
      calls.confirm += 1;
      activeJob = makeJob("queued_3d", "cartoon");
      await json(route, { data: activeJob });
      return;
    }
    if (/\/jobs\/[^/]+\/cancel$/.test(path) && method === "POST") {
      calls.cancel += 1;
      const cancelled = makeJob("cancelled", activeJob?.style || "cartoon");
      activeJob = null;
      await json(route, { data: cancelled });
      return;
    }
    if (/\/jobs\/[^/]+\/style-preview$/.test(path) && method === "GET") {
      await route.fulfill({ status: 200, contentType: "image/png", body: tinyPng });
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
      await route.fulfill({
        status: 200,
        contentType: "model/gltf-binary",
        body: createAvatarGlb(),
      });
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
    calls,
    setActiveJob(job: ReturnType<typeof makeJob> | null) {
      activeJob = job;
    },
  };
}

const photoFile = (name: string) => ({ name, mimeType: "image/png", buffer: tinyPng });

test("logs in with the existing Miaoxun account without browser storage", async ({ page }, testInfo) => {
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

for (const photoCount of [1, 4]) {
  test(`creates one realistic job from ${photoCount} guided photo${photoCount > 1 ? "s" : ""}`, async ({ page }) => {
    const mock = await installApiMock(page);
    await page.goto("/avatar/");
    const labels = ["正面全身照片", "左侧照片", "背面照片", "右侧照片"];
    for (const [index, label] of labels.slice(0, photoCount).entries()) {
      await page.getByLabel(label).setInputFiles(photoFile(`view-${index}.png`));
    }
    await page.getByRole("checkbox", { name: /确认拥有照片使用授权/ }).check();
    await page.getByRole("button", { name: "生成 3D 形象" }).click();
    await page.getByRole("button", { name: "确认并生成" }).click();

    await expect.poll(() => mock.jobBodies.length).toBe(1);
    expect(mock.jobBodies[0].style).toBe("realistic");
    expect((mock.jobBodies[0].photos as unknown[]).length).toBe(photoCount);
    await expect(page.getByText("正在准备 3D 生成")).toBeVisible();
  });
}

test("confirms or discards a cartoon reference explicitly", async ({ page }) => {
  const mock = await installApiMock(page, {
    activeJob: makeJob("awaiting_style_confirmation", "cartoon"),
  });
  await page.goto("/avatar/");
  await expect(page.getByAltText("卡通形象参考图")).toBeVisible();
  await page.getByRole("button", { name: "确认并生成 3D" }).click();
  await expect.poll(() => mock.calls.confirm).toBe(1);

  mock.setActiveJob(makeJob("awaiting_style_confirmation", "cartoon"));
  await page.reload();
  await page.getByRole("button", { name: "放弃本次" }).click();
  await expect.poll(() => mock.calls.cancel).toBe(1);
});

test("restores active work, shows safe diagnostics, and enforces exhausted quota", async ({ page }) => {
  await installApiMock(page, {
    activeJob: makeJob("processing_3d"),
    pollErrorOnce: true,
  });
  await page.goto("/avatar/");
  await expect(page.getByText("正在生成 3D 形象")).toBeVisible();
  await page.reload();
  await expect(page.getByText("正在生成 3D 形象")).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText(/request-safe-42/)).toBeVisible();
  await expect(page.getByText("sensitive provider detail")).toHaveCount(0);

  const quotaPage = await page.context().newPage();
  await installApiMock(quotaPage, { dailyRemaining: 0 });
  await quotaPage.goto("/avatar/");
  await expect(quotaPage.getByRole("button", { name: "今日次数已用完" })).toBeDisabled();
  await quotaPage.close();
});

test("renders a framed nonblank GLB and supports reset, fullscreen, and delete", async ({ page }, testInfo) => {
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
    if (!gl) return { nonBackground: 0, total: 0 };
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const buffer = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    let nonBackground = 0;
    for (let index = 0; index < buffer.length; index += 4) {
      const difference = Math.abs(buffer[index] - 27)
        + Math.abs(buffer[index + 1] - 36)
        + Math.abs(buffer[index + 2] - 34);
      if (buffer[index + 3] > 0 && difference > 30) nonBackground += 1;
    }
    return { nonBackground, total: width * height };
  });
  expect(pixels.nonBackground).toBeGreaterThan(Math.max(500, pixels.total * 0.002));

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
    await expect(page.getByRole("button", { name: "进入全屏" })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath("model-viewer.png"), fullPage: true });

  await page.getByRole("button", { name: "删除模型" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect.poll(() => mock.calls.deleteModel).toBe(1);
  await expect(page.getByText("暂无 3D 模型")).toBeVisible();
});
