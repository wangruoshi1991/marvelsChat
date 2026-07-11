# Build 23 Foundation Design

## Context

TestFlight build 22 points at `http://8.153.167.11/api`, but the installed app can still become unusable for two independent reasons:

1. Updating `lastSyncAt` recreates `incrementalSync`, which recreates the realtime effect. Each new socket receives `connection.ready` and performs another full bootstrap, producing a bootstrap/sync loop.
2. The mobile client calls diary, album, and media lifecycle routes that are absent from the current backend source and deployment. A July 8 server backup confirms these routes existed before a later backend overwrite.

## Scope

### Mobile synchronization

- Store the latest incremental cursor in a ref so cursor updates do not change callback identity.
- Keep only one bootstrap and one incremental request in flight.
- On realtime connection, run one incremental catch-up instead of a full bootstrap.
- Keep the 30-second interval as a fallback without recreating it after every cursor update.
- Add a regression test proving that a sync response does not create another WebSocket or bootstrap loop.

### Station content lifecycle

- Restore owner-scoped PATCH and soft DELETE operations for diary entries, albums, and media assets.
- Restore signed OSS upload preparation and authenticated media reads.
- Preserve the mobile API contract, including route names and response envelopes.
- Validate UUID path parameters, partial update bodies, MIME families, and size limits.
- Derive the OSS object key on the server, require the completion key to equal the prepared key, and verify the uploaded OSS object before marking it uploaded.
- Stream media from OSS through the authenticated backend endpoint, including range headers, instead of buffering the full object.

## Non-Goals

- This work does not add `MESHY_API_KEY` or a 3D provider.
- This work does not upload an iOS build; it prepares source for build 23 and deploys only the independently testable backend portion.
- This work does not redesign Agent pages or implement the remaining provider pipelines.

## Verification

- Mobile TypeScript, ESLint, and Jest checks pass.
- Backend syntax, route contract, validation, and OSS signing tests pass.
- Agent registry tests pass.
- Live server health, authentication, restored route existence, and an authenticated media lifecycle smoke test pass without exposing credentials.

