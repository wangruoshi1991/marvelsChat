import type {
  HomepageMedia,
  HomepagePage,
  HomepagePageView,
  HomepageRoute,
  HomepageTheme,
} from "./homepageTypes";

export const visibleSections = (page: HomepagePage) =>
  page.sections.filter((section) => !section.hidden);

export function resolveCover(view: HomepagePageView): HomepageMedia | null {
  const mediaById = new Map(view.media.map((item) => [item.id, item]));
  const hero = visibleSections(view.page).find((section) => section.type === "hero");
  for (const assetId of hero?.assetIds || []) {
    const media = mediaById.get(assetId);
    if (media) return media;
  }
  return view.media[0] || null;
}

export const themeClass = (theme: HomepageTheme) =>
  theme === "gallery" ? "theme-gallery" : "theme-clean";

export function parseHomepageRoute(pathname: string): HomepageRoute {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "preview" && segments[1]) {
    return { mode: "preview", token: segments[1] };
  }
  if (segments.length === 2 && segments[0] === "s" && segments[1]) {
    return { mode: "share", token: segments[1] };
  }
  if (
    segments.length === 2
    && segments[0] === "legal"
    && ["privacy", "terms"].includes(segments[1])
  ) {
    return { mode: "legal", document: segments[1] as "privacy" | "terms" };
  }
  return { mode: "not-found" };
}
