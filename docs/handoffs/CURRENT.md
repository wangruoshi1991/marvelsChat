# 妙讯当前交接入口

更新：2026-10-10。本页只记录现行状态与下一步；历史事实和评测失败见链接。接续先读 README、docs/README、AGENTS，再核对 Git 与运行环境。文档本身不授权生产操作。

## 目标与约束

- 正式移动端为 `MiaoxunRN/`；API/Worker 为 `backend/`，管理台为 `admin/`。
- 目标是可上线的真实产品；无假数据、固定检索词表、关键词降级、旧 schema 兼容或静默失败路径。
- 保留现有修改；不能读取私人素材作为测试数据，不能替用户取得云端 AI 同意或自动上传本机相册。
- 用户本轮已授权先清理本地/线上冗余，再提交推送当前分支并部署检索 API/Worker。公开测试素材和模型调用授权继续有效。未要求合并 main；TestFlight 条件独立核验。

## 检索修复候选

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

- 发布前已只读核对：runtime `album-assistant-20261009-01`，来源 `a634fc4`；迁移35；API/Worker active、NRestarts=0，health/ready 200。
- 保留 `AVATAR_3D_ALLOWLIST=*`；检索 `limited_release`、无账号白名单/每日次数/费用预算上限，保留瞬时限流与用户同意。
- 旧 runtime、环境配置、storage、数据库本机/异地备份均保留；清理不改正式用户数据。部署进度和当次恢复点见[部署说明](../deployment.md)。
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

## 历史入口

- [清理前完整检索记录](2026-10-10-retrieval-before-cleanup.md)：10/08–10/10的过程、失败、费用与旧环境证据。
- [相册对话检索](../agents/album-assistant.md)、[检索发布证据](../agents/media-retrieval/release-evidence.md)。
- [生产运维](../production-operations.md)、[数据库与恢复](../database-backup.md)、[文档索引](../README.md)。
