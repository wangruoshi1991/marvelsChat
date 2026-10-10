# 媒体检索 Agent 发布证据

- 状态: 生产已开放开发联调；真实图片/视频、隔离、撤回和清理 E2E 已通过，完整上线验收未完成
- 生产生命周期: `limited_release`（对所有登录用户开放，各用户仍须自行同意私有素材索引）
- 负责人: Jarson（个人负责）
- App/TestFlight 集成: Build 45 双 Simulator 已安装；入口和同意页面可达，部分索引成功的 App 状态修复已通过定向回归；TestFlight Build 45 尚未上传
- 最新本地修复校准: 解析 24/24、单图旧回归 30/30、冻结配置后的全新六图首次独立评测 30/30；真实服务/鉴权聊天 HTTP 9 项通过。候选未部署，有限媒体不代表全部生产质量；供应商实际账单未知
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

## 2026-10-09 部署前复核（历史）

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

### 2026-10-09 runtime 02 与公开素材 E2E（历史）

- runtime 02 来源 `63d6547c045e6bc9b90b95bf3d64c2588b293739`，标准制品 SHA-256 `0b855b75cfd2f2cd43761983dc9bef22cf39319a0c547030f47e5838ae2649d1`，365 文件校验通过；迁移 0 applied / 34 unchanged，Linux runtime 受影响测试 83/83，health/ready 200、服务 active。物体开放描述通过语法修复，没有添加“画面”等固定检索词；Worker 每 10 秒独立报告心跳。
- 两个随机测试账号使用公开图片和合成视频，通过真实生产 API：注册/登录、OSS 上传、用户同意与索引、开放式中英文正例、空负例、幂等回放；原失败描述的视频回归命中 3000–6000 ms。本人预览 200、其他账号 404，另一空素材账号检索无跨账号结果。撤回同意立即 409，purge 成功且段残留 0，原素材保留；测试账号和媒体均注销清理，最终残留 0。
- 成功批次 30 条 Provider 操作账本均 estimated，无 reserved/unknown：描述/图片向量各 8、解析/查询向量各 5、重排 4。未将预估当成账单。既有账号含中断/待核对的任务与账本，仍保留原状态，不自动重试或清零。
- 最新 RN 修复部分索引失败误禁用全检索的页面；成功素材可继续搜索，未完成计数和提示保留。仅成功状态读取会清除对应旧错误，不清除搜索/索引错误或未知费用保护；空素材库不调用模型搜索。最终完整仓库门禁通过：RN 31 组 / 212 项，后端 437 passed / 4 门控 skipped，Agent 33、Admin 14、相关 Web/格式/lint/类型/构建通过。正常签名 Release Simulator Build 45 两机覆盖安装，保留数据；iPhone 17 部分成功页与输入按钮、SE3 空状态布局实测通过。用户自行提交的私有搜索返回空结果；助手未提交其私有查询。成功结果、软件键盘与视频跳转尚无 Simulator 视觉验收。
- 开发联调范围的 verdict 为 `COMPLETE WITH CONDITIONS`：公开素材生产闭环已通过；正式上线 verdict 仍为 `BLOCKED`，缺 held-out 大库质量、独立安全/发布复核、真机/Android 和 TestFlight 分发。未宣称有限 smoke 可证明所有私人素材均可解析。

### 2026-10-09 新 held-out 数据集与未完成评测

- 新增 `agents/media-retrieval/heldout-suite.json`，版本 `unsplash-8-assets-heldout-2026-10-v1`：8 张独立公开图、30 条双语案例（16 正例、14 负例），含直接描述、属性和组合负例；素材来源及 SHA-256 固定。预设门槛为总体至少 90%、正例 top-1 至少 90%、负例空结果至少 90%、组合负例至少 83%。该小样本不等同于大库基准。
- `backend/scripts/media-retrieval-calibrate.js` 增加自定义数据集输入、本地图片 SHA-256 校验、付费调用前阈值校验和分层评分，并允许显式设置最多 200 次评测调用；线上检索用户额度和频率策略未改。全仓 `./scripts/check-repository.sh` 通过，校准器定向测试 9/9 通过。
- 生产机直接 provider 校准尝试未生成可用报告：首次因临时目录权限失败，未触发 provider；权限修正后的运行在汇总时访问缺失的 `acceptanceThresholds` 字段并异常退出。由于批次报告只存在内存，无法确定模型操作的派发/成功数量，实际费用未知。没有自动重试，不将此尝试记为任何质量结果；重复执行同一批付费调用前须先核对供应商账单/用量。
- 评测数据只使用公开图片 data URL，没有写生产数据库或业务 OSS；本地与服务器临时图片及数据集副本均已清理。held-out 质量评测仍未完成。

