# 漫画与日记对话创作合同

更新：2026-11-11。本页描述本地候选实现；是否已部署、分发与真机验证以[CURRENT](handoffs/CURRENT.md)为准。Build62仍是旧表单流程。

用户在原漫画日记Agent会话讨论故事或日记，明确选择素材。信息充分时，同一次文字回复产生严格完整提案；消息内仅点一次“生成漫画”即可创建原058逐格图片任务，不再打开制作表单或调用文字模型。日记是独立分支，只有点“保存日记”才写入私有日记，不创建漫画/图片任务。普通讨论和澄清均无内容写入副作用。

## 数据与权限

源码`comic-diary 0.1.6`保留原七项scope，不新增权限、供应商、队列、依赖或配置开关。客户端需服务端公开`chatContent:1`，发送`X-Miaoxun-Chat-Content: 1`；漫画新消息缺合同在模型调用前426。其他Agent聊天合同不变。

059保存`chat_content_previews`，区分comic/diary，持久化本人/线程/输入与输出消息、严格不可变snapshot/hash、真正进入模型的需求和历史消息版本、明确选中来源版本以及精确产品授权。pending24小时；同一漫画会话新消息受理后，原pending立即superseded，即使用户未点击“继续修改”，也不能在模型等待时确认旧内容。普通讨论后如要生成，需得到新的可见提案。已确认作品的修改生成新提案，不改写原作。最多6份去重来源，每格最多4张明确选中的参考图；不读取未选择的全相册、其他会话或日记。普通文字模型仅看到图片元数据，不能声称已看懂照片；需用户补充创作说明，确认后现图片适配器才接收真实参考图字节。

消息公开metadata只含`contentPreview:{version:1,id}`。完整内容经本人鉴权API读取，不在公开metadata写入分镜、原图URL或授权信息。撤回/删除消息抑制入口，来源变化阻止确认、后续画格和输出绑定；已生成作品仍可在本人“我的漫画”读取，不依赖重新授予执行权限，也不返回失效来源正文。

确认在同事务完成：漫画记录、唯一058任务/画格、结果关联和审计，或私有日记和审计。漫画不隐式写日记。已成功确认按首次接受的revision/hash重放，换key也返回原目标；确认结果未知只刷新原结果，不再次调用模型或创建任务。058的source约束、逐格一次调用、结果未知即停止后续/不自动重试保持。

继续修改时，本次`contextRefs`是完整素材清单，空数组明确不选素材；不会与旧清单并集恢复已移除照片/日记/消息。保留的旧来源固定原revision，变化即拒绝；移除的来源不再读取或传给模型，原分镜里未选照片ID也会去除。已保存的分镜文字仍可作为改写起点，不等于删除原作品。已确认提案出于安全不返回旧来源清单，继续修改时客户端提示重新选择参考素材。

## API

以下接口都要求正常登录；预览接口另要求内容合同头，错误使用现有`error.details.code`。

| 方法和路径 | 请求/结果 |
| --- | --- |
| `GET /api/chat-content-previews/:id` | 本人可见预览、当前允许操作、来源安全标签及typed结果ID |
| `POST /api/chat-content-previews/:id/confirm` | `{revision,snapshotHash,idempotencyKey}`；只确认服务器原内容，返回当前预览与原结果ID |
| `POST /api/chat-content-previews/:id/reject` | `{revision}`；取消pending，不删除已生成作品 |
| `POST /api/threads/:threadId/messages` | 沿现消息合同可附`contentPreviewContext:{id,revision}`，参与请求指纹，只能续本线程提案 |
| `GET /api/station/comic-diaries/:comicDiaryId` | `{comicDiary,tasks}`，本人单作品，不以最近列表猜测存在性 |
| `GET /api/station/comic-diaries` | 本人作品列表，旧独立草稿可达 |

comic snapshot字段为`title/summary/style/frameCount/frames`，style只允许`slice-of-life/cute/manga/storyboard`，2–8格按1开始连续排序；未指定默认4格生活漫画。每格固定`index/title/scene/caption/dialogue/mood/camera/mediaAssetIds`。diary snapshot固定`title/body/mood`。严格校验拒绝多余字段、无效顺序、超长文本或未选媒体，不从失败结果补造内容。

