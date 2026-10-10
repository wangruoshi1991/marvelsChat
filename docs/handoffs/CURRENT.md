# 妙讯当前交接入口

更新：2026-10-10。本页只记录现行状态、证据和下一步；日期文档保留当时事实。接续先读README、docs/README、AGENTS，再核对Git与运行环境。文档不是生产操作授权。

## 目标与约束

- 正式移动端为 MiaoxunRN/，API/Worker为 backend/，管理台为 admin/。
- 目标是可上线的真实产品；无假数据、固定检索词表、关键词降级、旧schema兼容或静默失败路径。
- 保留已有修改；不用私人素材测试，不替其他用户取得云端AI同意，不自动上传手机相册。
- 本轮用户授权清理本地/线上冗余、提交推送当前分支及部署检索API/Worker，公开素材模型调用授权有效。没有合并main，没有上传新TestFlight。

## 已完成的检索阶段

- parser schema v3仅分类原文visual/identity/syntax片段，必须完整还原原文；旧格式、低置信度、缺失或改写明确blocked。解析使用管家的DeepSeek配置。
- 身份在owner范围按完整值精确约束。原文向量召回后，对最多20个候选逐张读取当前原图片/精确视频帧判定；每次核验owner、同意、epoch、文件版本及费用预留。只接受全部条件支持的high匹配，后续失败不返回部分成功。
- descriptor v9、query v10、rerank v13（temperature=0、batchSize=1）、embedding policy v13；视觉qwen3.6-flash、向量qwen3-vl-embedding。规范化画面仅存请求内存，证据引用不进公开DTO。
- 相册Agent 0.2.2：工具只提供本次matchedQuery、匹配状态、素材引用、类型、视频时间，不把简短摘要交给对话模型再判画面。摘要仍供App卡片显示；本次检索结论优先于历史助手猜测。
- 正式入口是相册管理对话，不保留独立搜索页。添加Agent统一取得云端AI同意，已有同意复用；系统相册权限不自动上传。数据主体只有媒体表与OSS原件，索引为派生数据。

## 当前生产与客户端

- 当前runtime retrieval-visual-20261010-03，来源3b001b426518cd196ec17653738b117f23968987；389文件哈希通过。制品SHA256 e291d1006b640d9386bd288e0f129781af74c77f4073555c9985ff3de93cc805。
- 即时回滚runtime为retrieval-visual-20261010-02，来源2feaae1；同35项迁移，无新增迁移。02已验证卡片/检索链，但历史回复污染是已知问题，回滚后会重现。releases仅保留03与02。
- 03停写恢复点marvels_chat-20261010T055106Z.dump，SHA256 ad80df5f85afc6010b252fb8bcf32808ed1d6b953eb3733928df96196bbc4cf9，459行TOC、SHA及异地service success。本轮没有完整恢复演练。
- API/Worker/数据库/备份timer active，NRestarts=0，health/ready200，最终Worker心跳1秒；环境root:marvels0640、代码root:root只读。
- AVATAR_3D_ALLOWLIST=*。检索limited_release，Agent/Provider/index开启，无账号白名单、每日次数/月预算/全局预算上限；保留瞬时限流、用户同意、未知费用阻断，无自动重试。
- Build45连接正式HTTPS。临时iPhone17实际发起图片和运动视频检索，卡片、原图预览、软件键盘布局与2.5s视频定位通过。03在同一旧聊天复验图片/视频，正确报告匹配并更正历史否定。两台原有模拟器数据保留；临时设备和凭据已清理。
- Build45 archive已生成，但Distribution证书及Apple待更新协议仍阻塞TestFlight；没有上传，Simulator不代替真机/Android验收。

## 验证证据与失败边界

- 最新全仓门禁通过：backend467 passed/4环境门控skipped、RN30组178项、Agents33、Admin14及相关Web/lint/类型/格式/构建。隔离PostgreSQL/pgvector9/9已通过；后续对话投影不涉及数据库变更。
- 原文解析24/24，最终图片回归30/30，冻结版本后全新六图首次评测30/30；独立素材此后仅作回归。真实隔离HTTP/模型9项通过。20,000常量向量段计划p95 53.34ms仅验证查询计划，不证明大库召回或并发。
- 生产公开素材通过OSS/Worker索引、真实相册对话、幂等重放无新增检索派发、本人预览200/跨账号404、精确视频时间、空负例及撤回新搜索409/旧结果403。
- 两个本轮临时账号已注销，旧token401；users/assets/segments/threads残留0，三个OSS对象分别404，全库媒体/索引owner orphan0。注销前最终检索账本88条estimated，无reserved/unknown，6个index与1个purge成功；对话模型调用不包含在这88条里，实际账单未知。
- 第一批视频索引失败，诊断在注销前未保存，原因和精确调用数未知；不能算已定位解决。第二批不存在蜜蜂的条件曾误作正例，空结果正确；测试SQL的CHAR36/UUID数组错误修正后续验，未改产品合同。
- 0.2.1干净历史14组候选通过，但生产Simulator旧历史仍否定。0.2.2相同16组模型/合成工具对照：基线15/16、候选16/16，五个found回复人工核验通过；合成历史基线偶尔正确，不代表实际聊天问题不存在。详见[对话结果](../agents/media-retrieval/quality-results-2026-10-10-match-boundary.json)。
- 完整失败、早期费用及调用审计见[发布证据](../agents/media-retrieval/release-evidence.md)；有限素材不能证明任意媒体库准确率。

## 本轮清理

- 未调用的漫画固定分镜/关键词评分、孤立检索常量和摘要函数删除，内部导出收窄。502个JS/TS引用检查的零入边均为有效入口/声明/测试。
- 本机8个旧缓存约4.0GB移至 /Users/gary/.Trash/miaoxun-cleanup-20261010-01，可恢复，尚未释放磁盘。有效archive/dSYM/IPA、Pods、依赖、配置及密钥保留。
- 九个历史release完整归档至 /opt/projects/marvels-chat/backups/release-history-20261010，约210MiB；内容、权限与SHA核验后移出运行目录。历史schema恢复必须匹配数据库恢复点，不作为当前兼容路径。
- 已完成测试stage取证后删除，未跟随node_modules软链接；旧源码冗余依赖删除。空的专属QA容器/匿名卷删除，其他数据库保留。
- HTTPS发布及异地备份两个完全包含于当前分支的本地/远端分支删除。Build24和三个伙伴分支含独有提交，保留以防丢工作；当前分支已推送，未合并main。
- 清理范围和恢复办法见[清理审查](../reviews/2026-10-10-redundancy-cleanup.md)。

## 下一步

检索开发联调阶段为READY WITH CONDITIONS；完整移动端发布仍BLOCKED。后续分别处理Build45签名/协议与分发、真机/Android、代表性大库/视频与并发质量、供应商账单核对、完整隔离恢复演练及独立发布复核。其他产品能力以[上线清单](../mobile-launch-checklist.md)为准，不声称全项目零问题。

可以从本页接续新对话；先核对当前代码与运行状态，再确定下一项，不重复已经完成的检索修复和清理。

## 历史入口

- [清理前完整过程](2026-10-10-retrieval-before-cleanup.md)、[相册对话合同](../agents/album-assistant.md)、[检索发布证据](../agents/media-retrieval/release-evidence.md)。
- [部署记录](../deployment.md)、[生产运维](../production-operations.md)、[数据库恢复](../database-backup.md)。
