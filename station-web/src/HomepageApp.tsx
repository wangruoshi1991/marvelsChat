import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  HomepageApiEnvelope,
  HomepageMedia,
  HomepagePageView,
  HomepageRoute,
  HomepageSection,
} from "./homepageTypes";
import {
  parseHomepageRoute,
  resolveCover,
  themeClass,
  visibleSections,
} from "./homepageView";
import { LegalPage } from "./legal";

const defaultFetcher: typeof fetch = (...args) => globalThis.fetch(...args);

const endpointForRoute = (route: HomepageRoute) => {
  if (route.mode === "preview")
    return `/api/homepage-previews/${encodeURIComponent(route.token)}`;
  if (route.mode === "share")
    return `/api/homepage-shares/${encodeURIComponent(route.token)}`;
  return null;
};

const mediaForSection = (
  section: HomepageSection,
  mediaById: Map<string, HomepageMedia>,
) =>
  section.assetIds
    .map((id) => mediaById.get(id))
    .filter(Boolean) as HomepageMedia[];

function MediaImage({
  media,
  className,
  eager = false,
}: {
  media: HomepageMedia;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      className={className}
      src={media.url}
      alt={media.alt}
      width={media.width || undefined}
      height={media.height || undefined}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      referrerPolicy="no-referrer"
    />
  );
}

function SectionView({
  section,
  mediaById,
}: {
  section: HomepageSection;
  mediaById: Map<string, HomepageMedia>;
}) {
  const media = mediaForSection(section, mediaById);
  const sectionClass = `content-section section-${section.type}`;

  if (section.type === "gallery") {
    return (
      <section className={sectionClass} data-section-id={section.id}>
        <div className="section-inner">
          <header className="section-heading">
            <h2>{section.title}</h2>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
          </header>
          <div className="photo-grid">
            {media.map((item) => (
              <figure key={item.id} className="photo-grid-item">
                <MediaImage media={item} />
              </figure>
            ))}
          </div>
          {section.body ? <p className="section-body">{section.body}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className={sectionClass} data-section-id={section.id}>
      <div className="section-inner text-section-inner">
        <header className="section-heading">
          <h2>{section.title}</h2>
          {section.subtitle ? <p>{section.subtitle}</p> : null}
        </header>
        {section.body ? <p className="section-body">{section.body}</p> : null}
        {media.length ? (
          <div className="section-media-row">
            {media.map((item) => (
              <MediaImage key={item.id} media={item} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function HomepagePage({ view }: { view: HomepagePageView }) {
  const sections = visibleSections(view.page);
  const hero = sections.find((section) => section.type === "hero");
  const remaining = sections.filter((section) => section !== hero);
  const mediaById = useMemo(
    () => new Map(view.media.map((item) => [item.id, item])),
    [view.media],
  );
  const cover = resolveCover(view);
  const stripMedia = view.media.slice(0, 9);

  return (
    <main
      className={`homepage ${themeClass(view.page.theme)}`}
      lang={view.page.language}
    >
      {view.mode === "preview" ? (
        <div className="preview-marker">预览</div>
      ) : null}
      <section
        className={`homepage-hero ${cover ? "has-cover" : "without-cover"}`}
      >
        <div className="hero-media" aria-hidden={!cover}>
          {cover ? (
            <MediaImage media={cover} eager />
          ) : (
            <div className="media-placeholder" />
          )}
        </div>
        <div className="hero-copy">
          <p className="owner-name">
            {view.owner.nickname || view.owner.avatarText}
          </p>
          <p className="ai-content-marker">AI 生成内容</p>
          <h1>{hero?.title || view.page.title}</h1>
          {hero?.subtitle || view.page.summary ? (
            <p className="hero-summary">
              {hero?.subtitle || view.page.summary}
            </p>
          ) : null}
        </div>
        {stripMedia.length ? (
          <div className="photo-strip" aria-label="主页照片">
            {stripMedia.map((media) => (
              <div className="photo-strip-item" key={media.id}>
                <MediaImage media={media} />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {view.owner.bio &&
      !remaining.some((section) => section.type === "about") ? (
        <section className="content-section section-about">
          <div className="section-inner text-section-inner">
            <header className="section-heading">
              <h2>关于我</h2>
            </header>
            <p className="section-body">{view.owner.bio}</p>
          </div>
        </section>
      ) : null}

      {remaining.map((section) => (
        <SectionView key={section.id} section={section} mediaById={mediaById} />
      ))}

      <footer className="homepage-footer">
        <span>{view.owner.nickname || "妙讯主页"}</span>
        <nav aria-label="法律信息">
          <a href="/legal/privacy">隐私</a>
          <a href="/legal/terms">条款</a>
        </nav>
      </footer>
    </main>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; view: HomepagePageView }
  | { kind: "error"; requestId: string };

export function HomepageApp({
  pathname = window.location.pathname,
  fetcher = defaultFetcher,
}: {
  pathname?: string;
  fetcher?: typeof fetch;
}) {
  const route = useMemo(() => parseHomepageRoute(pathname), [pathname]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const endpoint = endpointForRoute(route);
    if (!endpoint) return;
    const controller = new AbortController();
    setState({ kind: "loading" });
    fetcher(endpoint, {
      headers: { Accept: "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as HomepageApiEnvelope;
        if (!response.ok || !body.data) {
          throw Object.assign(new Error("unavailable"), {
            requestId:
              body.error?.requestId ||
              response.headers.get("x-request-id") ||
              "",
          });
        }
        setState({ kind: "ready", view: body.data });
      })
      .catch((error: Error & { requestId?: string }) => {
        if (error.name === "AbortError") return;
        setState({ kind: "error", requestId: error.requestId || "" });
      });
    return () => controller.abort();
  }, [attempt, fetcher, route]);

  if (route.mode === "legal") return <LegalPage document={route.document} />;
  if (route.mode === "not-found") return <UnavailablePage />;
  if (state.kind === "loading") return <LoadingPage />;
  if (state.kind === "error") {
    return <UnavailablePage requestId={state.requestId} onRetry={retry} />;
  }
  return <HomepagePage view={state.view} />;
}

function LoadingPage() {
  return (
    <main
      className="state-page loading-page"
      aria-busy="true"
      aria-label="正在加载主页"
    >
      <div className="loading-identity" />
      <div className="loading-photo" />
      <div className="loading-line" />
    </main>
  );
}

function UnavailablePage({
  requestId = "",
  onRetry,
}: {
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <main className="state-page unavailable-page">
      <p className="wordmark">妙讯</p>
      <h1>这个主页暂时无法访问</h1>
      <p>链接可能已失效或被撤销。</p>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          重新加载
        </button>
      ) : null}
      {requestId ? <p className="request-id">诊断编号 {requestId}</p> : null}
    </main>
  );
}
