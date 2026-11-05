# UI-Agent 与协作贡献配套发布草稿

日期：2026-11-05。状态：`DRAFT / BLOCKED`。这是当前工作区的发布方法审查，不是生产执行记录或操作授权。生产只读核对、真实备份隔离恢复与本地发布授权验证记录见 [发布前证据](2026-11-05-release-preflight-evidence.md)；它们不代表已执行生产迁移、发布正式 Agent、调用付费模型或上传 TestFlight。实际状态仍以 [CURRENT](../handoffs/CURRENT.md)、Git、候选制品及运行检查为准。

## 发布对象和合同

配套对象是同一可追溯 revision 的 API、AI Task Worker、媒体 Worker、`agents/`、`shared/` 和客户端。移动端仍为 `MiaoxunRN/`。当前源码合同为 `aiTasks:1 / siteDocuments:2 / agentWorkspaces:6 / uiPreferences:1`。

| 对象 | 当前源码入口 | 发布前必须证明 |
| --- | --- | --- |
| 新 UI 偏好 | `backend/src/ui-preference-service.js`、`ui-preferences-app-store.js`、`routes/ui-preference-routes.js` | 只由正式预览、确认、重置、撤销流程读写 `user_profiles.station_config.uiPreferences`，包含 revision CAS 和授权复验 |
| 新客户端门控 | `backend/src/ai-client-contract.js`、`MiaoxunRN/src/services/aiContract.ts` | bootstrap 明确返回 `contracts.uiPreferences === 1`；受控 API 要求 `X-Miaoxun-UI-Preferences: 1` |
| 旧 UI 偏好 | `backend/database/051_user_ui_preferences.sql`、`ui-preferences-repository.js`、`/api/me/ui-preferences` | 保留原 `user_ui_preferences` 合同；与新 App 存储隔离，不自动迁移、双写或覆盖 |
| 预览记录 | `backend/database/055_ui_preference_previews.sql` | 新预览表、用户/消息关联、索引及确认/撤销字段；保存的预览和用户确认设置均需纳入备份 |
| Agent 聊天贡献 | `backend/database/056_workspace_agent_contributions.sql`、`agent-workspace-repository.js` | 新索引支持按所属用户/Agent/更新时间读取真实节点；不得写入伪造聊天消息作为贡献 |
| UI-Agent 上架 | `agents/ui-agent.agent.js`、现行 Agent registry/product/release 流程 | 版本、独立权限、release/product、entitlement 和用户明确授权全部可验证；文件存在不代表上线 |

055 不会同步 051 的旧表数据。若要求合并两套历史偏好，应先定义映射、冲突规则、用户确认和独立迁移；本次不能通过直接复制 JSON 代替。旧接口不得被删掉或重指向新存储来隐藏兼容问题。候选测试还应证明旧接口/旧客户端合同保持原有语义，新接口拒绝不匹配客户端。

## 进入维护前的门禁

`scripts/prepare-runtime-release.mjs` 只打包已提交的 HEAD 文件，并拒绝任何已修改或未跟踪文件。055/056与本轮163文件已获准提交为 `cebc1e6d5c7848fc630f1e8453b0c3bfbad774f3`，干净源码生成的正式制品为 `ui-agent-candidate-20261105-cebc1e6`，SHA与284文件核验见 [发布前证据](2026-11-05-release-preflight-evidence.md)。这个本地阶段已完成；不能手工打包后续工作区或删除文件绕过门禁。推送、生产部署、UI-Agent发布、付费真实模型调用及TestFlight上传仍各自按用户明确范围执行。

生产维护前，应准备以下证据，缺一项则保持 `BLOCKED`：

- 当前活动 release、进程真实 cwd、完整旧制品及 manifest、旧迁移文件和账本校验和；不得用本文中的历史版本代替当前检查。
- 新 release 的 `sourceHead/sourceTree/includesWorkingTreeChanges=false`、归档 SHA-256、逐文件 manifest 核验、Linux 锁文件依赖安装和整仓检查结果；后续代码改变须重新冻结与验证。
- 生产备份在独立 PostgreSQL 18 + pgvector 恢复副本中的完整恢复、账本、业务表、序列、owner/ACL 和关键关系检查；同时记录版本、恢复点时间、校验摘要与 RPO/RTO，不记录行内容。
- 恢复副本上只读升级预检通过；056 按真实表规模的建索引耗时、锁等待、磁盘/WAL余量测量，以及明确的维护预算和超时值。
- 已审阅且能使用的 root 管理恢复工具、旧制品、受限环境文件和 storage 关联。正式 runtime 不打包 `scripts/restore-production-database.sh` 或整套备份工具，必须在受限恢复目录单独保留并校验，不能假定新 release 内有这些脚本。
- 旧 App、候选 App 与候选后端的兼容测试和候选构建身份；已有 Build58 不包含当前工作区后续修改，不能用于验收本轮代码。

