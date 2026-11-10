# 2026-11-05 UI-Agent 正式上架与 Build59 分发

状态：`UI_AGENT_PUBLISHED / BUILD59_TESTING / DEVICE_AND_REAL_MODEL_PENDING`。本记录承接已完成的[后端生产切换](2026-11-05-ui-agent-production-deployment.md)。用户已分别批准 UI-Agent 0.1.0 release/同版本 iOS/Android 产品发布，以及 Build59 分发签名、TestFlight 上传并沿用原测试组。用户自身 UI 权限同意、付费模型调用和实体设备安装验收不包含在上述授权内。

## 正式发布与独立核验

全部写操作通过已有认证的运营后台正常表单和审核流程完成，没有直接更新数据库、伪造管理员身份或代用户开通。

| 对象 | 实际值 |
| --- | --- |
| Agent | `ui-agent`，`0.1.0`，显示名称 `UI Agent` |
| release | `e27b8685-0105-4fc3-96c1-c6cdde4ca30f` |
| release 合同 | `ab702c08f7cae44fb1a260fda75a6d24dc71c66d1aaea003563b5346fb3f4a57` |
| release 发布 | 2026-11-05 10:59:50 +08:00，draft → review → published |
| 产品 | `fa9b423f-dc2f-4c1c-9773-13c01affacd5` |
| 产品版本 | `65099dd0-befe-47fd-9073-4d5d4b5e9127`，`0.1.0` |
| 产品合同 | `443c5a3f94f00ec60b54123075d14ca61a26a587d015aac6fd11d0f02aa3ccdc` |
| 产品发布 | 2026-11-05 11:07:01 +08:00，draft → review → published |
| 平台 | `ios`、`android` |
| 唯一依赖 | 上述精确 UI-Agent release；没有绑定其他版本或扩大 scopes |
| 权限 | `profile:read`、`messages:read`、`ui-preferences:write` |

11:10:57 +08:00独立检查14项全部通过：公网TLS验证及 `GET /api/agents` 返回200，公开Agent由8增为9，UI-Agent版本、合同、身份和发布状态正确；实际数据库 registry/release/product/依赖精确一致，两个合同SHA重新计算匹配。release和product的三段状态历史均有真实actor和requestId，usage审计存在操作人。数据库检查使用只读事务并回滚，不读取生产用户身份或私人内容。

截至该检查，UI-Agent entitlement总数、启用数和用户数均为0，`user_agents`投影总数和启用数也为0。用户须自行经过现行App产品授权流程；上架、readiness或公共目录可见都不是用户同意或真实模型质量证明。若需停止提供此产品，应使用正常产品暂停流程，不直接删记录；暂停和恢复不会替用户同意新权限。

脱敏证据位于本机制品目录 `ui-agent-publication/verification.json`，截图为 `ui-agent-publication/product-published.png`。核验同时确认生产额外的 `polar_catalog` schema 没有普通/分区表、外部表、视图或序列；没有为此重新恢复或修改数据库。

## 客户端归档

由 `cebc1e6d5c7848fc630f1e8453b0c3bfbad774f3` 对应源码执行本地 Release archive：

```sh
xcodebuild -workspace MiaoxunRN/ios/MiaoxunRN.xcworkspace \
  -scheme MiaoxunRN -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/miaoxun-build59-cebc1e6-derived \
  -archivePath '<外部制品目录>/ios-build59/MiaoxunRN-build59.xcarchive' \
  CURRENT_PROJECT_VERSION=59 \
  MIAOXUN_API_BASE_URL=https://8.153.167.11 archive
```

- 实际archive退出0，用时76秒；Xcode26.6(17F113)，iphoneos26.5。
- 版本 `1.0 (59)`，Bundle `com.wangruoshi.miaoxun`，API `https://8.153.167.11`。
- `main.jsbundle` 5603303字节，SHA-256 `031f61bf24781175616bd35c21a849054bd2677e57ebd84f8984b3e1550cb45e`；458个源码输入归档前后与源提交逐项一致。
- 原始归档 `codesign --verify --deep --strict` 通过；签名为 Apple Development，profile `get-task-allow=true`。后续分发签名在下节单独核验。
- 工程磁盘Build仍58，未修改源码、锁文件、依赖版本或设备App。Organizer复用既有云端分发签名和profile，没有创建或撤销证书；未将缺少本地私钥误当成必须新建凭据。
- 原始archive只有App dSYM。已校验官方完整下载包SHA，并仅在副本补齐React、ReactNativeDependencies、Hermes三个dSYM；四个二进制与dSYM的arm64 UUID全部匹配。原始225项及xattr未变，副本只新增三个dSYM共27项，App/JS/配置/profile/CodeResources字节相同。
- 当前未设置出口合规声明键；Build58的既有声明不能直接当作Build59的新声明授权。后续如出现法律或合规确认，应按实际问题处理。

