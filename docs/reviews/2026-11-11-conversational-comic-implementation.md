# 2026-11-11 对话漫画首版本地实现

本记录对应用户“先这样实现一版，先看看效果”的本地实施授权。工作树为 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，基线 `f1a6c8fc5c2b0aea2852e0f626d2ef82e68e72e7`，分支 `codex/ui-agent-candidate-20261105`；保留原有交接、索引、发布记录和设计文档修改。没有提交、推送、部署、后台发布、TestFlight上传、追加付费调用或代用户授权。

## 实际交互与文件

- `MiaoxunRN/src/features/messages/MessagesScreen.tsx`、`ChatMessageItem.tsx`、`useChatContentPreviews.ts`：原漫画Agent聊天内讨论，服务端提案消息卡片一次确认；集中读取可见预览和轮询活跃任务，后台停止，账号/线程/epoch迟回抑制。旧 `ComicCreationScreen.tsx` 表单及其专用旧测试移除，保留日记详情转漫画入口。
- 同目录 `ContentPreviewMessageCard.tsx`、`ComicFrameGrid.tsx`、`ComicDetailScreen.tsx`、`MyComicsScreen.tsx`、`ComicSourcePickerSheet.tsx`、`PrivateReferenceImage.tsx`：紧凑画格、真实加载/失败/未知占位、详情分镜、大图、只读历史、明确选择具体参考图；旧 `StationComicRenderPanel.tsx` 共用画格。触点至少44pt，未重新设计现有页面。
- `MiaoxunRN/src/models/chatContentPreview.ts`、`services/api/chatContentApi.ts`、`aiContract.ts`、`messageApi.ts`、`models/api.ts`、session类型/发消息/同步调用及 `App.tsx`：严格合同、当前消息引用、修改上下文、本人作品读取和编辑器接线。确认后不再调用文字模型；普通漫画不保存日记。
- `backend/database/059_chat_content_previews.sql`、`backend/src/chat-content-contract.js`、`chat-content-preview-service.js`、`chat-content-provenance.js`、`routes/chat-content-preview-routes.js`：不可变预览、本人/线程/消息/结果所有权外键、内容hash、24小时窗口、原子确认/审计、成功重放；原专业消息和058 Worker接入来源、scope、精确Product/Release/entitlement校验。
- `agents/comic-diary.agent.js`：源码0.1.6，七scope保持；严格comic/diary/reply/clarify分支。同一次文字模型答复给完整分镜，Agent无发布动态权。
- `backend/database/060_station_post_submissions.sql`、`backend/src/station-post-submission-repository.js`、station post路由/schema/事务helper：稳定发布ID、有序payload hash、回执与帖子/媒体/审计同事务；resolve原子关闭未提交意图。RN `useStationPostComposer.ts`、composer组件、`stationPostAttemptStore.ts`、station API/session动作：账号隔离持久恢复，未知冻结，已有漫画图作为借用资产取消不删除，进入编辑器默认仅自己可见，最后本人点发布。
- 对应RN、Backend、Agents测试；`backend/scripts/comic-render-live-e2e.js`移除写死58项迁移的判断，按当前文件与checksum核对。本轮没有执行该付费live脚本。
- 合同、配置说明和交接：`docs/conversational-comic.md`、`docs/api/chat-content-previews.md`、database/agents/AI交互/小站说明、`MiaoxunRN/README.md`、`backend/.env.example`、批准spec/实施清单、文档索引和CURRENT。没有新依赖、供应商、环境开关或权限架构。

## 独立审查收口

- 普通自然聊天未点“继续修改”也必须使旧pending失效：新消息受理事务统一supersede同owner/thread全部pending，模型等待时不能确认旧内容；消息重放不失效新提案，confirmed成品保留。
- 删除本次Agent提案回复后，Worker发送和输出绑定必须停止：本次input/output与真实history按稳定ID排序检查/锁定，迟到图片不绑定成品，也不派发后续画格。
- 修改中的素材移除必须生效：本次`contextRefs`是完整明确清单，不能由旧提案并集恢复已取消照片；保留来源固定旧revision，变更明确拒绝；给模型的旧snapshot清除不再选中的图片ID。
- 动态结果未知时只读GET“未提交”不能解锁：resolve持同一锁持久关闭旧意图，迟到POST409；已删除动态回执409且保留记录，不恢复或重复发布。
- 旧Alert回调不得关闭新账号编辑器；同账号Keychain迟写完成前恢复读取必须等待，不能覆盖原待核验意图。借图取消、旧token迟回和本次临时上传清理分别验证。

