import React from "react";
import { Breadcrumb, Button, Space, Tag, Typography } from "antd";
import { Link } from "react-router-dom";
import { ADMIN_PAGE_DEFINITIONS, resourceHref, visibleResourcePages } from "./admin-workspace.js";

const { Title, Text } = Typography;

export function WorkspacePageHeader({ page, onRefresh, refreshing = false, extra }) {
  const definition = typeof page === "string" ? ADMIN_PAGE_DEFINITIONS[page] : page;
  if (!definition) return null;
  return <header className="workspace-page-header">
    <div>
      <Breadcrumb items={[{ title: <Link to={resourceHref("overview")}>妙讯运营后台</Link> }, { title: definition.group }, { title: definition.label }]} />
      <div className="workspace-page-heading"><div><Title level={2}>{definition.label}</Title><Text type="secondary">{definition.description}</Text></div><Tag color="green">真实服务数据</Tag></div>
    </div>
    <Space>{extra}<Button onClick={onRefresh} loading={refreshing}>刷新数据</Button></Space>
  </header>;
}

export function ResourceSubnav({ current, user, links = [] }) {
  const resources = visibleResourcePages(user, current, links);
  if (resources.length < 2) return null;
  return <nav className="resource-subnav" aria-label="当前工作域资源导航">{resources.map((page) => <Link key={page.key} className={page.key === current ? "active" : ""} to={resourceHref(page.key)}>{page.label}<small>{page.description}</small></Link>)}</nav>;
}

export function WorkspaceSection({ title, description, actions, children, className = "" }) {
  return <section className={`workspace-section ${className}`.trim()}><div className="workspace-section-heading"><div><h3>{title}</h3>{description && <Text type="secondary">{description}</Text>}</div>{actions}</div>{children}</section>;
}

