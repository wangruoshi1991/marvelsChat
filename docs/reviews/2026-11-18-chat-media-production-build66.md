# 2026-11-18 聊天媒体配套部署与 Build66 上传核验

## 当前结果

- 用户已明确批准既定 060→061 生产维护、停写备份、隔离恢复/升级演练、runtime 切换及验证后开流。生产已于 2026-11-18 09:40 CST 恢复服务；不是仅完成本地准备。
- 现行 runtime：`/opt/projects/marvels-chat/releases/chat-media-20261117-43bbe01/runtime`，sourceHead `43bbe014186ff48ad76ecbf08a898bd5f3332437`，309 文件精确匹配，归档 SHA256 `aac7fe976fb0fd7a767be76da0eac0c14069786c0a5446508cb68844fd95f740`；账本001–061/checksum全部匹配，无pending。
- API、AI Worker、media Worker 实际进程 cwd 均为新 runtime，active/running、NRestarts=0。独立只读验收观察同一 AI 子进程两次成功 poll、AI/media 心跳前进；备份 timer 开流后恢复 active/waiting。
- 公网严格 TLS `/api/health`、`/api/ready`、`/api/agents`、`/admin/`、`/admin/products` 均200；目录9项，漫画0.1.6与UI Agent0.1.0保持published。未认证 `/api/custom-stickers` 与 `/api/me` 为401。共享 `/` 为200、`/suanming/` 为401。原Nginx字节恢复、持久维护marker已移除、env字节未变。
- registry/release/product/entitlement/user_agents 与公开目录完整指纹保持不变。本次部署没有模型调用、用户代授权、Agent发布或测试业务写入。

## 原失败与修正证据

1. v2 在恢复的隔离PG18中已提交061，但验证 trigger 列时用 `ARRAY(SELECT a.attname...)` 得到 `name[]`（OID1003）。本项目pg-types将此类型返回字符串，和JS数组精确比较误判，抛出`new_trigger_not_exact`。生产仍060、旧runtime、服务停止并保留503；门禁未跳过。
2. v3仅将该列查询改为`json_agg(a.attname ORDER BY a.attname)`，保留函数、触发器、列集合、owner、权限、新表为空和账本的精确检查。061 SQL和309文件制品不变。另新增严格rehearse入口，核对原root-only外层失败及唯一内层失败060→061回执；演练和resume-forward分成独立命令。原失败回执不覆盖。
3. v3测试夹具修正了旧路径、root证据读取及数组断言漂移。Python33/33、JS6/6和语法检查通过，独立代理复审通过。冻结工具清单SHA256 `030972d4f2820fffd1019615c05e78d5e2fed8f04139112c2f1fbadc8a670112`，服务器先只读验证工具/旧060/精确制品与停写维护，再执行。
4. 原停写备份恢复核验通过：79张原表数据、序列、角色/权限、逻辑schema、函数及trigger一致。v3在同一隔离克隆重验已提交061通过；旧数据/序列/元数据不变、新表为空、函数及trigger精确、备份角色可读，隔离cluster停止。新回执`restored-upgrade-verification-rerun-1794965776700321415.json`。
5. 生产resume-forward实际单事务060→061通过，storage校验复制、原子切换并启动三个unit；先保持维护至awaiting_open，再独立validate只读通过，最后open通过。原dump未恢复到生产、未自动降账本或回滚runtime。

生产执行证据保存在服务器`/opt/projects/marvels-chat/backups/chat-media-20261117-43bbe01-execution/`；停写备份、schema摘要与旧runtime资料在相邻`chat-media-20261117-43bbe01/`目录。执行state是累计历史字段，旧error/productionRuntime等不会自动清除；以最新stage、activeRuntime及实时链接/marker/进程/账本核验为准，不能把历史字段当成当前维护或当前runtime。

本机脱敏回执目录：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/chat-media-testflight-20261117/production-20261118/`。包含原失败、rehearse/resume/validate/open、public-post-open和完整公开目录。初始公网观察脚本误读`agents`而非`data` envelope导致count0，已从新鲜响应纠正，原HTTP一直200；错误路径`/api/me/custom-stickers`的404不是功能错误，正式路由为`/api/custom-stickers`且未认证401。

## Build66

- Xcode Organizer实屏显示`1.0 (66)`、`Uploaded with warnings`、Submission Build Number66、今天09:20。Organizer归档元数据uploadedBuildNumber66、errors为空；官方ContentDelivery日志明确`UPLOAD SUCCEEDED`/COMPLETE，已完成上传，不重复操作。
- 新脱敏上传回执：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/chat-composer-20261118/build66-upload-readonly-20261118.json`。上传副本产品与冻结原件一致，只有Info.plist新增Distributions元数据；实际上传重签名App严格签名验证通过、get-task-allow=false。557源码、43,220依赖、149条原归档清单及JS/Hermes证据保持一致，使用正式Bundle及HTTPS API。
- 上传警告90725是2027年4月起要求iOS27 SDK；本次没有被拒。此前归档记录的React/ReactNativeDependencies/Hermes框架dSYM缺失仍限制崩溃符号化，不能把上传成功解释为全部符号齐全。
- 上传后的首次检查遇到Chrome登录过期。随后只读核验App Store Connect，Build66已列入版本1.0，状态为「缺少出口合规证明」，测试组栏为空，Build65仍为「正在测试」。用户此前选择自行处理出口合规，处理后再核对Build66测试组和真实设备安装。
- 用户报告处理完毕后，App Store Connect实读Build66为「正在测试」，群组列有两个 `yunzhi`，对应现有内部与外部组。页面显示7个邀请，安装数仍显示「–」。Mac找到了配对的iPhone 14 Pro，但Xcode设备工具因手机锁屏无法读取已安装版本。

## 验证与剩余边界

- 本次发布工具Python33、JS6、远端隔离PG18恢复/升级及生产独立只读验证通过。已有11月17日整仓/隔离38项/Simulator证据保留，本轮不把历史检查冒充新跑。
- 新鲜`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：RN122套/1534项、Backend1153通过/410项PG环境门控跳过、Agents59、Admin52、avatar-web29、检索Web4；格式/lint/类型/构建及`git diff --check`通过。410项默认跳过不计PG通过；本次PG18停写恢复/061升级与生产验证另有实际回执。
- 测试组已核对，真机先确认TestFlight版本1.0（66）、冷启动及讯页同步。再验中文拼音候选、长草稿末行、表情/更多切换及妙猜猜入口，接着验二楼轻滑留在页面、明显上滑退出并回到原滚动位置。使用测试账号已有的非敏感图片验证预览和系统照片落盘，并检查漫画及UI Agent的现有会话和权限状态。真实发送、素材上传及模型生成按相应测试范围另行确认。
- 未新增Git提交或推送，保留发布树和Desktop既有修改；本轮不修改业务制品或另起架构。
