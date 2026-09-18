# 2026-09-16 线上检索、管理员与诊断核查

后续已获用户发布授权：生产现为 `app-integration-20260916-04`、数据库31迁移，TestFlight43
上传成功。实际执行与最新状态见[发布记录](2026-09-16-production-and-testflight-43.md)。
以下候选准备和初次核查内容保留为历史证据；不再表示尚未发布。

初次核查时间：2026-09-16 17:03–17:20 Asia/Shanghai；后续追加候选暂存与验证记录。
初次远端核查为只读，随后已写入独立 release 候选目录并完成权限硬化；尚未切换活动版本、
迁移生产库、启用 Provider、发起真实模型调用、创建线上用户或更改密码。发布前须重新核对。

## 当前交付状态（后续追加）

- RN 正式相册新增“找素材”：同意、启用、补建、撤回、任务事件、明确错误和图片/视频命中预览。
  这不是妙讯管家的自动工具调用。原公共检索合同未修改。
- 生命周期操作在请求前写入账号隔离的 Keychain 日志，跨页面/重启复用原操作编号，用户手动
  重试。费用待核对仍允许撤回；本地日志删除失败或服务端成功响应不满足合同，不丢弃原编号。
  清理只接受当前任务的完成确认，不把历史成功清理误作本次成功。
- 编辑小站资料已精简为昵称/签名与定位选择地区，职业信息折叠选填；使用已有原生定位和
  后端地理解析，不需要手工输入城市。权限错误、候选选择、明确保存与退出确认已实现。
- 独立 QA App、profileqa 账号及 QA API/管理台已清理。专用自动化测试库最后检查用户数为 0，
  PostgreSQL 55436 已停止；没有操作其他本地数据库或正式 TGary 数据。
- 线上既有 `admin` 管理员可用性已核实为 active/完整权限；本轮未重新登录验证密码，也未
  新建默认密码或重置已有密码。生产 API、worker、ready 仍正常，活动 release 仍为 `042c023`。

### 已暂存、尚未激活的候选

| 项目 | 值 |
| --- | --- |
| release ID | `app-integration-20260916-03` |
| 服务器目录 | `/opt/projects/marvels-chat/releases/app-integration-20260916-03/runtime` |
| 本地 tar | `/var/folders/k2/bnl6hg557j761ylt5szlbbjm0000gn/T/miaoxun-release-iRfa38/app-integration-20260916-03.tar.gz` |
| tar SHA-256 | `2a2f5b20fa3383bdc6489a5f0d686abce3f7496d256d4a95f93251a60a0bc524` |
| 来源 | HEAD `e70270f` 加明确 runtime 白名单工作区改动；不是已提交的独立 Git release |
| 文件校验 | manifest 336 个文件全部匹配，未携带 AppleDouble 元数据；Linux 锁文件安装 114 包成功 |
| 权限 | 代码 root 所有，服务用户仅可写 storage；env 从旧版本精确复制为 root:marvels 0640，未输出内容 |
| 尚未执行 | 停服后备份、storage 复制、030/031 迁移、symlink 切换、正式 App 安装、线上 UI 验收 |

由 `scripts/prepare-runtime-release.mjs` 产生候选；不会将整个 dirty worktree 或 macOS
node_modules 上传。admin/dist 内容对应服务器 runtime/admin，avatar 对应 runtime/avatar-web/dist。
旧候选 `app-integration-20260916-02` 含 AppleDouble 文件，已拒绝使用，从未激活；其暂存目录
仍在，不能把它当作可部署或可回滚版本。当前存储目录约 20K，必须停写后从 `042c023` 原样复制。

### 最新检查

| 检查 | 结果 |
| --- | --- |
| RN TypeScript / ESLint / Prettier | 通过 |
| RN 全量 Jest | 28 suites / 152 tests 通过 |
| Backend 全量 syntax/test | 201 文件检查；362 通过，1 项 opt-in pgvector 测试跳过 |
| 新候选 Linux 检查 | 201 文件检查，相关 29 项测试通过 |
| 真实隔离 PG API 验收 | 资料读写/权限/隐私及 owner-only 媒体元信息通过，测试用户已清理 |
| Admin | 11 项测试、生产构建通过 |
| Agents | 检查与 33 项测试通过 |
| Avatar-web | TypeScript、29 项测试、生产构建通过 |
| 检索 mock smoke | 通过，真实供应商调用数 0 |
| iOS Release simulator | 最后客户端修正后构建通过，正式 bundle `com.wangruoshi.miaoxun` / API `https://8.153.167.11` |
| diff 空白检查 | 通过 |

