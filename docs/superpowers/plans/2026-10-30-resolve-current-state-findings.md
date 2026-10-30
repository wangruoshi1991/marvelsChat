# 妙讯当前问题收敛实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 收敛当前工作区已识别的发布合同、产品目录、RN/Android 配置、文档漂移和可验证性问题，并把无法在仓库内完成的真机/生产事项记录为明确阻塞。

**Architecture:** 保持现有单体边界。后端继续由 registry、release、product、entitlement 四层合同决定执行资格；目录投影只暴露可执行且合同当前的产品。RN 只消费 bootstrap/sync 的真实目录与 entitlement，Android 使用显式 API origin；文档统一指向当前交接而不是历史快照。

**Tech Stack:** Node.js 20+/Express/PostgreSQL、React Native 0.87.1/TypeScript、Vite、PostgreSQL migrations、Node test/Jest。

**Spec:** `docs/handoffs/CURRENT.md` 当前工作区章节、`AGENTS.md` 以及用户本轮“所有问题都要解决”的授权。

## Global Constraints

- 保留所有已有修改和新增文件；不得 reset、clean、覆盖、删除、提交或推送。
- 不部署生产、不上传 TestFlight、不调用付费模型、不输出密钥或真实账号信息。
- 普通 Agent 必须经过已发布 product、显式 consent、entitlement 和当前 release 合同；管理员不能替用户启用。
- 真实错误必须显式返回；不添加假数据、旧授权兼容、静默 fallback 或旧头像兜底。
- 迁移 SQL、历史资产和历史审计证据不得删除。
- 每项代码行为先添加会失败的回归测试，再写最小实现；测试和文档必须与 API/数据库/RN/Admin 变更同步。
- 现有本机数据库只有迁移 026；新链路只在隔离 `_migration_test` PostgreSQL 中验证，不直接升级共享本机库。
- 完成后必须更新 `docs/handoffs/CURRENT.md`，并运行 `git diff --check` 与 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`；环境门控测试的跳过项必须单独列出。

### Task 1: 产品目录只暴露当前可执行合同

**Files:**
- Modify: `backend/src/product-catalog-repository.js`
- Modify: `backend/src/product-catalog-projection.js`
- Test: `backend/test/agent-product-access.test.js`
- Test: `backend/test/agent-publishing-service.test.js`

**Interfaces:** `listProducts({ includeUnpublished: false })`、`getPublishedProductCatalog(userId)` 和产品启用接口继续保持现有返回形状；新增的过滤只减少不可用目录，不改变已发布且合同当前产品的 DTO。

- [x] 写失败测试：已发布产品依赖 release 为 paused/unpublished、registry version/scopes 不一致或 readiness 不通过时，不出现在公开 catalog；已授权 entitlement 保留历史但标记不可用，执行仍返回明确错误。
- [x] 运行定向 backend 测试确认失败原因是当前 repository/projection 未过滤依赖。
- [x] 在 repository/projection 中集中实现 dependency current gate，避免 App、产品启用和执行阶段各自复制不同条件。
- [x] 写失败测试：产品 contract hash 对 `identity_snapshot` 的 canonical identity 变化敏感，旧 hash 不能发布或启用。
- [x] 将 identity snapshot 纳入产品合同计算和发布门禁，保持历史 hash 不被静默重写。
- [x] 运行 `backend/test/agent-product-access.test.js`、`agent-publishing-service.test.js`、`publishing-idempotency.test.js` 和 backend syntax check；20/20 通过，schema alias scoped re-review 通过。

### Task 2: RN 产品目录消费与 Android 显式配置

**Files:**
- Modify: `MiaoxunRN/src/features/session/useMiaoxunSession.ts`
- Modify: `MiaoxunRN/src/features/station/StationAgentsPanel.tsx`
- Modify: 相关 RN Agent/授权组件和类型文件（仅在测试证明需要时）
- Modify: `MiaoxunRN/android/app/build.gradle`
- Test: `MiaoxunRN/__tests__/sessionSync.test.tsx`
- Test: 相关 Agent access/identity tests

**Interfaces:** session 对外继续提供 `products`、`entitlements`、`catalogRevision`；Agent 推荐和授权 UI 必须使用同一真实 product/entitlement 状态，不在客户端创建或扩展授权。

- [x] 写失败测试：catalog 中产品暂停、entitlement unavailable/reconsent_required 时，RN 不把它显示为可直接启用的推荐项，并展示明确状态。
- [x] 写失败测试：可用产品和 entitlement 正常时保持现有 Agent identity、scope confirmation 和幂等请求行为。
- [x] 调整 RN 目录选择/授权展示，使 products 与 entitlements 真正参与可启用状态计算；不引入前端权限兜底。
- [x] 写失败测试：Android 没有显式 `MIAOXUN_API_BASE_URL` 时构建配置不提供正式 IP 默认值；非法/缺失 origin 进入显式失败。
- [x] 移除 Android Gradle 的隐式 API origin 默认值，保留现有 ConfigModule 校验和文档示例。
- [x] 运行 RN 定向 Jest、`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run format:check`。

### Task 3: 文档和运行交接收敛

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`（仅当索引需要）
- Modify: `docs/mobile-launch-checklist.md`
- Modify: `docs/ios.md`
- Modify: `docs/agents.md`
- Modify: `docs/architecture.md`
- Modify: `docs/database.md`
- Modify: `docs/project-map.md`
- Modify: `docs/handoffs/CURRENT.md`

