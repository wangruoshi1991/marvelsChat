# 2026-11-06 检索 Agent 入口续验

本阶段仅核对源码、隔离PostgreSQL及loopback HTTP合同，不读取用户相册、不修改生产、不部署、不调用供应商。

## 入口和能力边界

`media-retrieval`仍是内部媒体索引/检索Agent，不是独立可添加的普通聊天伙伴，也不是全网搜索。用户从二楼上传图片/视频，添加相册管理Agent并明确同意云端索引，Worker完成索引后，在相册会话查找，或由管家派发`album-manager/media.select`协作节点。相册Agent只使用受控`list_albums`及`search_media`工具；选中相册限制、当前内容版本、owner、撤权和真实Provider状态不能通过前端开关绕过。

源码入口是`agents/album-manager.agent.js`、`backend/src/album-assistant-tools.js`、`backend/src/media-retrieval-user-service.js`、`backend/src/media-retrieval-worker.js`、`MiaoxunRN/src/features/messages/AlbumAssistantStatus.tsx`及`AlbumAssistantResults.tsx`。未授权、无素材、索引中、部分不可用、检索失败与空结果已区分；不能把空查询结果解释为相册没有素材。

## 本次修复

- 私有开发验证Web的搜索请求漏发必填`Idempotency-Key`，后端schema会拒绝，原有fixture测试没有覆盖请求头。API现在强制显式操作键并在请求前校验8–160位字符；调用点每次用户新搜索生成一次键，不自动重试。API不会自生成键，调用方同次重放可沿用原键，后端幂等语义未改变。
- Web统一为检索和事件接口声明合同2。事件API当前没有旧客户端合同门禁，此项只保持声明一致，不声称曾固定失败。
- RN搜索是该服务唯一漏发合同2头的请求，现补齐。当前Build 45+原可通过后端构建号门禁，因此不能把这项称为当前正式安装包固定失败的根因。
- 没有修改后端业务、迁移、授权范围或供应商配置；没有把Web当作正式App入口。

## 验证

| 项目 | 结果 | 范围 |
| --- | --- | --- |
| Web合同测试 | 先2失败后4/4通过 | 必填操作键、拒绝非法键、同键重放/新键、合同2、脱敏错误、禁止持久化bearer |
| RN检索和相册定向 | 先1失败后21/21通过 | search合同头及已有相册状态/结果展示回归 |
| 真实Express/HTTP客户端贯通 | 1/1通过 | 实际Web API→loopback→真实路由门禁/schema，明确测试认证，冻结Provider结果fixture；漏键400且不进入service |
| Backend相册/检索公共合同 | 23/23通过 | 工具范围、撤权、索引状态、真实结果引用与公开错误合同 |
| 专用空库pgvector迁移集成 | 12/12、0跳过 | 全迁移重复应用，真实owner隔离、搜索事务重放、epoch/素材变化、撤权purge；Provider与向量为显式fixture |
| Web语法与生产构建 | 通过 | 5文件语法、Vite构建 |

命令：

```sh
cd media-retrieval-web && npm test && npm run check && npm run build
cd ../MiaoxunRN && npm test -- --runInBand __tests__/mediaRetrievalApi.test.ts __tests__/albumAssistant.test.tsx
cd ../backend
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false node --test test/media-retrieval-client-http.test.js test/media-retrieval-public-contract.test.js test/album-assistant-tools.test.js test/album-assistant-access-service.test.js test/album-assistant-result-access.test.js
MIAOXUN_DOTENV_ENABLED=false RUN_MEDIA_RETRIEVAL_MIGRATION_INTEGRATION=1 MEDIA_RETRIEVAL_MIGRATION_DATABASE_URL="$ISOLATED_DATABASE_URL" NODE_ENV=test DEFAULT_ADMIN_ENABLED=false node --test test/media-retrieval-migration.test.js
```

专用PostgreSQL仅监听loopback54389，数据库`retrieval_followup_migration_test`；日志`/tmp/miaoxun-retrieval-followup-20261106-migration.log`及`/tmp/miaoxun-retrieval-followup-20261106-contract.log`（最终HTTP加公共合同合跑24/24）。测试不使用共享开发库或生产库。完成后专库activeSessions为0，临时Express服务关闭，PostgreSQL已正常停止、`pg_ctl status`确认无运行进程。冻结fixture和通过路由不是视觉质量证据；当前真实图片/视频供应商质量、手机实际上传→索引→聊天结果仍待受控验收。

发布边界：RN修改需要下版客户端；私有Web工具仅需重新构建，不需要后端部署或数据库迁移。本次不改变模型/费用限制。
