# 漫画图片生成本地实现与验收（2026-11-10）

后续用户已另行授权接入指定媒体密钥，真实文字生图、参考图编辑与正式Provider验证均已完成，见[真实生图记录](2026-11-10-cicadas-comic-live.md)。下文“零真实调用/无适配器”等描述是本次本地实现阶段的历史边界，最新状态以该记录和CURRENT为准。

用户已回复“通过”，本轮落实独立媒体 Provider 和漫画异步成图任务。所有改动留在当前工作区；没有提交、推送、生产数据库/服务变更、Agent release/product 发布、TestFlight 上传或真实供应商请求。原有提交205218e仅包含设计，不能当作本轮实现制品。

## 实际行为

- 文字分镜保存与图片任务分开。用户确认格数后创建持久任务；API不在请求内等待供应商，Worker按格顺序执行。
- 公开漫画合同 `comicRenders:1` / `X-Miaoxun-Comic-Renders:1`，内部队列漫画row是v2。现有 `aiTasks:1` 列表/详情/事件/决策都排除漫画，旧客户端不会误收新状态。
- 058迁移加入逐格owner外键、任务kind外键、独立Worker能力心跳及无账号级联的清理journal。每次派发和最终存储绑定都复核当前产品授权、Agent版本和显式选择素材版本。
- 成功图片私有保存至station_media_assets；不保存Provider URL、不自动发布或检索索引。PNG/JPEG/WebP输入限制16MiB/16MP，去元数据转WebP，最长边2048。图片顺序保持用户选定的引用次序。
- 单格已知失败可形成部分完成；授权/来源变化停止未派发格；结果未知停止整个任务，不自动重试。queued-only取消使用revision CAS，2/3路并发仅一次成功，其余409；运行中不声称已取消。
- OSS写入与数据库提交无法同事务：pending journal在上传前落库；完成时asset可读/frame成功/journal stored同事务。提交响应丢失时先查journal，不能查明则显式未知并停止后续生成。清理失败保留意图；账号删除后仍可清理孤儿对象，活资产/活租约不清理。
- RN提供确认、逐格状态/私有图片、部分成功/未知说明、排队取消、前后台恢复和错误后手动刷新。权限变化清掉不可访问任务；轮询保留图片实例，终态停止轮询。独立scope显示“生成图片”。
- `comic-diary`源码0.1.4增加comic.render和media:image:generate。层级scope按完整字符串精确授权，无通配符。未发布同版产品或未同意新权限时不能使用。

## 配置与未接入部分

独立配置入口在backend/.env.example及deploy/miaoxun-prod.env.example：MEDIA_GENERATION_ENABLED/PROVIDER/API_BASE_URL/API_KEY/IMAGE_MODEL/TIMEOUT_MS。Key仅在服务端受限secret环境，无客户端或Admin密钥表单。不设置token/费用上限；未知用量保持未知。

源码没有已核验的图片HTTP适配器，默认关闭且零网络请求，填满环境变量也不能启用未知协议。供应商HTTPS host、endpoint、model、认证、请求/响应、输入图片、异步job/下载、真实usage、幂等/超时/取消合同仍待核实；此前聊天中暴露的Key未使用，真实联调前需轮换。视频Agent继续只提供脚本/镜头规划。测试中Provider/OSS图片fixture只是隔离测试设施，不能称为真实成图或线上能力。

## 验证命令与结果

- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`：最终通过，包含Backend/Agents/Admin和Web工程检查、Admin build、RN Prettier/ESLint/TypeScript/Jest；RN99套1261项通过。默认门控的PG跳过项单独列出，未计作数据库通过。
- `MIAOXUN_DOTENV_ENABLED=false RUN_COMIC_RENDER_INTEGRATION=1 DATABASE_URL=<本机隔离数据库> node --test backend/test/comic-render-repository.integration.test.js`：14/14通过，0跳过。全空独立数据库按顺序执行全部58迁移，覆盖私有输出持久化、幂等、owner/授权/来源、部分/未知、恢复事件、无重放、queued取消并发及账户孤儿清理。
- `MIAOXUN_DOTENV_ENABLED=false RUN_AI_TASK_REPOSITORY_INTEGRATION=1 AI_TASK_REPOSITORY_DATABASE_URL=<另一个全空本机数据库> node --test backend/test/ai-task-repository.integration.test.js`：12/12通过，0跳过，重新迁移最新058。
- `MIAOXUN_DOTENV_ENABLED=false DATABASE_URL=<第三个本机隔离数据库> node backend/scripts/db-migrate.js`，再运行 `RUN_COMIC_DIARY_ACCESS_INTEGRATION=1` 对应comic-diary-access.integration.test.js：17/17通过，0跳过。
- Provider/配置/权限/Agent/readiness定向77/77；RN新合同/UI40/40，连同原合同四套82/82。完整整仓检查涵盖这些非PG测试。
- `node scripts/miaoxun-development.mjs ios --build-only`：iPhone17/iOS26.5 Debug候选编译成功，现有安装/数据未替换，没有启动App或调用生产；不是设备交互或真实Provider验收。证据位于本机MiaoxunDevelopment/1139656e744d/builds/2026-11-10T09-10-07-181Z/build.json。
- `git diff --check`：通过。最终跨层只读复审无新增P1/P2；额外真实PG回归验证取消共享锁升级死锁，现使用排他锁。

## 下一步与发布边界

1. 核实实际图片供应商合同，安全轮换/配置Key后再写专用适配器，并做隔离真实成图验收。
2. 待单独授权准备后端058/API/Worker制品、迁移预检/回滚点及生产部署；同版comic-diary release/product需要正式发布和用户重新同意。
3. 新客户端需要配套发布与实体设备验收；本轮仅编译模拟器候选，不代表TestFlight/线上已更新。

## 实现取舍

- 层级scope按完整字符串精确匹配，以承载独立图片权限；不包含通配符。若改为另一命名规范，需要同步发布/授权schema和Agent合同。
- 内部队列v2与独立公开漫画v1并存，旧任务合同隔离；若合并，需升级旧客户端解析及服务端合同。
- 未派发的格显示skipped/未生成，区分queued与unknown；若移除需同步数据库、API和RN状态。
- 代码留在未提交工作区，便于本轮审阅；后续生成正式制品前需要另行确认提交/推送范围。

## 实际修改文件

### 后端与数据库

- `backend/.env.example`
- `backend/database/058_comic_image_generation.sql`
- `backend/src/agent-readiness-service.js`
- `backend/src/ai-client-contract.js`
- `backend/src/ai-task-repository.js`
- `backend/src/ai-task-runner.js`
- `backend/src/ai-task-worker-status-repository.js`
- `backend/src/ai-task-worker.js`
- `backend/src/comic-image-provider.js`
- `backend/src/comic-render-executor.js`
- `backend/src/comic-render-repository.js`
- `backend/src/comic-render-service.js`
- `backend/src/comic-render-storage.js`
- `backend/src/config.js`
- `backend/src/routes/comic-render-routes.js`
- `backend/src/routes/station-routes.js`
- `backend/src/schemas.js`
- `backend/test/agent-readiness.test.js`
- `backend/test/agent-release-contract.test.js`
- `backend/test/ai-client-contract.test.js`
- `backend/test/ai-task-runner.test.js`
- `backend/test/ai-task-worker-status.test.js`
- `backend/test/ai-task-worker.test.js`
- `backend/test/comic-image-provider.test.js`
- `backend/test/comic-render-contract.test.js`
- `backend/test/comic-render-executor.test.js`
- `backend/test/comic-render-repository.integration.test.js`
- `backend/test/comic-render-routes.test.js`
- `backend/test/comic-render-storage.test.js`
- `backend/test/server-config.test.js`

### Agent

- `agents/comic-diary.agent.js`
- `agents/registry.js`
- `agents/test/registry.test.js`

### 正式移动端

- `MiaoxunRN/__fixtures__/comicRender.ts`
- `MiaoxunRN/__tests__/comicRenderContract.test.ts`
- `MiaoxunRN/__tests__/comicRenderPanel.test.tsx`
- `MiaoxunRN/src/features/agents/agentPresentation.ts`
- `MiaoxunRN/src/features/station/StationComicDiaryPanel.tsx`
- `MiaoxunRN/src/features/station/StationComicRenderPanel.tsx`
- `MiaoxunRN/src/features/station/useComicRenderTasks.ts`
- `MiaoxunRN/src/models/api.ts`
- `MiaoxunRN/src/models/comicRender.ts`
- `MiaoxunRN/src/services/aiContract.ts`
- `MiaoxunRN/src/services/api/comicRenderApi.ts`
- `MiaoxunRN/src/services/api/stationAgentApi.ts`

### 部署配置样例

- `deploy/miaoxun-prod.env.example`

### 文档

- `docs/README.md`
- `docs/agent-model-configuration.md`
- `docs/agents.md`
- `docs/handoffs/CURRENT.md`
- `docs/reviews/2026-11-10-comic-image-generation.md`
- `docs/superpowers/plans/2026-11-10-comic-image-generation.md`
- `docs/superpowers/specs/2026-11-10-comic-image-generation-design.md`
