# 2026-11-06 UI 偏好持久化与检索入口续验

## 范围与结论

继续前一阶段后，核对 UI-Agent 的预览、确认、bootstrap、撤销和恢复默认，以及检索 Agent 的实际入口。本轮修复源码并执行隔离 HTTP、PostgreSQL、RN 回归和构建；没有调用供应商、读取私人媒体、修改生产、提交、推送、部署或上传 TestFlight。保留开始时全部未提交修改，不将它们全部计为本轮工作。

结论为有条件完成：下列并发与请求合同缺陷已经复现并修复。真实模型 UI 建议、App 实际重启后的完整预览确认流程、检索供应商视觉质量和原生连续手势仍未通过本轮设备验收。

## 已复现的缺口与修复

| 缺口 | 修复及证据 |
| --- | --- |
| UI 确认、重置或撤销后，旧 bootstrap 可能覆盖新偏好 | `useMiaoxunSession` 按服务器 UI revision 接收新状态；更新 profile revision 保护，较早 bootstrap 仍可刷新消息/通知但不能覆盖已确认偏好。 |
| 延迟 profile/外观保存带回旧偏好；UI 操作回执可能晚于较新 bootstrap | UI revision 独立比较；保留较新偏好且接收本次资料/外观保存；资料快照过时时也能独立接收更高 UI revision。切换登录清理 revision 引用，拒绝旧账号回执。 |
| 恢复默认后旧确认仍可被撤销，从而恢复已丢弃的设置 | reset 在原事务中把 pending 和尚未撤销的 confirmed 记录标为 reset，关闭此前撤销历史；新确认仍能正常撤销。字段、状态枚举与 API 均复用现有合同，没有迁移或历史数据回填。 |
| undo 按事务时间排序可能选错确认 | PostgreSQL `CURRENT_TIMESTAMP` 是事务开始时间，锁等待时不代表确认顺序；改按 CAS `confirmed_revision` 降序选最近一条，再保留时间次序作辅助。 |
| 私有 Web 检索工具搜索漏发必填操作键 | API 显式要求合法 `Idempotency-Key`，每次新提交生成新键，同次重放可保留原键；无自动重试。真实 HTTP 路由测试覆盖漏键拒绝与正确转交。 |
| RN search 漏合同2头 | 补齐 `X-Miaoxun-Retrieval-Contract: 2`；现有 Build45+原能通过后端构建号门禁，不将此项称为当前真机固定失败的根因。Web事件请求声明也统一，但事件API没有同一门禁。 |

检索 Agent 没有丢失：`media-retrieval` 是内部索引与搜索能力，正式用户通过二楼上传、授权相册管理、等待索引，再在相册会话查找或由管家协作 `media.select` 使用。它只查询获准索引的私有图片/视频，不是普通可添加聊天伙伴或全网搜索。细节见[检索入口记录](2026-11-06-retrieval-entry-followup.md)。

## 测试与实际边界

新 UI 生命周期 HTTP 测试运行真实认证、发布/产品/授权仓储、预览服务、数据库事务、bootstrap 与撤销。只有模型传输是明确的合同 fixture，不冒充真实供应商输出。新增五项包括：未确认不写正式偏好、fresh bootstrap 持久化、重复确认/撤销拒绝、恢复默认截断历史、新确认可撤销、时间倒序下的正确撤销、两个预览竞争、撤权后禁止确认/撤销/重置。它们不证明设备重启或模型质量。

- RN新增13项回归。初轮8项和补充1项先失败，修复后UI相关4套65项通过；包含旧bootstrap、资料/外观快照、操作回执、跨账号和hook重挂载。
- UI新增HTTP生命周期5项与已有12项聊天集成，共17项专用PostgreSQL集成零跳过；连同service、route、app-store定向测试共52/52通过。
- 检索Web4项、RN检索/相册21项、HTTP及公共合同24项、专用PostgreSQL迁移/事务12项通过。Provider与图文向量为显式fixture；不把其计为真实视觉质量。
- 最终整仓退出0：RN91套1172项，Agents55项，Admin49项，Web检索4项通过；Backend1053项通过、327项数据库门控跳过另列。TS、ESLint、Prettier、各工程检查与构建通过。
- 独立增量审查无确定P0/P1/P2；另独立实跑RN会话/检索2套46项、Web4项与diff检查通过。
- 最新源码正常Xcode Simulator构建退出0，仍有既有Pods/脚本警告。本轮只编译，没有安装或把编译当作设备验收。候选JS SHA256为`fa5f9e2f2ae6ef1eeba11a53704d4d2781146f3565065fc35a53fecc511d539a`。