外部证据 `ios-build59/verification.json`、`symbols-verification.json` 和 `symbols-preparation.md` 保存完整命令、源码清单、官方符号摘要与UUID。原始archive保持不变。

## Apple 校验与 TestFlight 上传

- Organizer Validate 已于11:22 +08:00显示全部校验通过，日志无critical错误。保存的真实分发IPA为19715076字节，SHA-256 `2f01ca9a2a5093111c0b2e7dc6fe94020a61382e89671f6ec2b34b00bc749a5d`；Apple Distribution严格验签通过，profile `get-task-allow=false`、`beta-reports-active=true`，无设备列表；内嵌JS、origin和Build不变。
- 用户恢复App Store Connect登录后，实时列表和最新上传记录均以58为最新，没有59。原内部/外部测试组均为既有 `yunzhi`；未修改成员、新建测试组或触碰App Store正式审核。
- 最终上传review确认 `1.0 (59)`、arm64、Symbols Included，使用已有Cloud Managed Apple Distribution及Store profile；已关闭自动版本管理，保留符号上传，不限制为internal-only。随后执行已授权的唯一一次Upload，11:43:11 +08:00日志记录Upload succeeded，Organizer显示App upload complete，App Store Connect同步出现Build59且为“正在处理”。上传成功；随后Build59出现“缺少出口合规证明”。用户当次确认“不属于上述的任意一种算法”后已保存，状态更新为准备提交；继续复用原内部/外部yunzhi测试组并发布测试。
- 独立固定了本次实际上传IPA（19715089字节，SHA-256 `8ab4281e2c22199ead6b1dc26eab20007e30518d930c7a571ca5fe4db61d537c`）、同次staged App和四份dSYM。Organizer收据为Uploaded to Apple/success、Build59、0 errors/0 warnings；严格分发验签通过，四组UUID匹配，JS来源一致。外部原归档与符号副本完整manifest/xattr未变。证据为 `organizer-upload-distribution/verification.json`、`upload-receipt.json`、`upload-status-redacted.log`。
- 已在Build59详情核对两组精确ID：内部 `818141ae-7dc1-42c8-8976-b6683da78bd8`、外部 `04a99079-1004-4961-a929-0c09de1ccdc1`；外部7人，未修改成员或新建组。填写本轮实际验收重点（手势/滚动、妙页三态、贡献展示、UI偏好预览确认撤销），提交外部测试后已批准，再启动原组测试分发；最终列表显示 `1.0 (59)` **正在测试**、两个yunzhi群组、邀请7。
- Build59的ASC对象为 `d0a1b1af-88ec-4e6f-93e8-82e2d3ca31c5`。最终证据 `asc-build59-test-groups.png`、`asc-build59-testing.png`；这证明测试版可分发，不证明已安装、真实模型效果或设备交互通过。
- Validate保存包和实际上传包分别保留，不能混作同一制品；上传成功、处理完成和测试组可用分别核验。证据为 `organizer-validation-observation.json`、`organizer-validation-distribution/verification.json`、`profile-and-build-number-observation.json`、`organizer-upload-review.png`、`asc-before-upload.png`、`organizer-upload-complete.png`。


## 真实协作验收准备

静态复核确认：现有 `backend/scripts/agent-workspace-live-eval.js` 仅调用初始管家规划，不创建数据库workspace、不执行专业Agent或Runner，因此不能将该脚本通过称作多Agent真实闭环。

已在外部 `collaboration-eval/collaboration-eval-plan.md` 准备单一公开虚构故事案例：按需求让漫画分镜、视频脚本和形象建议三个不同专业Agent独立并行，再由管家依赖三份真实成果汇总。最终须核对同一个workspace的聊天关联、贡献API、妙页列表数据及真实成果；RN渲染、滑动和实体设备仍另行验收。

