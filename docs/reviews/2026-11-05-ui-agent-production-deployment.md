# 2026-11-05 UI-Agent 配套后端生产发布

结论：`BACKEND_DEPLOYED`。用户明确确认生产维护、新停写备份与恢复核验、055/056迁移和API/双Worker同制品切换。正式UI-Agent产品发布、用户独立授权、真实模型验收、TestFlight上传和实体设备交互不在本次执行范围。此前制品证据见 [发布前记录](2026-11-05-release-preflight-evidence.md)，实施方法见 [执行方案](2026-11-05-ui-agent-release-plan.md)。

## 制品与窗口

| 项目 | 实际值 |
| --- | --- |
| release | `ui-agent-candidate-20261105-cebc1e6` |
| 源提交 | `cebc1e6d5c7848fc630f1e8453b0c3bfbad774f3` |
| source tree | `9c187fd8a495edaf92ce0b9b48f94cfff95487ae` |
| 归档SHA-256 | `a385f6a054d2ffd2abe2631ba2b0550d94870343ad73ba594f21b00655b1114e` |
| 当前runtime | `/opt/projects/marvels-chat/releases/ui-agent-candidate-20261105-cebc1e6/runtime` |
| 旧runtime，保留未删除 | `/opt/projects/marvels-chat/releases/app-collaboration-20261103/runtime` |
| 维护开始 | 2026-11-05 10:28:20 +08:00 |
| 恢复公网 | 2026-11-05 10:40:24 +08:00 |
| 维护时长 | 约12分04秒，包含新备份的完整恢复及约束核验 |
| 实际服务器工具链 | Linux x86_64，Node22.22.1/npm9.2.0，PostgreSQL18.6/pgvector0.8.1 |

服务器先核验旧276文件和候选284文件的完整manifest哈希，再在独立新release目录执行 `npm ci --omit=dev --no-audit --no-fund`，使用真实后端锁文件，未复用开发依赖。候选配置加载通过，没有新增UI专用密钥；显式设置 `AGENT_WORKSPACE_MAX_CONCURRENT=4`，表示每进程并发节点上限，参与Agent数量仍按需求与依赖图决定。其余既有供应商配置保持原范围。沿用受限env与storage关联，使用候选 `scripts/harden-production-release.sh` 加固新代码与父目录，env仅服务组可读，storage由应用身份写入。

## 停写与可恢复性

HTTP/HTTPS、WebSocket入口和后台均验证 `503 + Retry-After:120` 后，暂停备份timer并优雅停止三个服务，确认全部inactive、应用数据库没有其他客户端连接且无prepared transaction。停止前任务、协作、媒体和3D均无运行队列；费用账本原有6条unknown保留，没有清空或重放。

恢复资料保存在服务器受限目录 `/opt/projects/marvels-chat/backups/ui-agent-20261105-cebc1e6/`，root所有、0700；dump及含环境文件的旧runtime归档为0600。没有把这些敏感文件写入仓库或公开日志。

| 恢复点 | 结果 |
| --- | --- |
| 新停写完整dump | `stopped-write-054.dump`，930233字节，保留owner/ACL |
| dump SHA-256 | `fe965ad4b853f50dac2f83a875a0dc8a91a25e61e2ee48dbb8981d8b6a726ed5` |
| 旧runtime完整归档 | `old-runtime-full.tar.gz`，26147296字节，逐项核验旧manifest |
| 旧归档SHA-256 | `3c5516747eb9251f0ad725bf3edfedd547d4f85a5180d21a6e254df0fdd6dac3` |
| 恢复环境 | 服务器独立PostgreSQL18.6集群，仅0700 Unix socket，无TCP监听，不启动应用/Worker |
| 数据 | 74张原表的计数与有序JSON数据摘要全部一致 |
| 序列 | 7个序列的定义、依赖、last_value/is_called一致，未用nextval验证 |
| 权限与结构 | database/schema/relation/function/default ACL、所有者、RLS标记及扩展版本匹配；所需角色无密码、NOLOGIN重建 |
| 约束 | 1168个；32个CHECK的数组cast反编译格式变化，在副本事务中重解析源定义，与恢复定义完全一致后回滚探针 |
| 备份身份 | 副本SET ROLE读取和完整导出通过；未从生产查询角色口令/hash |
| 清理 | 临时恢复集群停止并删除，生产PostgreSQL保持运行，受限恢复点保留 |

