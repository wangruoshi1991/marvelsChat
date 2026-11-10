# UI-Agent 配套发布前验证记录

日期：2026-11-05。本记录证明本地提交、正式制品和发布前准备；随后已获独立授权完成后端生产切换，实际维护、完整新恢复点、055/056和API/双Worker证据见 [生产发布记录](2026-11-05-ui-agent-production-deployment.md)。UI-Agent正式产品随后也已单独获准上架，Build59本地归档完成，见 [上架与客户端记录](2026-11-05-ui-agent-published-build59.md)；用户独立授权、真实模型和客户端分发/设备验收仍待续。正式移动端为 `MiaoxunRN/`，发布方法见 [执行方案](2026-11-05-ui-agent-release-plan.md)。下文生产只读状态与“未部署/未上架”描述保留为当时证据，不能当成现在运行状态。

## 已授权提交与正式制品

用户明确批准原候选清单163个文件创建本地发布提交并生成正式后端制品。清单原始内容摘要为 `2504544209fee331fa41c9931d6fd0cca2225c893d1a0926ae346ad070f9f7c9`；暂存校验发现新增测试一处行尾空格，清除后定向5/5通过，其余162个文件逐字节保持批准内容。提交无范围扩展，未推送。

| 项目 | 证据 |
| --- | --- |
| 源提交 | `cebc1e6d5c7848fc630f1e8453b0c3bfbad774f3`；163文件，12763行新增/699行删除 |
| 源tree | `9c187fd8a495edaf92ce0b9b48f94cfff95487ae` |
| 构建命令 | `node scripts/prepare-runtime-release.mjs ui-agent-candidate-20261105-cebc1e6`，退出0 |
| release ID | `ui-agent-candidate-20261105-cebc1e6` |
| 归档 | `ui-agent-candidate-20261105-cebc1e6.tar.gz`；1264231字节；284个运行文件 |
| 归档SHA-256 | `a385f6a054d2ffd2abe2631ba2b0550d94870343ad73ba594f21b00655b1114e` |
| 构建环境 | macOS26.4/arm64，Node26.5.0/npm11.17.0，Git2.50.1；不是目标Linux上的服务运行证据 |
| 来源校验 | clean committed HEAD；manifest的sourceHead/sourceTree匹配；`includesWorkingTreeChanges=false` |
| 内容校验 | 归档安全路径/无重复或符号链接；manifest与完整文件集合一致，284项哈希全部匹配；运行源码逐文件对应提交，backend lockfile原字节保留，package投影有效 |
| 必要入口 | ui-agent、shared新/legacy合同、055/056、API/双Worker、UI预检/附件/任务运维脚本及两套重建前端均存在 |
| 排除核对 | 无.env、node_modules、测试/评估、storage内容或密钥文件扩展名；常见密钥内容模式0命中，该扫描不等于穷尽审计 |

