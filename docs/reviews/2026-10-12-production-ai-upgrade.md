# 正式环境 AI 任务升级记录

## 已完成的部署与统一

用户已明确授权本次正式升级、固定客户端更新与清理。2026-10-12已完成；没有Git推送、付费供应商验收或TestFlight上传。

- 生产唯一运行制品 `ai-tasks-20261012-01`，来源 `5cbc27c02ea44dbd9299bcd1c8408e3a1672a26a`；415文件SHA核验通过，归档SHA256 `0fd5c946a92d35b62afa2f63bb9fae41dfaa2b9441e8c622dc8432dbfc56105e`。API、AI Task Worker及媒体Worker的全部进程实际目录一致，active/零重启；HTTPS health/ready200，心跳持续推进。
- 维护覆盖HTTP/HTTPS业务入口、保留ACME。Nginx reload首次即时探测尚读到旧worker响应，等待实际503+Retry-After后才停服务和备份；没有在未确认停写时迁移。维护结束恢复原配置并复核公网TLS/ready。
- 新停写dump实际恢复到临时数据库，保留原owner/ACL；51表数据摘要一致，应用角色读取和旧35账本校验通过。随后删除恢复库。036为1 applied/35 unchanged，25ms；重复0 applied，旧50张非账本表摘要一致，新任务及事件0。服务器原pgvector0.8.1保持不变，本轮不升级扩展。
- 恢复资料在 `/opt/projects/marvels-chat/backups/ai-tasks-20261012-01/`：`pre-036.dump`、SHA/TOC、前后摘要、迁移结果及旧Nginx配置。36库不可直接切回旧03；开放写入后优先同合同前向修复，旧dump不能覆盖新任务/用户数据。
- Linux lockfile依赖安装、sharp、ffmpeg/ffprobe、145文件语法检查通过；官方npm审计0漏洞。项目父目录原可被服务用户改写，已补加固脚本并验证代码/入口不可写、配置可读、storage可写；Linux隔离权限反例通过。新任务表备份读取权限和备份timer有效。
- 固定iPhone17原“妙讯”已更新1.0(46)，正式Bundle及HTTPS origin；正常保留生产登录。Simulator重定位数据容器，不能用旧路径相同作为成功标准，没有读取Keychain。官方App归档SHA256 `a828b3407d5893753258153259f0f2118edbacc6b064fe1fbc70d10cf79649e0`，JS SHA256 `0ae828cb29244b27264cabfbbe2cd6e7e0d00f317a43edb5329245b5265674e6`。
- iOS/Android工程默认46及正式origin；日常ios脚本原位更新官方App，不启动本地服务。旧4390自动服务已停用并归档，4391/API/AI Worker/PG55441已正常停止，保留固定本地身份及数据库；显式隔离验证命令为 `verify-local-start` / `verify-local-restart`。
- 旧生产02/03压缩归档，4612个文件内容核验后移出releases，运行目录仅当前版本。旧DerivedData及缓存约21.4GiB、一个已确认空的QA容器/匿名卷已清理；正式归档、符号、SDK、恢复备份及有数据的其他数据库保留。

最新全仓检查 `/tmp/miaoxun-production-unified-20261012-check.log` 通过：RN40组267项、backend507 passed/20门控skip、Agents33、Admin14及其余门禁；相关45项PG集成和迁移/锁/恢复测试已另执行。独立生产复核覆盖415哈希、9个进程、两类连续心跳、备份权限、恢复和无新增模型任务记录。运行与原生汇总以 `~/Library/Application Support/MiaoxunReleasePreparations/ai-tasks-20261012-01/manifest.json` 及 `production-ops-independent.json` 为准。

本轮上线的是配套服务器与本地Simulator客户端。TestFlight仍为45；旧端相册/建站提示更新。未执行付费模型、真实写入任务流程、真机/Android和代表性大库视频验收，不能据此声称全产品正式发布完成。下一步见[当前交接](../handoffs/CURRENT.md)。

- 原生只读复验通过：原登录、妙真实分类/详情、任务空态与二楼六面板正常；没有发送、注册、授权或上传。二楼进出使用无障碍动作，不代表连续拖拽已验收。Debug仍显示React Native通用warning提示条，精确警告未定位，未屏蔽，不声称零告警。

## 切换前准备方案（历史）

以下保留切换前证据和方案，其中“尚未部署”等描述是准备时状态，当前结果以上节为准。

用户已选择本地开发客户端连接现有正式环境，不建立独立开发 API、数据库或 Worker 环境。现有本地库保留用于后端验证，一次性隔离测试库在测试后清理。本文记录升级候选与执行方案，不表示已部署。