限制：新版编辑/GPS/键盘/视频播放器尚未实际 UI 验收；真实供应商质量、延迟和费用未验收；
Android 缺少 SDK/JDK 未做原生编译；系统 CocoaPods 安装成功，但 `bundle check` 的锁定 gems
仍缺失。TestFlight 未构建分发。上述限制不能以 mock、构建成功或旧 QA 截图代替。

最终 iOS 构建日志 `/tmp/miaoxun-online-release-build-20260916.log`；产物
`/tmp/miaoxun-online-integration-build/Build/Products/Release-iphonesimulator/MiaoxunRN.app`。
生产最后只读复核：迁移账本 29 条、3 条动态、like/favorite 总计均为 0；030 的真实互动计数
重算不会清除现有非零聚合计数。候选 env 与旧版本完全一致，服务用户能读 env、不能写代码。
所有实际切换与存储复制步骤尚未执行；须获本次发布确认后执行。

## 当前线上事实

| 项目 | 已核实结果 |
| --- | --- |
| 正式 API | `https://8.153.167.11`；公网及回环 `/api/health`、`/api/ready` 为 200 |
| release | `app` symlink 指向 `/opt/projects/marvels-chat/releases/042c023/runtime` |
| 数据库 | ECS 本机 PostgreSQL 18，29 个迁移已执行，最新 029；pgvector 0.8.1 |
| 服务 | 后端、检索 worker、PostgreSQL、备份 timer 均 active；后端/worker 自 9/10 启动，NRestarts=0 |
| 备份 | 最近任务 9/16 12:23 成功；9/15 有实际异地恢复演练，见生产运维文档 |
| 管理员 | 既有登录名 `admin`，active，权限 `*`；最近登录 9/8；没有读取密码/hash，也没有重置 |
| 初始化开关 | 运行进程 `DEFAULT_ADMIN_ENABLED=false`、`CREATE_FIRST_USER_AS_ADMIN=false`；默认密码、ADMIN_EMAILS 为空 |
| 临时验收账号 | 线上 `profileqa` / `identity-preview@example.invalid` 数量为 0；之前验收账号只在隔离本地库 |
| 检索开关 | 环境总开关/Provider=true；数据库 Agent=true，Provider=false、queue=false，lifecycle=sandbox |
| 模型 | 实际进程配置为阿里云百炼北京工作空间；描述/查询解析 `qwen3.6-flash`，向量 `qwen3-vl-embedding`，1024 维 |
| 必需凭据 | 检索 Key、OSS、AMap Key 均存在；未输出值，存在不等于真实调用成功 |
| worker | 最新心跳约 0–5 秒；旧 ready/stopped 行是历史记录，不代表多个当前存活进程 |
| 检索数据 | 1 个 enabled 同意记录，0 个 ready 分段；8 张 uploaded 图片，0 个 uploaded 视频 |

`buildMediaRetrievalRuntimeStatus()` 在加载实际 backend 进程环境、只读事务模式下的结果为：
`temporarily-unavailable`，原因 `lifecycle-not-available`、`operator-disabled`、`not-ready`。
因此后端部署、Key 存在、worker 存活均不能证明 App 已能检索。

正式管理员已经存在。不能因初始化开关关闭就重新创建通用默认密码账号；应使用既有管理员
登录 `https://8.153.167.11/admin/`。常驻环境不保存初始化密码是有意的安全边界。

## 历史失败能证明什么

8/27 的两个 `media-index` 聚合失败对应子任务：

| 时间 | 子任务 failure_code | 已能定位的边界 |
| --- | --- | --- |
| 11:13 | `retrieval_service_unavailable` | 图像描述 Provider 调用失败；没有持久化 HTTP 状态，不能断言是网络、模型权限还是参数 |
| 13:59 | `retrieval_policy_unverifiable` | 图像描述返回值未通过 `normalizeDescriptor`；不能恢复具体失败字段 |

