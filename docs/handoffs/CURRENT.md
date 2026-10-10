# 妙讯当前交接入口

更新：2026-10-10。本页只记录现行状态与下一步；历史事实和评测失败见链接。接续先读 README、docs/README、AGENTS，再核对 Git 与运行环境。文档本身不授权生产操作。

## 目标与约束

- 正式移动端为 `MiaoxunRN/`；API/Worker 为 `backend/`，管理台为 `admin/`。
- 目标是可上线的真实产品；无假数据、固定检索词表、关键词降级、旧 schema 兼容或静默失败路径。
- 保留现有修改；不能读取私人素材作为测试数据，不能替用户取得云端 AI 同意或自动上传本机相册。
- 用户本轮已授权先清理本地/线上冗余，再提交推送当前分支并部署检索 API/Worker。公开测试素材和模型调用授权继续有效。未要求合并 main；TestFlight 条件独立核验。

## 检索修复

- 查询解析复用管家 `NEW_API_*` 对话模型；schema v3 分类原文 visual/identity/syntax 片段，必须完整还原原文。缺失、旧格式、低置信度或覆盖不完整明确 blocked。
- 身份只在当前 owner 范围按完整值精确约束，不进入向量或视觉判定；视觉用原文向量召回，再读取当前原图片/精确视频帧逐张判定，最多 20 个候选。
- 每次判定重新核验 owner、同意、epoch、原文件版本与费用预留。只接受 high 且所有条件有画面引用的匹配；后续失败不返回部分结果。规范化画面只留请求内存，内部引用不进公开 DTO。
- 当前版本：descriptor v9、query v10、rerank v13（temperature=0、batchSize=1）、embedding policy v13、parser v3；公开 API 合同仍 v2，最低 App Build 45。没有新增迁移或 RN UI 改动。
- 未调用的漫画日记 deterministic-storyboard 生成器、孤立检索常量/摘要函数已移除，内部函数收窄导出；正式漫画流程继续调用真实 Agent。

## 验证证据与边界

- 最终修复前全仓门禁：backend 467 passed / 4 环境门控 skipped，RN 30 组 / 178 项，Agents 33、Admin 14；其他 Web、lint、类型、格式、构建通过。隔离 PostgreSQL/pgvector 9/9。
- 真实解析 24/24，旧图片回归 30/30，冻结配置后的全新六图首次评测 30/30（正18、负12、组合负6）。多图版本曾误匹配无书本雪山图，失败保留；现有素材今后仅作为回归集。
- 隔离真实数据库/模型/鉴权聊天 HTTP：9 项、49 次调用；幂等、指定相册、视频精确帧、跨账号404、空结果、撤回阻断通过。测试 users/assets/segments/runs/threads 残留为0。本地 storage 适配器与注入 readiness 不等同于生产 OSS/Worker。
- 20,000 常量向量段的 owner-scoped 计划 p95 53.34 ms，仅验证索引计划/耗时，不证明大库召回、并发或百万规模质量。
- 后续评测累计 1,628 次调用（1,395 succeeded、228 HTTP succeeded、5 failed-billing-unknown），账单尚未核对；此前406次单列。细节见[检索发布证据](../agents/media-retrieval/release-evidence.md)与[脱敏质量结果](../agents/media-retrieval/quality-results-2026-10-10-visual.json)。

## 生产与客户端

- 当前runtime `retrieval-visual-20261010-02`，来源 `2feaae1`；迁移35；API/Worker active、NRestarts=0，health/ready 200。公开素材生产/Simulator已验证检索卡片与预览；回复复验仍发现历史否定污染，正在验证0.2.2工具投影修复。
- 保留 `AVATAR_3D_ALLOWLIST=*`；检索 `limited_release`、无账号白名单/每日次数/费用预算上限，保留瞬时限流与用户同意。
- 历史runtime正在完整归档移出releases，保留当前与一个配套回滚版本；环境、storage、数据库本机/异地备份不丢失。清理不改正式用户数据。部署进度和当次恢复点见[部署说明](../deployment.md)。
- Build45 的两机 Simulator 证据来自10/09相册对话版本；本次没有新 UI 改动。iOS archive 已生成，但 Distribution 签名与 Apple 待更新协议阻塞 TestFlight；未声称已上传。
- 较大媒体库质量、代表性视频、真机/Android、完整恢复演练与独立发布验收仍需补齐。其他产品未闭环能力见[上线清单](../mobile-launch-checklist.md)。