初次副本恢复发现历史对象引用额外角色，按原库必要对象角色元数据补齐后重新恢复；未修改生产角色或权限。运维辅助查询另修正SQL NULL输出和sequence不具复合类型的处理，均发生在生产迁移之前。约束反编译差异经PostgreSQL解析证明等价，没有用忽略约束或修改历史迁移来绕过验证。

完整dump由本机postgres peer执行 `pg_dump --format=custom --compress=6` 创建，未使用既有备份脚本的 `--no-owner --no-acl` 选项。角色元数据、恢复二进制SHA及原env/服务配置另行受限保存，不导出数据库角色密码。副本使用 `pg_restore --create --exit-on-error` 保留owner/ACL；没有执行会删除生产库的恢复脚本。

## 迁移与切换

同一候选在新停写备份恢复副本上先通过预检，再实跑055/056及升级后预检。8份用户资料在升级前后各错误计数均为0，副本应用两项约16.04ms。此前锁超时与部分提交分支证据保留在发布前记录。

生产仍停写时重新比较全部冻结数据与元数据，确认无变化。由实际应用数据库身份加载候选迁移器，连接超时5秒，并在同一连接显式设置 `lock_timeout=5s / statement_timeout=30s / idle_in_transaction_session_timeout=30s` 后执行：

- `loadMigrationFiles()`、`checkUIPreferenceUpgrade()`：054 baseline正确，pending严格055/056，8份资料通过。
- `applyPendingMigrations()`：055、056各自事务成功，合计约17.92ms。
- 升级后预检：56/56，pending为空；新表存在、056索引ready/valid。
- 73张既有非账本业务表摘要、7个序列状态保持不变；新预览表为空。001–054历史迁移未改写。

原子切换app后启动API、AI Task Worker和媒体Worker；三个MainPID的真实cwd均为同一新runtime/backend。维护中API ready返回数据库connected/migrationsCurrent；AI心跳跨两个30秒周期证明普通任务与workspace的lastSuccessfulPollAt前进，activeNodes为0；媒体ready心跳持续更新。仅证明服务与轮询可用，没有提交真实模型任务。

实际备份登录身份验证继承读取、CONNECT和BYPASSRLS，并成功读取新表；随后用该身份完整导出902673字节，TOC含 `ui_preference_previews` TABLE DATA和新贡献索引。该导出沿用日常备份的no-owner/no-acl语义，不替代上面的完整owner/ACL恢复点。其SHA为 `b8ad13b57cba1ae828eb2f25dd7a331d55aecc8bd40272d58bdad6defe2a1984`。

## 已开放与验收边界

原Nginx配置逐字节恢复并通过 `nginx -t`，reload后移除维护标记，恢复备份timer。公网TLS校验、health/ready/agents/admin均200；后台JS/CSS加载成功，CSP等安全头保持有效。候选284文件manifest在启动后再次匹配，未出现结构化启动错误。preview/confirm/reset/undo和旧UI偏好入口未认证均401；没有为验收读取或伪造用户会话。

10:43–10:44 +08:00独立只读线上审查再次通过：284文件全SHA和56项SQL/账本集合及校验一致；API/双Worker零重启，3个实际Node进程cwd均指向新制品。AI任务轮询从02:42:32Z推进至02:43:02Z，workspace同样推进，所检查60秒窗口Worker错误0；媒体ready心跳最新约2秒。公网后台index及JS/CSS逐文件哈希与候选一致；备份timer active/waiting，下次计划12:20 +08:00。此独立审查未读env或用户内容，也未执行生产写入。

公开Agent仍8个，UI-Agent尚未正式发布，属于本轮预期边界。发布registry文件、API启动、心跳和预检不能代替正式product/release、用户同意或真实模型协作验收。Build58不包含本轮客户端代码，本次没有上传TestFlight或覆盖日常实体设备App。

脱敏证据固定保存在本机 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/ui-agent-candidate-20261105-cebc1e6/production-20261105/`，主记录为 `deployment-verification.json`，含停写备份/完整恢复/迁移/进程身份/心跳/实际备份登录与导出/公网验收报告。生产恢复资料与密码不复制到该脱敏目录。

公网开放后已经进入保留新写入的阶段：后续故障优先同合同前向修复；不得仅切旧制品或用054 dump覆盖新增业务数据。下一阶段依次为正式UI-Agent发布及独立用户授权、获准真实模型验收、新客户端分发与实体设备交互验收。