主要命令：

```sh
cd MiaoxunRN
npm test -- --runInBand __tests__/sessionSync.test.tsx __tests__/uiPreferenceSettings.test.tsx __tests__/uiPreferenceChatCard.test.tsx __tests__/uiPreferences.test.ts
cd ..
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false RUN_AI_TASK_INTEGRATION=1 DATABASE_URL=<isolated-loopback-url> node --test backend/test/ui-agent-message-integration.test.js backend/test/ui-preference-service.test.js backend/test/ui-preference-routes.test.js backend/test/ui-preference-app-store.test.js
MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh
git diff --check
cd MiaoxunRN/ios
xcodebuild -workspace MiaoxunRN.xcworkspace -scheme MiaoxunRN -configuration Debug -destination 'platform=iOS Simulator,id=7E81531F-02AE-40FC-98DA-A575CEC9930F' -derivedDataPath /tmp/miaoxun-collaboration-qa-20261105 PRODUCT_BUNDLE_IDENTIFIER=com.wangruoshi.miaoxun.collaborationQA20261105 MIAOXUN_API_BASE_URL=http://127.0.0.1:4395 build -quiet
```

主要日志：

- `/tmp/miaoxun-ui-session-race-red-20261106.log`、`/tmp/miaoxun-ui-profile-overlap-red-20261106.log`、`/tmp/miaoxun-ui-session-race-green-20261106.log`。
- 独立PG证据目录由`/tmp/miaoxun-ui-followup-current.json`指向，含`migrations.log`、`ui-lifecycle-red.log`、`ui-lifecycle-final.log`和`cleanup.json`；配置仅为临时loopback连接，不含供应商凭据。第一次生命周期RED中的一处错误字段断言随后按实际`error.details.code`纠正；恢复默认和撤销顺序两项仍是实际代码缺陷。
- `/tmp/miaoxun-retrieval-followup-20261106-migration.log`、`/tmp/miaoxun-retrieval-followup-20261106-contract.log`。
- `/tmp/miaoxun-ui-retrieval-followup-20261106-repository.log`、`/tmp/miaoxun-ui-retrieval-followup-20261106-build.log`。

UI专库收尾验证用户0、会话0、预览0、其它连接0；PostgreSQL正常停止，`postmaster.pid`及socket不存在。检索专库也已正常停止。没有重启或改动此前保存真实模型协作成果的库，本轮不装QA App或操作正式登录。

## 本轮修改文件

- `MiaoxunRN/src/features/session/useMiaoxunSession.ts`、`MiaoxunRN/__tests__/sessionSync.test.tsx`。
- `MiaoxunRN/src/services/api/mediaRetrievalApi.ts`、`MiaoxunRN/__tests__/mediaRetrievalApi.test.ts`。
- `backend/src/ui-preference-service.js`、`backend/test/ui-agent-message-integration.test.js`、新增`backend/test/media-retrieval-client-http.test.js`。
- `media-retrieval-web/src/api.js`、`media-retrieval-web/src/main.js`、`media-retrieval-web/test/public-contract.test.js`。
- `docs/ai-interaction-system.md`、`docs/media-retrieval-product-handoff.md`、本记录、检索入口记录、文档索引及`docs/handoffs/CURRENT.md`。

## 发布与后续

本轮RN修改需要下一版客户端，reset/undo修复需要新后端制品，私有Web工具需要重新构建；没有新增迁移、权限或Agent声明，不需要因为本次修复创建新的Agent产品版本。现有TestFlight Build59不包含这些修改。本轮没有生产部署或上传授权动作。

iPhone14Pro已由`devicectl`显示available/paired，但系统iPhone镜像引导提示必须更新iOS后才可连接；未升级系统或改变设备设置。因此不能实际操作它验证连续手势、麦克风或相机，不能据“已配对”认定真机验收通过。

仍需完成：UI-Agent正常用户授权、真实模型预览→确认→App重启→撤销/默认的设备全流程；实体连续手势及阅读防误退出；媒体实际上传发送/定位；检索供应商和图文索引质量。微信、邮箱、日历、群聊尚未接通的业务仍不冒充可用。