## 本轮清理

- 本机8个旧缓存目录约4.0GB已移至 `/Users/gary/.Trash/miaoxun-cleanup-20261010-01`，清空废纸篓前可恢复；没有释放其占用磁盘。
- 服务器旧源码四项 node_modules 和已完成测试暂存已删除，日志/验证脚本先压缩为 root 管理的恢复证据；可由锁文件/Git重建源码依赖。
- 已删除本地与远端的 HTTPS 发布、异地备份两个完成分支，提交全部保留在当前分支；Build24与三个伙伴分支含独有提交，保留。
- 本轮已结束、空库的视觉 QA 容器及其匿名卷已删除；其他数据库、模拟器数据、发布归档、恢复密钥和有效证据保留。
- 502个JS/TS文件的静态引用检查未发现孤立业务模块；HTML、Worker、原生声明和测试入口逐项确认，不能仅据零import删除。详情见[清理审查](../reviews/2026-10-10-redundancy-cleanup.md)。

## 下一步

1. 清理后仓库门禁与隔离pgvector9/9已通过，生产ready200、备份服务success；日志见清理审查。
2. 提交推送当前 `codex/testflight-44`，生成干净来源 runtime；创建并核验恢复点，部署同 revision API/Worker，检查权限、迁移、就绪和日志。
3. 仅用已授权公开素材验证生产检索闭环并清理临时账号/对象，再核对 Simulator。TestFlight 单独记录签名/协议状态。
4. 完成后更新本页与当次发布记录。先完成检索阶段，再讨论新对话；不要以文档的历史授权代替当轮用户请求。

## 生产验收续接

原画面修复已经推送为a0f3daf并部署runtime retrieval-visual-20261010-01；389文件哈希、生产依赖审计0漏洞、迁移0 applied/35 unchanged、权限与health/ready通过。停写恢复点为marvels_chat-20261010T050750Z.dump（SHA256 64fac1e862f54e579d3b1369652b42c1e9231f96b22f5955d8702460e7876514，459行TOC）；异地备份service success，未做本轮完整恢复演练。

公开图片、真实运动花朵视频完成生产OSS/Worker索引；相册对话命中、幂等无重复检索派发、本人预览、跨账号404、视频时间点、空结果、撤回新搜索409与旧结果403通过。临时iPhone17的Build45已实际发送图片/视频查询并显示卡片，图片预览/软件键盘布局/视频2.5s定位播放通过，两个已有模拟器数据未改。第一批视频索引失败且诊断未在注销前保存，不能确定原因或恢复精确调用数；第二批不存在蜜蜂的条件曾误当正例，空结果符合语义；另有测试SQL将CHAR36误当UUID数组的脚本错误，修正后复验。这些失败不写成通过。

UI发现相册Agent把短摘要当完整匹配证据而自行否定返回结果；0.2.1提示规则在14组干净历史回归通过，但runtime02的Simulator在旧否定历史中仍错误否定。0.2.2将对话工具改为匹配结论投影，摘要只供App显示；保留历史以支持用户多轮条件，并明确本次工具结论优先。新增两个历史污染回归；候选16/16、五个found回复人工核验通过，全仓门禁通过。待部署与同一Simulator聊天复验、临时账号/OSS最终清理。旧14组对照的初始正则漏掉aren't green/doesn't quite match，随后对相同输出重新评分为基线13/14、候选14/14；保留该事实，不算独立盲测。

## 历史入口

- [清理前完整检索记录](2026-10-10-retrieval-before-cleanup.md)：10/08–10/10的过程、失败、费用与旧环境证据。
- [相册对话检索](../agents/album-assistant.md)、[检索发布证据](../agents/media-retrieval/release-evidence.md)。
- [生产运维](../production-operations.md)、[数据库与恢复](../database-backup.md)、[文档索引](../README.md)。
