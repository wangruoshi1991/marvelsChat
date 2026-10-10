# 2026-10-10 冗余清理

本轮用户授权先清理线上和本地，再提交推送当前开发分支并部署检索API/Worker。清理依据为最新引用、进程、Git祖先关系和服务器路径；历史文档不是授权。

## 代码与文档

- 检查502个JS/TS文件相对导入和后端导出；零静态入边均为HTML入口、声明、服务器/Worker或测试配置，保留。
- 删除无任何调用的漫画日记本地关键词评分/固定分镜生成器及其专用函数；正式流程由真实comic-diary Agent生成，未改该流程。
- 删除未使用的JOB_TYPES、SEGMENT_STATES、SAFE_ERROR_CODES、AGENT_KEY常量和provenanceDigestFor；内部使用的函数与版本常量收窄为非导出。
- CURRENT仅保留现行状态、验证边界及下一步；清理前全文保存在日期交接，历史失败/费用证据未丢失。现有迁移、资源槽位、内嵌viewer和独立Web工程仍有合同/构建用途，保留。

## Git分支

| 分支 | 当前HEAD之外独有提交 | 处理 |
| --- | ---: | --- |
| codex/https-ip-release-and-db-access | 0，PR9已合并 | 删除本地/远端分支，提交仍可从main/当前分支追溯 |
| codex/offsite-database-backups | 0 | 删除本地/远端分支，全部提交已包含于origin/codex/testflight-44 |
| codex/build24-ios-release | 17 | 保留；不能因旧名称丢失未合并工作 |
| feat/avatar-3d-web-v1 | 32 | 保留伙伴历史独有提交 |
| feat/media-retrieval-product-integration | 9 | 保留伙伴历史独有提交 |
| feat/public-agent-creator-kit | 2 | 保留伙伴历史独有提交 |

main、当前分支与唯一worktree保留；没有合并或关闭其他PR。

## 本机文件

没有运行中的xcodebuild/clang；目标目录无打开文件。以下目录已移至 `/Users/gary/.Trash/miaoxun-cleanup-20261010-01`，合计约4.0GB，清空废纸篓前可恢复，空间尚未释放：

- MiaoxunRN/ios/build：ModuleCache.noindex、Index.noindex、WorkspaceProbe、CompilationCache.noindex、SDKStatCaches.noindex。
- /tmp：miaoxun-rn087-derived、miaoxun-rn087-derived-final、miaoxun-rn087-derived-retry。

全部xcarchive/dSYM/IPA、当前Build/Products、签名Simulator构建、Pods、node_modules、环境配置、恢复密钥与评测报告保留。已结束且隔离表残留为零的miaoxun-retrieval-visual-qa-20261010容器及其匿名卷删除；其他Docker数据库未动。

## 服务器文件

确认systemd/Nginx均通过app symlink访问当前runtime，目标目录无进程打开文件、没有当前依赖软链接后，删除：

- releases/ab6765b/source的admin/agents/avatar-web/backend四项node_modules；source由375MB降至8.7MB，运行制品未动，锁文件可重建。
- 已完成的/tmp/miaoxun-retrieval-deploy.cX9CZj、miaoxun-album-eval.NCHs9e、miaoxun-media-calibration.oRAU08与三个随机公开素材临时目录。

删除前将三份测试日志与verify.mjs/controls.mjs压缩到 `/opt/projects/marvels-chat/backups/cleanup-20261010/retrieval-deploy-evidence.tar.gz`，SHA256为 `cf76f42639f77ccf96701c7fe4ee5b81c7da63ac8e7a372c223ec08f59c5b22f`。目录0700；仅用于历史取证，不作为当前执行指令。

旧release与历史数据库恢复点配套，因此完整归档后移出运行目录，不保留多套在线代码。已归档042c023、ab6765b、album-assistant-20261009-01、app-integration-20260916-02/03/04、media-retrieval-20261009-01/02；8项合计归档约187MiB，目录为 `/opt/projects/marvels-chat/backups/release-history-20261010`。全部源码、依赖、dist、配置、storage及文件权限保留，目录root:root0700、归档0600。每项经tar内容/权限对比、可读性与SHA校验后删除确切旧目录；服务配置、保留制品软链接和进程文件引用均先核对，未删除正式用户数据或数据库/异地备份。

旧schema版本不能直接指向当前35项迁移数据库运行。恢复历史灾备时，须在隔离环境解包完整制品、匹配数据库恢复点、核验配置及权限，再验收API/Worker和存储；没有执行本轮完整恢复演练。归档用于恢复，不能解释为运行时兼容路径。

最终新增03修复后，将retrieval-visual-20261010-01按同样流程归档；历史共9项约210MiB。releases仅保留03当前与02回滚，02的已知对话历史污染问题明确记录，完整回滚步骤见部署说明。五个本轮服务器stage在报告/脚本/日志取证后删除，最终证据归档SHA256 `f1aa33c81f57a9e709aefe11687c7e0b218e0d34e2566ed7a5af500734f0e1b3`；未跟随生产依赖软链接，不含临时账号凭据。

两个生产测试账号注销、旧token401，users/assets/segments/threads残留0；三项公开OSS对象各404。临时Simulator及其Keychain和本机凭据文件删除；两台已有Simulator保持原数据。最新门禁日志 `/tmp/miaoxun-album-match-boundary-repository-20261010.log` 全通过；生产最终ready200、API/Worker NRestarts0、Worker心跳1秒，检查区间无匹配到uncaught/unhandled/worker-failed/runtime-error日志。

## 清理后验证

`./scripts/check-repository.sh`与`backend: npm run test:media-retrieval-migration`清理后均通过：backend467 passed/4环境门控skipped、RN30组178项、Agents33、Admin14、其他Web/lint/格式/类型/构建通过；隔离pgvector9/9。日志为`/tmp/miaoxun-cleanup-repository-20261010.log`、`/tmp/miaoxun-cleanup-postgres-20261010.log`。引用复核仅余Worker入口的工厂导出，属于动态运行边界，保留。`git diff --check`通过。

删除无调用代码不改变已冻结检索prompt/模型，不重复付费质量评测。生产发布与smoke证据按部署记录补记；本清理不能证明项目全部功能已满足上架要求。