## 恢复副本预检和规模演练

只在隔离恢复副本执行。副本含真实备份数据，仍须受限访问；不在普通测试日志中输出账号、聊天、偏好 JSON 或连接凭据。独立实例/数据库、禁止外部发送和供应商调用、停止定时任务、禁止连接生产 OSS 写路径，均需在启动任何应用进程前确认。

先按 [备份与恢复](../database-backup.md) 验证 dump 的 SHA/TOC、加密 manifest（如适用）和隔离恢复。不得在恢复副本执行 root 生产恢复脚本；该脚本会终止生产连接并删除配置指向的数据库，不能当演练工具使用。恢复副本也不能使用生产应用身份或沿用生产 `.env`。

预检入口：

```sh
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false \
  npm --prefix backend run ops:ui-preference-upgrade
```

以上命令要求事先用受限方式注入指向独立恢复副本的 `DATABASE_URL`；不得把 URL 明文粘到日志或 Shell 历史。运行前另行核对连接目标与 `SELECT current_database()`。该 CLI 本身没有 loopback/数据库命名/生产目标保护，不能仅因命令叫 preflight 就认为目标安全。关闭 dotenv 是为了防止意外加载 checkout 的配置，不替代目标核验。

脚本以 `REPEATABLE READ READ ONLY` 事务扫描，单语句超时 30 秒，默认每批 500 行；最终回滚只读事务。批次限制和单语句超时都不是总运行时间或生产负载上限。若规模演练超时，不得直接提高生产超时或绕过检查，应先测量并调整经审查的方案。

预检只输出聚合 JSON 和退出码：

| 结果 | 含义与处理 |
| --- | --- |
| `ok:true / UI_PREFERENCE_UPGRADE_READY`，退出 0 | 账本与当前迁移文件匹配；baseline 应为实际 054，pending 应严格等于候选 055/056；`profiles` 各错误计数为 0。不是制品、锁时长、授权或模型验收通过 |
| `UI_PREFERENCE_MIGRATION_BASELINE_INVALID` | 账本缺失、校验和漂移、顺序/数量不符等；停止发布，核对实际制品与历史账本，不修改历史 SQL 或伪造账本 |
| `UI_PREFERENCE_UNTRACKED_SCHEMA` | 055 未登记但已有其表或索引；停止发布，调查来源和实际 schema，不自动删除 |
| `WORKSPACE_CONTRIBUTION_UNTRACKED_INDEX` | 056 未登记但索引同名对象存在；停止发布，核对定义及来源，不把同名当正确 |
| `UI_PREFERENCE_DATA_INVALID` | `invalidStationConfig/invalidPreferences/exhaustedRevision/unsupportedPreferences` 至少一项非零；保留原数据，提出独立有审计的数据修复方案，不静默删字段或归零 revision |
| `UI_PREFERENCE_PREFLIGHT_FAILED`，退出非 0 | 数据库或检查失败，不能判为“无问题”；受限诊断后重跑 |

用恢复副本测量 `agent_workspace_nodes` 实际行数和总大小、索引创建耗时、阻塞及剩余磁盘；必要时在专用副本模拟长事务，验证设定的 `lock_timeout` 能中断等待且没有登记 056。计时不能只用空 `_migration_test` 库。演练前后比较 051–054 校验和、关键业务聚合及 schema，记录候选 055/056 各自应用和重复运行结果。迁移后再跑预检，pending 必须为空、`appliedCount === expectedCount`。

迁移演练必须使用真实候选的 `loadMigrationFiles()` 与 `applyPendingMigrations()`，在同一 `pg.Client` 上显式 `SET lock_timeout` 和 `SET statement_timeout` 后调用；超时值由规模测量确定并记入执行单。当前 `backend/scripts/db-migrate.js` 没有设置这两个值，不能以仅设置 `PGOPTIONS` 或直接 `npm run db:migrate` 代替。生产执行连接加载方式与最终命令须在获准的执行单中固定，本文不连接或执行。

