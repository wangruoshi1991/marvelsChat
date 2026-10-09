# 媒体检索 Agent 发布证据

- 状态: 生产已开放开发联调；真实图片链路通过，视频和 App 可用态修复正在验证，完整上线验收未完成
- 生产生命周期: `limited_release`（对所有登录用户开放，各用户仍须自行同意私有素材索引）
- 负责人: Jarson（个人负责）
- App/TestFlight 集成: Build 45 已在双 Simulator 验证不可用状态；成功索引/搜索 E2E 和 TestFlight Build 45 尚未完成
- 真实模型校准: 公开素材真实模型小规模 smoke 已运行；供应商实际账单金额未知
- 发布批准: 独立 Security Reviewer 和 Release Owner 尚未完成复核

## 2026-08-06 初始本地证据（历史）

以下命令均在本地、mock-only、无真实媒体、无真实 Provider 调用和零成本的条件下通过：

```text
agents: npm run check
agents: npm test                         # 30 passed
agents: npm run agent:check -- --agent media-retrieval --format json
agents: npm run agent:test -- --agent media-retrieval --format json
agents: npm run agent:eval -- --agent media-retrieval --format json    # score: 100
agents: npm run agent:smoke -- --agent media-retrieval --environment local --format json

backend: npm run check
backend: npm test                        # 54 passed
backend: npm run smoke:media-retrieval

media-retrieval-web: npm test
media-retrieval-web: npm run check
media-retrieval-web: npm run build

admin: npm run check
admin: npm run build
```

本地 smoke 额外验证：默认关闭时，任务会在读取私有媒体、创建临时对象和发起 Provider 调用前被阻断。受限 Web 试点的 Bearer 会话仅保存在当前页面内存，刷新页面后必须重新登录。

## 2026-08-06 当时尚未满足的发布门槛（历史）

1. `npm run test:media-retrieval-migration` 尚未执行。该命令需要一个本机 Docker daemon 和隔离的 pgvector 容器；当前机器未运行 Docker daemon。
2. 需要独立 Security Reviewer 和 Release Owner 的审阅，单人 `draft` 例外不能用于进入 sandbox、试点或发布。
3. 需要受控 sandbox 的数据库迁移、对象存储和 Worker 心跳验证。
4. 真实付费模型校准必须另行批准，记录账户引用、最大调用数、最大预算和停止条件；本次未进行。
5. App/TestFlight 集成须在 Web 试点和以上门槛完成后单独评审。

本文件不保存密钥、媒体、对象 URL、原始搜索语句或外部模型原始响应。

## 2026-10-09 当前复核

- `./scripts/check-repository.sh`：通过。RN 为 31 组 / 197 项；Agent、Admin、Avatar Web、媒体检索 Web、后端检查及生产构建均通过。默认后端门禁中的环境门控集成项不代替数据库专用测试。
- `backend` 的 `npm run test:media-retrieval-migration`：在隔离 PostgreSQL / pgvector 中 7/7 通过，包含全迁移重复执行、无限额度、费用预留、所有者隔离、授权撤回与清理；没有连接生产数据库。
- 自动化 `agent:eval` 的 30/30 是 mock-only、synthetic contract 覆盖，不是相关性或模型质量分数，也不证明 30 个真实媒体查询通过。另有公开素材真实模型小规模 smoke：10 个图片查询案例和 3 个合成视频时间点案例；不能代表 held-out 生产质量。已记录的 90 次供应商调用是多轮调试调用数，不是 90 个独立评测案例；实际账单仍须核对供应商账单。
- 生产只读状态：活动 runtime `app-integration-20260916-04`；迁移账本停在 031；数据库 `lifecycle=sandbox`、Agent=true、Provider=false、索引队列=false；每日用户上限 3、每月用户额度 500 分、全局日预算 500 分；reserved 成本预估均为 100 分。worker 正在运行且心跳正常，但 ready segment 为 0，索引任务 1 blocked / 1 failed。生产 `/api/ready` 为 200 仅代表数据库和已部署迁移就绪。
- 新候选代码及 032/033/034 迁移仍未提交、未部署；生产没有启用检索或执行数据库写入。本次没有读取账号/素材/搜索内容，也没有触发供应商调用。
- 用户明确要求服务不设每日次数、用户月预算或全局费用上限，只保留瞬时频率防滥用，不使用账号白名单。迁移 034 与 Admin 空值配置支持无限额度，但这不是自动账单/用户计费系统；上线仍需正数调用预留、账单核对、值守责任人和 Admin 人工 Provider kill switch。不得把成本账本估算描述为真实扣款。
- 当前 verdict：`BLOCKED`。下一步先整理并审查干净、已提交的 Build 45 / backend 候选，补足 30 个真实媒体查询的 held-out 评测与独立安全/发布复核；不得把 30/30 synthetic contract 结果计入模型质量样本。按 032-034 依赖顺序重新做生产只读预检、备份与恢复确认。完成批准后的客户端分发、后端部署和迁移后，仍须由用户在 App 主动同意私有素材索引，再验收 ready 索引、真实搜索、鉴权预览、撤回删除、多账号隔离及费用对账，最后才可将全局 lifecycle 设为 `available`。
- 后端生产依赖审计：`npm audit --omit=dev --audit-level=high` 原报告 1 个 Critical (`proxy-addr`) 和 2 个 High (`sharp`，含 `ndarray-pixels` 链路)；在不升级主版本下运行 `npm audit fix` 后，审计为 0 漏洞。已更新 `backend/package-lock.json`；检索/全量后端测试和 `./scripts/check-repository.sh` 均通过。
- RN 当前 `npm audit` 报告 53 项（48 High、5 Moderate、0 Critical）；兼容修复已去掉 `shell-quote` Critical。`npm audit --omit=dev` 仍报告 33 项（28 High、5 Moderate），包含当前 `react-native@0.86.0`；修复建议需要升至 `0.87.1`，属于主版本迁移。此次未强制升级；须先评估可达性并完成 iOS/Android 原生构建与回归，未处置前阻断发布。

