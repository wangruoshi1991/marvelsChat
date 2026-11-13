# 2026-11-13 对话漫画配套发布预检

本轮承接用户“继续”，先完成本地、隔离与生产只读准备；随后用户明确批准冻结100文件的“仅本地提交并正式打包，不推送”，并明确允许服务器部署更新。服务器已完成058→060迁移、runtime切换和流量开放；后台发布、iOS归档/TestFlight上传、代用户授权和付费供应商调用仍分别保留边界。11日的对话漫画实现不重复计为本轮开发成果；对应实现和设备反馈见[11日实施记录](2026-11-11-conversational-comic-implementation.md)。

## 当前基线与候选

实际工作区为 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，分支 `codex/ui-agent-candidate-20261105`，预检起始HEAD `f1a6c8fc5c2b0aea2852e0f626d2ef82e68e72e7`，tree `2619a46b97d7fa9b9c3415c3b64b9ce0a13c8414`。保留开始时99个修改/新增/删除文件，预检阶段未stage或重置。首份逐文件清单的规范化inventory摘要为 `6017efa1453d07718c3878e03bd55c32ab547b5916ccbb06f9464a53f19c78f7`；它是工作树快照，不能当成新提交或正式制品。

证据目录 `P` 为仓库外的 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/conversational-comic-20261113/`。

| 范围 | 本次核对 |
| --- | --- |
| RN | 原聊天提案、单次确认、画格/详情、选图与独立日记、本人动态编辑器；源码尚未分发 |
| Backend / Agent | 对话内容合同1、059/060、原058队列与Worker；漫画源码0.1.6、七scope保持 |
| Runtime增量 | 对实际生产manifest，18个已有文件修改、7个新增文件；所有已有runtime文件的HEAD基线均与生产相同，详见 `P/runtime-input-delta.json` |
| 依赖/原生/部署配置 | 候选未改package/lock、Pod/Gem锁、Xcode工程或deploy文件；未增加非example环境文件、证书/私钥路径 |
| 本轮仓库改动 | 新增本预检，更新CURRENT、文档索引和对话合同的迁移/回退边界；未改业务源码 |
| 正式制品 | 后续获授权后从干净提交生成306文件runtime，未绕过原打包器门禁；精确来源及hash见下节 |

完整候选路径/字节摘要见 `P/source-inventory-initial.json`；本轮文档变更与业务源码未变核对以 `P/source-inventory-final.json` 和 `P/source-delta-this-turn.json` 为准。候选中的已有交接/11日发布记录修改也保留在清单内，不能隐式遗漏或覆盖。

## 获授权后的本地提交与制品

用户明确回复“允许”后，重新核对100文件最终inventory及NUL路径清单的SHA、HEAD/tree、空暂存区、全部工作树字节和既有通过日志。只暂存指定100文件，再逐项核对index blob与冻结清单，`git diff --cached --check`通过。提交 `79e91dd590a8e267991091c044e5a307394aaa0b`，tree `84a3d3574139c273fff8aacee1dd53f7bfccdda4`，父提交为原 `f1a6c8f`；100个提交路径和字节完全相符，工作树干净。证据 `P/precommit-verification.json`、`staged-verification.json`、`source-commit.json`。未推送。

正式执行 `node scripts/prepare-runtime-release.mjs conversational-comic-20261113-79e91dd` 退出0。它从Git提交blob取源，在独立临时目录以空npm配置和允许的环境变量执行锁定依赖安装、Admin及avatar-web构建；没有改变项目依赖或配置。构建保留fsevents install-script未批准提示及大chunk提示，未通过批准脚本或修改门禁屏蔽。两项Web构建成功，构建产物与旧生产制品逐字节相同。

| 产物/来源 | 实际值 |
| --- | --- |
| Release ID | `conversational-comic-20261113-79e91dd` |
| Source HEAD / tree | 上述 `79e91dd…` / `84a3d357…`，`includesWorkingTreeChanges=false` |
| 文件数 | 306项manifest文件；tar共307个普通文件，额外一项为manifest |
| 保存位置 | `P/artifacts/conversational-comic-20261113-79e91dd.tar.gz`、`P/artifacts/runtime/` |
| 归档SHA256 | `0bb5a823631bad03bedb986fd7153ff4a2c957377fbdc83115e7d89f29856212` |
| Manifest SHA256 | `ed7442b1f0bc0fab75934abd5c86c54e66bdea7ff7173103f8ef9ffd8410e5a3` |
| 对生产增量 | 18修改、7新增、0删除、281不变；含059/060、漫画0.1.6原七scope |

独立只读审查27/27通过：提交来源/100文件字节、manifest完整文件集合/逐项hash、tar路径/重复项/类型/内容、60项迁移及漫画版本/scope、精确runtime增量、无真实env/测试夹具或私钥块。证据 `P/independent-runtime-review.json`，SHA256 `94c38012d17d948c3fb7cae3514584ae92fac861864ba63c74a44a9c39621439`；打包日志 `P/runtime-package.log`、产物回执 `P/runtime-artifact.json`。提交与打包后、更新本节前，工作树仍干净。

本节、CURRENT和索引为打包后的文档补记，保留未提交，不改变上述源提交或制品。业务源码和已通过的整仓/PG测试对应字节未变，未重复运行无关检查。正式runtime打包成功不等于iOS归档成功、已部署、后台上架或真机验收。

## 生产部署与开放实证

用户明确允许服务器部署更新后，使用冻结的`conversational-comic-20261113-79e91dd`制品和已审查的7文件工具完成维护窗口。执行回执已复制到`P/production-execution/`，来源为服务器`/opt/projects/marvels-chat/backups/conversational-comic-20261113-79e91dd-execution/`；没有读取环境密钥或受保护接口。

- `execution-state.json`：`stage=traffic_opened`、`trafficOpened=true`、`maintenanceActive=false`、`migrationFrom=58`、`migrationTo=60`，active runtime为`/opt/projects/marvels-chat/releases/conversational-comic-20261113-79e91dd/runtime`。
- `production-migration.json`和`migration-status.json`：生产从58应用059/060，账本60/60、无pending、checksum全部匹配，新表owner为`marvels_chat`，供应商调用0。
- `recovery-point-verified.json`：停写058恢复点独立恢复验证通过，旧表/序列/元数据/约束保持，隔离cluster已停止；`restored-upgrade-verification.json`再次验证从该恢复点前向升级到60。
- `runtime-verification-final.json`：API、AI task worker和媒体检索worker active且心跳/poll推进，流量开放前验证通过；备份timer在开放后只读检查中为active。
- 开放后只读：`/api/health` 200、`/api/ready` 200且数据库connected/migrationsCurrent=true；队列无active/passive任务，6条历史media cost unknown未重试或修改。账本只读回执`post-open-ledger-readonly.json`记录count 60、max `060_station_post_submissions.sql`及059/060 checksum。

该部署只证明服务器和数据库合同已上线，不证明iOS新包、TestFlight可安装或真机功能通过。部署后通过已登录后台正常UI核对到registry为漫画日记 Agent 0.1.6，而现有已发布 Release/Product仍为0.1.5；同一时点公开`GET /api/agents`返回8项且没有`comic-diary`。随后在本轮用户继续授权下，已通过正常后台UI创建、审核并发布漫画 `comic-diary` 0.1.6 Release，再创建、审核并发布绑定该Release的产品版本0.1.6；旧0.1.5保持不变，用户授权未自动迁移。公开只读复核已返回9项，漫画为`releaseVersion: 0.1.6`、`published: true`、`catalogStatus: published`、`identity.published: true`，`/api/health`与`/api/ready`均200。该结果说明目录缺失是Release/Product与runtime registry版本不一致造成的发布门禁结果，不是客户端解绑问题；仍不能替代本人重新同意0.1.6权限或真机验收。

## 生产只读实证（部署前历史快照）

北京时间09:20起通过正常SSH及公开HTTP检查，未提取浏览器登录态、未请求受保护HTTP或修改远端文件/数据。冻结只读审计工具的30项检查全部通过；原失败部署证据及独立恢复证据分别校验，未改写为同一成功回执。以下读数属于部署前历史快照，已被上方生产部署与开放实证取代。证据 `P/production-readonly.json`，SHA256 `4fac5f52f7179eab1fae38f61e9d13f59bf18c1e558c034c7e771d60deca01eb`。

- 当前runtime仍为 `chat-comic-20261111-f1a6c8f/runtime`，299项manifest及字节摘要相符；账本仍58项、checksum一致。
- API、AI任务Worker和媒体检索Worker active、同源、0重启；备份timer正常；env、Nginx字节/语法和共享路由保持。
- `/api/health`、`/api/ready`、`/api/agents`均200；公开9项，漫画仍0.1.5、UI-Agent0.1.0。漫画精确Release/Product与七scope匹配，公开目录可见。`ready`对应当前058运行版本，不能证明候选060上线。
- 09:24的repeatable-read只读事务中，全部active/passive队列计数0。历史媒体费用unknown仍6条，摘要与11日相同，未重试、清理或修改。证据 `P/production-queue-readonly.json`；这不是未来切换时的排空保证，执行前须重新检查。
- 09:26的只读心跳查询中，AI近期ready 1个、心跳年龄2.918秒，能力为 `agent_message/comic_render/site_draft`；检索近期ready 1个、年龄4.793秒。只返回计数/能力/时间，不读取私人消息。证据 `P/production-heartbeats-readonly.json`。

## 已有058数据升级与恢复

新建独立loopback PostgreSQL专库，先由现有迁移工具应用001–058，再写隔离fixture，使用现有 `applyPendingMigrations` 升级059/060。没有复制生产数据、连接生产写库、调用Provider或修改SQL来放宽验证。

37项隔离检查通过：72张旧表（16张有fixture数据）的行JSON摘要在升级前后保持；仅新增059/060、60项checksum为current，重复执行0新增，历史checksum篡改明确拒绝。058备份恢复和含新预览/发布回执的060备份恢复均验证通过。所有权、不可变内容及原引用约束均按真实PostgreSQL检查。

锁竞争也实际执行：059被旧聊天表读锁阻挡时，在1.5秒明确报55P03，059事务完整回滚，账本仍58且无半建对象；释放锁后可应用。060被旧帖子表读锁阻挡时，已提交的059保留、060完整回滚，账本为59且060 pending；释放锁后仅应用060。

**迁移是逐文件事务，059与060不是整体事务。** 任一步失败都应保持维护，读取真实账本/对象/checksum后决定修复或恢复；不以命令失败推断数据库仍58。两次验证脚本自身错误（表名正则漏数字、负例先撞唯一键）已保留原日志并修正验证，未改业务SQL，不能计为业务缺陷或成功执行。

升级后的同一专库继续运行三组仓库PG集成测试，36/36通过、0失败、0跳过；不把整仓环境门控skip计入PG通过。回归测试会更新目录/registry时间戳，并新增7条fixture运行和54条usage审计；复核其余68张旧表及原有usage记录保持，不笼统声称测试后72表仍完全不变。升级和备份恢复本身的72表不变已在测试前独立核验。

本轮cluster在确认端口63170、角色与精确data_directory、其他客户端连接0后停止；`pg_ctl stop`退出0，随后`status`退出3。完整脚本、058/060备份、数据摘要、两次harness失败日志、测试和停止证据已保留于 `P/migration-upgrade/`。汇总 `result.json` SHA256为 `9d30b0e69c482cfa66a872fea095b77ac74d70a6333d3fddc9663389b0b8b3ba`；升级回归日志 `upgraded-schema-regression.log` SHA256为 `378fedbe13bf942b9ec7d48a104af9f758579ac8c6647d96bbc44f35b06753f7`。隔离fixture数据量小，不能据此估算生产迁移时长或锁等待。

## 本轮整仓与iOS

`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 本轮实际退出0，`All repository checks passed`：RN111套1374项、Backend1148通过/402环境门控跳过、Agents59、Admin52、Avatar29、检索Web4；类型、lint、格式与Web构建通过。完整日志 `P/repository-check.log`，SHA256 `53d3a64d5a772fff4e9b40a3836a0d6fbecd26275191f4d50dc8b1bd56551048`。React act警告和Web chunk提示仍保留。