两次 `image-description` 账本均为 unknown，共 200 分。这个数是保守预算占用，**不是已核实的
供应商扣款**。历史日志不含可恢复诊断，旧响应也未保留。远端 Provider/policy 文件的 SHA-256
与本次开始时本地文件一致，但这仍不能证明历史调用返回的具体内容。

旧提示词缺少完整字段类型、列表/长度限制和查询置信枚举，是独立可确认的协议缺口；后续
提示词修正不应被表述为已经复现并解决了历史供应商失败。真实评估仍需受控调用。

## 本次诊断与后台改动

- Provider 错误额外生成内部诊断：固定 operation/stage、100–599 HTTP 状态、白名单供应商
  code、白名单 schema path。任意供应商 code 映射为 `unrecognized`；不记录原始 message、
  URL、凭据、图像、caption、检索词、模型原文或任意属性名。
- 通过真实 `reservationId` 查询既有成本账本，派生 user/run；写入 `usage_events` 专用类型
  `media_retrieval.provider.failed`。不修改费用结算和 AgentRun 公共 DTO，不增加数据库迁移。
- `/api/events` 拒绝该保留事件类型，防止普通客户端伪造后台诊断。管理端既有 overview
  的 `agents:manage` 权限保护诊断列表；返回前再次投影白名单字段。
- 诊断保留 30 天，由既有 worker 每日 retention sweep 删除。后台展示近 30 天最新 20 条、
  关联运行、阶段、HTTP/code/path 与处理指引。历史没有诊断的失败明确显示不可追溯。
- 审计写入失败返回既有 `retrieval_repository_write_failed`，服务日志只记录受限诊断，
  不伪装成成功，也不输出数据库异常。没有自动重试 Provider。
- 后台把 unknown 改称“今日待核对预留”，说明预留/估算/未知均不是实付；未清零历史费用。

检索同意说明应明确当前服务商“阿里云百炼（通义千问模型）”。已上传的私有图像/视频采样帧
通过短效地址发送给该服务，查询也经该服务解析。更换实际处理商或处理目的时，必须重新审查
披露和同意版本，不能只换环境配置而保留错误文案。

## 预算与在线验收边界

当前 DB 规则：每用户每日 3 次、每用户每月 500 分、全局每日 500 分；描述和向量各预留
100 分。按当前实现，一张图索引需要 200 分，一次普通视觉查询可能另需 200 分；6 帧视频
索引需要 1200 分，超过当前日预算和月预算。028 已放宽技术上限，这不是不可修改的代码上限。

因此不能直接启用并自动回填全部素材，再把预算阻塞归咎于检索算法。需要先核实供应商定价与
真实 usage，选择可评估的素材量、明确预算，再通过后台审计操作设置。默认 enable 会回填当前
用户全部可索引素材；当前 `limited_release` 只是生命周期标签，没有逐用户白名单机制，不能
把它当作“只有指定用户能调用”。本轮没有更改线上预算和开关。

安全在线路径：新版后端/管理台就绪后先只读验证登录、资料、状态、媒体读取；检索 UI 可展示
真实不可用原因。接着在已确认的预算与同意范围内启用，使用本人真实账号/授权素材完成
enable→索引结束→搜索→原图或视频命中时间→撤回及物理清除验证。不得用真实生产库跑会
批量注册、删除用户和改业务数据的自动化测试。

## 发布顺序（待实际执行）

以下为发布步骤，不是已经执行的记录；先将全部本轮改动与检查结果做成明确、带 SHA-256
manifest 的 release artifact，不能将当前整个 dirty worktree 直接 rsync 到生产。

1. 锁定候选文件清单/版本并构建。runtime 应包含 backend（src/database/scripts/锁文件）、
   agents、shared、运维 scripts、必要 deploy 模板。依赖在 Linux 使用锁文件 `npm ci --omit=dev`
   安装，不拷贝 macOS 的 sharp/原生 node_modules。
