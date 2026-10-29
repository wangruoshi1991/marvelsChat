# 妙讯标准化后台与 Agent 发布链路实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将妙讯后台改造成真实运营系统，并建立从 Agent 代码注册、审核上架、产品发布、用户授权到 App 执行的单一标准链路。

**Architecture:** 保留 Vite 原生后台和现有 Express/PostgreSQL 边界。新增 Agent release、产品目录、依赖和 entitlement 数据合同；后台负责审核和发布，App 只消费已发布的标准目录，运行时只调用代码 registry 中经过版本/contract 校验的 executor。移动端所有 Agent 展示统一使用服务端完整 `AgentIdentity`，缺失时显示合同错误，不走任何旧字段或静态头像回退。

**Tech Stack:** Node.js 20、Express、PostgreSQL、Zod、Vite 原生 JavaScript/CSS、React Native + TypeScript、Node test runner。

**Spec:** `docs/superpowers/specs/2026-10-29-admin-console-design.md`

## Global Constraints

- `agent_catalog` 是最终发布的 Agent 展示 identity 来源；移动端不得按 key、category 或旧 glyph 生成替代身份。
- 代码注册、目录审核、产品发布和用户授权是独立状态；发布不能代替用户授权。
- identity、版本、权限或 contract hash 缺失/不匹配必须返回明确错误或 `reconsent_required`，不能静默兼容。
- 所有管理写操作使用后端资源权限、事务、幂等键和审计记录。
- 统计只读真实数据库记录；未知成本、token 和空数据保持 `null`/空态。
- 生产部署、数据库迁移和 TestFlight 上传不在本计划内，需单独授权。

---

### Task 1: 建立共享 Agent identity 与发布数据合同

**Files:**
- Create: `shared/agent-catalog.js`
- Create: `backend/database/046_agent_releases.sql`
- Create: `backend/database/047_product_catalog.sql`
- Create: `backend/database/048_agent_entitlements.sql`
- Modify: `backend/src/migration-files.js`
- Modify: `backend/src/schemas.js`
- Test: `backend/test/agent-release-contract.test.js`

**Interfaces:**
- Produces shared identity field constants and deterministic contract-hash helpers; Zod request schemas live in `backend/src/schemas.js`.
- Produces tables for deployed release snapshots, catalog status/history, products, product dependencies, product status history and user entitlements.
- `agent_catalog` stores the operator-approved identity and no longer relies on runtime `currentCatalogueKeys`.

- [ ] **Step 1: Write failing contract tests** for required identity fields, valid release status transitions, product dependency shape, and entitlement statuses. Assert malformed identity, duplicate scopes and unknown states are rejected.
- [ ] **Step 2: Run `node --test backend/test/agent-release-contract.test.js`** and verify it fails because the shared contracts and migrations do not exist.
- [ ] **Step 3: Implement shared identity constants/hash helpers and backend Zod schemas**, then add migrations with explicit enums, unique keys, contract hash/version fields, JSONB identity snapshot, status history, indexes for product/agent/time queries, and foreign keys. Seed existing deployed Agent keys as historical registry rows without using a runtime hardcoded publish decision.
- [ ] **Step 4: Update migration discovery** and run the migration parser tests; verify 046–048 are discovered in numeric order and are idempotent.
- [ ] **Step 5: Run the contract tests and PostgreSQL migration tests**; commit `feat: add agent release and product contracts`.

### Task 2: Implement Agent release review, product publishing and entitlement APIs

**Files:**
- Create: `backend/src/agent-release-repository.js`
- Create: `backend/src/product-catalog-repository.js`
- Create: `backend/src/agent-publishing-service.js`
- Create: `backend/src/routes/admin-release-routes.js`
- Create: `backend/src/routes/admin-product-routes.js`
- Create: `backend/src/routes/product-routes.js`
- Modify: `backend/src/agent-catalog-repository.js`
- Modify: `backend/src/routes/admin-routes.js`
- Modify: `backend/src/routes/app-routes.js`
- Modify: `backend/src/repositories.js`
- Modify: `backend/src/ai-agent-access.js`
- Test: `backend/test/agent-publishing-service.test.js`
- Test: `backend/test/product-catalog-routes.test.js`

