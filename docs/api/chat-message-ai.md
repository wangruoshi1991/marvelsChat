# 普通聊天消息翻译与语音转写

这两个接口要求已登录，按当前账号能读取的单聊或群聊消息副本取内容。撤回、删除、其他账号的消息以及未被当前消息引用的语音附件均返回 404。已经退出群聊但仍可阅读的历史消息遵循同一规则。会话中的其他消息、引用和用户资料不随请求发送给供应商。

| 操作 | 请求 |
| --- | --- |
| 翻译文字 | `POST /api/threads/:threadId/messages/:messageId/translate`，请求体 `{"language":"zh"}` 或 `{"language":"en"}` |
| 翻译已有转写 | `POST /api/threads/:threadId/messages/:messageId/translate`，请求体 `{"language":"en","attachmentId":"<UUID>","transcriptId":"<UUID>"}`。只使用服务端对应转写，不接收客户端正文，也不再次调用转写。 |
| 转写语音 | `POST /api/threads/:threadId/messages/:messageId/transcribe`，请求体 `{"attachmentId":"<UUID>"}`，可选 `language` 为 `zh` 或 `en`。未指定时由供应商识别语言。 |

成功返回 `{"data":{"text":"…"}}`，带 `Cache-Control: private, no-store`。输入文字上限为 6000 字符。转写仅接收该消息所引用的内部 AAC/M4A 语音附件，上限 8 MiB、约 60 秒。服务端不写入聊天记录或记录正文、音频和模型输出。接口会在返回结果前再验证消息及附件仍可读取。已送达供应商的请求由供应商处理，即使消息在处理期间撤回。

当两项功能都可用，且转写结果不超过 6000 字符、附件存在有效 SHA-256 元数据时，转写成功响应另含随机 `transcriptId`。服务进程仅在内存中保存该结果，绑定当前账号、会话、消息、附件及附件 checksum/大小/时长；翻译前后只复验这些元数据及当前可读权限，不重读音频。每条结果最多保留 10 分钟，并通过定时器清除；每账号最多 20 条、全进程最多 200 条，超限淘汰最早条目。服务重启、过期、淘汰或请求落在没有该结果的其他进程时返回 `409 CHAT_MESSAGE_AI_TRANSCRIPT_EXPIRED`，不会重新转写或接受客户端补交正文。本实现的 receipt 属于单进程，不支持跨实例共享，也不构成线上多实例验收证据。

同一有效 `transcriptId`、同一目标语言的并发与成功重复翻译复用结果，避免重复供应商调用。失败仅允许用户主动重试；请求已送达供应商时仍可能计费。RN 仅在转写成功后显示“翻译转写”，用户点击后才发送翻译请求，原文和译文分别展示；失效时明确提供“重新转写”，不会自动调用任何供应商。界面显示/隐藏结果只改变本地展示，不重复请求；切换账号/会话、语言或能力配置会使旧结果失效，应用进入后台时清除本地结果和 receipt，未完成请求的返回不再展示。

两项功能分别由 `CHAT_MESSAGE_TRANSLATION_ENABLED` 和 `CHAT_MESSAGE_TRANSCRIPTION_ENABLED` 启用，默认关闭。翻译使用 `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL`。语音转写使用 `CHAT_MESSAGE_TRANSCRIPTION_URL`、`CHAT_MESSAGE_TRANSCRIPTION_API_KEY`、`CHAT_MESSAGE_TRANSCRIPTION_MODEL`，URL 填 OpenAI 兼容转写端点的完整 HTTPS 地址。每账号合计每 10 分钟最多 20 次请求，单次供应商请求和响应读取最多 30 秒。模型响应超过 128 KiB、格式无效、被截断或包含工具操作均视为失败。

已认证的 `GET /api/app/bootstrap` 和 `GET /api/app/sync` 返回 `data.chatMessageText`，包含布尔值 `translate`、`transcribe` 和 `translateTranscript`，最后一项仅在两项服务都可用时为 `true`。服务端依据功能开关、HTTPS 端点和供应商配置是否齐全生成，返回值不含供应商凭据。各入口只在对应字段为 `true` 时显示；转写翻译额外要求三个字段均为 `true`，旧服务缺少 `translateTranscript` 时保持隐藏。404 响应只有带 `CHAT_MESSAGE_AI_NOT_FOUND` 错误码时才表示原消息或语音附件不可用。

| 状态 | 错误代码或含义 |
| --- | --- |
| 400 | 无效标识、语言或未知请求字段 |
| 401 | 会话未认证 |
| 404 | `CHAT_MESSAGE_AI_NOT_FOUND` |
| 409 | `CHAT_MESSAGE_AI_TRANSCRIPT_EXPIRED`，仅明确点击“重新转写”才重新调用转写供应商 |
| 422 | `CHAT_MESSAGE_AI_UNSUPPORTED_CONTENT` |
| 429 | `RATE_LIMITED` |
| 502 | `CHAT_MESSAGE_AI_PROVIDER_FAILED` |
| 503 | `CHAT_MESSAGE_AI_UNAVAILABLE` |
| 504 | `CHAT_MESSAGE_AI_TIMEOUT` |