iOS只读汇总 `P/miaoxun-ios-preflight-20261113-summary.json`，SHA256 `46b594796448ac7bf1e6782fdc07002868af7b7afb0d2d07d2ff6ba10f43aa26`：

- Xcode26.6（17F113），Release build settings读取成功；正式Bundle/API/Team正确，磁盘仍1.0（58），未改版本号；Podfile.lock与Pods/Manifest.lock相同。
- 固定iPhone17为Shutdown。官方build-only在只读容器检查时退出1，`Unable to lookup in current state: Shutdown`；尚未开始编译，未boot/install/launch或绕过保护。不是源码编译失败，也没有当前候选的原生编译/设备视觉通过证据。
- `bundle check`缺8个锁定gem，未安装；CLI有3个Development、0个Distribution身份。该CLI结果不否定11日正常Organizer上传成功的旧证据。
- 配对iPhone14 Pro实读正式Bundle为1.0（62）、`builtByDeveloper=true`；未启动App或读取私人内容，不能独立认定TestFlight安装来源或功能通过。Build62归档及符号副本与既有JS摘要相符，但均不包含当前候选。
- 未重新读取ASC最高构建号，未选择新号、填出口合规、改变测试组或上传。用户此前要求自行处理的Apple操作继续保留边界。

## 执行门槛和回退边界