**Interfaces:**
- Admin: `GET /api/admin/agent-releases`, `POST /api/admin/agent-releases/:id/review`, `PATCH /api/admin/agent-releases/:id/identity`, `GET/POST /api/admin/products`, `POST /api/admin/products/:id/submit`, `POST /api/admin/products/:id/publish`, `POST /api/admin/products/:id/pause`.
- App: `GET /api/app/bootstrap` and `GET /api/app/sync` return only published products/Agent identities plus `catalogRevision`; `POST /api/me/products/:productId/enable` creates entitlement and required `user_agents` rows in one transaction.
- Runtime rejects missing registry release, stale version/hash, unavailable product, incomplete identity or scope mismatch with stable error codes.

- [ ] **Step 1: Write failing service tests** for code registration sync, review rejection when identity/readiness/scopes fail, publish transaction, idempotent repeated publish, product enable consent, stale entitlement and unavailable Agent behavior.
- [ ] **Step 2: Run the focused tests** and capture the expected missing-module failures.
- [ ] **Step 3: Implement release synchronization** from `listAgents()` using registry version, declared permissions and deterministic contract hash. Replace `currentCatalogueKeys` with migration-seeded status and make new releases `unreviewed`.
- [ ] **Step 4: Implement publishing service** with transaction locks, explicit state transitions, readiness checks, dependency checks, status history and `admin.*` audit events. Require complete identity payloads; reject partial identity patches.
- [ ] **Step 5: Implement product listing/submit/publish/pause and App enable** with entitlement + `user_agents` transaction and owner-consent rules. Keep existing sessions/history visible when unpublished, but return `unavailable` or `reconsent_required` explicitly.
- [ ] **Step 6: Wire routes and runtime checks**; remove old direct `published`-only paths and make `/api/agents` expose only complete published products/identities.
- [ ] **Step 7: Run focused backend tests plus the existing admin route tests**; commit `feat: enforce agent publishing lifecycle`.

### Task 3: Remove mobile identity fallbacks and unify Agent rendering

**Files:**
- Modify: `MiaoxunRN/src/models/api.ts`
- Modify: `MiaoxunRN/src/shared/AgentGlyphAvatar.tsx`
- Modify: `MiaoxunRN/src/shared/threadIconRegistry.ts`
- Modify: `MiaoxunRN/src/shared/messageUtils.ts`
- Modify: `MiaoxunRN/src/components/ChatMessageItem.tsx`
- Modify: `MiaoxunRN/src/components/StationAgentsPanel.tsx`
- Modify: `MiaoxunRN/src/components/StationHomeModules.tsx`
- Modify: `MiaoxunRN/src/components/StationPostComposer.tsx`
- Modify: `MiaoxunRN/src/components/StationPostsPanel.tsx`
- Modify: `MiaoxunRN/src/shared/xunAvatarAssets.ts`
- Modify: `MiaoxunRN/src/hooks/useMiaoxunSession.ts`
- Test: relevant RN component tests and a new `MiaoxunRN/src/__tests__/agentIdentityContract.test.ts`

**Interfaces:**
- `AgentIdentity` is required and includes the published presentation/asset data needed by every Agent surface.
- `AgentGlyphAvatar` accepts only a complete identity (or an explicit unavailable-contract state) and never accepts `category`, `fallbackGlyph`, registry key or static xun asset selection as identity input.
- Session bootstrap/sync replaces the directory snapshot only after validating its revision and all identities.

- [ ] **Step 1: Add failing tests** proving each Agent surface rejects missing identity and that the same identity renders for 妙页、讯页、聊天详情、我页、动态和任务卡.
- [ ] **Step 2: Run the focused RN tests** and verify current optional/fallback paths fail the new assertions.
- [ ] **Step 3: Make API DTO identity required**, add the standard presentation asset field, and create one shared identity parser/error state.
- [ ] **Step 4: Remove `owned.identity || registered.identity`, `resolveAgentIdentity`, `fallbackGlyph`, category color fallback and key-based `xunAvatarAssets`; pass the validated identity from session data through every component.
- [ ] **Step 5: Handle archived/unavailable releases explicitly** in session and message/thread rendering without using key/name substitutes.
- [ ] **Step 6: Run TypeScript, focused component tests and RN formatting; commit `feat: enforce one agent identity across mobile surfaces`**.

### Task 4: Replace the single-page admin UI with modular operations console

