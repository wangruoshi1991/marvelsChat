# Agent 发布与原位重新授权核查

日期：2026-11-11。本轮仅本地修复和隔离验证，不部署、生产发布、付费调用、替真实用户同意、提交或推送。保留此前工作区修改。

## 根因与修复

- `setAgentAccessThroughProduct` 和产品 repository 原已支持明确 `productVersionId` 的原位 consent。相同运行版本/权限下，展示身份和产品新版本发布不应迫使旧用户解绑；仍有效的精确旧授权继续使用。运行版本或权限变化则必须重新同意，不能自动加权。
- 真实新空 PostgreSQL 58 项迁移后复现：用户已同意旧产品（0.1.3），发布另一个产品绑定 0.1.4 与 `media:image:generate` 后，旧 grant 账本仍为 enabled、投影应识别 unavailable。用户明确同意新产品却在 `reconcileUserAgentProjection` 返回 `409 IDENTITY_CONFLICT`：它将所有 stored-enabled 历史产品直接聚合，旧失效身份阻断当前 consent。
- 修复只聚合当前 published、依赖可执行、产品合同及完整 scope 与 entitlement 精确一致的产品版本。失效旧 grant 保留原账本状态，不扩权、不自动升级，也不再污染当前 Agent 的显示身份/权限。原会话复用不变。
- 后端相关错误文案改为在“我”重新确认 Agent 权限；错误码及访问门禁不变。客户端的显式原位入口与多产品选择由对应 RN 变更负责。
- RN共享判断补齐同权限运行版本升级：新产品合同有效、同产品旧授权已失效且无仍有效enabled授权时，也提供明确“重新同意”；旧有效授权及纯身份修订仍可继续，不迫使每次发布重新同意。此分支新增六项回归，最终RN四套114项通过，独立审查再跑其中两套61项通过。
- 精确撤销补修：Agent-level service 原先在 `enabled:false` 时丢弃 `productVersionId`，使跨历史产品的明确当前版本撤销也报歧义。回归先 RED（收到 `null` 而非所选版本），再保留版本过滤和传给 `disableEntitlement`；无明确版本的歧义仍拒绝，不撤其他产品。

## 当前生产只读证据

- 根任务通过正常已登录后台读取：漫画 release `0.1.4` 为 published/ready，包含 `media:image:generate`，详情关联产品为“尚未绑定产品”；现有漫画产品仍为 `0.1.3` published，仅绑定 `0.1.3` release 与六项旧权限。
- 因此当前线上漫画目录缺失的已证实原因是新 release 未绑定到当前已发布产品，并非图片代码或上传 Build 自动丢失。此检查未执行发布；后续需明确产品版本上架范围，用户仍须自己在 App 同意新增图片权限。

## 各Agent当前能证明的范围

下表把本轮公开目录、当前源码声明和真实模型验收分开。公开目录可见只证明已通过目录投影，不能证明这个账号已有授权、Provider可用或任务实际成功。本轮没有新增付费调用，也没有替真实用户添加Agent。

| Agent | 本轮公开目录 | 当前实现/使用边界 | 尚待真实验收 |
| --- | --- | --- | --- |
| 妙讯管家0.3.3 | 可见 | 问答、文字计划、意图分流和已有协作调度 | 用户实际会话、明确授权下的模型与协作成果 |
| 相册管理0.3.2 | 可见 | 私有素材检索和明确选择；另需媒体AI同意、索引及检索服务 | 当前账号检索、无匹配、撤权和服务故障 |
| 文件预处理0.2.0 | 可见 | 明确选择并成功解析的UTF-8文本摘要/整理 | 实际上传→解析→授权→摘要；不声称任意二进制文件解析 |
| 建站0.3.4 | 可见 | 私有结构草稿，用户预览确认后保存 | 当前账号实际素材、模型草稿与确认持久化 |
| 3D形象顾问1.0.1 | 可见 | 文字准备/结果理解建议；实际3D生成另在“我的模样” | 顾问模型；原生3D完整链需单独验收 |
| 形象顾问0.1.3 | 可见 | 文字形象与审美建议，不直接改资料或成图 | 当前账号模型答复 |
| 视频制作0.1.3 | 可见 | 脚本与镜头表，不渲染视频成片 | 明确素材→模型脚本 |
| UI-Agent0.1.0 | 可见；后台产品/release已发布 | 独立权限、白名单偏好预览，用户确认后才生效 | 真机添加失败的实际错误、真实模型→预览→确认→撤销/重置 |
| 漫画0.1.4 | 缺失；新release无产品 | 文字分镜与确认后的独立图片队列已接入；图片scope必须另行明确同意 | 正确产品上架→本人授权→App真实成图与私图隔离 |
| 内部媒体检索0.1.0 | 非普通聊天目录 | 作为受控检索服务使用，不提供普通聊天runtime | 通过相册Agent和既有检索入口验收 |

