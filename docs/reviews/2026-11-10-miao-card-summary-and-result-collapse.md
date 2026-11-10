# 2026-11-10 妙页 S1/S2 内容密度收敛

## 决策

依照《妙板块-状态效果与交互说明-20261102.pdf》的三态结构，保留 S0 摘要和快捷操作、S1 参与 Agent、S2 当前成果详情。此次只收敛内容密度，不改三态导航和任务数据来源：S1 的 Agent 目标单行显示，真实摘要最多两行；S2 保留当前成果摘要，长文字成果在原卡片内通过“阅读完整成果 / 收起完整成果”显式展开，不默认拉取全文。

用户批准的方案适用于妙页 workspace 卡。其他 `WorkspaceTextResult` 调用保持原先直接读取正文的行为。

## 实现入口

- `MiaoxunRN/src/features/workspaces/AgentWorkspaceCard.tsx`：S1 将目标限制为一行；完成但没有单独摘要时使用明确文案，不把目标重复充作结果。
- `MiaoxunRN/src/features/workspaces/WorkspaceTextResult.tsx`：新增可选 `collapsedByDefault` 展示模式；S2 默认只展示已有成果摘要，用户展开后才读取受保护的正文 API，收起时卸载正文。
- `MiaoxunRN/__tests__/workspaceTextResult.test.tsx`、`MiaoxunRN/__tests__/miaoTaskFeed.test.tsx`：覆盖显式展开/收起、轮询期间保留展开正文、前后台和账号切换清除正文、重新展开时重验授权、失败后单独重试，以及 S1 行数限制。

## 验证

- `npm test -- --runInBand miaoTaskFeed miaoCardState workspaceParticipantModal workspaceTextResult miaoCardGestureContinuity`：5 suites / 84 tests 通过。
- `npm run typecheck`：通过。
- ESLint 与 Prettier 目标文件检查、`git diff --check`：通过。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`：退出 0。RN 97 suites / 1221 tests 全通过；Agents 55、Admin 49、Avatar Web 29、媒体检索 Web 4 全通过；后台、Avatar Web、媒体检索 Web 构建通过。后端有 PostgreSQL 环境门控跳过项，不作为隔离 PG 集成通过证据。
- 当前源码以隔离 Bundle `com.wangruoshi.miaoxun.collaborationQA20261110`、loopback API `127.0.0.1:4395` 编译并安装到 iPhone 17 / iOS 26.5 Simulator，恢复了 QA1010 的既有本地会话。妙页实际呈现服务器真实空状态，没有真实 workspace 卡片，因此本轮设备上未能观察 S1/S2 的视觉布局、连续滑动或动画；此前 JS/组件测试不替代该验收。

## 当前验收限制

- 隔离 API 的 `/api/agents` 只列出已发布的妙讯管家与站点 Agent；无法在此环境验收多个专业 Agent 并行或多专业贡献卡。目录注册与产品发布、用户授权和真实执行器不能互相替代。
- QA1010 的隔离库已有站点 Agent 1.1.0 产品 entitlement，模拟器目录也能读到该 Agent。当前没有可用于妙页展示的 QA workspace。本轮没有通过写入数据库、伪造摘要或启用供应商调用造出卡片。
- 站点 Agent 的头像资源元数据曾可读，但隔离文件存储返回 `AGENT_AVATAR_STORAGE_MISSING`（HTTP 503）。这是隔离环境缺图，不是 RN 头像容器解码失败的证据。合成头像上传需要从隔离 Admin 的真实草稿上传、发布及产品身份流程完成；本轮没有用生产头像、直接写库或把默认文件落到未核实隔离性的共享目录。
- 资产上传与发布完成后，还需使用一条已授权、真实执行的隔离 workspace，在 Simulator 检查头像、S0/S1/S2、卡片高度和滚动连续性。原生连续手指滑动、回弹体感仍需实体设备验收。

本轮未调用模型供应商、未更改生产数据/头像、未部署、未上传 TestFlight。实现及记录已提交为 `dcb3ae4` 并推送至 `codex/ui-agent-candidate-20261105`；未合并主分支。