### 2026-10-09 校准器续接修复（本地，尚未运行真实模型）

- 修复前一次失败评测暴露的审计缺口：CLI 付费运行现在必须传入全新 `--report` 文件；每个 provider 调用在派发前记录 `dispatched`，返回后记录 `succeeded` 或 `failed-billing-unknown`，并以原子替换写入报告。报告包含已返回的 token usage，不含凭据和 provider 原始响应。若进程中断，最后一个 `dispatched` 状态仍表示实际计费未知，不作为未调用证明。
- 先解析整个数据集并准备全部素材，验证结构、标签引用、阈值和固定 SHA-256 后才调用模型；图片只从显式 `--image-directory` 读取有界 JPEG，避免 CLI 对自定义 URL 发起外连。校准器定向测试 11/11，包括哈希不匹配时零 provider 调用和调用状态快照。线上检索额度/频率策略未变。
- 可复现命令示例：`node backend/scripts/media-retrieval-calibrate.js --allow-paid --dataset agents/media-retrieval/heldout-suite.json --image-directory <本地公开素材目录> --max-calls 200 --budget-fen 500 --reserve-fen 1 --report <全新报告路径>`。目录需包含 `<asset-id>.jpg`，并与数据集 SHA 一致；报告路径已存在时拒绝运行。预留金额仍只是 runner 估计，不是供应商计费上限或实际账单。
- 本轮本机检索 Provider 未配置，浏览器控制台连接不可用；没有真实 Provider 调用，也未能核对先前失败尝试的百炼实际用量/账单。新增 30 案例 held-out 没有质量结果，不能计为通过；下一步须先由可访问控制台/账单的环境核对旧用量，再决定是否运行上面的真实评测。大库质量、视频、Android/真机与 TestFlight 等其他发布门槛仍未完成。

### 2026-10-09 真实模型 held-out 基线（历史）

