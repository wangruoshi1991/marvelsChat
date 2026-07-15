import { describe, expect, it } from "vitest";
import type { HomepagePageView } from "./homepageTypes";
import {
  parseHomepageRoute,
  resolveCover,
  themeClass,
  visibleSections,
} from "./homepageView";

const mediaIds = ["photo-1", "photo-2", "photo-3"];

const pageView: HomepagePageView = {
  mode: "preview",
  owner: { nickname: "小妙", avatarText: "妙", bio: "记录生活" },
  page: {
    version: 2,
    language: "zh",
    title: "小妙的主页",
    theme: "gallery",
    summary: "海边、朋友和晚风",
    sections: [
      {
        id: "hero",
        type: "hero",
        title: "小妙的主页",
        subtitle: "记录夏天",
        body: "",
        assetIds: [mediaIds[1]],
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
      {
        id: "about",
        type: "about",
        title: "关于我",
        subtitle: "",
        body: "喜欢旅行。",
        assetIds: [],
        diaryEntryIds: [],
        actions: [],
        hidden: true,
      },
      {
        id: "gallery",
        type: "gallery",
        title: "照片",
        subtitle: "",
        body: "",
        assetIds: mediaIds,
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
    ],
  },
  media: mediaIds.map((id) => ({
    id,
    url: `https://media.invalid/${id}`,
    mimeType: "image/jpeg",
    width: 1200,
    height: 900,
    alt: id,
  })),
  visibility: "private",
  publishedAt: null,
};

describe("homepage view projection", () => {
  it("keeps server section order while removing hidden sections", () => {
    expect(visibleSections(pageView.page).map((section) => section.id)).toEqual([
      "hero",
      "gallery",
    ]);
  });

  it("resolves the hero cover from projected media and falls back safely", () => {
    expect(resolveCover(pageView)?.id).toBe("photo-2");
    expect(resolveCover({
      ...pageView,
      page: {
        ...pageView.page,
        sections: [{ ...pageView.page.sections[0], assetIds: ["not-projected"] }],
      },
    })?.id).toBe("photo-1");
  });

  it("maps only the two supported themes", () => {
    expect(themeClass("gallery")).toBe("theme-gallery");
    expect(themeClass("clean")).toBe("theme-clean");
  });

  it("recognizes preview, share, and legal routes without accepting near matches", () => {
    expect(parseHomepageRoute("/preview/token-123")).toEqual({ mode: "preview", token: "token-123" });
    expect(parseHomepageRoute("/s/token-456")).toEqual({ mode: "share", token: "token-456" });
    expect(parseHomepageRoute("/legal/privacy")).toEqual({ mode: "legal", document: "privacy" });
    expect(parseHomepageRoute("/legal/terms")).toEqual({ mode: "legal", document: "terms" });
    expect(parseHomepageRoute("/preview/")).toEqual({ mode: "not-found" });
  });
});
