# 对话漫画与日记预览 API

此合同是本地候选实现，需先应用059（在058之后），再发布匹配的Agent0.1.6和客户端；本文不代表生产已部署或真实模型质量已验收。

漫画Agent消息、新预览接口要求 `X-Miaoxun-Chat-Content: 1`。既有消息接口仍要求AI合同1、Workspace合同6。旧漫画客户端在调用模型前返回426，其他Agent的消息合同不变。

Agent仅可返回 `reply`、`clarify` 或漫画专属的 `content_preview`。后一种严格区分 `kind: comic|diary`，完整分镜或日记与真实回复、run、审计一起提交，客户端只收到 `metadata.contentPreview={version:1,id}`。模型无权指定owner、产品授权、执行权限或发布动作。

## 预览

`GET /api/chat-content-previews/:id` 返回 `{data: ContentPreview}`：

```ts
type ContentPreview = {
  id: string; version: 1; revision: number; snapshotHash: string;
  kind: 'comic'|'diary';
  status: 'pending'|'confirmed'|'rejected'|'expired'|'superseded'|'revoked';
  threadId: string; inputMessageId: string; outputMessageId: string;
  snapshot: ComicSnapshot|DiarySnapshot;
  sources: {type:string;id:string;title:string;mediaAssetId?:string}[];
  allowedActions: ('confirm'|'reject')[]; expiresAt: string;
  result: {comicDiaryId:string;comicRenderTaskId:string}|{diaryEntryId:string}|null;
};
type ComicFrame = {
  index:number;title:string;scene:string;caption:string;dialogue:string;
  mood:string;camera:string;mediaAssetIds:string[];
};
type ComicSnapshot = {
  title:string;summary:string;style:'slice-of-life'|'cute'|'manga'|'storyboard';
  frameCount:number;frames:ComicFrame[];
};
type DiarySnapshot = {title:string;body:string;mood:string};
```

Pending期限24小时。格数2–8且与frames一致，index从1连续；默认4格由Agent提案明确展示。一次预览canonical来源最多6份，每格最多4张参考图。模型只能分配明确选中的本人station-photo ID。文件、整相册和视频不能作为漫画提案的图片来源；相册需先在客户端选定具体照片。普通照片引用只有元数据，不是视觉理解。

当前可见输入、输出和实际进入模型的全部history均须仍可用。Pending读取及首次确认复核当前精确Agent、scope、Product、Release和entitlement；已确认读取不要求重新授予执行权限，但来源变更或撤回后聊天预览不可读。`sources`在非pending响应中为空，以免重放失效来源标题；已确认frames中的原参考ID可保留，不能把它当作重新读取或执行授权。

## 一次确认

`POST /api/chat-content-previews/:id/confirm`：

```json
{"revision":1,"snapshotHash":"64位小写SHA256","idempotencyKey":"稳定客户端键，8至160字符"}
```

成功返回当前ContentPreview，revision递增、status为confirmed、result为真实目标。确认不再次调用文字模型：comic分支同事务创建不依赖日记的漫画记录、058任务及画格、确认回执与审计；diary分支只把已确认正文存为 `source=agent,visibility=private` 的日记。任一步失败整体回滚。

幂等键按本人和preview定域。同预览同语义换key仍返回原目标，不能再执行；重放按首次接受的revision/hash比较，不能使用确认后revision新建请求。成功重放优先于expiry和当前执行授权检查，只返回本人已确认内容及结果引用。相同preview的不同revision/hash返回409。未知传输结果读取原预览，不换key重发生成意图。

`POST /api/chat-content-previews/:id/reject` body为 `{revision}`，只消费pending；已开始任务沿058的queued-only取消接口。不能宣称在途供应商调用已撤销。

继续修改经原消息API传 `contentPreviewContext:{id,revision}`，纳入消息fingerprint并限制同owner、线程和漫画Agent；pending与confirmed均可作为续作起点。漫画线程每条新消息在受理事务中立即使该线程所有旧pending预览superseded，不依赖修改关键词或是否点击续作入口，模型等待期间不能确认旧提案；显式续作先读取原快照，再统一失效pending，confirmed成品及回执保留。相同消息重放不会使新提案失效。

续作的 `body.contextRefs` 是完整当前来源清单，最多6份，空数组明确表示无外部素材；不能与旧清单取并集。客户端预装所有支持的photo/diary/chat-message来源后允许逐项移除。保留且未重传version的来源沿用原冻结version，变更后必须明确重新选择；移除的来源即使已删除或撤回也不会被重新读取。模型只收到当前选择的引用，续作快照中的未选参考图片ID被移除，明确移除的聊天来源从本次model history排除；新预览只冻结实际进入本次模型的request/history及当前引用版本，不继承旧历史来源正文。原已创作快照纯文本仍可用于续写，旧快照不被改写。confirmed响应sources为空，因此继续修改默认不自动恢复原素材，需用户重新选择。

## 作品和任务

`GET /api/station/comic-diaries/:comicDiaryId` 返回 `{data:{comicDiary,tasks}}`，列表仍返回既有ComicDiaryDTO数组。单作品详情只按本人读取 authored frames、成品及状态，去除来源prompt、来源IDs和metadata；不依赖源聊天或当前Agent执行权限。已保存日记和本人漫画不随聊天删除自动删除。

058任务公共合同仍为comicRenders1、内部contract_version2，不写thread/input/approval/context_refs，未知结果不自动重试。新chat-origin漫画冻结 `metadata.chatContentPreviewId`，Worker每格发送前和输出绑定前复验消息hash、来源revision与精确授权；本次输入与提案回复也必须仍属于本人、原线程且未删除/撤回，与来源消息按统一ID顺序锁定。已发出的供应商调用无法撤销，但删除提案回复后其迟到图片不会绑定为成品，也不会再派发后续画格。进度保存在task/preview，禁止回写冻结漫画的updated_at或metadata。

主要错误：426 `CHAT_CONTENT_CLIENT_UPDATE_REQUIRED`；404 `CHAT_CONTENT_NOT_FOUND`；409 `CHAT_CONTENT_CHANGED` / `CHAT_CONTENT_EXPIRED` / `CHAT_CONTENT_SOURCE_CHANGED` / `CHAT_CONTENT_AUTHORITY_CHANGED`；422 `CHAT_CONTENT_SOURCE_LIMIT` / `CHAT_CONTENT_SOURCE_UNSUPPORTED`；503 `COMIC_RENDER_NOT_READY`。授权错误继续使用既有 `AI_ACCESS_REVOKED`、`AGENT_PRODUCT_ENTITLEMENT_REQUIRED` 等安全合同。

本地验证采用独立loopback PostgreSQL和显式fixture provider/storage，未调用付费模型。预览并发、回放、撤权、来源失效、原子审计和058执行回归由 `backend/test/chat-content-preview.integration.test.js` 及既有comic-render集成测试覆盖。