2. `admin` 执行生产构建，将 **admin/dist 内容**放入 runtime/admin；Nginx 当前 `/admin/`
   alias 是 `/opt/projects/marvels-chat/app/admin/`，不是 admin/dist。Avatar 产物必须放
   runtime/avatar-web/dist。检索 pilot Web 不应混作正式 App。
3. 在 `/opt/projects/marvels-chat/releases/<已核实release-id>/runtime` 暂存；从当前 release
   精确复制生产 env（不输出内容），停写后复制 backend/storage（当前约 20K，不能遗失）。
   保留旧 runtime 原样，检查空间、锁文件、manifest 和 systemd 工作目录。
4. 维护窗口停止 API/worker，手动启动备份任务，检查 success、dump SHA-256 及 OSS manifest。
   新快照必须在停止业务写入之后建立，作为本次迁移失败的准确恢复点。
5. 用新 runtime 中的 harden 脚本及显式 `MIAOXUN_APP_LINK` 对新路径硬化，确认只有 storage
   可由 marvels 写入。再原子切换 app symlink，加载同一份生产 env，执行 `npm run db:migrate`。
   本轮资料/互动需要 030、031，后续若有新增迁移按候选 manifest 为准。不要先更新 App 再迁移。
6. 启动 API/worker，验证回环/公网 health+ready、迁移账本及校验和、worker 心跳、默认管理员
   可登录、资料保存/回读、既有鉴权媒体/3D 读取、管理台静态资源及检索状态。检索开关保持
   已确认值，不能借发布自动开启付费功能。
7. 服务稳定后安装连接正式 HTTPS 的新模拟器包；真机使用对应新 TestFlight build，旧的
   TestFlight 包不会自动获得此次 RN 页面变更。构建版本/上传另按发布范围处理。
8. 如果迁移或关键闭环失败，保持 API/worker 停止，恢复本次停写后的 dump 与旧 runtime，
   再验证。迁移账本变更后只切旧代码会导致旧版 readiness 失败，不能冒充完整回滚。

已核实的运维命令入口（在明确新 release/恢复点之后使用）：

```sh
systemctl stop marvels-chat-media-retrieval-worker marvels-chat-backend
systemctl start marvels-chat-database-backup.service
systemctl show marvels-chat-database-backup.service -p Result -p ExecMainStatus
```

新 symlink 生效后，以同一生产环境运行迁移；不得用 shell tracing 输出环境：

```sh
cd /opt/projects/marvels-chat/app/backend
set -a
. ../deploy/miaoxun-prod.env
set +a
npm run db:migrate
systemctl start marvels-chat-backend marvels-chat-media-retrieval-worker
curl --fail http://127.0.0.1:4390/api/ready
curl --fail https://8.153.167.11/api/ready
```

恢复使用仓库 `scripts/restore-production-database.sh`，传入明确的 custom dump 与 SHA-256；
脚本要求 API/worker 已停止。恢复是故障处置，不应当作正常发布步骤运行。详细凭据/恢复流程
见 [生产运维入口](../production-operations.md) 与 [部署说明](../deployment.md)。

## 验证证据与限制

- `backend npm run test:media-retrieval`：此次诊断完成时 108 通过、1 个 opt-in PG 迁移测试
  跳过；随后新增客户端诊断伪造拒绝测试单独通过。后续主流程改动需以最新总测试为准。
- `admin npm test`：11 通过；`npm run build` 通过。
- 此次改动相关 ESLint 与 `git diff --check` 通过。
- 使用 55436 的专用隔离 PostgreSQL，事务内实际执行诊断 INSERT/owner关联/脱敏读取并
  验证原预算行完全不变，随后 ROLLBACK；测试用户与诊断无残留。首次 fixture 使用不存在的
  operation 被 DB 约束拒绝，纠正成现有 `query-parse` 后复验通过。
- 未真实调用供应商，未验证真实 caption 质量、检索召回、延迟/实付金额、原生视频拖动或
  新版管理台在生产浏览器的视觉布局；这些不能被单元测试替代。

本次发布结论为 **BLOCKED（尚未完成候选发布与真实关键路径验收）**。现有线上服务健康，
不等于新检索功能已具备可发布证据。