**Files:**
- Modify: `admin/index.html`
- Create: `admin/src/app-shell.js`
- Create: `admin/src/router.js`
- Create: `admin/src/api-client.js`
- Create: `admin/src/permissions.js`
- Create: `admin/src/components/data-table.js`
- Create: `admin/src/components/metric-grid.js`
- Create: `admin/src/components/agent-identity-card.js`
- Create: `admin/src/modules/overview.js`
- Create: `admin/src/modules/accounts.js`
- Create: `admin/src/modules/agents.js`
- Create: `admin/src/modules/products.js`
- Create: `admin/src/modules/tasks.js`
- Create: `admin/src/modules/monitoring.js`
- Create: `admin/src/modules/audit.js`
- Create: `admin/src/modules/system.js`
- Replace: `admin/admin.js`, `admin/admin.css`
- Test: `admin/test/admin-console.test.js`

**Interfaces:**
- Router paths: `/admin/overview`, `/admin/accounts`, `/admin/agents`, `/admin/products`, `/admin/tasks`, `/admin/monitoring`, `/admin/audit`, `/admin/system`.
- Every module exposes `load()`, `render()`, `renderError()`, `renderEmpty()` and `refresh()` against the API client.
- Agent and product cards render only server-provided complete identities and status labels.

- [ ] **Step 1: Write failing Admin tests** for module navigation, permission filtering, 403/error/empty states, Agent identity contract errors, product publish confirmation, and refresh isolation.
- [ ] **Step 2: Run `npm --prefix admin test`** and verify failures against the current single-page implementation.
- [ ] **Step 3: Implement the shell** with fixed sidebar, top environment/admin status, route state, consistent loading/error/empty components and no hidden-block single-page rendering.
- [ ] **Step 4: Implement overview and monitoring cards/charts** using real aggregate responses, explicit data freshness and null cost/token presentation.
- [ ] **Step 5: Implement accounts/permissions, Agent review, product publishing, task operations, audit and system modules**, with confirmation dialogs and request IDs for mutations.
- [ ] **Step 6: Build and run Admin tests; commit `feat: rebuild modular admin operations console`**.

### Task 5: Add task/monitoring aggregates and documentation

**Files:**
- Create: `backend/src/admin-operations-repository.js`
- Modify: `backend/src/admin-repository.js`
- Modify: `backend/src/routes/admin-routes.js`
- Modify: `docs/admin.md`
- Modify: `docs/agents.md`
- Modify: `docs/architecture.md`
- Modify: `docs/handoffs/CURRENT.md`
- Test: `backend/test/admin-operations-repository.test.js`

**Interfaces:**
- `GET /api/admin/overview?days=7|30|90` returns metric cards, daily series, freshness and empty/error metadata.
- `GET /api/admin/tasks` filters `ai_tasks`, workspaces and runs by product, Agent, user, status and time.
- `POST /api/admin/tasks/:id/retry` and `/cancel` enforce task contracts, idempotency and audit.
- `GET /api/admin/monitoring` returns Agent/product/user aggregates with `null` for unknown cost/token.

- [ ] **Step 1: Write failing aggregate tests** for real rows, no-row empty state, unknown cost/token, failure counts, queue status and idempotent retry/cancel.
- [ ] **Step 2: Implement SQL aggregates and route schemas** with bounded time windows and stable response metadata.
- [ ] **Step 3: Connect the Admin modules** and ensure filters link user, Agent, product, task and audit details without duplicating data stores.
- [ ] **Step 4: Update operational docs** with the code→release→publish→App flow, state transitions, identity contract and rollback/reconsent behavior.
- [ ] **Step 5: Run the full repository check, Admin build, backend tests and RN focused identity suite; commit `feat: add admin task monitoring and lifecycle docs`**.

### Task 6: Whole-flow verification and release handoff

**Files:**
- Modify: `docs/handoffs/CURRENT.md`
- Create: `docs/reviews/2026-10-29-admin-console-verification.md`

- [ ] **Step 1: Run `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`** and retain the complete log.
- [ ] **Step 2: Run isolated PostgreSQL migrations 001–048 and HTTP integration tests** for registration, review, publish, bootstrap/sync, user consent, execution, unpublish and reconsent.
- [ ] **Step 3: Build and preview Admin locally**, verify every module and all permission/error/empty states with real API responses.
- [ ] **Step 4: Build/install the fixed iPhone 17 simulator**, verify all Agent surfaces use the same published identity and missing/stale identity shows the contract error.
- [ ] **Step 5: Record evidence, remaining limitations and explicit production/TestFlight authorization boundaries in the handoff; do not deploy or upload from this plan.