- 运行前校验 8 张 Unsplash 图片 SHA-256、数据集 SHA-256 `d3bac0a4cedae50fdfb83946c2bb4314529780f709603a5bcaef409eafeea9f7`、代码版本、模型版本与配置指纹均匹配。模型为 `qwen3.6-flash` 和 `qwen3-vl-embedding`。只向 Provider 发送公开图片 data URL 与公开查询；没有连接生产数据库、写生产 OSS 或运行 App 用户搜索。
- attempt05 完成 30/30 案例，Provider 操作 102 次全部成功并返回 usage：图片描述/图片向量各 8 次、查询解析 30 次、查询向量 28 次、重排 28 次。临时报告 SHA-256 为 `b8531c8225777908eccce9e9f3bd0a3d31c6300d670f0c17eece8fb1114ba1fc`；报告及公开图片在完成核验后已从服务器临时目录清理。Provider 返回 usage 字段累计为 input 54,974、output 2,650、image 9,664、total 62,448；不同字段是否重叠及实际计费折算以供应商定义和账单为准，不把它们换算成金额。runner 预留估值为 102 分，`actualCostFen=null`，这不是费用封顶或实际账单。
- 质量门槛未通过：总体 26/30（86.7%，门槛 90%）；正例 top-1 13/16（81.25%，门槛 90%）；负例空结果 13/14（92.9%，门槛 90%）；组合负例 5/6（83.3%，门槛 83%）。三条中文正例失败：`dog-zh-object` 与 `cat-zh-color` 因语义来源验证拒绝继续嵌入，`pizza-zh-details` 返回空结果；`composition-cat-books` 将只含猫的结果误判为满足“橘猫坐在一摞书上”。不得降低现有 fail-closed 输入边界或把相似度单独当作充分证据。
- 旧报告取证补正：原 `report.json` 有 15 个 Provider 请求标记、15 条 usage，其中 14 次描述/向量处理完成，第 15 个花朵描述收到 HTTP 200 和 usage、但 `objects[]` 不符合 schema，因此中止且没有案例分数；旧 CLI 把它保守记为 `failed-billing-unknown`。attempt04 有 17 个成功 Provider 请求及 usage（8 张图片描述/向量共 16 次、1 次查询解析），首条查询没有通过来源边界即停止。attempt02 的唯一调用标记在配置 eligibility 检查处被 `retrieval_not_enabled` 阻断，usage 为空，未发 Provider HTTP 请求；attempt03 未实际启动。attempt01/04 的 `actualCostFen` 均为空。此次运行前曾查看的账单按日数据不能归属这些批次，百炼实际账单/费用仍未核实；用量明细导出为 0 字节不能作为零费用证据。
- 评测器小修：无法验证的查询现在保留为该案例失败并继续评估剩余案例；不会调用 embedding 绕过安全边界。后端校准器定向测试 12/12 通过；`./scripts/check-repository.sh` 全通过，backend 456 passed / 4 环境门控 skipped、RN 30 组 / 178 项、Agent 33、Admin 14，相关 Web、类型、lint 与构建通过。隔离 PostgreSQL 迁移集成未因离线 runner 改动重跑。评测器修复不改变线上检索行为。
- 该 30 案例集已用于调试分析，不再是对后续调参保持盲态的独立 holdout。下一步在独立开发集上修复中英文来源保真召回和组合约束误命中，保留本批作为回归基线；之后需新建未用于调参的全新图片/查询 holdout 再做发布质量判断。真实账单核实、较大媒体库、代表性视频、真机/Android、独立安全与发布复核及 TestFlight 分发仍未完成，正式上线 verdict 保持 `BLOCKED`。

### 2026-10-10 原文约束修复与独立质量验证（此前阶段）

- 只使用固定 SHA-256 的公开图片与公开查询，直接在隔离临时目录调用 Provider；没有连接生产数据库、写生产 OSS、读取私人素材或部署候选。运行时仍为 `album-assistant-20261009-01`。本轮不包含 App/UI 变更或新的 Simulator 验证。
- 查询解析内部 schema v2 添加最多 11 个原文约束片段；服务端强制补入完整原始视觉描述。身份词必须经原文验证后才可移除，查询向量不使用模型翻译或改写。完整描述和约束都进入输入哈希，缺完整描述或伪造片段拒绝继续。
- 重排使用显式候选、条件和描述条目编号；每项条件都须引用 `clothing/scene/actions/objects` 的实际条目。缺条件、重复/越界编号、伪造候选、OCR/summary 引用均拒绝；Provider 输出与最终结果投影分别校验，证据不进入公开 DTO。该校验确认引用来源与完整性，语义是否充分仍由模型判断，不宣称确定性证明组合语义。
- 描述条目上限统一为 160 字符，保持每数组最多 12 项及响应字节上限，超限拒绝且不截断。描述 prompt v8、query prompt v7、rerank prompt v9、embedding policy v12、visual grammar v5、semantic serialization v2；模型为 `qwen3.6-flash` / `qwen3-vl-embedding`，1024 维。最终 descriptor 配置指纹 `d42134f10fee0ee16cf90077dadca0c48ce4780bc893e10b2c5e0caf4c594aad`，embedding 指纹 `d14e2b14e9b1c5adf70a805adc4cc394822da51aa8091e0d55f0c140abb96ba9`。

| 首次独立性与用途 | 总体 | 正例 top-1 | 负例空结果 | 组合负例 | 门槛结果 |
| --- | --- | --- | --- | --- | --- |
| 开发集 v2，调参集 | 23/24 | 15/16 | 8/8 | 5/5 | 通过开发门槛 |
| 独立集 v1，冻结配置后首次运行 | 25/30 | 14/18 | 11/12 | 5/6 | 未通过总体和正例门槛 |