隔离工具的 `--prepare` 已实际运行：本地全新Unix socket PostgreSQL18.4（不同于生产18.6）完成001–056迁移并复查集群身份，正常HTTP管理员引导、注册登录、三个专业Agent release/product/用户同意、bootstrap、空workspace列表和401检查通过；结束撤销三项测试同意、登出会话、停止独立集群并删除socket目录。模型请求与被拦截调用均为0，未访问生产。证据为 `collaboration-eval/clusters/prep_1105_114016/evidence/report.json`；这些是工具与合同准备证据，不能证明真实规划、并发或模型成果。

另一次完整应用预演 `off_1105_114702` 在新建独立集群运行真实消息路由、持久化workspace、默认runAgent解析、真实Runner和贡献接口；只有供应商HTTP传输是明确标注的本地合成响应。三个专业节点于03:47:18.507/.508/.510 UTC开始，全部完成后管家汇总才于.608开始；同一workspace在feed唯一，三个贡献及数据库正文hash一致，越权404和幂等重放无额外调用通过。合成HTTP共7次，真实供应商0次，`modelEvidence=false`、RN/设备未验。结束三项测试授权撤销、会话退出、集群停止、socket删除。此结果证明本地应用编排和数据合同，不证明模型能正确选人、生成高质量成果或实体App表现；报告位于 `collaboration-eval/clusters/off_1105_114702/evidence/report.json`。

工具收口复验：22项不外发单测和12个外置模块语法检查通过（主执行方另复跑 `node --test test/harness.test.mjs` 为22/22、0跳过）；修后 `final_1105_121158` 再次执行完整隔离应用链，53次真实本地HTTP和7次本地合成传输通过，结束activeSessions=0。父进程在独立PG启动期间收到SIGTERM的故障演练也已确认仅停止本次集群，postmaster.pid与socket均移除，真实供应商调用0。`--live`继续锁定，独立审查已收口，下一次真实调用仍需明确供应商、模型、私有凭据来源和全局预算；上述语法/门禁/中断结果不扩展为模型验收。外部实际修改文件为 `cli.mjs`、`config.mjs`、`execution-policy.mjs`、`provider-gate.mjs`、`pg-guard.mjs`、`isolation.mjs`、`local-cluster.mjs`、`child-process.mjs`、`normal-http-fixture-protocol.mjs`、`runtime-child.mjs`、`offline-model-transport.mjs`、`product-path-review.mjs`、`test/harness.test.mjs`及说明/配置样例；具体执行入口、审批范围和保留证据见该目录 `README.md`、`adapter-review.md`、`live-approval-plan.md`、`verification.json`。

提议上限为8次真实请求、每次输出1200 tokens、全局共享持久预算、不重试、未知结果停止新派单。此为待审方案，不是调用授权。当前产品OpenAI-compatible请求没有输出token上限，须先准备外置传输预算保护；该保护不替代供应商账单限制，也不能用其局部测试冒充生产模型行为或模型验收。供应商、模型、数据和金额/调用上限仍需明确后才能执行。

## 分发后的设备验收清单

以下全部是待执行清单；上传、Apple Validate和本地应用预演不替代设备结果。

| 场景 | 必须观察到的结果 | 当前证据边界 |
| --- | --- | --- |
| 讯页/二楼 | 无顶部下拉文案；下拉进入、上滑退出跟手与回弹；普通内容滚动不误退出 | 候选源码/构建通过，实体设备待验 |
| 相册/文件 | 相册上传入口可用，无连接卡片；无成果区域，文件详情阅读不退出二楼 | 同上 |
| 妙页 | S0摘要；右滑S1参与Agent；左滑S2本任务成果；跟手、转场、回弹和返回正确 | 同上 |
| 多Agent | 按需求选多个Agent；无依赖并行、有依赖等待；同workspace在妙页唯一，贡献出现在对应聊天 | 隔离真实应用预演通过，真实模型/生产任务/设备待验 |
| UI-Agent | 用户本人授权后请求预览，确认才应用；合法插槽、持久化、撤销/默认、冲突/撤权显式失败 | 正式产品已发布，生产用户授权与设备效果待验 |
| 聊天 | 点按/长按语音、识别确认、发送；相册/拍摄/文件/位置和已接通加号功能 | 候选源码/构建通过，实体设备待验 |

## 本轮边界与下一步

本轮增加正式产品发布元数据并执行已授权Build59上传；没有改变已封存后端runtime来源，没有提交或推送工作区文档，没有付费模型调用或生产用户授权写入。

下一步为：在TestFlight安装1.0(59)后执行上表实体设备清单；获得有明确供应商与预算的真实模型范围后执行隔离验收；用户本人在App内同意UI权限后再验证预览/确认/冲突/撤销。
