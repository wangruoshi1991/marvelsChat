# Build 24 Shared Homepage Web Renderer Design

## Status

Approved through the Build 24 product interview and the instruction to start implementation on 2026-07-15.

## Goal

Render one exact personal homepage experience for authenticated App previews and anonymous unlisted links. The renderer consumes only the structured Build 24 page-view contract and never accepts arbitrary HTML, CSS, provider metadata, storage keys, or credentials.

## Chosen Approach

Create an independent `station-web` React/Vite package with assets rooted at `/site-assets/`. Express serves the built shell for `/preview/:token`, `/s/:token`, `/legal/privacy`, and `/legal/terms`. The browser derives the route mode and fetches the corresponding same-origin JSON API.

This approach is preferred over server-side string templates because it gives the React Native WebView and browser share link the same component tree. It is preferred over separate preview and share apps because one renderer prevents visual drift. Full SSR is deferred because Build 24 links are private or unlisted and do not require search indexing.

## Page Contract

The renderer accepts:

```ts
type HomepagePageView = {
  mode: "preview" | "share";
  owner: { nickname: string; avatarText: string; bio: string };
  page: {
    version: 2;
    language: "zh" | "en";
    title: string;
    theme: "gallery" | "clean";
    summary: string;
    sections: HomepageSection[];
  };
  media: HomepageMedia[];
  visibility: "private" | "link";
  publishedAt: string | null;
};
```

Sections render in server order. Hidden sections do not render. Media is resolved only by the signed URL projection supplied by the backend. Missing media produces a stable visual placeholder without changing section dimensions.

## Visual System

`gallery` is image-led and full-width. The hero uses the selected cover as real media with a uniform readability scrim, owner identity, title, and summary over the image without a card. The next section remains visible at common mobile and desktop heights. Gallery content uses a stable responsive grid with restrained 4px corners.

`clean` is editorial but not decorative. The owner name is the first signal, followed immediately by a wide selected image and compact profile text. Sections use white and neutral bands, dark text, and a limited coral/green accent pair. It does not use gradients, floating cards, or oversized dashboard typography.

Both themes use full-width sections, system Chinese fonts, zero letter spacing, accessible contrast, stable image aspect ratios, and responsive layouts from 320px through desktop. Legal pages use the same typography without homepage imagery.

## States

- Loading: fixed skeleton geometry; no instructional marketing copy.
- Preview: a compact `预览` status marker that is outside user content.
- Share: no App installation requirement and no technical status fields.
- Expired or revoked: one unavailable page with no distinction that leaks token state.
- Network failure: retry command and request ID when the API supplies one.
- Empty or missing image: stable neutral placeholder and preserved layout.

## Security And Privacy

- React text nodes render all user content; no `dangerouslySetInnerHTML` for user data.
- The backend keeps `Referrer-Policy: no-referrer`; the document also declares it.
- Fetch uses same-origin URLs and sends no authorization for preview/share token routes.
- Tokens stay in route paths and are never written to logs, analytics, local storage, or error text.
- Signed media URLs are kept in memory only.
- Legal text is repository-owned static content marked for legal review.

## Backend Integration

`homepage-web-service.js` locates `station-web/dist`, mounts immutable static assets under `/site-assets`, and returns `index.html` for the four Web routes. Missing build artifacts return a controlled 503 instead of a filesystem stack trace. API routes remain the source of page data and status codes.

## Verification

- Unit tests cover route parsing, section ordering, hidden modules, cover selection, and both themes.
- Build/type checks run from a clean install.
- Playwright covers iPhone SE, iPhone Pro Max, and desktop viewports.
- Screenshots are inspected for blank output, overlap, first-viewport identity/media, and next-section visibility.
- Image checks verify at least one rendered media element has nonzero dimensions when media exists.