## 迁移和锁的真实边界

迁移器在 session 级 advisory lock 下，逐文件执行 `BEGIN → SQL → INSERT schema_migrations → COMMIT`。055 和 056 是两个独立事务。055 成功后，056 即使失败也只回滚 056，不会回滚 055。

055 新建 `ui_preference_previews`、普通索引并补确认/撤销字段。056 在现有 `agent_workspace_nodes` 上执行普通 `CREATE INDEX idx_agent_workspace_nodes_owner_agent_updated`，会扫描该表并阻塞表写入；不能称为无停机索引。长事务还可能推迟获取锁，必须排空 API/Worker 写入并监测锁等待。`CREATE INDEX CONCURRENTLY` 不能直接替换到当前事务型迁移器中；若需采用，必须另行设计、实现和验证账本及失败恢复机制，不编辑已经发布的历史 SQL。

## 获准后的维护执行顺序

以下是待审批的执行顺序，不代表本轮已经执行。具体 release ID、旧/新摘要、恢复点、停写窗口、迁移超时、负责人和终止条件须先填入执行单。

1. 冻结候选并完成上节门禁。维护前只读核对活动 release、systemd 单元、待迁移账本、队列/未知回执和备份状态。确认没有其他发布或备份/DDL操作争用窗口。
2. 令 Nginx HTTP/HTTPS 进入维护，外部实际确认 `503 + Retry-After`，包括 API/WebSocket 新连接入口。仅切维护页不足以停在途写入；还须优雅停止 API 和两个 Worker，确认 PID 消失、在途事务/工作排空，无其他写入者。
3. 停止宽限按实际单元核对：当前模板 API/AI Worker 为 90 秒，媒体 Worker 为 30 秒；AI Worker 内部有 75 秒停止截止。不能统一假定两个 Worker 都有 90 秒。到达截止时须检查未决 lease/调用回执，保持维护并评估恢复条件，不能用常规 SIGKILL 或把 systemctl inactive 当成所有业务调用已安全结束。
4. 保持停写，生成新的完整停写 dump 和 SHA/TOC，保存旧制品、受限 env、storage 关联和 schema/序列/关键业务聚合。在独立实例完成该新 dump 的恢复核验；旧季度演练不能代替本次恢复点。确认备份 timer、磁盘空间和新表备份角色权限的处置，避免与迁移冲突。
5. 将候选放入新 release 目录，核对哈希，Linux 安装锁文件依赖；同步停写后的 storage 与受限 env，代码/父目录由 root 管理，env `root:marvels 0640`，仅明确 storage 可写。保留旧目录，不直接覆盖活动 runtime。
6. 对停写数据库复核 baseline/待迁移文件，使用候选迁移器和已批准的显式连接超时执行 055、056。逐项核验账本、校验和、表/列/索引定义及关键聚合；再运行只读预检，要求 pending 为空。失败分支见下节，不解除维护。
7. 原子切换新 app 指向。API、AI Task Worker、媒体 Worker 启动时须使用同一 release 的源码/agents/shared 和同一受限环境文件，确认真实进程 cwd 与 manifest。不得只换 API、留下旧 Worker。明确配置 `AGENT_WORKSPACE_MAX_CONCURRENT`；默认 4、允许 1–20 是每进程的节点并发上限，不是固定参与 Agent 数。参与者由真实需求、已发布能力和依赖图决定。
8. 维护中验证 localhost health/ready、迁移 current、新合同、备份角色可读新表、AI Worker 心跳及 workspace poll 时间持续前进、媒体 Worker 真实心跳。`ops:ai-tasks` 聚合中 `workerLiveness` 固定为 `not_checked`，不能单凭其 `ok:true` 判定 Worker 存活；还要比对两个时间点的 heartbeat/poll/队列年龄及结构化错误、过期 lease、未知回执。没有任务时只证明轮询活跃，不宣称模型执行通过。
9. 在获准范围内完成 UI-Agent registry/release/product 和独立权限发布，核对可用性与授权提示。未获用户同意前不写入其授权；未上架或未授权时客户端必须明确不可用。真实模型调用单独确定供应商/预算/账号/输入范围，不因服务启动而自动触发生产冒烟任务。
10. 所有门禁通过后记录开放写入的准确时间，恢复 Nginx 并复核公网 TLS、health/ready、现有合法会话和错误状态。开放后持续观察 API/Worker 错误、队列和新预览/确认行为，按受限聚合留证。

