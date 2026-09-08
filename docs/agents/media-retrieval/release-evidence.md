# 媒体检索 Agent 发布证据

- 状态: 本地实现与自动化验证完成，尚未具备发布条件
- 生命周期: `draft`
- 负责人: Jarson（个人负责）
- App/TestFlight 集成: 未开始
- 真实模型校准: 未开始
- 发布批准: 未提供

## 2026-08-06 本地证据

以下命令均在本地、mock-only、无真实媒体、无真实 Provider 调用和零成本的条件下通过：

```text
agents: npm run check
agents: npm test                         # 30 passed
agents: npm run agent:check -- --agent media-retrieval --format json
agents: npm run agent:test -- --agent media-retrieval --format json
agents: npm run agent:eval -- --agent media-retrieval --format json    # score: 100
agents: npm run agent:smoke -- --agent media-retrieval --environment local --format json

backend: npm run check
backend: npm test                        # 54 passed
backend: npm run smoke:media-retrieval

media-retrieval-web: npm test
media-retrieval-web: npm run check
media-retrieval-web: npm run build

admin: npm run check
admin: npm run build
```

本地 smoke 额外验证：默认关闭时，任务会在读取私有媒体、创建临时对象和发起 Provider 调用前被阻断。受限 Web 试点的 Bearer 会话仅保存在当前页面内存，刷新页面后必须重新登录。

## 尚未满足的发布门槛

1. `npm run test:media-retrieval-migration` 尚未执行。该命令需要一个本机 Docker daemon 和隔离的 pgvector 容器；当前机器未运行 Docker daemon。
2. 需要独立 Security Reviewer 和 Release Owner 的审阅，单人 `draft` 例外不能用于进入 sandbox、试点或发布。
3. 需要受控 sandbox 的数据库迁移、对象存储和 Worker 心跳验证。
4. 真实付费模型校准必须另行批准，记录账户引用、最大调用数、最大预算和停止条件；本次未进行。
5. App/TestFlight 集成须在 Web 试点和以上门槛完成后单独评审。

本文件不保存密钥、媒体、对象 URL、原始搜索语句或外部模型原始响应。
