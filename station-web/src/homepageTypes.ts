export type HomepageTheme = "gallery" | "clean";
export type HomepageSectionType = "hero" | "about" | "gallery" | "diary" | "contact";

export type HomepageAction = {
  label: string;
  kind: "message" | "follow" | "link";
  href: string;
};

export type HomepageSection = {
  id: string;
  type: HomepageSectionType;
  title: string;
  subtitle: string;
  body: string;
  assetIds: string[];
  diaryEntryIds: string[];
  actions: HomepageAction[];
  hidden: boolean;
};

export type HomepagePage = {
  version: 2;
  language: "zh" | "en";
  title: string;
  theme: HomepageTheme;
  summary: string;
  sections: HomepageSection[];
};

export type HomepageMedia = {
  id: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  alt: string;
};

export type HomepagePageView = {
  mode: "preview" | "share";
  owner: {
    nickname: string;
    avatarText: string;
    bio: string;
  };
  page: HomepagePage;
  media: HomepageMedia[];
  visibility: "private" | "link";
  publishedAt: string | null;
};

export type HomepageRoute =
  | { mode: "preview"; token: string }
  | { mode: "share"; token: string }
  | { mode: "legal"; document: "privacy" | "terms" }
  | { mode: "not-found" };

export type HomepageApiEnvelope = {
  data?: HomepagePageView;
  error?: {
    message?: string;
    requestId?: string;
  };
};