RN会话集中读取可见卡片和轮询活跃任务，后台停止；token/账号/线程/epoch变更丢弃迟回。画格按固定位置显示排队、生成、失败、未知或真实私图，点开详情查看大图与分镜。取消只允许排队任务；有成功图片时可进入现有动态编辑器，部分成功明确实际图片数。历史入口是只读“我的漫画”，新创作只在聊天进行；日记详情的明确转漫画入口保留。

本版相册选择器使用当前已载入的最近媒体，并明确提示范围不完整；不是读取全相册或全库搜索。“我的漫画”读取最近50份作品，单作品详情按精确ID获取，不用列表缺失判断作品不存在。

## 动态发布回执

060为现`POST /api/station/posts`增加可选UUID `clientRequestId`。旧无ID请求保留独立发布语义；新客户端在发POST前账号隔离持久化最终payload和有序附件来源，body、位置、visibility、Agent选择和图片顺序参与hash。帖子、媒体排序、回执与审计同事务；同owner/ID同hash返回原帖，不同hash409。

`GET /api/station/post-submissions/:clientRequestId`只读返回`{status:'submitted',post}`或`{status:'not_submitted'}`。**GET未提交不能证明延迟POST不会到达。** 本人`POST .../:clientRequestId/resolve`持同一请求锁，已提交返回原帖；缺失则持久关闭意图再返回未提交，延迟旧POST明确409。RN未知状态冻结payload，以原ID核验/关闭后才能编辑或新建意图，不能换ID重复发帖。关闭/重启后恢复同一记录，核验失败继续保留，不静默清理可能已用于帖子的新上传资产。

已提交帖子随后被删除时，回执仍保留，重放/核验返回409 `STATION_POST_RECEIPT_UNAVAILABLE`；客户端明确显示错误并保留该次发布记录，既不插回已删除帖子，也不自动重发。本版尚无手动解除这类回执的流程。

漫画带入默认“仅自己可见”，用户可编辑文案/移除图片/选择可见范围，最后本人点发布才写帖子。`existingAsset`借用已有成品，取消只撤引用不删除；`pickedLocalFile`才拥有本次临时上传清理责任。Agent没有发布动态的权限。

## 验证与配套顺序

隔离测试可显式使用fixture文字/图片Provider与对象存储，同时运行真实HTTP鉴权、数据库事务、队列Worker、图片标准化和私读。这不代表真实供应商画质、费用或设备验收。

```sh
MIAOXUN_DOTENV_ENABLED=false DATABASE_URL=<loopback专用_migration_test库> node backend/scripts/db-migrate.js
MIAOXUN_DOTENV_ENABLED=false RUN_CONVERSATIONAL_COMIC_INTEGRATION=1 DATABASE_URL=<同一专用库> node --test backend/test/conversational-comic-e2e.integration.test.js
MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh
git diff --check
```

配套发布须另获授权：恢复副本验证059/060及备份→部署迁移/Backend/原AI Worker→核对readiness与合同→正常后台发布精确0.1.6 Release及Product→用户本人原位同意→新客户端分发→真实设备与单独授权的模型验收。旧Build62缺新内容合同，不能单独升级服务后声称旧包已支持。

11月13日已有058数据升级演练确认，迁移逐文件提交：059成功而060失败时账本为59，必须保持维护，不能当作两项整体回滚。059/060已写入账本后，旧058runtime的迁移检查会拒绝未知文件，只切回旧runtime不能恢复就绪。仅在保持维护且确认没有开放后新写入时，才能评估恢复已验证的完整058数据库备份并配套原runtime；不得手动删表、删账本或修改checksum。产生新内容、授权、任务或发布回执后不得用旧备份覆盖业务，优先前向修复，恢复范围需另确认。详见[配套发布预检](reviews/2026-11-13-conversational-comic-release-preflight.md)。
