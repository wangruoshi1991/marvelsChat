# 2026-11-06 妙页布局、头像与真实协作计数验收

## 范围与候选

用户解锁 Mac 后续验收。使用 iPhone17 / iOS26.5 Simulator，以及独立 Bundle `com.wangruoshi.miaoxun.collaborationQA20261105`，显式连接隔离 API `http://127.0.0.1:4395`。没有改正式 Bundle、API、Build Number 或 Keychain，没有提交、推送、部署、上传 TestFlight 或新增供应商调用。

读取既有真实模型成功任务 `c50d8297-2331-4cd3-89cb-0dece23496ea`：唯一 feed 条目、管家与三专业 Agent。正文是此前真实生成并落库的文字分镜、视频脚本、形象建议与管家汇总，不是图片或视频成品。QA API 不运行 Worker、不带供应商密钥；模型创建接口明确 503。

最终候选正常 Xcode 构建、安装并启动；本地 Build58 仅为测试 Bundle 的版本，不能混同 TestFlight58/59。JS SHA256：`80510f4fc63f0b09114f6ca62d4b2870e9c709a93c6e0241798a6dbf47523377`。候选元数据与实际截图位于 `/tmp/miaoxun-simulator-20261106/`。

## 实际验收与修复

| 项目 | 本轮实际证据与结论 |
| --- | --- |
| S0 | 唯一真实任务、顶部独立头像与名称、菜单、状态、更新时间和人数；正常点击展开本卡详情。 |
| S1 | 人数入口显示四位实际参与者的职责、贡献状态与时间；详情弹层可关闭并打开对应聊天。 |
| S2 | 受保护真实文字在同一卡片撑高显示，保留概要；未跳至完整 workspace。 |
| 瀑布 | 实测发现展开仍半宽；改为摘要配对、S1/S2独占整行，收起恢复半宽。按 kind:id 保存三态，轮询和列模式改变不丢状态，账号切换清空。实际点按与截图验证通过。 |
| 窄卡头像 | 实测四头像因菜单占位而排成四行；改40pt头像列、26pt图片、4pt间距，保留全部名称与44pt菜单。最终截图为两列两行。 |
| 动画重抓 | 代码复现快速反向重抓将当前位移强制归零；改原生停止位移加本次 dx，过期异步回执失效。补 Feed active/前后台透传，离页后不触发状态切换。回归通过，原生体感待验。 |
| 不使用麦克风的布局入口 | 新增妙页浮动入口具名无障碍操作「打开快捷菜单」「切换任务布局」，不启动语音。Simulator 实际通过系统自定义操作切换瀑布，原长按语音保留。 |
| 图片头像 | 隔离真实 HTTP 上传透明机器人 PNG，正常发布 release/产品版本并同范围授权升级后，实际 App 的讯页、妙卡及漫画贡献聊天显示图片、透明底色与白环。仅发布 release 而未升级已授权产品时继续显示旧 mark，符合版本授权合同。测试图不是正式蓝湖资产。 |
| 聊天贡献 | 新候选实际打开漫画聊天，读取此前真实文字分镜全文；头像升级后贡献仍存在。三专业记录均经 API 核验，本轮未新增生成。 |
| 协作次数 | 实际发现任务成功后四位 Agent 仍显示0。指标原只读冻结轮表，而当前轮状态来自 workspace；修正后实际 bootstrap 和我页四位均协作1次。管家多个节点同轮只计1，等级仍按每10次升级，当前 Lv.1；偏好未评估，未填假百分比。 |
| 二楼 | 实际打开相册/文件；相册只有上传入口和真实空态，没有连接手机相册卡；文件无「我的成果」区域。通过正常 API 上传本地自创长文后，App 详情实际读取正文。 |
| 原生选择器 | 聊天相册和文件可打开系统选择器并取消；没有选择私人媒体或发送内容。相机明确提示模拟器不可用，语音明确提示需要真机，返回后可继续操作。 |

布局参照原 PDF 第2–4、13–14页，保留当前产品配色，未复制示例中的商户、优惠券、图片或虚构业务动作。单条真实任务无法证明多条实际任务混排的原生表现；混合 task/workspace、同 ID、轮询、窄屏和账号切换用定向回归验证。

连续拖动与滚轮在当前 CUA/Simulator 中未产生可可靠判定的连续触摸：一次从标题拖动实际触发详情点击，正文拖动/滚轮多次未改变画面。不能据此把左右方向、跟手、回弹、抖动体感、二楼下拉/上滑或文件上下阅读不误退出记为通过；也不能仅据工具无效断言产品失败。未使用按钮点击冒充手势验收。

## 修改文件