- [x] 将固定 Build 42、固定旧 HEAD、旧生产 040–043 描述改为“以 CURRENT 当前章节和实际代码/迁移为准”，保留历史章节和审计证据。
- [x] 统一 README、iOS 文档和 Android 文档的 API origin 约定：构建时显式注入，禁止静默默认；明确当前源码、隔离数据库、线上历史制品的边界。
- [x] 记录本轮实际运行证据：本机 backend 未启动、本机数据库迁移 026、隔离迁移/HTTP 检查需要独立运行；不写入秘密、生产账号或私人聊天。
- [x] 增加真机 Build54 验收矩阵和当前阻塞项：设备操作、语音、真实任务、续作、33 个设计状态、TestFlight/生产动作均不由代码变更代替。
- [x] 运行文档引用检查、`git diff --check`。

### Task 4: 隔离 PostgreSQL 和整仓验证

**Files:**
- Inspect/modify only if required: `backend/scripts/check-migration-replay.sh`, `backend/scripts/check-agent-publishing-integration.js`, `scripts/check-repository.sh`
- Evidence: `/tmp/miaoxun-migration-replay-20261030.log`, `/tmp/miaoxun-release-http-20261030.log`, `/tmp/miaoxun-repository-check-20261030.log`

- [x] 在全新 loopback `_migration_test` 数据库串行执行 001–048 首次迁移和重复回放，不触碰当前本机 `marvels_chat`。
- [x] 在同一类隔离库执行 release → product → consent → entitlement → bootstrap/sync → pause/revoke/old-session 门禁验收。
- [x] 显式记录 268 个 PostgreSQL 环境门控测试的实际通过/跳过/失败，不把跳过写成通过。
- [x] 运行最终 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`，保存完整输出。

### Task 5: 外部验收交接

**Files:**
- Modify: `docs/handoffs/CURRENT.md`

- [x] 更新下一步为当前 Build54 真机验收清单：二楼、讯页、妙页、我页、长按、语音、聊天/任务详情、输入框和状态切换。
- [x] 明确仓库内验证不能替代实体 iPhone、TestFlight 状态、生产 health/ready 和真实模型费用边界。
- [x] 最终检查工作区没有被清理，未提交、未推送，所有未闭环事项均有证据和负责人动作。

## 2026-10-30 完成记录

Task 1–5 已完成。产品目录和 release/product/entitlement 合同、RN/Android 显式配置、文档交接、隔离 PostgreSQL/HTTP 验收及整仓检查均已落地并记录在 `docs/handoffs/CURRENT.md`；未清理、提交或推送工作区。

已知外部阻塞仍保留：实体 iPhone 上的 Build54 完整验收尚未闭环；TestFlight 当前状态和设备安装复验不能由本地测试替代；生产 046–048 部署、线上 health/ready 与用户流程尚未执行；真实模型调用和费用核对未进行。上述事项需要独立的设备、发布、生产和费用授权，不能用隔离库或仓库测试宣称完成。

## 2026-10-30 收尾补审

- 发布链路复核发现产品级撤权路由曾绕过媒体产品生命周期 hook；已补 `agentPublishingService.disableProduct`、路由调用和回归测试，并在隔离 HTTP 链路中验证产品撤权后的 entitlement 与 Agent projection。
- 文档/config 复审补齐 `MiaoxunRN/README.md`、移动端上线清单、iOS、Agent、AI 交互、文件处理和部署说明中的当前工作区/历史生产边界；Android 示例显式传入 `MIAOXUN_API_BASE_URL`。
