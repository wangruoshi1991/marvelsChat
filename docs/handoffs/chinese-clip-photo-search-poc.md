# Chinese CLIP 相册检索原型交接

2026-11-26。本次交接提供一个已经验证可运行的本机相册检索原型，供移动端同事复现并与现有检索方案比较。入口为 [`tools/ai-photo-search-poc/README.md`](../../tools/ai-photo-search-poc/README.md)。本分支新增独立工具和交接文档，未将其接入正式 App 或生产运行配置。

## 先运行再比较

1. 在原型目录运行 `./start.command`，导入少量照片，输入中文描述检索。
2. 按原型 README 下载经哈希校验的公开素材，启动独立测试相册，运行固定查询。
3. 将同一批照片和同一组题目交给现有检索方案，对比前 5 命中、首图完整匹配、空结果、索引耗时、查询耗时和模型调用成本。
4. 确认目标是后端运行，还是照片始终留在手机、手机离线运行，再决定整合方式。

## 两套实现的边界

| 项目 | 本原型 | 仓库现有正式链路 |
| --- | --- | --- |
| 模型 | Chinese-CLIP 在服务电脑的 MPS 或 CPU 上推理 | Node.js Provider 调用外部模型 API |
| 检索 | 图片/文本向量余弦排序，返回候选 | 服务端索引、向量召回及候选画面核对 |
| 数据 | SQLite 和本地照片副本，共享单相册 | PostgreSQL、用户素材归属和授权/生命周期 |
| 客户端 | 简单网页，适合验证 | React Native、相册 Agent/workspace 和鉴权预览 |
| 无目标 | 仍返回最相似照片 | 沿用现有公开合同的空、失败和不可用状态 |

参考现行源码：[`media-retrieval-provider.js`](../../backend/src/media-retrieval-provider.js)、[`station-media-retrieval-routes.js`](../../backend/src/routes/station-media-retrieval-routes.js)、[`mediaRetrievalApi.ts`](../../MiaoxunRN/src/services/api/mediaRetrievalApi.ts)、[`WorkspaceMediaResult.tsx`](../../MiaoxunRN/src/features/workspaces/WorkspaceMediaResult.tsx)。这些是源码事实，不替代线上或设备验收。

## 建议整合方式

若模型在后端运行，可将图片/文本特征计算抽成独立 Python service/worker，由现有 Node 后端编排，复用账户鉴权、素材归属、授权撤回、任务、清除和 App 结果界面。此次没有实现这层适配；不让正式 App 直接访问无鉴权的 PoC 接口。

现有模型向量与 Chinese-CLIP 向量不能混用。更换模型时需同步模型来源/版本、维度、归一化和数据库约束，并重新生成图片与文本索引，保留明确的失败和无结果策略。不能仅替换模型名后继续使用旧索引。

若要求照片不离开手机，需要另做端侧模型转换或选型、手机相册权限、增量索引、后台执行、存储与内存/耗电/性能验证。当前 Python 原型没有这些手机端能力。现有手机相册授权也不会自动把整个系统相册加入服务端索引。

## 原型接口

这些接口用于独立原型联调，不是正式 App 的公开合同。照片导入为异步建索引，先看状态再搜索。默认只允许本机 Host；显式局域网演示保留同源与网段限制，但不提供用户鉴权。

| 方法和路径 | 输入与结果 |
| --- | --- |
| `GET /api/status` | 照片总数、ready/pending/failed、模型和索引状态 |
| `POST /api/photos` | multipart `files`，每批最多 50 张；返回 accepted/duplicates/errors |
| `POST /api/model/load` | 请求准备模型，首次需联网下载 |
| `POST /api/search` | JSON `{"query":"蓝眼睛长毛猫的脸部特写","limit":5}`；返回 results、elapsed_ms、indexed_count |
| `GET /api/photos?limit=60` | 当前照片、缩略图和大图路径；公开图附署名链接 |
| `POST /api/feedback` | query、photo_id、relevant、rank，保存人工判断 |
| `GET /api/evaluation` | 当前相册的搜索和反馈记录 |
| `DELETE /api/photos` | 清除本原型整个相册、索引、搜索和反馈，保留模型缓存 |

相似度只用于排序，不是概率。原型只针对可见画面，不可靠支持人物身份、拍摄日期、精确地点、文字和复杂关系；没有匹配照片时仍返回候选。局域网操作会作用于共享相册，不能用于多用户正式部署。

## 交付内容与证据

- 运行源码、网页、锁定依赖、macOS 启动和局域网后台脚本。
- 四图真实模型 smoke 脚本、访问限制测试、固定公开 60 图和两轮题目/结果、逐图许可。
- 图片只按已记录的 HTTPS 地址下载并校验 SHA-256。模型、虚拟环境、运行日志、数据库、个人照片和下载图片均不提交。
- 历史 2026-11-10 第二轮：目标首位命中 18/24、前 5 命中 24/24；视觉复核首图完整匹配 17/24；4 条无目标未能拒绝。只代表小样本验证，不保证大相册效果。
- 本次交接复验状态见 [当前交接](CURRENT.md) 中的 2026-11-26 小节。历史结果保留原日期，新结果写入工具 `.run/`。

同事接手后的首个交付建议是一个固定样本的两方案对比结果与选型决定，再建立正式适配分支。现有 App、迁移、Provider 和生产开关不由本交接自动变更。