本日增量（保留此前已有脏工作区）：

- `MiaoxunRN/src/features/miao/useMiaoCardGesture.ts`、`MiaoTaskCard.tsx`、`MiaoTaskFeed.tsx`、`MiaoTaskAgent.tsx`、新增 `miaoFeedRows.ts`。
- `MiaoxunRN/src/features/workspaces/AgentWorkspaceCard.tsx`。
- `MiaoxunRN/src/features/agents/VoiceShortcutDock.tsx`。
- `MiaoxunRN/__tests__/miaoCardGestureContinuity.test.tsx`、`miaoTaskFeed.test.tsx`、`voiceShortcutDock.test.tsx`。
- `backend/src/agent-user-metrics.js`、`backend/test/agent-user-metrics-postgres.test.js`。
- 本记录、文档索引与 `docs/handoffs/CURRENT.md`。

计数没有新增字段、API、迁移或回填：现有 `metrics.completedWorkspaceRounds` 读取当前轮 workspace 状态，历史轮读冻结状态，要求节点成功并按 Agent/workspace/round 去重，三层 owner 一致。需新后端制品才能在线生效；RN 布局与无障碍入口需新版客户端。

## 测试与构建

新增回归均先失败后修复；分别覆盖异步原生 offset、失效回执、账号/路由切换、瀑布混排行模型、宽度与无麦克风入口。独立最终代码审查无确定 P0/P1/P2 发现，不能代替设备体感。

```sh
cd MiaoxunRN
npm test -- --runInBand miaoCardGestureContinuity miaoTaskFeed stablePanResponder miaoCardState workspaceParticipantModal secondFloorGestureContinuity
npm test -- --runInBand voiceShortcutDock
npm run typecheck
# 同步对修改文件运行 ESLint 和 Prettier
cd ..
MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh
git diff --check
# 专用、完整迁移的空 *_migration_test 库；不是 QA 原成果库或生产
RUN_AGENT_USER_METRICS_POSTGRES=1 MIAOXUN_DOTENV_ENABLED=false DATABASE_URL=<isolated-url> node --test backend/test/agent-user-metrics.test.js backend/test/agent-user-metrics-postgres.test.js
```

- 最终整仓退出0：RN91套1159项、Agents55项、Admin49项通过，TypeScript/ESLint/Prettier与各工程构建通过。Backend1052通过、322数据库门控跳过；跳过不记通过。日志 `/tmp/miaoxun-simulator-20261106-final-repository-check.log`。
- 统计专用 PostgreSQL 加单元7/7通过，覆盖当前轮成功但轮表queued、历史成功当前失败、同 Agent 多成功节点计1、owner越权排除及普通聊天去重；无需用生产数据验证。
- 正常 Xcode Simulator 构建退出0，日志 `/tmp/miaoxun-simulator-20261106-final-build.log`，仍有既有 Pods/脚本警告。

```sh
cd MiaoxunRN/ios
xcodebuild -workspace MiaoxunRN.xcworkspace -scheme MiaoxunRN -configuration Debug -destination 'platform=iOS Simulator,id=7E81531F-02AE-40FC-98DA-A575CEC9930F' -derivedDataPath /tmp/miaoxun-collaboration-qa-20261105 PRODUCT_BUNDLE_IDENTIFIER=com.wangruoshi.miaoxun.collaborationQA20261105 MIAOXUN_API_BASE_URL=http://127.0.0.1:4395 build -quiet
```

## 收尾与未完成

QA App 已卸载；正式 App 的 Bundle 路径与 JS SHA256 与开始前完全一致，未清正式 Keychain或改变其登录凭据。记录 `/tmp/miaoxun-simulator-20261106/app-cleanup.json`。

隔离服务的头像/文件/授权/会话/密码与数据库进程收尾证据统一位于仓库外 `collaboration-eval/client-qa-20261106-layout/cleanup-verification.json`。独立复核确认原密码摘要与最初基线匹配、4项授权撤回、活跃会话0、旧mark产品恢复、新图片版本暂停/下架、临时管理员禁用、文件正常删除后404，API/专PG/socket停止且私有凭据删除。真实workspace与六节点完整行在清理前后指纹一致；最初两份workspace/node摘要的SELECT口径未保留，不能声称与最初摘要精确匹配，证据已保留该限制。

剩余必须分别验收：实体 iPhone 连续手势与阅读防误退出；真实麦克风、相机、定位、媒体上传发送；UI-Agent 正常授权、真实预览、确认、重启与撤销恢复；媒体检索的真实供应商质量。微信/邮箱/日历/群聊缺少实际业务接入的部分仍未开放。Build59 不含本轮和此前后续修复；本轮未部署或上传。