### 发布范围

| 单元 | 当前 | 本次候选 |
| --- | --- | --- |
| 正式 API | retrieval-visual-20261010-03 | 相册持久任务、上下文引用、建站私有草稿及审批，明确拒绝不支持的客户端协议 |
| PostgreSQL | 001–035 | 追加036的ai_tasks / ai_task_events，不回填或删除旧业务数据 |
| 媒体检索 Worker | 03 | 与新API同制品切换，保留现有检索配置和权限 |
| AI Task Worker | 尚未安装 | 同机新增marvels-chat-ai-task-worker，消费同一正式库；这是产品运行组件 |
| 本地iPhone17客户端 | 独立“妙讯开发”，本地4391 | 准备新协议的正式HTTPS构建，部署后使用既有正式账号正常登录 |
| TestFlight1.0(45) | 同步合同 | 普通既有页面保留；相册任务和建站需要新客户端，不能作为本次完整验收端 |

候选保留已有妙目录、二楼及统一AI交互，不再改造讯/小站。不自动授权、导入本地身份、上传相册或调用模型。逐步骤执行、可靠取消、委派及记忆不在本次范围。

本轮修复已确认的升级问题：旧客户端的受影响请求在业务写入前拒绝；新客户端先检查服务端合同；空引用消息延续原幂等指纹；建站网络中断保留“结果未知”；Worker停止时不再派发新任务，并提供心跳日志。协议声明不授予权限，owner、Agent授权、同意和版本检查仍由后端执行。详见[统一AI交互](../ai-interaction-system.md)。

### 生产只读预检

2026-10-12核对：运行目录仍为03，API/媒体Worker active/running、NRestarts0，公网ready200；35项迁移、无ai_tasks，保留6个账号且1个管理员。未发现排队或执行中的检索/3D任务。Node22.22.1、PostgreSQL18.6、磁盘约183GiB可用，备份timer active且最近Result=success。配置root:marvels0640，storage为marvels:marvels0750。Nginx `/etc/nginx/conf.d/marvels-chat.conf` 将HTTP/HTTPS请求转到4390。

这些是当时的只读证据，实际切换须复查。没有注册账号、读取私人内容、调用模型、修改配置或重启生产服务。

### 本地验证与回退条件

独立PostgreSQL18.4/pgvector0.8.6演练使用03源码与隔离测试内容：

- 35→36为1 applied/35 unchanged，重复为0/36，applied_at不变；旧45张业务表行数与摘要一致。
- 036外键对users/chat_threads/chat_messages持有ShareRowExclusiveLock；模拟写锁冲突触发55P03，整个迁移事务回滚，仍35且无新表。释放锁后重试成功。
- 实际HTTP：旧API+35 ready200，新API+35 ready503，新API+36 ready200，旧API+36 ready503。旧包缺036文件导致账本检查失败；API可能仍监听，health200不能证明回滚成功。
- 升级前dump恢复到另一空库后，旧API ready200，数据摘要一致；升级后任务只存在36库，恢复旧dump会丢失它。
- 任务仓库12/12，最终HTTP8/8、撤回6/6、建站19/19，共45项PG测试通过，无skip。含旧/错误协议拒绝且零业务写入、旧消息重放与审批/权限边界。
- 只读运维摘要在35库明确失败，36库空态与10项状态样本统计正确。使用仅SELECT且默认只读角色，48张表前后摘要一致，不输出用户/任务ID、内容或凭据。

报告及复跑脚本：`/tmp/miaoxun-migration036-rehearsal-20261012-s9kao_7t/REPORT.md`、`/tmp/miaoxun-final-ai-contract-20261012-o9zj_y_j/REPORT.md`。临时API、PG和测试库已清理；本地演练不证明生产规模耗时、Linux角色ACL、OSS恢复或真实模型质量。

全仓 `./scripts/check-repository.sh` 通过：RN40组267项，backend507 passed/20环境门控skip，Agents33、Admin14及Web/静态/构建门禁通过；本轮相关PG门控已按上文实际执行。日志 `/tmp/miaoxun-production-ai-upgrade-check-20261012.log`。之后仅简化协议提示文案，8项RN协议复验通过，日志 `/tmp/miaoxun-ai-contract-final-text-20261012.log`。`bash -n scripts/restore-production-database.sh` 与diff检查通过。

**回退边界：**

1. 迁移失败且已回滚到35：核验后可恢复03。
2. 036成功但尚未开放业务写入：保持维护，保存现场；按停写恢复点执行受控恢复，再启动03。不能只删新表/账本或切app软链接。
3. 已产生新写入：保留36和任务/审批，优先同合同前向修复。先停止受影响入口与AI Worker，记录queued/running/awaiting_confirmation；结果未知的调用不重放。旧库恢复必须先审查后续数据协调。