- 开发集 v2 的咖啡标签按可见证据改为两只白色拉花杯及一只深色饮品，不能确认第三杯为咖啡；v1/v2 不是严格配对比较。唯一失败 `dev-backpack-zh` 在原文动作/位置语法处被 `semanticRoleUnproved` 身份启发式拒绝。未通过安全验证不能算正确空结果。
- 独立集有 6 张全新图片、30 个新案例（18 正例、12 负例、其中 6 个组合负例），配置冻结后首次评估，未依据其结果继续调参。四条正例 `watch-en-detail`、`car-en-action`、`car-zh-scene`、`car-en-detail` 返回空结果；报告不保留描述/模型原文，尚不能判断具体漏检阶段。负例 `composition-fork-watch` 被中文身份启发式拒绝，计为质量失败。未来若用此集分析修复，它只能是回归集，发布判断须另用新独立集。
- 九批共 406 次 Provider 调用：400 succeeded，6 failed-billing-unknown；失败均为 HTTP 200 后输出校验失败且有 usage。没有自动重试；中断批次不算质量通过。校准器将单查询/重排输出校验失败记录到该案例并继续其余案例，网络/索引故障仍停止批次。Token 原始字段累计 input 298,842、output 29,928、image 78,660、total 367,434；字段可能重叠，不能据此换算金额。`actualCostFen=null`，实际账单待供应商核对。
- 脱敏机器证据见 [quality-results-2026-10-10.json](quality-results-2026-10-10.json)，记录每批数据集/报告 SHA、版本、配置指纹、状态、操作数量、分层质量、失败 ID 和 usage。开发最终报告 SHA `3c4b290f79146df1ff3020d07a23b02d3bfd02b6360da9bfdcb65ceacf8242ce`；独立报告 SHA `a4d7fac5b81589387a1e0a1b623649004de3b12bcd21d8545fa7b61e3a917b26`。原始公开调试报告保留在本机 `/tmp/miaoxun-retrieval-quality.izPPcs`，不把原始模型响应入库。
- 最终 `./scripts/check-repository.sh` 全通过：后端 464 passed / 4 门控 skipped，RN 30 组 / 178 项，Agent 33、Admin 14、相关 Web/格式/lint/类型/构建通过；日志 `/tmp/miaoxun-retrieval-repair-repository-final.log`。本轮独立 PostgreSQL/pgvector 集成 9/9，日志 `/tmp/miaoxun-retrieval-repair-postgres.log`。九个报告原始文件 SHA 已核对本地与远端一致，两个最终数据集哈希按 runner 的 `JSON.stringify(parsedDataset)` 方式核对通过。已删除本任务八个远端临时目录中的公开图片、候选代码和报告；本机副本保留可恢复证据，生产 runtime 与依赖未修改。
- 正式上线 verdict 继续 `BLOCKED`。下一步先诊断中文身份误判及四条漏检，再用新的独立素材验证；较大媒体库、代表性视频、账单核实、真机/Android、独立安全与发布复核、TestFlight 与完整恢复演练仍未完成。未推送、部署或上传 TestFlight。

### 2026-10-10 后续原画面修复（当前候选，未部署）

- 本地实现已移除固定视觉词表、语法启发式、关键词 SQL 和 B7 词汇排序。parser schema v3 分类原文片段，拼接必须完整还原经 NFKC/trim 的输入；缺失、旧 schema、低置信度、改写或不完整输出明确拒绝。解析复用管家 `NEW_API_*`，视觉/向量使用独立百炼配置，无自动模型切换。readiness 与派发共用 HTTPS 配置判定。
- 最终判定使用当前 owner 原图片或精确视频帧；读取前后、每次 Provider 请求前、保存结果前重新核验同意、epoch 和内容版本。每素材每查询只读一次，画面最长边 1024、最多 512 KiB，仅存请求内存。文件流式超限、缺帧、越权、版本变化和 Provider 失败均阻断；不取历史描述代替画面或返回部分成功。
- 多图 v10/v11/v12 均把无书本的雪山图误判为满足书本组合条件，三批均为 29/30。虽达原聚合门槛，此修复拒绝接受该回归。temperature=0 和 high 标签均未单独解决。五组预先安排的单图正负例诊断 10/10；最终 rerank v13 每次只发送一张图/一帧、临时 c0、完整条件引用，并只接受所有条件明确支持的 high 匹配，最多 20 次且逐次授权记账。引用校验不等于模型语义确定性保证。

