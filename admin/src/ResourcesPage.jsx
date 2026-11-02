import React, { useEffect, useState } from "react";
import { Alert, Button, Col, Empty, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import { Link } from "react-router-dom";
import { ReloadOutlined } from "@ant-design/icons";
import { request } from "./platform.js";
import { loadOverviewData } from "./admin-view-contracts.js";
import { hasAdminPermission } from "./components/admin-workspace.js";
import UsersPage from "./UsersPage.jsx";
import { AgentReleasesPage, ProductsPage } from "./PublishingPages.jsx";
import { TasksPage, MonitoringPage, AuditPage, MediaRetrievalPage, SystemPage } from "./OperationsPages.jsx";
import { ResourceSubnav } from "./components/admin-workspace.jsx";

const { Title, Text } = Typography;
const statusLabel = { draft: "草稿", review: "审核中", published: "已发布", unpublished: "已下架", queued: "排队中", running: "运行中", failed: "失败", succeeded: "成功", cancelled: "已取消" };
const statusColor = { draft: "gold", review: "blue", published: "green", unpublished: "orange", queued: "gold", running: "blue", failed: "red", succeeded: "green", cancelled: "default" };
function StatusTag({ value }) { return <Tag color={statusColor[value] || "default"}>{statusLabel[value] || value || "未知"}</Tag>; }
function DashboardSection({ title, description, children, extra }) { return <section className="dashboard-section"><div className="dashboard-section-heading"><div><Title level={4}>{title}</Title><Text type="secondary">{description}</Text></div>{extra}</div>{children}</section>; }
function Overview({ user }) {
  const [state, setState] = useState({ overview: null, releases: [], tasks: [], errors: [], resourceErrors: {}, loading: true });
  const load = async () => {
    setState((old) => ({ ...old, loading: true, errors: [] }));
    setState(await loadOverviewData(user, request));
  };
  // Keep the initial refresh isolated from React cleanup; manual refreshes use the same loader.
  useEffect(() => { load(); }, []);
  const value = state.overview || {}; const metrics = value.metrics || {};
  return <>
    <div className="page-title"><div><Title level={2}>运营总览</Title><Text type="secondary">用真实运行数据查看平台状态、待处理发布和正在执行的任务。</Text></div><Space><Text type="secondary">窗口：30 天</Text><Button icon={<ReloadOutlined />} onClick={load} loading={state.loading}>刷新</Button></Space></div>
    {state.errors.map((error) => <Alert key={error} type="warning" showIcon message="部分运营数据读取失败" description={error} style={{ marginBottom: 12 }} />)}
    <Row gutter={[16, 16]} className="dashboard-metrics">{[["用户总数", metrics.usersTotal], ["活跃用户", metrics.activeUsers], ["Agent 运行", metrics.agentRuns], ["进行中任务", metrics.aiTasksActive], ["成功运行", metrics.succeeded], ["失败运行", metrics.failed], ["会话总数", metrics.threadsTotal], ["窗口消息", metrics.messages]].map(([label, number]) => <Col xs={12} sm={8} lg={6} key={label}><div className="dashboard-metric"><Statistic title={label} value={number == null ? "未知" : number} /></div></Col>)}</Row>
    <div className="dashboard-grid">
      {hasAdminPermission(user, "agents:manage") && <DashboardSection title="待处理的 Agent release" description="只有通过 identity、权限和 readiness 门禁后，才可进入产品发布。" extra={<Link to="/releases">进入发布中心</Link>}><Table size="small" rowKey="id" loading={state.loading} dataSource={state.releases} pagination={false} columns={[{ title: "Agent", render: (_, row) => <Space direction="vertical" size={0}><strong>{row.identity?.displayName || row.agentKey || "未知"}</strong><Text type="secondary">{row.agentKey || "--"} · v{row.version || "--"}</Text></Space> }, { title: "状态", dataIndex: "catalogStatus", render: (value) => <StatusTag value={value} /> }, { title: "就绪", render: (_, row) => row.readiness?.ready ? <Tag color="green">通过</Tag> : <Tag color="red">{row.readiness?.missing?.join("、") || "未通过"}</Tag> }, { title: "更新时间", dataIndex: "updatedAt" }]} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={state.resourceErrors?.releases ? "release 数据读取失败，请刷新重试" : state.loading ? "正在读取 release" : "暂无待审核 release"} /> }} /></DashboardSection>}
      {hasAdminPermission(user, "tasks:read") && <DashboardSection title="当前运行任务" description="来自 ai_tasks 与 agent_workspaces 的真实队列记录。" extra={<Link to="/tasks">进入任务中心</Link>}><Table size="small" rowKey="id" loading={state.loading} dataSource={state.tasks} pagination={false} columns={[{ title: "任务", render: (_, row) => <Link to="/tasks">{String(row.id || "").slice(0, 12) || "未知"}</Link> }, { title: "Agent", dataIndex: "agentId", render: (value) => value || "--" }, { title: "状态", dataIndex: "status", render: (value) => <StatusTag value={value} /> }, { title: "用户", dataIndex: "userId", render: (value) => value ? <Text code>{String(value).slice(0, 12)}…</Text> : "--" }, { title: "更新时间", dataIndex: "updatedAt" }]} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={state.resourceErrors?.tasks ? "任务数据读取失败，请刷新重试" : state.loading ? "正在读取任务" : "当前没有运行中任务"} /> }} /></DashboardSection>}
    </div>
    <DashboardSection title="每日运行与任务趋势" description={`数据源：${value.freshness?.source || "服务端"}；生成时间：${value.freshness?.generatedAt || "未知"}`}><Table rowKey="day" loading={state.loading} dataSource={value.daily || []} pagination={false} scroll={{ x: 720 }} columns={[{ title: "日期", dataIndex: "day" }, { title: "Agent 运行", dataIndex: "runs" }, { title: "成功", dataIndex: "succeeded" }, { title: "失败", dataIndex: "failed" }, { title: "任务", dataIndex: "tasks" }, { title: "成功率", render: (_, row) => row.runs ? `${Math.round(Number(row.succeeded || 0) / Number(row.runs) * 100)}%` : "未知" }]} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={state.resourceErrors?.overview ? "趋势数据读取失败，请刷新重试" : state.loading ? "正在读取趋势" : "暂无趋势记录"} /> }} /></DashboardSection>
  </>;
}

export function ResourcesPage({ resource, user }) {
  let page;
  if (resource === "overview") page = <Overview user={user} />;
  else if (resource === "users") page = <UsersPage />;
  else if (resource === "releases") page = <AgentReleasesPage user={user} />;
  else if (resource === "products") page = <ProductsPage user={user} />;
  else if (resource === "tasks") page = <TasksPage />;
  else if (resource === "monitoring") page = <MonitoringPage />;
  else if (resource === "audit") page = <AuditPage />;
  else if (resource === "media") page = <MediaRetrievalPage />;
  else page = <SystemPage />;
  return <><ResourceSubnav current={resource} user={user} />{page}</>;
}
