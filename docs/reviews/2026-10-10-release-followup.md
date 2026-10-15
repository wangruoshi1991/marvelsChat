# 2026-10-10 Build45 后接续检查

## 范围与结论

接续基线为 `codex/testflight-44` / `a4d90c3`，开始时工作区干净。先读取根 AGENTS、README、文档索引及 CURRENT，
再核对代码、Git 和运行状态。历史部署、付费调用及上传授权没有沿用。

本轮完成两项本地候选修复和生产只读检查；没有提交、推送、部署、付费模型调用或 TestFlight 上传。
生产仍为 `retrieval-visual-20261010-03` / 相册 Agent 0.2.2，Build45 仍使用原上传源码。
本地 Agent 候选为 0.2.3；完整产品正式发布仍为 **BLOCKED**，本报告不是上线批准。

## 已确认并修复的问题

### 索引终态被误报为等待

原工具和 RN 只看已索引/总数，失败后仍让用户等待。状态 SQL 还把没有任务、取消或已完成但没有有效索引的素材
默认算作 queued。候选现在把每个当前用户已上传、未删除的图片/视频分为可检索、真正排队处理中、暂不可检索。
当前索引和活动任务必须对应真实内容指纹；任务还须属于当前 index epoch。活动任务优先于失败历史。

公开 DTO 字段保持不变，`skippedAssets` 明确为暂不可检索且没有有效活动任务的素材数，不能等同供应商失败数。
工具返回 `indexCoverage` 计数；无可用素材、无活动任务为 `index-unavailable`。部分就绪仍可搜索，界面和 Agent
明确说明覆盖不完整及不会自动重试，不再承诺所有素材仍在处理。没有引入示例数据或生产兜底路径。

独立复核曾发现初版使用任务创建时间判版本不可靠：`CURRENT_TIMESTAMP` 是事务开始时间，而内容变更使用
`clock_timestamp()`。最终实现已通过当前指纹与旧事务时间、错误指纹与新任务时间的交叉测试，以及SQL/JS指纹序列化对照。

### 发布 API origin 校验遗漏

原 Android/iOS 校验均允许 `127.0.0.2`、RFC1918、链路本地及部分 IPv6 回环/本地地址；Android 的 `URI.host`
保留方括号导致 `https://[::1]` 也通过。原 iOS shell 还允许带用户信息的 URL。旧测试只查源码字符串，不能发现这些遗漏。

两端现在调用 `scripts/validate-release-api-origin.mjs`，检查规范 HTTPS origin、端口、无用户信息/路径/查询/片段，
拒绝本地及保留字面 IP 和特殊域名。当前公网 IP `8.153.167.11` 保持允许，Debug 保持本地开发支持。
iOS 使用显式 `.xcode.env` / `.xcode.env.local`，Android 尊重 `react.nodeExecutableAndArgs`；缺少 Node 时明确失败。
校验器和错误日志不回显输入 URL，macOS 符号链接路径也必须真正执行 CLI 校验。

构建检查不查询 DNS，也不证明证书或服务可达。域名解析到内网等部署配置仍须在正式环境验证。

## 验证矩阵

| 项目 | 状态 | 证据与边界 |
| --- | --- | --- |
| 基线与实际代码 | PASS | HEAD a4d90c3；生产 0.2.2 匹配结论/摘要分离已存在，未重复修复 |
| 仓库门禁 | PASS | 最终 backend477 passed/4环境门控skip、RN30组183项、Agents33、Admin14、Web及静态检查通过 |
| PostgreSQL/pgvector | PASS | 最终隔离 PostgreSQL18.4、pgvector0.8.6、35项迁移，12/12；含真实事务时间边界和指纹序列化 |
| 发布 origin 行为 | PASS | 11/11，包含实际 Xcode shell phase、Debug、本地/保留地址、非法URL、不泄露凭据和符号链接 |
| Android 校验接线 | PASS（有限） | Java17 + 缓存Gradle9.3.1临时工程执行原样校验闭包及任务钩子；不代表完整Android构建 |
| iOS Simulator 构建 | PASS（有限） | 新隔离 DerivedData，Debug、显式本地API、禁用签名，BUILD SUCCEEDED；没有安装到已有设备 |
| RN 状态功能 | PASS（组件） | 相册10项覆盖全不可用、部分可用、仍有任务及轮询转换；不是Simulator/真机视觉验收 |
| 生产只读预检 | PASS（有限） | 0 failures/4 warnings；health/ready、证书续期、配置防护通过；不验证付费模型质量 |
| Android 完整构建/设备 | BLOCKED | SDK/NDK缺失，离线Kotlin JVM2.2.0插件未缓存；Release签名参数未配置 |
| 新候选真实模型/移动端流程 | 未运行 | 未执行付费对话评测；尚未运行新状态的真机、Simulator视觉或Android交互验收 |
| 完整发布条件 | BLOCKED | 大库/视频/并发质量、账单核对、完整恢复演练等仍缺证据 |

