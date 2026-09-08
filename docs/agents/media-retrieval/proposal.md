# 媒体检索 Agent 提案

- Agent key: `media-retrieval`
- 名称: 媒体检索 Agent
- 状态: `draft`
- 日期: 2026-08-06
- Owner Team: Jarson（个人负责）

## 用户问题

用户希望按自然语言在自己已经上传的图片和视频中寻找已有素材，例如服饰、颜色、场景、动作、物体或画面中的文字，而不是生成新的内容。

## 目标任务

- 经用户一次明确同意后，为其已有私有媒体建立可删除的派生索引。
- 对图片和最多六张视频代表帧生成非身份化描述与 1024 维检索向量。
- 在已认证用户自己的素材范围内返回受控命中、匹配原因与视频时间点。
- 支持回填、增量索引、重建、停用和清除的可审计异步运行。

## 非目标

- 不读取设备相册、第三方库或其他用户素材。
- 不生成人像、图片、视频或 3D 内容。
- 不做脸部、名人或人物身份识别，也不推断年龄、性别、健康或其他敏感属性。
- 不把原始媒体、对象路径、向量、模型原始响应或搜索原文返回给客户端。

## 成功门槛

- 合成 30 案例评测通过率至少 85%，授权、删除和身份隔离案例必须全部通过。
- 已完成索引的检索 P95 不高于 2 秒。
- 跨用户泄漏、停用后召回和软删除后召回均为零。
- 单张图片最多一次描述调用和一次向量调用；视频最多六帧且不转写音频。

## 负责人和单人例外

| 角色 | 负责人 |
| --- | --- |
| Agent Owner | Jarson |
| Capability Owner | Jarson |
| Client Owner | Jarson |
| Security Reviewer | Jarson |
| Release Owner | Jarson |

目前所有角色由 Jarson 一人承担。该例外只适用于 `draft` 契约和本地测试；没有独立安全与发布复核前，禁止进入 sandbox、受限 Web 试点、真实付费校准或发布。

## 当前限制

```text
MEDIA_RETRIEVAL_ENABLED=false
MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED=false
MEDIA_RETRIEVAL_USER_DAILY_REQUEST_LIMIT=0
MEDIA_RETRIEVAL_GLOBAL_DAILY_BUDGET_FEN=0
```

尚未配置任何真实付费调用，也未创建 App 或 TestFlight 集成。
