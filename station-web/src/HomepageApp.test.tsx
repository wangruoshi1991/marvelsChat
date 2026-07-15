import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomepagePage } from "./HomepageApp";
import type { HomepagePageView } from "./homepageTypes";

const view: HomepagePageView = {
  mode: "share",
  owner: { nickname: "小妙", avatarText: "妙", bio: "喜欢旅行和记录生活。" },
  page: {
    version: 2,
    language: "zh",
    title: "小妙的夏天",
    theme: "gallery",
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
        id: "hidden-about",
        type: "about",
        title: "不能显示",
        subtitle: "",
        body: "隐藏的私人文字",
        assetIds: [],
        diaryEntryIds: [],
        actions: [],
        hidden: true,
      },
      {
        id: "gallery",
        type: "gallery",
        title: "照片",
        subtitle: "亲自选择的生活片段",
        body: "",
        assetIds: ["photo-1", "photo-2"],
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
    ],
  },
  media: ["photo-1", "photo-2"].map((id) => ({
    id,
    url: `https://media.invalid/${id}`,
    mimeType: "image/jpeg",
    width: 1200,
    height: 900,
    alt: `${id} 描述`,
  })),
  visibility: "link",
  publishedAt: "2026-07-15T05:00:00.000Z",
};

describe("HomepagePage", () => {
  it("renders the gallery theme, selected cover, and visible sections only", () => {
    const html = renderToStaticMarkup(<HomepagePage view={view} />);

    expect(html).toContain("theme-gallery");
    expect(html).toContain("小妙的夏天");
    expect(html).toContain("https://media.invalid/photo-2");
    expect(html).toContain("亲自选择的生活片段");
    expect(html).not.toContain("隐藏的私人文字");
  });

  it("uses the clean theme without changing content order", () => {
    const html = renderToStaticMarkup(
      <HomepagePage view={{ ...view, page: { ...view.page, theme: "clean" } }} />,
    );

    expect(html).toContain("theme-clean");
    expect(html.indexOf("小妙的夏天")).toBeLessThan(html.indexOf("照片"));
  });
});
