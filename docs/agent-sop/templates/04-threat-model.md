# Agent Threat Model

- Agent key: `REQUIRED_AGENT_KEY`
- Version: `REQUIRED_VERSION`
- Reviewer: `REQUIRED_SECURITY_REVIEWER`

## 资产

列出账号、Token、Prompt、个人数据、文件、Artifact、Provider 配额、预算和管理权限。

## 信任边界

列出 Client、妙讯 API、worker、数据库、OSS、队列、Provider 和管理后台之间的边界。

## 威胁与控制

至少评估：未授权调用、跨用户读取、Prompt 注入、数据外泄、恶意文件、SSRF、重复扣费、任务重放、事件伪造/乱序、Checkpoint 篡改、AgentCard 字段泄漏、日志泄密、供应商失效、动态代码执行、公开发布和删除失败。

每项记录：威胁、前置条件、影响、现有控制、验证测试、剩余风险和责任人。

## 事故响应

写明 Provider kill switch、新任务 kill switch、访问撤销、密钥轮换、数据清理、用户通知和恢复审批。

## 结论

- 可接受风险: `REQUIRED_LIST_OR_NONE`
- 阻塞风险: `REQUIRED_LIST_OR_NONE`
- 审批: `approved | rejected`