当前结论是**服务器已完成058→060部署并开放，漫画0.1.6 Release/Product已发布，Build63已归档并由Organizer上传Apple；Apple处理/TestFlight分发和真机验收尚未完成**。不能把后台公开可见或上传成功当成完整真机链路通过。

1. 已按用户批准的精确100文件范围本地提交和打包，来源SHA/tree、完整文件集合及hash核验通过，未推送；本步骤未授予生产部署、后台发布或上传权限。
2. 生产部署已完成并通过开放后只读验证；后续不重复迁移、不重试6条历史unknown，也不以旧058 runtime覆盖60账本。
3. 漫画0.1.6 Release/Product已按正常后台流程发布并经公开目录复核；当前0.1.5已发布产品保持不变，已有用户授权不自动迁移。Build63已由Xcode Organizer上传Apple，Build62缺`chatContent:1`，旧包新漫画消息会明确426，不能称已支持。Apple处理、出口合规、测试组和可安装状态仍需单独核对；用户仍须本人原位同意对应产品与scope，不解绑重建、不代同意。
5. 新客户端先取得当前源码的编译、签名及设备证据，再只读核实ASC最高号；归档、上传、Apple合规/分发分别按已明确范围执行。模型费用另核环境/次数/格数，不沿用已用过的“小猫与小狗”一次授权。

迁移前失败可保留原058完整runtime/数据库。迁移到59或60后，**只切回058旧runtime并不能恢复就绪**：旧 `checkMigrationStatus` 会拒绝未知059/060账本。仅在保持维护、确认没有开放后新写入时，才能按已验证的完整058恢复点恢复数据库并配套原runtime；不手动删表、删账本或改单项checksum。开放后存在新预览、授权、任务或发布回执时，旧备份不能覆盖新业务，优先前向修复，恢复范围须重新确认。

后续设备验收依次是：原聊天直接提案/一次确认/紧凑四格与详情、明确选图及撤权、独立保存日记、本人编辑发布与结果未知恢复；再复验长输入/表情、二楼退出、妙页卡片和已存在Agent的真实能力。UI-Agent添加与旧漫画原位同意已有用户真机通过证据，不重复实现；UI偏好执行、其他Agent供应商质量、语音/普通附件/群聊缺口不因本预检宣称完成。