### 2026-10-09 续接复核

- 修复 App 首页个人相册“找素材”入口的 Modal 路由条件，并新增父级路由回归。Release Simulator Build 45 正常签名构建成功，覆盖安装于 iPhone 17 与 Miaoxun QA SE3；SE3 实测入口可见、可打开状态页，布局无裁切。生产状态仍不可用，未触发授权/启用/搜索流程。
- `./scripts/check-repository.sh`：通过，RN 31 组 / 200 项；PostgreSQL/pgvector 专项 `npm run test:media-retrieval-migration`：7/7 通过。`git diff --check`：通过。
- 升级到 React Native `0.87.1` 后，`npm audit` 为 53 项（48 High、5 Moderate）；其中 `npm audit --omit=dev --audit-level=high` 仍有 20 High，均由 Metro/micromatch 使用的 `braces@3.0.3` 引入。公告范围含 3.0.3，npm registry 当前没有 3.0.4；强制审计修复会降级到 RN 0.72.17，未采用。Android 构建尝试在 Gradle 启动前因本机无 Java Runtime 失败；Android SDK、`adb` 与 `sdkmanager` 也缺失，Android 构建未验证；依赖审计和平台验证继续阻断发布。
- 生产只读预检：runtime `app-integration-20260916-04`；迁移 31 项至 031；服务与备份 timer active，备份 service 最近一次任务 success；`/api/health` 与 `/api/ready` 均为 200。DB 仍为 sandbox、Agent=true、Provider=false、index=false，日/月/全局额度仍为 3/500/500，ready segment=0，index jobs 为 blocked 1 / failed 1；032 三个唯一约束冲突计数为 0。没有读取用户行或素材，没有执行生产写入、迁移、部署或 Provider 调用。
- 仍缺独立 Security Reviewer / Release Owner、30 案例 held-out 真实素材质量证据、Build 45 分发和用户主动授权后的索引/搜索/撤回 E2E。未上传 TestFlight、未推送 Git；当前 verdict 仍为 `BLOCKED`。

### 2026-10-09 本次开发联调部署范围

- 用户已授权 RN 升级、生产迁移 032–034、后端/Worker 部署与检索 Provider 开放，继续采用无限日次数/月预算/全局预算和瞬时限流。上述授权不替代其他用户的私有素材同意，也不构成独立安全审查或完整上线质量认证。本次按开发联调范围执行；完整上线评审仍保持未完成。
- 新恢复点 `marvels_chat-20261009T043128Z.dump` SHA-256 为 `0e666db9606226493bed22b67904afea3621e324a4a73b980289d7acc10ef5ba`，校验和、450 行 custom dump TOC 与加密异地归档/manifest 成功。本次尚未完整恢复演练。
- iOS Release sourcemap 2,815 个模块中未包含 braces、micromatch、fast-glob、Metro、metro-file-map 或 CLI；依赖 High 为未修复的构建工具风险，不是零漏洞结论。Android 临时 JDK/SDK tools 已准备，Google SDK 法律协议仍待用户接受，未开始 Android 编译。
- 后端合同 v2 支持先部署：Build 44 检索接口明确返回 426，不影响其他既有 API；Build 45 已安装到两个 Simulator，TestFlight 尚未分发。

### 2026-10-09 已执行的生产变更

- 标准 runtime `media-retrieval-20261009-01` 来自 `70789b1b6ce9c35bf18e28978ea99bc4c0ab63b6`，365 文件哈希校验通过；官方 registry 服务器生产依赖审计 0，Linux 完整源码后端测试 434 passed / 4 skipped。
- 停写后的恢复点为 `marvels_chat-20261009T044415Z.dump`，SHA-256 `1c32a2f8eb68092e87a57efc37e28885d1a8957db17518e26a303508acf53fce`，SHA 校验和 TOC 可读。032–034 为 3 applied / 31 unchanged；后端和 Worker 已切换、root 只读权限及 storage 所有权已核对，health/ready 200、NRestarts=0。
- 开关和脱敏运维事件在同一事务中记录；`limited_release`、Agent/Provider/index=true，三个次数/费用上限=NULL，无账号白名单。新账号可读 available 状态；检索旧客户端 426、未登录 401、普通登录/bootstrap/3D 只读均已真实通过。
- 公开图片与合成视频 ready 索引、图片开放式中英文检索、空负例及幂等查询通过；视频“自行车的画面”暴露确定性语法误判，替代原始描述不能视为该案例通过。已定位并正在验证修复，App cached readiness 和 Worker 长处理心跳也在修复。测试账号与其素材均已注销清理、聚合残留=0；未读取其他账号私有素材。完整生产 E2E 尚未通过。