仓库门禁的环境门控 skip 不算通过；本轮另行运行媒体检索 PostgreSQL 集成，其他未涉及的门控项没有补跑。

## 当前运行状态与环境

只读检查实际 API 和 Worker 的 `/proc/<MainPID>/cwd` 均指向 `retrieval-visual-20261010-03/runtime/backend`，
服务 active/running、NRestarts=0。备份 timer active，最近备份 service Result=success、ExecMainStatus=0。
没有读取用户素材、聊天或凭据值，没有对生产数据库写入。

`check-launch-readiness.sh` 的四项 warning 为域名 clientHold、两个公共 DNS 查询为空、默认 shell 找不到 Java。
正式 IP HTTPS 可用。进一步核查本机已装 Homebrew JDK17，只是没有配置 JAVA_HOME；显式设置后 Gradle可运行，
后续阻塞为SDK/NDK及依赖缓存。未下载大型Android环境、接受许可证或创建发布签名。

配对 iPhone 可见，但本轮没有安装或操作；已有两台 Simulator 数据保留。Android 语音桥接缺少
`android.speech.RecognitionService` 包可见性声明是静态待验项，需在Android11+真机核实，不写成已修复。

## Build45 崩溃符号

主 App dSYM UUID 与归档匹配。三个 framework 原本均没有匹配本地 dSYM，上游二进制也没有可重建完整调试信息的
本地对象文件；不能用伪造 UUID 或空 dSYM 消除警告。

已取得 [RN0.87.1官方React Core Release符号包](https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/0.87.1/react-native-artifacts-0.87.1-reactnative-core-dSYM-release.tar.gz)，
官方重定向至 `repo.reactnative.dev`。包为169,847,320字节，SHA256
`13be5ccced7d0b2b062b8cebc142c55860604cb47687bdc0db9c04f0da0cdbfe`。
iOS arm64 UUID `BC2C636B-CB25-3E31-A2DE-4DAD2B486C95` 精确匹配Build45，`dwarfdump --verify` 为No errors。
DWARF SHA256为 `24c809a3a8ccc7f5686ad97ebc2b19f164a5e3371914062b5708d5027847c1aa`。

保留目录：`/private/tmp/miaoxun-build45-official-symbols-rif6mgbr/`，含原包、解包符号与`verification.json`。
未改原archive/Pods，未向Apple上传；Apple端原三项缺符号警告不能标为已解决。
ReactNativeDependencies `4B1D1555-6C1F-3A91-A240-C44A7F8A6A95` 与hermesvm
`BE274A23-47CC-3F5A-9E98-8474553DF5A8` 仍缺匹配符号。若上游无法提供，后续需单独验证源码构建及新包符号，
新UUID不能修补旧Build45。

## 命令与证据

- `./scripts/check-repository.sh`：`/tmp/miaoxun-check-repository-20261010-final.log`。
- `./scripts/check-launch-readiness.sh`：`/tmp/miaoxun-launch-readiness-20261010-resume.log`。
- `MEDIA_RETRIEVAL_MIGRATION_DATABASE_URL=<隔离空库> npm run test:media-retrieval-migration`：
  `/tmp/miaoxun-resume-postgres-20261010-final.log`；Unix socket专属实例，不监听TCP，不访问生产数据；结束后已停机删除。
- `xcodebuild -workspace ios/MiaoxunRN.xcworkspace -scheme MiaoxunRN -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/miaoxun-resume-ios-20261010 MIAOXUN_API_BASE_URL=http://127.0.0.1:4390 CODE_SIGNING_ALLOWED=NO build`：
  `/tmp/miaoxun-resume-ios-20261010.log`。保留已有第三方Pods deployment target警告，不能写成零警告。

## 发布和下一步

本地修复不新增迁移、环境变量或供应商调用。后续经授权发布时，同步后端/Agent状态语义后再分发新客户端；旧Build45
状态展示不会因只更新后端自动获得新文案。不得把旧Build45的移动端验收直接用作本地新候选验收。
回滚前核对当前部署与数据库状态；本次无schema变更，不需要为撤销这些候选变更恢复数据库。

优先推进现有Build45的真机回归，以及新候选的失败/部分失败界面和对话评测；Android需先准备SDK及构建环境。
大库/代表性视频及并发、实际账单、当前35项迁移恢复点的完整隔离恢复仍按原发布清单执行。
