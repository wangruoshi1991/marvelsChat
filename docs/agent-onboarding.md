# 代码 Agent 接入、配置与上架

更新：2026-11-02。本页描述当前源码；实际部署、App 分发与验收证据见 [CURRENT](handoffs/CURRENT.md)。后台沿用唯一 React / Refine / Ant Design 入口。

## 职责与创建对象

| 对象 | 负责入口 | 权威内容 |
| --- | --- | --- |
| 运行能力 | 开发人员，agents 与 backend executor | Agent key、运行版本、权限、真实工具与执行逻辑 |
| 供应商配置 | 服务端受限运行配置 | endpoint、API Key、模型、timeout；后台只读脱敏状态 |
| 发布草稿 | 后台选择已部署代码 | 名称、简介、图形/图片头像、颜色、shape、mark |
| release | 后台审核与发布 | 不可变运行版本、展示身份与权限合同 |
| 产品版本 | 后台结构化表单 | 产品 identity、平台、具体 release、完整 scopes |
| 使用授权 | 用户在 App 明确 consent | 精确 productVersionId、合同 hash、scopes；管理员仅可撤销 |

Agent key 是代码标识，例如 site-builder，不是供应商 API Key。填写一个 key 不会生成执行能力；不存在的运行代码由后端明确拒绝。按本轮用户选择完善代码 Agent，不增加在线写任意代码或录入供应商密钥的第二套平台。

## 完整操作流程

1. 开发并注册 Agent，声明唯一 key、语义化运行版本、权限与真实能力；需要工具时同步实现后端执行器。使用现有 Agent SOP 完成代码、授权、恢复、幂等和错误验证。
2. 按明确范围部署同一套 API 与 Worker。仅本地新增文件不会出现在正式服务 registry；agent:release 只生成验证证据，不会部署。
3. 后台“Agent 发布 → 已部署代码能力”读取真实 registry、配置缺项与能力边界。浏览页面不创建草稿，也不自动测试供应商。
4. 选择“配置发布身份”，填写名称、简介、头像、颜色与形状，显式创建 draft。key、运行版本、scopes 由服务端代码提供，只读；创建保留幂等和审计。
5. 核对后提交审核、发布 release。review 要修改时先退回草稿；已发布身份不可直接改写。只改名或头像时用“创建身份修订”，可以保持同一运行版本。
6. 在“产品发布”创建产品，填写名称、简介、产品版本、支持平台，选择具体已发布 release。服务端重验依赖、就绪和权限；提交审核后发布。
7. App 读取已发布产品；用户确认产品版本与权限后，后端事务写入精确 entitlement、user_agents 和会话。后台发布不代替用户授权。

配置就绪只证明环境门禁，不证明 PDF/OCR、生图、视频成片或协作 3D 已实现。capabilityNeeds 是必须明确说明的能力边界，仍须结合代码和对应验收判断。

## 修订、产品版本与已有用户

产品草稿可编辑，已发布版本不可编辑。已有产品用“新增版本”绑定新 release，不通过再造产品 key 或替换旧依赖绕过版本管理。后台按 productVersionId 查看依赖、历史、授权汇总并操作该版本。

新草稿不遮蔽正式产品，发布新版本不搬移既有 consent。仍可执行的旧版继续按用户原 entitlement 返回其身份，新用户读取最新已发布版。用户明确选择新版本后才在事务中替换该产品旧启用授权；运行版本或权限已失效则显式 unavailable。多个产品对同 Agent 产生冲突身份时明确拒绝，不静默选择。

## 图片头像与发布顺序

统一合同支持 agent-mark 图形和 agent-image 图片。图片模式保留 mark、shape、colors，增加 avatar 六字段：assetId、受控相对 URL、SHA-256、image/webp、width=512、height=512。图形模式不携带 avatar；图片失败显示明确错误，不回退图形。

后台上传 PNG/JPEG/WebP，最大 2 MB，单帧、64–4096 像素。后端真实解码并重编码为去元数据的 512×512 WebP，保存不可变文件和记录；拒绝 SVG、伪 MIME、外部 URL 与伪造资源。草稿仅认证管理员可预览，发布 release/产品引用后才可公开读取。文件缺失或摘要校验失败明确报错。

存储使用 MIAOXUN_AGENT_AVATAR_ROOT，缺省 backend/storage/agent-avatars，须作为持久化数据备份和随发布同步。执行迁移 049（头像资源与目录字段）、050（产品版本展示快照），不能只复制前端。后台认证预览使用 blob URL，Nginx 的 img-src 需允许 blob:，其余脚本限制保持。

Build54 不支持图片合同。AGENT_IMAGE_PUBLICATION_ENABLED 默认 false：上传与草稿编辑可用，图片身份审核/发布返回 AGENT_IMAGE_CLIENT_NOT_READY。先完成支持新合同的 App 验收、分发，再按明确范围开启服务端门禁；不提供旧头像兼容路径。

## 新增接口

| 操作 | API |
| --- | --- |
| 代码能力 | GET /api/admin/agent-registry |
| 创建/修订草稿 | POST /api/admin/agent-releases，agentKey、identity、可选 sourceReleaseId |
| 草稿身份编辑 | PATCH /api/admin/agent-releases/:id/identity |
| 退回草稿 | POST /api/admin/agent-releases/:id/withdraw |
| 上传图片 | POST /api/admin/agent-avatar-assets，原始图片请求体、Idempotency-Key |
| 草稿预览 | GET /api/admin/agent-avatar-assets/:id/:sha256.webp |
| 已发布图片 | GET /api/agent-avatar-assets/:id/:sha256.webp |
| 产品依赖选择 | GET /api/admin/products/published-agent-releases |
| 产品版本列表/新增 | GET/POST /api/admin/products/:id/versions |
| 产品草稿编辑 | PATCH /api/admin/products/:id/versions/:versionId |

产品 submit/publish/pause 必填 productVersionId。Agent 管理需要 agents:manage，产品读取/写入分别需要 products:read/write；图片上传允许 agents:manage 或 products:write。产品管理员有独立依赖读取入口，不扩大为 Agent 管理权限。错误保留 request ID，不返回供应商密钥。