固定目录为 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/ui-agent-candidate-20261105-cebc1e6/`。同目录保留 `.tar.gz.sha256`、`release-manifest.json`、`verification.json`、`source-commit.json`、`approved-candidate-scope.json`、`build.log`、`repository-check.log`。临时构建目录没有作为交付位置。

独立只读复核实际归档也通过：276个非前端文件逐项对应上述提交或明确package投影，另8个为前端产物；56项迁移、10个Agent定义和10条runtime脚本均完整，792个相对import闭合。未解包落盘、安装依赖、启动服务或修改仓库；该复核证明归档内容，不扩大运行验收结论。

提交前命令 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0，RN86套/1093项、Agents55项、Admin48项通过；Backend1355项中1049通过、306项专用数据库门控跳过，不能计为通过。其余语法、构建、RN类型/lint/格式与打包测试均通过。原日志 `/tmp/miaoxun-20261105-precommit-authorized.log` 已复制到固定目录。随后 `git diff --cached --check` 在行尾空格修复后通过。RN仍有已知act警告；干净前端构建有chunk体积提示及npm可选fsevents安装脚本未批准提示，均不影响命令成功，未扩大安装脚本许可。

制品从上述源提交封存；本节和CURRENT的后续文档记录不包含在归档中，不改变sourceHead。未执行完整候选Linux服务启动或实体设备交互，不能把内容完整性和已有依赖探针当作线上闭环验收。

## 当前来源与生产只读状态

- 原工作区基线 `186e8fece02061ad04dd9eef5644c5bb82c4f117`，当时detached且有既有未提交/未跟踪文件。修改明细、状态及内容SHA-256冻结在本机 `/tmp/miaoxun-candidate-scope-20261105.json`，获准后重新核对并按上节提交；清单本身不是runtime或Git revision。
- 通过已有 SSH 身份只读核对，活动目录仍为 `/opt/projects/marvels-chat/releases/app-collaboration-20261103/runtime`，manifest 来源 `80d700945bedcdfa25b98ccad796dd2c038c17f8`，276 个文件。生产迁移为001–054；055表和056索引尚不存在。
- API、AI Task Worker、媒体 Worker 与备份 timer 均 active；ready 返回数据库 connected/migrationsCurrent。此状态只证明旧版运行正常。
- 最近已有备份任务 `Result=success / ExecMainStatus=0`，完成于 `2026-11-05 06:19:09 CST`。未触发新的生产备份或停写。备份角色具有 `pg_read_all_data`，正式发布后仍须实测新表备份可读。
- 生产 Node `22.22.1`、npm `9.2.0`、Linux x86_64；当前 `agent_workspace_nodes` 7行、总大小约200kB。没有停止、重启、修改生产服务或数据库。

## 真实备份的隔离恢复与迁移

取服务器已有 `marvels_chat-20261104T221908Z.dump`，892458字节，服务器计算与本地复制 SHA-256 均为 `e57efe5629fd666a597113dac43d2a157589d48173fcdfd5463bf5d708df68d6`。文件及独立 PostgreSQL 18.4 数据目录仅本机当前用户可读，实例仅开放受限 Unix socket，不监听 TCP。

恢复使用 `pg_restore --exit-on-error --no-owner --no-privileges`。因此本次证明 schema、数据和升级合同，不证明生产 owner/ACL 的恢复。执行当前源码的 `loadMigrationFiles()`、`checkUIPreferenceUpgrade()` 和 `applyPendingMigrations()`；未连接生产应用、Worker 或供应商。

| 检查 | 实测结果 |
| --- | --- |
| 恢复后054 baseline | 校验和匹配；待迁移严格为055/056 |
| UI偏好预检 | 扫描8份资料；无非法形状、不支持字段或耗尽的revision |
| 055应用 | 约3.71ms，成功登记 |
| 056应用 | 解除测试锁后约1.56ms，索引存在且成功登记 |
| 锁失败分支 | 另一事务持有 `ROW EXCLUSIVE` 锁；迁移连接设置 `lock_timeout=150ms / statement_timeout=5s` 后，056约152.39ms返回 `55P03` |
| 部分成功边界 | 056超时后055仍已提交；056未登记且无索引残留，解除测试锁后重试成功 |
| 升级后预检 | 56/56，pending为空，8份资料全部通过 |
| 资料保全 | 对全部资料ID和station_config的有序结果在进程内比较摘要，一致；未输出原文或身份 |
| 重复迁移 | 新增0项 |
| 清理 | 独立集群停止；备份明文、恢复库和数据目录均已删除 |

脱敏报告：`/tmp/miaoxun-production-restore-20261105-report.json`。此次使用7个节点的真实备份副本，不是空库；毫秒值仅适用于本机恢复副本，不预测生产机器的锁等待或高负载性能。该备份也不能代替正式维护窗口的新停写恢复点。

## UI-Agent 真实发布与授权代码验证

新建独立 loopback PostgreSQL 18.4 集群，使用三个精确命名的 `_migration_test` 数据库，显式关闭 dotenv，设置 `NODE_ENV=test DEFAULT_ADMIN_ENABLED=false`：

- `npm run db:migrate`：001–056，56项成功。
- `RUN_PUBLISHING_LIFECYCLE_POSTGRES=1 node --test test/publishing-lifecycle-postgres.test.js`：10/10通过，零跳过。
- 另一空库运行 `RUN_UI_PREFERENCE_MIGRATION_INTEGRATION=1 node --test test/ui-preference-migration-integration.test.js`：1/1通过。
- 实际 `ui-agent 0.1.0` 调用现行发布服务创建、审核并发布 release/product，缺少独立 `ui-preferences:write` 的同意被拒绝，完整范围才投影成功。UI服务使用默认真实授权、锁、复验、持久化和usage审计，覆盖预览不改正式设置、确认CAS、重复确认、撤权、暂停、撤回发布、换号、过期和冲突。
- 模型run与发布readiness使用测试注入，4次模型替身调用、零供应商请求、6条真实数据库usage记录。这不是当前供应商 readiness 或模型质量验证，也没有在生产创建产品或替用户同意。

三个测试库均已删除，自建集群停止并删除，其他本机PostgreSQL实例未改动。完整命令及脱敏结果：`/tmp/miaoxun-ui-agent-audit-20261105-a7c21e/verification.md`。

## Linux 干净依赖与导入

把当前明确枚举的运行源码、真实后端 package-lock 和投影后的 package.json 复制到临时测试目录；没有复用或链接开发 node_modules，没有生成发布归档。安装容器仅挂载该临时目录，不含工作区环境文件或凭据。

| 环境 | 结果 |
| --- | --- |
| Linux arm64 / Node22.23.2 | `npm ci --omit=dev --no-audit --no-fund` 安装112个生产依赖；断网导入通过 |
| Linux x86_64 / Node22.23.4 / npm10.9.9 | 同一快照重新干净安装112个生产依赖，断网导入通过 |
| 实际运行依赖 | API、两个Worker及8个服务模块共11个模块加载；10个Agent含ui-agent0.1.0；055/056文件存在；Sharp0.35.5实际生成PNG |
| 隔离与保全 | 导入容器 `--network none`，数据库未配置，未开启监听与后台任务；后端lockfile字节保持不变 |
| 清理 | 两轮临时源码与node_modules已删除，相关容器均已删除；只保留探针和脱敏证据 |

导入探针临时抑制了入口的 `listen` 回调，故只证明依赖解析、模块加载和本地原生依赖，不是服务完整启动或真实任务执行。Docker Hub取amd64超时后使用显式ECR镜像，未修改Docker或系统网络配置。amd64镜像 digest 为 `sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da`。未覆盖生产精确 Node22.22.1 补丁版本。

命令、镜像、输入摘要及日志：`/tmp/miaoxun-prod-deps-probe-20261105-c92f13/verification.md`。此探针早于正式制品生成；上节制品已通过干净HEAD门禁，但仍须在获准发布时于目标服务器核验实际安装。

## 未完成与授权边界

1. 本地提交与正式制品阶段已完成，未执行推送。163文件包含工作区原有修改，不意味着文件均由本轮创建；只读准备与隔离验证的边界仍保留。
2. 生产维护、停写新备份及完整owner/ACL恢复核验、迁移及API/双Worker切换仍须单独授权，并按执行草稿处理部分成功和恢复。
3. UI-Agent正式上架与用户本人独立同意仍待执行；不从隔离测试搬运账号、授权或测试数据到生产。
4. 真实模型、TestFlight与实体设备交互分别待对应授权和验收。Build58不包含当前修改。

生产核对与隔离验证之后，新增执行仅为获准的本地提交、干净构建、制品校验和文档留证。没有推送、生产部署/迁移、正式产品发布、供应商调用或TestFlight上传。此前iOS构建与隔离数据库结果见 [CURRENT](../handoffs/CURRENT.md)，本轮提交前整仓检查见上节；最终交接文档另行验证并保存，制品不会随文档更新而静默变化。
