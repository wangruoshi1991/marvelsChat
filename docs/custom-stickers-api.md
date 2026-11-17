# 自定义表情 API 合同

第一阶段只支持本人收藏的静态 JPEG、PNG、WebP 图片。服务端统一规范化为静态 PNG，最大输入 2 MiB、最长边 512 像素；GIF、动画 WebP、视频、无法解码的内容均返回明确错误。服务端不记录图片内容、原始 URL 或文件名。

## 收藏

- `GET /api/custom-stickers?limit=100&before=<id>`：只返回当前账号未删除的收藏。未认证或其他账号不能读取。
- `POST /api/custom-stickers/upload`：认证后以 `application/octet-stream` 上传；必须提供 UUID `Idempotency-Key` 和 `X-Miaoxun-Sticker-Mime`。返回 `{ id, mimeType, byteSize, width, height, downloadPath }`，重复相同请求返回同一收藏，复用同一幂等键提交不同图片返回 `409`。
- `DELETE /api/custom-stickers/:stickerId`：软删除本人收藏。删除不影响已经发送且仍可见的消息；删除后不能新发该表情。
- `GET /api/custom-stickers/:stickerId/content`：认证内容读取。收藏者可读自己的未删除收藏；已发送消息的接收者或仍在群内的成员可读可见消息引用。陌生人、退出群成员、已删除/撤回消息对应内容返回 `404`。

## 消息

普通消息请求增加可选 `stickerId`。表情消息必须同时提供 `clientMessageId`，且 `content` 为空、没有普通 `attachmentIds`、上下文引用、Agent/UI/workspace/content-preview 字段或客户端上下文。服务端验证表情仍属于发送者本人收藏，并在消息 `metadata.sticker` 写入 canonical `{ id, mimeType, byteSize, width, height, downloadPath }`。同一收藏可跨普通会话发送，但不能由 Agent 会话、非所有者或不在群组的账号发起。

`stickerId` 纳入消息 request fingerprint 和已有幂等/精确重试合同。普通消息镜像只携带安全 canonical metadata；公开消息投影会在消息删除或撤回后移除表情字段。表情不授予任何 Agent scope，也不开放共享搜索。

迁移 `061_custom_stickers.sql` 使用独立收藏表和消息引用表；收藏删除采用软删除，引用触发器在发送、镜像、删除/撤回时校验所有权、会话成员关系和消息形态。
