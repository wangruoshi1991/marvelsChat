# 妙讯运营后台完整性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将线上妙讯运营后台从“多个可访问页面”提升为可运营的模块化控制台：每个领域都有真实数据列表、筛选、详情工作区、状态流和受保护操作，且模块之间可追踪关联。

**Architecture:** 保留现有 Vite + React + Ant Design 壳和后端 `/api/admin/*` 合约。前端统一使用列表页 + 详情 Drawer/Inspector + 状态时间线；跨模块通过服务端 ID 和跳转参数关联，不在前端复制数据或制造占位数据。后端仅在前端确实缺少真实数据时补最小只读详情接口，写操作继续复用现有幂等与审计边界。

**Tech Stack:** React 19、React Router、Ant Design 5、Vite、Node test、Express/PostgreSQL。

**Spec:** `docs/handoffs/CURRENT.md` 当前后台章节、`AGENTS.md` 以及用户关于后台模块完整性的要求。

## Global Constraints

- 保留工作区已有修改；不 reset、clean、覆盖、删除、提交或推送。
- 不使用前端假数据、静默 fallback 或管理员替用户 consent；真实错误显式展示。
- 真实写操作必须经过现有服务端权限、幂等键和审计记录；前端只隐藏无权操作，不替代服务端校验。
- 列表页不把所有信息压缩成摘要卡；表格、详情工作区和状态时间线优先。
- 每个新增行为先写会失败的测试，再实现最小代码；完成后同步文档和交接。

### Task 1: 统一后台工作区与跨模块导航

**Files:**
- Modify: `admin/src/App.jsx`
- Modify: `admin/src/app.css`
- Create: `admin/src/components/admin-workspace.jsx`
- Test: `admin/test/admin-workspace.test.js`

- [ ] 写失败测试：模块页提供面包屑、二级资源导航、刷新状态、详情区域和可访问的窄屏布局；活动资源和 URL 保持同步。
- [ ] 实现统一 `AdminWorkspace`、`PageHeader`、`FilterBar` 和 `DetailDrawer` 基础组件，替换各页重复的标题/卡片壳。
- [ ] 让侧栏按“工作台/账户中心/发布中心/运营中心/系统中心”分组，模块之间可用明确的资源链接互跳。
- [ ] 运行 Admin 定向测试和构建。

### Task 2: 完善工作台与运行监控

**Files:**
- Modify: `admin/src/ResourcesPage.jsx`
- Modify: `admin/src/OperationsPages.jsx`
- Modify: `admin/src/platform.js`
- Test: `admin/test/admin-operations-pages.test.js`

- [ ] 写失败测试：工作台显示数据来源/生成时间、趋势表、失败任务列表和需要处理的发布项；监控支持窗口切换、Agent/产品/用户三个维度详情。
- [ ] 实现工作台真实汇总视图，未知成本/Token 保持“未知”，无数据明确显示空态。
- [ ] 为监控表行增加详情 Drawer 和跳转任务/产品/用户的真实链接；不引入模拟图表数据。
- [ ] 运行定向测试和构建。

### Task 3: 完善发布中心和产品目录

**Files:**
- Modify: `admin/src/PublishingPages.jsx`
- Modify: `admin/src/ResourcesPage.jsx`
- Test: `admin/test/publishing-workspace.test.js`

- [ ] 写失败测试：Agent release 详情展示 registry 版本、identity、声明权限、就绪检查和状态历史；产品详情展示依赖 release、平台、consent/entitlement 摘要和发布门禁。
- [ ] 实现 release/product 详情工作区和状态时间线；保持已发布 release 不可编辑、产品发布/暂停使用确认和幂等键。
- [ ] 为发布中心增加待处理筛选（缺 identity、未通过 readiness、review、paused），将失败原因显式呈现。
- [ ] 运行定向测试和构建。

### Task 4: 完善任务、账号、审计和媒体检索模块

**Files:**
- Modify: `admin/src/OperationsPages.jsx`
- Modify: `admin/src/UsersPage.jsx`
- Modify: `admin/src/platform.js`
- Test: `admin/test/admin-module-completeness.test.js`

- [ ] 写失败测试：任务详情仅展示状态元数据、阶段事件和失败代码，禁止用户原文和原始模型响应；账号详情展示产品 entitlement 与会话；审计详情展示脱敏 payload/requestId；媒体检索展示 runs/diagnostics 分页与控制审计。
- [ ] 实现四类详情 Drawer/Inspector，列表支持服务端分页、筛选和明确重试/取消/撤权操作。
- [ ] 对跨模块记录提供真实 `Link` 或可复制 ID，错误信息保留 request ID。
- [ ] 运行 Admin 全部测试和构建。

### Task 5: 后端只读详情合约、文档与整仓验证

**Files:**
- Inspect/modify only if required: `backend/src/routes/admin-routes.js`, `backend/src/admin-list-repository.js`, `backend/src/admin-operations-repository.js`
- Modify: `docs/admin.md`
- Modify: `docs/handoffs/CURRENT.md`
- Test: corresponding backend route/repository tests when APIs change

- [ ] 先核对现有 API 是否已经提供详情所需字段；只有缺失真实数据时才增加最小只读 endpoint，并补权限/测试。
- [ ] 更新后台文档，列出模块、数据来源、状态操作和不允许的管理员代授权边界。
- [ ] 运行 `npm --prefix admin test`、`npm --prefix admin run build`、必要的 backend 定向测试、`git diff --check` 和最终整仓检查。
- [ ] 在 CURRENT 中记录修改文件、验证结果、未闭环事项和后续真机/生产边界。