本地定向合同/权限测试通过不能把这一列全部改为“线上可用”。用户当前UI-Agent无法添加尚缺其真机错误响应；本轮修复了已证实的多产品选择不一致与预览入口遗漏，仍需新客户端和实际账号复验。

## 本轮测试边界

- 新增 `backend/test/agent-product-reconsent-postgres.test.js`；`RUN_AGENT_PRODUCT_RECONSENT_POSTGRES=1` 仅允许 loopback 的专用 `*_migration_test` 数据库。RED：发布不扩权子测通过，显式新 consent 返回预期 `IDENTITY_CONFLICT`；3 项合计 1 通过、2 失败（含父测试），0 跳过。最终 GREEN 在另一全新数据库 `audit_product_reconsent_final_migration_test` 迁移 58/58，4/4 通过，覆盖发布不扩权、显式当前 consent/原会话复用、精确撤销且旧失效 grant 不复活。既有 `publishing-lifecycle-postgres.test.js` 在独立新库迁移 58/58 后 10/10 通过，确认同 runtime 身份修订仍保留原授权、同产品原位升级及暂停/撤权序列。两套零跳过；独立 PG 已精确停止。
- Backend 发布/访问/幂等/UI 偏好定向 75/75；Agent runtime/readiness/授权/相册读取 86/86；Agents 全量 57/57，通过且零跳过。模型 runtime 使用显式测试传输，不产生付费调用。
- 逐 Agent registry 和 workspace executor 声明重新读取：10 个注册项；漫画 `comic.storyboard` 与独立图片 scope，UI Agent 专用 `plan` 预览，内部 `media-retrieval` 不提供普通聊天 runtime，视频脚本、3D 顾问与形象建议继续保留既有文字能力边界。源码及合同测试不等于线上用户/Provider 实际可用。
- 真实 PostgreSQL 脱敏证据：`/private/var/folders/k2/bnl6hg557j761ylt5szlbbjm0000gn/T/miaoxun-audit-pg-20261111-uhearlm1/reconsent-final-receipt.json`，同目录 `product_reconsent_final_test.log`、`publishing_lifecycle_final_test.log`。源码语法检查 429 文件、目标 ESLint 与 `git diff --check` 通过。

生产漫画缺失的精确 release/product 状态、线上 UI-Agent 添加结果、App 真机 consent 与真实模型任务仍按根任务当前证据分别记录。

## 修改文件与最终集成证据

- RN选择/确认/session：`MiaoxunRN/src/features/agents/agentAccess.ts`、`useAgentAccessConfirmation.ts`、`src/features/session/useMiaoxunSession.ts`；展示：`src/features/station/StationAgentsPanel.tsx`、`StationAgentCards.tsx`。回归：`MiaoxunRN/__tests__/agentAccessConfirmation.test.tsx`、`sessionSync.test.tsx`、`stationModuleManagement.test.tsx`。
- Backend投影与精确撤销：`backend/src/product-catalog-repository.js`、`agent-publishing-service.js`；回归：`backend/test/agent-product-access.test.js`、新增`agent-product-reconsent-postgres.test.js`。
- 原位确认文案：`backend/src/agent-workspace-service.js`、`ai-agent-access.js`、`ai-message-task-service.js`、`ai-site-task-service.js`、`repositories.js`、`routes/message-routes.js`。错误码、读取/派发权限与审计合同不变。
- 文档：`docs/admin.md`、`docs/README.md`、`docs/handoffs/CURRENT.md`、本记录和`2026-11-11-current-state-audit.md`；交互8文件另见`2026-11-11-gesture-flow-audit.md`，上一阶段目录诊断与UI-Agent预览改动另见同日对应记录。没有新迁移或配置项，不新增用户权限声明。

最终整仓日志`/tmp/miaoxun-interaction-20261111-523yM6/repository-check-final.log`退出0（Backend1136通过/376门控跳过，RN99套1289项，Agents57、Admin52、Avatar Web29、检索Web4）；独立PG14项另列，不把跳过算通过。同权限升级回归另修改`MiaoxunRN/__tests__/agentProductAccess.test.ts`；独立审查无未解决P1/P2/P3。iOS仅构建退出0，源码前后摘要一致、原App不变，最终证据`MiaoxunDevelopment/1139656e744d/builds/2026-11-11T02-54-49-619Z/build.json`；未安装、启动或验收本次候选的实际触控。较早1283项及02:43构建在最后六项回归前，仅作中间记录。
