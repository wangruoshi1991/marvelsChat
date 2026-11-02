import React, { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { App as AntApp, Alert, Avatar, Button, Form, Input, Layout, Menu, Spin, Tag, Typography } from "antd";
import { AppstoreOutlined, AuditOutlined, DashboardOutlined, DatabaseOutlined, LogoutOutlined, MonitorOutlined, RobotOutlined, SettingOutlined, TeamOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { apiOrigin, authProvider, readAuth } from "./platform.js";
import { ResourcesPage } from "./ResourcesPage.jsx";
import { activeAdminPage, filterAdminNav } from "./components/admin-workspace.js";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const pages = [
  { key: "overview", label: "工作台", group: "workspace", icon: <DashboardOutlined />, permission: "users:read", description: "运营指标与待处理事项" },
  { key: "users", label: "用户与权限", group: "accounts", icon: <TeamOutlined />, permission: "users:read", description: "用户、角色、会话和授权" },
  { key: "releases", label: "Agent 发布", group: "publishing", icon: <RobotOutlined />, permission: "agents:manage", description: "注册、审核、发布和身份" },
  { key: "products", label: "产品目录", group: "publishing", icon: <AppstoreOutlined />, permission: "products:read", description: "产品版本与发布门禁" },
  { key: "media", label: "媒体检索", group: "publishing", icon: <DatabaseOutlined />, permission: "agents:manage", description: "索引、队列、预算和诊断" },
  { key: "tasks", label: "任务管理", group: "operations", icon: <UnorderedListOutlined />, permission: "tasks:read", description: "任务生命周期和人工处置" },
  { key: "monitoring", label: "运行监控", group: "operations", icon: <MonitorOutlined />, permission: "audit:read", description: "Agent、产品、用户运行聚合" },
  { key: "audit", label: "审计记录", group: "system", icon: <AuditOutlined />, permission: "audit:read", description: "管理员操作和运行事件" },
  { key: "system", label: "服务配置", group: "system", icon: <SettingOutlined />, permission: "model:operate", description: "模型、依赖和服务状态" },
];

function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="login-page"><div className="login-brand"><div className="brand-mark">妙</div><Title>妙讯运营后台</Title><Text>管理账号、Agent、产品与服务运行</Text></div><div className="login-panel"><Title level={3}>管理员登录</Title><Text type="secondary">使用已授权的管理员账号登录</Text>{error && <Alert type="error" showIcon message={error} className="login-error" />}<Form layout="vertical" onFinish={async (values) => { setBusy(true); setError(""); try { await authProvider.login(values); await onLogin(); } catch (e) { setError(e.message || "登录失败"); } finally { setBusy(false); } }}><Form.Item label="账号 / 手机号 / 邮箱" name="username" rules={[{ required: true, message: "请输入账号" }]}><Input autoComplete="username" size="large" /></Form.Item><Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}><Input.Password autoComplete="current-password" size="large" /></Form.Item><Button type="primary" htmlType="submit" block size="large" loading={busy}>登录</Button></Form></div></div>;
}

class ModuleErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Alert type="error" showIcon message="当前模块加载失败" description="请重试，或通过侧栏切换其他模块。" action={<Button onClick={() => this.setState({ failed: false })}>重试模块</Button>} />;
    return this.props.children;
  }
}

function Shell({ user, onLogout, sessionError }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navGroups = filterAdminNav(user);
  const allowedKeys = new Set(navGroups.flatMap((group) => group.children.map((page) => page.key)));
  const allowed = pages.filter((page) => allowedKeys.has(page.key));
  const current = activeAdminPage(location.pathname);
  const selected = allowed.find((page) => page.key === current);
  const menuItems = navGroups.map((group) => {
    const children = group.children.map((definition) => {
      const page = allowed.find((item) => item.key === definition.key);
      return ({
      key: page.key,
      icon: page.icon,
      label: <Link to={`/${page.key}`}>{page.label}</Link>,
      title: page.description,
      });
    });
    return children.length ? { key: group.key, label: group.label, type: "group", children } : null;
  }).filter(Boolean);
  return <Layout className="app-layout"><Sider breakpoint="lg" collapsedWidth="0" width={248} className="app-sider"><div className="sider-brand"><div className="brand-mark small">妙</div><div><strong>妙讯运营后台</strong><span>MARVELSCHAT ADMIN</span></div></div><div className="sider-caption">运营控制台</div><Menu theme="dark" mode="inline" selectedKeys={[current]} items={menuItems} /><div className="sider-footnote">仅显示当前账号已授权的资源</div></Sider><Layout><Header className="app-header"><div className="header-context"><Text type="secondary">妙讯运营后台</Text><span className="header-divider">/</span><Text>{selected?.label || "后台"}</Text>{selected?.description && <Text type="secondary" className="header-description">{selected.description}</Text>}</div><div className="header-user"><Tag bordered={false}>API · {new URL(apiOrigin()).host}</Tag><Avatar size="small" style={{ background: "#dbece8", color: "#17685e" }}>{String(user.displayName || "管").slice(0, 1)}</Avatar><span>{user.displayName || user.email || "管理员"}</span><Button type="text" icon={<LogoutOutlined />} onClick={async () => { await onLogout(); navigate("/login"); }}>退出</Button></div></Header><Content className="app-content">{sessionError && <Alert type="warning" showIcon closable message="管理员身份暂时无法向服务端刷新" description={sessionError.message || "请检查后台服务连接后重试。"} style={{ marginBottom: 18 }} />}{selected ? <ModuleErrorBoundary key={current}><ResourcesPage resource={current} user={user} /></ModuleErrorBoundary> : allowed.length ? <Navigate to={`/${allowed[0].key}`} replace /> : <Alert type="warning" showIcon message="当前账号没有后台访问权限" />}</Content></Layout></Layout>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null); const [sessionError, setSessionError] = useState(null);
  const sync = async () => { const result = await authProvider.check(); setUser(result.authenticated ? (result.user || readAuth().user) : null); setSessionError(result.error || null); setReady(true); };
  useEffect(() => { sync(); }, []);
  if (!ready) return <div className="loading-screen"><Spin size="large" tip="正在检查管理员身份" /></div>;
  return <AntApp><Routes><Route path="/login" element={user ? <Navigate to="/overview" replace /> : <Login onLogin={sync} />} /><Route path="/*" element={user ? <Shell user={user} sessionError={sessionError} onLogout={async () => { await authProvider.logout(); setUser(null); setSessionError(null); }} /> : <Navigate to="/login" replace />} /></Routes></AntApp>;
}
