# 2026-09-29 仓库冗余与文档一致性审查

## 范围与依据

基于 `codex/testflight-44` 的受版本控制文件、现行构建与发布脚本、文档引用，以及生产服务的
只读状态检查。审查开始时仅 `docs/deployment.md` 有未提交的 3D 白名单运维记录，本轮保留该记录。
仓库整理阶段未清理被 Git 忽略的本地文件；随后单独盘点并清理了下述可重建缓存。
不更改线上代码、数据库或 TestFlight。

## 处理结果

| 候选 | 核对结果 | 处理 |
| --- | --- | --- |
| `docs/demo-migration.md` | 旧 HTML/Vue 迁移和“妙”入口计划与正式 RN 实现冲突，除文档目录外无运行引用 | 删除当前副本；Git 历史仍可追溯 |
| 根 README 与各专题文档的长链接列表 | 入口重复，现行说明与带日期的记录混排 | 增加 `docs/README.md` 分类索引，根 README 只保留主要入口 |
| 迁移指南、iOS 指南、部署首页、生产文件权限说明 | 分别遗漏 030-031、错误禁止公网 IP、仍称 Build 43 最新、错误声称生产环境文件仅 root 可读 | 对照 SQL、构建守卫、发布证据和服务器权限修正 |
| `016_station_posts.sql` / `021_station_posts_compat.sql` | 内容相同，但两者均已进入按文件名与 SHA-256 核对的迁移账本 | 保留；删除或改写会破坏 readiness |
| RN 内嵌查看器 HTML 与 `avatar-web` 源码 | HTML 是生成产物，仓库检查会重新构建并逐字节比较 | 保留源码与已提交产物 |
| iOS AppIcon 的相同字节图片 | Xcode asset catalog 中不同设备/尺寸槽位 | 保留；资源合同按槽位而非哈希判断 |
| `media-retrieval-web`、`admin`、`avatar-web` | 各有独立构建或质量门禁，Web 工具并非 RN 正式页面 | 保留独立工程 |
| `docs/agents/media-retrieval/.gitkeep` | 目录已有正式文档，不再需要空占位文件 | 删除；Git 历史可追溯 |
| `scripts/check-db-connection.js` | 无脚本或文档入口；从根目录无法解析仅由后端声明的 `dotenv`、`pg`，也不支持现行 `DATABASE_URL` | 删除失效诊断脚本；后端 `checkDatabase()` 继续检查连接和迁移状态 |
| 根目录 `开发需求.md` | 早期产品草稿含过期技术栈和缺失图片引用，但有独有产品设想 | 保留并标为历史资料，移除失效图片链接，加入文档索引 |

文档相对链接检查在整理后无断链。代码未发现可以仅凭精确内容重复就安全删除的源文件；
动态 Agent 加载、迁移账本、原生资源槽位和构建产物都不能用静态引用数量判断是否无用。
对 481 个受版本控制的 JS/TS 文件核对相对 import/require 后，21 个无静态入边文件均属于
HTML 或 Node 启动入口、测试与配置、TypeScript 全局声明，或由 `Worker` 构造器加载的
`avatar-3d-mobile-optimizer-worker.js`；没有确认可删的孤立业务模块。此检查不证明所有导出、
样式键或依赖都被使用，不能替代具体功能的调用链审查。

`./scripts/check-repository.sh` 通过：根仓库 lint 与发布打包测试、后端和 Agent 检查与测试、
Admin / Avatar Web / 媒体检索 Web 构建、RN 格式/lint/类型和 28 组 177 项测试，以及 App
内嵌查看器与重新构建产物的逐字节比较。未运行原生 iOS/Android 真机构建、付费 Provider
调用或生产写入；本轮没有业务代码和迁移变更。

## 本机忽略文件复核

`MiaoxunRN/ios/build` 原约 6.4 GB，其中混有 `.xcarchive`、dSYM 和 Build 38 的 IPA，
因此不能整目录删除。确认没有进行中的 Xcode 构建，也没有进程打开目标目录后，将
`DerivedData`、`DerivedData-39`、`build38-derived`、`build41-derived` 和 `codex-derived`
这五个旧的派生目录（合计约 4.6 GB）移入本机废纸篓；它们可由后续 iOS 构建重新生成。
清空废纸篓前可恢复，且磁盘空间尚未真正释放。

保留全部发布归档、IPA、当前 `Build`、Pods、各工程 `node_modules`、Web `dist`、
Android 构建产物及测试截图，以免破坏当前开发环境或丢失发布与验证证据。
`.local-backups` 中是历史冲突和服务器同步备份，`output/` 含被交接文档引用的恢复手册 PDF；
本地 `.env` 和 `.xcode.env.local` 是配置文件，这些均未清理。

## 仍需按功能处理

大型架构、iOS 和部署文档保留历史故障与发布证据；历史章节已经用日期区分，后续新增事实应
优先更新现行入口，并将一次性证据放入 `reviews/`。较大的业务文件应在修改对应功能时按责任
边界拆分，避免仅为缩短行数改变运行路径。本次文档整理不证明全部业务流程已达到正式上架标准；
发布门槛仍以 [移动端上线清单](../mobile-launch-checklist.md) 和当次实测为准。