| 验证范围 | 结果 | 边界 |
| --- | --- | --- |
| 实际 DeepSeek 原文角色解析 | 24/24 | 姓名同音、多个身份、开放词汇、多语言、注入与敏感推断 |
| 最终 v13 可见六图回归 | 30/30 | 正例 18/18、负例 12/12、组合负例 6/6 |
| 冻结最终配置后的全新六图首次独立评测 | 30/30 | 同一分层全通过；以后这批仅作为可见回归集 |
| 真实运动花朵视频，较早 v10 | 6/6 | 单段 CC0 视频；当前逐帧版本另经下面服务验收 |
| 最终真实服务与鉴权聊天 HTTP | 9/9 项 | 实际 PostgreSQL、产品 routes、真实对话/检索模型；本地公开文件 storage 与注入 service gate |

- 最终服务/HTTP 覆盖索引、指定相册图片、精确视频帧、真实对话工具、结果读取、同消息重放无派发、跨账号 404、空结果、撤回阻断与旧结果 403。49 次调用含检索账本 43 条 estimated 和 6 次对话调用，该批无 reserved/unknown。结束后隔离 users/assets/segments/runs/threads 均为 0。首次消息创建 201、同消息重放 200，保持真实合同。未写生产 DB/OSS 或读取私人素材。
- 本次后续各批累计 1,628 次调用：1,395 succeeded、228 HTTP succeeded、5 failed-billing-unknown；HTTP 与输出验证状态分开。此前 406 次单独保留，不重复计入。usage 原始字段累计 input 1,592,431、output 94,680、image 778,216、total 1,744,651，字段可能重叠，actualCostFen=null；不是供应商账单或用户扣款。无自动重试。
- 27 个完整、失败、空报告的 SHA 本地/远端一致；配置、分层、失败 ID、调用/用量/账本见 [画面修复质量证据](quality-results-2026-10-10-visual.json)。QA teardown 顺序错误及两批 HTTP harness 错误均保留，不计为产品通过；未修改产品合同迁就测试。原始公开报告在本机 `/tmp/miaoxun-retrieval-generic.uMQmAV`。
- 最终全仓门禁通过：backend 467 passed / 4 环境门控 skipped，RN 30 组/178 项，Agent 33、Admin 14，相关 Web/lint/类型/格式/构建通过；日志 `/tmp/miaoxun-retrieval-single-repository-verified.log`。隔离 PostgreSQL/pgvector 9/9，日志 `/tmp/miaoxun-retrieval-single-postgres-final.log`。20,000 合成段、当前 owner 2,000，10 次查询返回本人 20 条并用 owner 索引，p95 53.34 ms、预设门槛 500 ms；常量向量只验证执行计划/耗时，不代表大库召回或并发。
- 摘要核验后清理本任务远端暂存目录，未跟随生产 node_modules 符号链接；停止专属数据库隧道与测试容器，其他服务及模拟器数据不动。本轮无 UI 改动或新 Simulator/真机/Android 验收。
- 本地检索修复 verdict 为 COMPLETE WITH CONDITIONS：有限公开素材质量和真实服务/API 已验证，候选尚未提交部署。生产只读复核仍为 album-assistant-20261009-01、ready 200、API/Worker active、重启数 0。正式上线 verdict 仍 BLOCKED：生产同步、Build 45 分发、代表性大库/视频与并发、独立发布复核、恢复演练及 Apple 签名/协议条件仍待处理。具体发布范围需单独明确。
