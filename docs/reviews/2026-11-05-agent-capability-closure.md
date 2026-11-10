# 2026-11-05 Agent能力整理与真实入口修复

本阶段核对当前源码、公共Agent目录和独立本地PostgreSQL，不修改生产数据、注册/发布状态或用户授权，不调用外部模型。模型传输仅使用明确标注的合同fixture；数据库、服务、路由、授权、原消息保护和结果持久化使用真实代码。不能把合同测试当作模型质量或真机验收。

## 当前能力目录

2026-11-05实读`agents/registry.js`共10项；同日HTTPS `GET /api/agents`返回200及9个已发布项，内部检索不在公开普通聊天目录。此只读快照不代表未来发布状态。

| Agent / 版本 | 用户入口与实际能力 | 当前能力边界 |
| --- | --- | --- |
| 妙讯管家 / 0.3.3 | 管家会话；需求澄清、动态选人、依赖编排、文字计划/汇总，转交UI偏好 | 不执行预订、外发消息、日历写入或任意网页查询 |
| 相册管理 / 0.3.2 | 我页添加并同意云端索引；会话查找；协作`media.select` | 只检索已上传且获准的素材；不是读取本机全部照片，也不自动移动/删除 |
| 文件预处理 / 0.2.0 | 文件上传后的原Agent会话；`file.summary`及`text.summarize` | 支持已完整保存的UTF-8 TXT/MD/JSON/CSV/TSV；未接PDF/DOCX解析 |
| 建站 / 0.3.4 | 专属会话或协作`site.compose`，严格结构草稿、预览确认保存 | 不执行页面声明的链接/发送/关注意图，不生成任意代码 |
| 漫画日记 / 0.1.3 | 专属会话、`comic.storyboard`文字分镜；明确日记流程可保存结构化草稿 | 没有最终漫画出图 |
| 视频制作 / 0.1.3 | 专属会话、`video.script`文字脚本/镜头表 | 没有视频成片或渲染供应商 |
| 形象顾问 / 0.1.3 | 专属会话、`character.advise`文字形象建议 | 不直接生成头像、改用户资料或读取未选私聊 |
| 3D形象顾问 / 1.0.1 | 专属会话、`model.advise`照片准备和结果理解建议 | 不启动3D生成；App独立3D产品流程另有服务与权限 |
| UI Agent / 0.1.0 | 管家转交、设置偏好；本阶段补通专属会话→受保护预览卡 | 只生成白名单patch，用户确认后才写偏好；本阶段修改尚未部署 |
| 媒体检索 / 0.1.0（内部） | 相册Agent受控`search_media`工具及站点媒体检索API，索引图片/视频帧 | 不是全网搜索；无普通聊天/分派模式，不直接作为第10个可添加伙伴 |

参与者按任务需要选择，不固定两人。节点并发上限与参与人数分开；动态并发的真实样例及1/2/3/4/5/19节点隔离证据见[客户端验收](2026-11-05-collaboration-client-acceptance.md)。

## UI-Agent专属聊天断链与修复

原先所有非管家Agent消息均进入`createSpecialistMessageService`。该服务要求`dispatch`和已注册workspace执行能力；UI-Agent只实现`plan`和独立预览协议，因此即使产品已发布、用户已授权，直接发消息仍固定返回422 `AI_AGENT_MODE_UNSUPPORTED`。5项新增隔离PostgreSQL回归在修复前全部复现该断链。

当前修复：

- `backend/src/routes/message-routes.js`显式识别UI-Agent，要求AI/UI偏好客户端合同、稳定消息ID和最多1200字本条文字；附件、素材、任务引用及专业续作上下文在消息写入前明确拒绝。
- 复用已有`uiPreferenceService.prepare/persistPrepared`，输入来自真实已保存用户消息。没有先运行普通聊天、专业分派或直接透传模型JSON。
- 预览和回复在同一完成事务绑定，返回已有`uiPreferencePreview.id`，由RN现有`UIPreferenceChatCard`读取；不直接写正式偏好。成功记录该次模型提供的provider、延迟和真实usage，不合成用量。
- `ui-preference-service.js`在实际dispatch前重验当前Agent授权，并支持原消息有效性检查。prepared内部携带本次回执供专属聊天审计，公共preview响应不泄漏回执、权限或Provider信息。
- 同一消息处理中返回409，完成后重放同一回复和预览，不重复调用模型。撤权、来源消息撤回、非法patch、revision变化均不能交付可确认预览。
- 后续复核补齐失败审计：在运行时收到回执及严格解析前保留已知provider和数字usage，非法patch、不完整响应、CAS变化、真实撤权/产品暂停/release下架仍记录已有用量。若原消息在响应中被撤回或软删除，返回404、不写回复或预览；`message-repository.recordDiscardedUIAgentMessageReceipt`只记录无输出的失败run，锁定该用户已失效原消息并通过现有唯一索引幂等，不保存模型正文或非法patch。未收到回执时仍为未知，不推断零费用。此最小补充只覆盖专属UI聊天，不宣称已重做管家转交多次模型调用的聚合记账。

复用现有055预览表和`user_profiles.station_config.uiPreferences`，不新增迁移、环境变量或权限范围；需要新的后端制品。当前TestFlight已有预览卡和合同入口，但本轮其他RN修复仍不在Build59中，不据此宣称整个设备流程通过。

## 媒体检索入口与可用性