## 验证边界

独立一次性loopback PostgreSQL、测试角色和专用 `*_migration_test` 库用于本轮；空库实际应用60项迁移。有限statement/lock timeout用于并发验证。端到端测试运行真实Express鉴权、仓库事务、058队列/执行器、图片标准化和私有HTTP读取；文字/图片Provider与对象存储明确使用fixture，不冒充真实模型、生产存储或真机。

数据库最终执行：同一新库依次跑预览16项、058队列14项、HTTP端到端4项、私图字节读取1项、发布回执6项，**41/41通过、0失败、0跳过**。迁移首次60 applied/0 unchanged，再跑0 applied/60 unchanged；独立checksum/readiness校验`current=true,appliedCount=60,expectedCount=60,pending=[]`。旧专业Agent HTTP集成另库21/21、0跳过，证明既有聊天链路回归。日志 `/tmp/miaoxun-conversational-comic-postgres-final.log` 与 `/tmp/miaoxun-conversational-comic-migration-final.json`。

RN实现者定向13套176项通过，TypeScript、定向ESLint零警告、Prettier通过；独立审查者5套48项通过，并在独立真实PG复核移除图片后`actualReferenceKinds=[],removedImageStillRead=false`。这些是组件/合同验证，不替代设备。

整仓首跑被尚在整理的28个RN文件格式检查中止；整理后重跑到RN全量发现7项既有管家场景的调用参数断言失败（App无条件增加两个尾部undefined）。App改为按ChatScreen实际参数原样透传，未修改旧expect或放宽门禁，定向4套122项通过后完整重跑。

最终 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0，明确 `All repository checks passed`：RN **111套1374项通过**；Backend1148通过、402项环境门控跳过、0失败；Agents59、Admin52、Avatar29、检索Web4全通过；语法、格式、ESLint零warning、类型、Web构建和内嵌viewer一致性通过。`git diff --check`退出0。最终日志 `/tmp/miaoxun-conversational-comic-repository-final-success.log`；原失败日志 `...-repository-check.log` 与 `...-repository-final.log` 保留，未改写为成功。环境门控skip不计为PostgreSQL通过，真正的PG验证为上列41+21项。测试日志仍有React act警告及Web chunk提示，未通过屏蔽日志或降门槛解决。

本轮专用cluster在核对role、端口59957、精确data_directory且没有其他客户端连接后已用fast stop停止；测试库和日志保留于本轮临时目录，未对共享/生产PG执行清理。后续复验需按新隔离环境重新启动/迁移，不依赖常驻测试服务。

固定iPhone17当前为Shutdown。源码冻结后实际运行 `node scripts/miaoxun-development.mjs ios --build-only` 退出1，构建前的只读容器检查返回 `Unable to lookup in current state: Shutdown`。没有启动、安装、启动App或绕过保护，因此本轮不能声称iOS编译、模拟器视觉或真机通过。最终日志 `/tmp/miaoxun-conversational-comic-ios-build-only-final.log`。

## 当前线上与下一步

本轮公开只读实读 `/api/ready` 200，数据库连接/迁移current；`/api/agents` 200、9项、漫画0.1.5，UI Agent0.1.0。该readiness对应当前生产runtime，不证明本地059/060已部署。用户已确认安装Build62；本轮未重新读取设备版本，也未改Apple分发。

新版本尚未上线，当前手机看不到新流程。配套工作顺序和回退边界见[完整合同](../conversational-comic.md)：先独立恢复验证/部署059与060及Backend/Worker，再正常后台发布精确0.1.6 Release与Product、新客户端分发，最后真机与单独授权的真实模型验收。

首版已明确的范围限制：相册选择仅当前最近载入图片、历史作品最多50份；没有全库照片分页/搜索。文字模型只读选图元数据，不能看懂原图；需附故事说明。已确认作品续作不暗中恢复旧素材，需重新明确选择。已删除动态的未知发布回执保留并冻结，本版没有手动解除流程。真实模型画质、供应商费用、设备尺寸/图片性能、手势/键盘/动效均仍待设备验收。
