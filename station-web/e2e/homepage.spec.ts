import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { HomepagePageView, HomepageTheme } from "../src/homepageTypes";

const token = "a".repeat(43);
const testPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const viewForTheme = (theme: HomepageTheme): HomepagePageView => ({
  mode: "share",
  owner: { nickname: "小妙", avatarText: "妙", bio: "喜欢旅行、朋友和日常记录。" },
  page: {
    version: 2,
    language: "zh",
    title: "小妙的夏天",
    theme,
    summary: "海边、朋友和晚风。",
    sections: [
      {
        id: "hero",
        type: "hero",
        title: "小妙的夏天",
        subtitle: "把喜欢的时刻放在一起",
        body: "",
        assetIds: ["photo-2"],
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
      {
        id: "about",
        type: "about",
        title: "关于我",
        subtitle: "现在与这里",
        body: "喜欢旅行、朋友和日常记录，也喜欢在普通的一天里发现值得留下的细节。",
        assetIds: [],
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
      {
        id: "gallery",
        type: "gallery",
        title: "照片",
        subtitle: "亲自选择的生活片段",
        body: "",
        assetIds: ["photo-1", "photo-2", "photo-3"],
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
    ],
  },
  media: ["photo-1", "photo-2", "photo-3"].map((id, index) => ({
    id,
    url: `https://media.test/${index + 1}.png`,
    mimeType: "image/png",
    width: 1200,
    height: 900,
    alt: `生活照片 ${index + 1}`,
  })),
  visibility: "link",
  publishedAt: "2026-07-15T05:00:00.000Z",
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function mockHomepage(page: Page, theme: HomepageTheme) {
  await page.route("https://media.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: testPng,
  }));
  await page.route("**/api/homepage-shares/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-ID": "e2e-request" },
    body: JSON.stringify({ data: viewForTheme(theme) }),
  }));
}

for (const theme of ["gallery", "clean"] as const) {
  test(`${theme} homepage is nonblank, framed, and reveals the next section`, async ({ page }, testInfo) => {
    await mockHomepage(page, theme);
    await page.goto(`/s/${token}`);

    await expect(page.getByRole("heading", { level: 1, name: "小妙的夏天" })).toBeVisible();
    await expect(page.locator("[data-section-id='about']")).toBeVisible();
    await expect.poll(() => page.locator(".hero-media img").evaluate((image: HTMLImageElement) => ({
      complete: image.complete,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }))).toEqual({ complete: true, width: 1, height: 1 });

    const layout = await page.evaluate(() => {
      const nextSection = document.querySelector("[data-section-id='about']")?.getBoundingClientRect();
      const title = document.querySelector("h1")?.getBoundingClientRect();
      const strip = document.querySelector(".photo-strip")?.getBoundingClientRect();
      return {
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        nextTop: nextSection?.top || 0,
        viewportHeight: window.innerHeight,
        titleBottom: title?.bottom || 0,
        stripTop: strip?.top || Number.MAX_SAFE_INTEGER,
      };
    });

    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.nextTop).toBeLessThan(layout.viewportHeight);
    expect(layout.titleBottom).toBeLessThanOrEqual(layout.stripTop);
    await page.screenshot({
      path: testInfo.outputPath(`${theme}-${testInfo.project.name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("revoked or expired links show one safe unavailable state", async ({ page }) => {
  await page.route("**/api/homepage-shares/**", (route) => route.fulfill({
    status: 410,
    contentType: "application/json",
    body: JSON.stringify({ error: { message: "internal detail", requestId: "request-safe-1" } }),
  }));
  await page.goto(`/s/${token}`);

  await expect(page.getByRole("heading", { name: "这个主页暂时无法访问" })).toBeVisible();
  await expect(page.getByText("internal detail")).toHaveCount(0);
  await expect(page.getByText("诊断编号 request-safe-1")).toBeVisible();
});