## 失败分支和回退条件

| 失败位置 | 应采取的动作 | 禁止的处理 |
| --- | --- | --- |
| 055 之前 | 保持维护，确认无 schema 变更后可继续使用匹配旧制品/旧库，或修复候选后重试 | 未确认账本就解除维护 |
| 055 事务失败 | 确认事务已回滚、连接终止且账本无 055，检查实际表/索引残留；重新预检后决定 | 仅凭 CLI 非 0 认定全部迁移均未变 |
| 055 成功、056 失败 | 记录已提交 055，保持维护，检查 056 锁/资源/超时；确认 056 未登记及无异常残留后，以同一候选受控重试，或走匹配备份恢复分支 | 声称 055 已自动回滚；删除账本让旧代码强行 ready |
| 056 成功但新服务/合同验收失败，尚未开放写入 | 保持维护。优先同合同修复；如决定退回，须恢复本次停写前完整、已验证 dump、匹配旧制品与 storage/env 关联，再核验旧账本/ready | 只切旧代码连接新增迁移数据库；只 DROP 表/索引/账本作为通用回滚 |
| 开放写入后任何故障 | 再次维护，保存故障时新备份和新增任务/回执/消息/预览/确认设置，按同合同前向修复；如必须恢复须另行评审可证明的数据保全与重放方案 | 用旧 dump 覆盖新写入；丢失已确认 UI 偏好或任务结果 |

旧制品严格核对完整迁移文件/账本，新增 055/056 后不能通过旧代码的 ready 检查。055 数据和 `station_config` 中确认设置都是应保留的业务数据。恢复脚本成功仅证明结构检查通过，仍须验证账本、业务聚合、序列、owner/ACL、storage 关联及旧服务实际 ready；不能由脚本成功自动开放流量。

## 发布后的配套验收

| 项目 | 必须取得的真实证据 |
| --- | --- |
| UI-Agent | 正式版本/产品、独立权限和用户同意；未发布/未授权/撤权明确失败；预览不写正式设置、确认后 CAS 持久化、过期/重复/换号/版本冲突拒绝；重置/撤销和重启后的真实效果 |
| 多 Agent | 多于两个参与者的需求用例；无依赖节点执行时间区间重叠、有依赖节点待上游成功；贡献属于当前账号/Agent/节点，妙页卡片、原会话和结果关联同一真实 workspace；失败/部分完成/等待输入或授权/取消不伪造成功 |
| 真实模型 | 用获准预算及隔离或已有测试环境运行，保存脱敏结构化调用/节点回执与语义复核；离线注入测试、Worker ready 或 registry 状态都不计作模型验收 |
| 新客户端 | 新构建确认 Bundle/Build/origin/JS 摘要与候选一致；上传 TestFlight、关联原测试组须单独授权。Build58 不能代表本轮代码 |
| 实体 iPhone | 讯页进入二楼与上滑退出动画、文件详情阅读不退出、妙页 S0/S1/S2 跟手与回弹、语音点按/长按/识别确认、相册/拍摄/文件/位置、贡献与成果、授权与换号；另验大字体/无障碍/屏幕尺寸。模拟器或 device available 不能替代 |

## 本次审查结果与下一步

本次代码/文档核对确认了 055/056 的逐文件事务边界、新旧偏好存储隔离、预检聚合输出和未登记对象检测、同制品 API/双 Worker 要求及实际停止宽限差异。后续已补生产只读核对、真实备份隔离预检/升级/锁超时重试，以及 Linux 干净依赖与本地 UI-Agent 实际授权流程，具体边界见同日发布前证据；这些证据没有改变线上数据库或运行制品。

下一步依次为：获准把审查清单中的修改形成可追溯 clean revision 并生成正式制品；获得明确维护/后端发布范围后复核最新数据并创建新的停写恢复点，执行配套发布；完成 UI-Agent 正式产品与独立用户授权；获准真实模型验收；新版 TestFlight 和实体设备验收。真实备份演练已覆盖本次7节点小表，不需再以空库重复代替；正式切换时仍须核对数据变化、锁和实际目标环境。发布结论保持 `BLOCKED`，不把本地演练当成正式切换。

参考入口：[部署方法](../deployment.md)、[数据库](../database.md)、[备份恢复](../database-backup.md)、[恢复负责人手册](../database-recovery-owner-guide.md)、[AI/UI 合同](../ai-interaction-system.md)、[当前交接](../handoffs/CURRENT.md)。