旧03还保留直接应用草稿的接口，不理解新审批。因此不制作“旧代码补036文件”的业务兼容回退，也不放松迁移账本检查。

### 制品与执行顺序

全仓检查通过后，将候选保存为独立本地Git分支，在干净工作树打包，保留原工作区及索引。制品包含sourceHead/sourceTree、逐文件和归档SHA。确切提交、归档路径与检查日志放在仓库外最终证据中，避免为了更新自身哈希反复修改文档。

本轮最终证据目录：`~/Library/Application Support/MiaoxunReleasePreparations/ai-tasks-20261012-01/`，以 `manifest.json` 中实际结果为准。iPhone17使用独立开发Bundle、正式HTTPS origin、构建号46，仅构建而不提前安装连接旧03；这不是TestFlight上传。原工作区与旧原生安装保留。

```sh
./scripts/check-repository.sh
node scripts/prepare-runtime-release.mjs ai-tasks-20261012-01
```

本次采用现有systemd。runtime虽带Compose配置，但缺完整Docker构建源，不能据此声称归档可Compose build；Docker不属于本次正式部署。Linux需另执行锁文件 `npm ci --omit=dev` 并检查sharp、ffmpeg/ffprobe和服务用户权限。

正式操作顺序：

1. 上传新制品到 `releases/ai-tasks-20261012-01/runtime` 并验SHA，不覆盖03/02；Linux安装依赖，核对配置存在而不打印值。
2. 在HTTP/HTTPS入口设置明确503及Retry-After的维护响应，保留ACME；nginx配置验证后reload。已有WebSocket和在途写入仍需停API排空。
3. 核对任务后停止媒体Worker、API（含3D runner），后续维护也必须停止AI Worker；确认无在途写入，创建新的停写dump并验SHA/TOC。清理账号时的旧dump不能代替此恢复点。
4. 停写时将最新storage同步到新制品，复制服务器既有env并维持root:marvels0640。迁移连接显式设置 `options: '-c lock_timeout=10s -c statement_timeout=60s'`，调用新制品的迁移加载器与账本；不依赖node-postgres未显式配置的PGOPTIONS。期望1/35，再核对36项校验和；失败保持维护。
5. 安装AI Worker模板、daemon-reload，原子切换app软链接并执行现有权限加固。启动同版本API、AI Worker和媒体Worker，核对实际进程cwd。
6. 维护状态下从本机检查health/ready、协议声明、只读任务统计、两类Worker日志及权限；无任务时不发起模型调用。开放入口后复核公网TLS/ready，已有账号登录/读取；旧Build45受影响请求明确提示更新且不新建任务。
7. 将配套客户端安装到固定iPhone17，连接正式HTTPS，复用已有正式账号正常登录。本地token不跨环境复用；记录bundle、Build、JS摘要和origin。TestFlight上传和真实模型验收另列范围。

Linux依赖检查、生产维护响应与停写备份在获准执行时进行，本轮不提前改服务器。**升级后旧Build45的相册与建站会要求更新**；必须将这一影响包含在最终升级确认中。

### 运维与验收限制

`npm run ops:ai-tasks` 在只读事务中检查迁移并输出队列数量、最老排队秒数、过期租约/审批、近24小时失败/中断；`workerLiveness=not_checked`，不能单独证明Worker在线。

AI Worker每30秒输出 `ai_task_worker_heartbeat`，包含checkedAt、databaseConnected、lastDatabaseSuccessAt、state、activeTask、lastSuccessfulPollAt。连接检查有5秒等待上限，失败不刷新成功时间；独立SELECT1不刷新队列轮询时间。需联合systemd状态、心跳新鲜度、最老排队和过期租约判断；模型执行期间轮询不推进可能正常，仍应核对任务租约，数据库连通不代表模型进度。

```sh
systemctl show marvels-chat-backend marvels-chat-media-retrieval-worker marvels-chat-ai-task-worker \
  --property=Id,ActiveState,SubState,NRestarts,MainPID
journalctl -u marvels-chat-ai-task-worker --since '-5 minutes' --no-pager
# 在当前runtime/backend中载入同一受限服务环境后：
npm run ops:ai-tasks
```

恢复脚本已把AI Worker加入停机检查。此前暂停的真机/Android、大库/视频质量等不因本次升级准备自动通过；Simulator与协议替身测试不代表真实模型验收，也不代表全产品已可正式发布。