正式用户路径是：二楼相册上传素材 → 我页添加相册管理Agent并明确同意`media-retrieval-consent-v1` → Worker建立索引 → 相册Agent会话自然语言查找 → 受保护图片/视频结果（含匹配时间）。没有独立的二楼搜索面板，也没有独立可添加的检索聊天Agent。

`media-retrieval`服务仍完整存在：enable/status/search/reindex/delete API、独立索引Worker、事件、pgvector、来源版本和撤回清除。默认关闭或配置不齐时拒绝调用，是显式门禁，不应删除权限校验或换成文件名/标签假检索。部署及配置入口：

- 共享文字查询解析：`NEW_API_BASE_URL/KEY/MODEL`。
- 独立视觉与向量配置：`MEDIA_RETRIEVAL_DASHSCOPE_API_KEY/BASE_URL`、caption/embedding模型及版本；必须同一1024维图文空间，配置样例在`backend/.env.example`，不能把文字模型替换成视觉模型假定兼容。
- `MEDIA_RETRIEVAL_ENABLED`和`MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED`；后台检索控制的operator/queue/provider/lifecycle；正数预留及可选限额；Worker心跳、OSS和pgvector。上限可为null，不把本阶段开发投入重新设为固定token或金额上限。
- 用户主动同意及当前内容epoch；改配置、模型或供应商后需受控重建索引，历史索引不能混用。

本轮没有读取生产私有控制、供应商密钥、用户媒体或启用Provider，因此不声称线上视觉索引已开放。未执行`media-retrieval-service-e2e.js --allow-paid`；它需要实际受审的公开图片/视频与现有供应商凭据，且会触发真实调用。当前可继续设备正常用户路径及已有测试环境配置核验。

## 本阶段验证

独立环境为本机PostgreSQL18.4、loopback端口54387、专用`*_migration_test`数据库，56项迁移；未使用共享开发库或生产库。

| 检查 | 结果与实际覆盖 |
| --- | --- |
| Agents全量`MIAOXUN_DOTENV_ENABLED=false npm test` | 55/55；声明、提示词、dispatch/contribute、registry及内部检索合同；不代表模型质量 |
| Backend检索/相册/runtime/capabilities定向 | 317通过、0失败；1项数据库迁移门控另外专跑，不算通过 |
| `RUN_MEDIA_RETRIEVAL_MIGRATION_INTEGRATION=1`专用空库 | 12/12、0跳过；真实pgvector索引/搜索事务、重放、素材变化、撤权epoch、跨用户保护、完整purge；Provider/向量为显式fixture |
| UI/专业消息/管家专用新鲜隔离库 | 最终99/99、0跳过；含12项UI消息与已知用量失败审计、实际撤权/产品暂停/release下架、原消息响应中撤回/软删除、既有管家和专业消息回归 |
| 后端语法与定向ESLint/diff | 语法397文件、定向ESLint和`git diff --check`通过；全仓最终检查由主任务统一运行 |

核心命令（`DATABASE_URL`仅指上述专用空库/本机库）：

```sh
cd agents
MIAOXUN_DOTENV_ENABLED=false npm test
cd ../backend
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false node --test test/media-retrieval-*.test.js test/album-assistant-*.test.js test/agent-readiness.test.js test/agent-runtime.test.js test/agent-workspace-capabilities.test.js test/agent-workspace-dynamic.test.js
MIAOXUN_DOTENV_ENABLED=false RUN_MEDIA_RETRIEVAL_MIGRATION_INTEGRATION=1 MEDIA_RETRIEVAL_MIGRATION_DATABASE_URL="$DATABASE_URL" NODE_ENV=test DEFAULT_ADMIN_ENABLED=false node --test test/media-retrieval-migration.test.js
MIAOXUN_DOTENV_ENABLED=false RUN_AI_TASK_INTEGRATION=1 RUN_SPECIALIST_MESSAGE_INTEGRATION=1 NODE_ENV=test DEFAULT_ADMIN_ENABLED=false node --test --test-concurrency=1 test/ui-agent-message-integration.test.js test/ui-preference-service.test.js test/ui-preference-routes.test.js test/butler-workspace-integration.test.js test/agent-chat-integration.test.js test/specialist-message-integration.test.js
```

第一轮93项合并预检重用了先前Butler夹具库，命中其固定release主键重复，属于环境不满足“新鲜一次性库”；没有清共享数据或放宽测试，改用新建全56迁移专库后完整93项通过。

日志根目录：`/tmp/miaoxun-agent-acceptance-20261105.ViR2ol/`。初轮93项为`ui-specialist-evidence-pg.log`；审计复核在另建`ui_receipt_combined_migration_test`完整应用56迁移后最终99/99（`ui-receipt-combined-final-pg.log`），UI专属消息12项和服务32项另跑44/44（`ui-receipt-final-pg.log`）。增加usage断言后发现原撤权夹具用了数据库不允许的`revoked`值、只测到数据库错误；已改用正式disableEntitlement和发布生命周期操作，实际竞争场景重新通过。原消息丢弃审计两项先失败再修复，日志为`ui-receipt-validated-red-pg.log`和`ui-receipt-green-pg.log`。隔离测试数据与会话按各套件删除，最终专库用户/会话/预览均0；测试集群已正常停止，`pg_ctl status`确认无运行进程。没有生产部署、提交、推送、上传或供应商调用。待办为真实供应商视觉质量及设备UI-Agent预览确认/重启/撤销恢复，不重复宣称这些已经通过。
