import React, { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { App as AntApp, Alert, Avatar, Button, Form, Input, Layout, Menu, Spin, Typography } from "antd";
import { AppstoreOutlined, AuditOutlined, DashboardOutlined, DatabaseOutlined, LogoutOutlined, MonitorOutlined, RobotOutlined, SettingOutlined, TeamOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { authProvider, readAuth } from "./platform.js";
import { ResourcesPage } from "./ResourcesPage.jsx";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const pages = [
  { key: "overview", label: "运营总览", icon: <DashboardOutlined />, permission: "users:read" },
  { key: "users", label: "用户与权限", icon: <TeamOutlined />, permission: "users:read" },
  { key: "releases", label: "Agent 发布", icon: <RobotOutlined />, permission: "agents:manage" },
  { key: "products", label: "产品目录", icon: <AppstoreOutlined />, permission: "products:read" },
  { key: "tasks", label: "任务管理", icon: <UnorderedListOutlined />, permission: "tasks:read" },
  { key: "monitoring", label: "运行监控", icon: <MonitorOutlined />, permission: "audit:read" },
  { key: "media", label: "媒体检索", icon: <DatabaseOutlined />, permission: "agents:manage" },
  { key: "audit", label: "审计记录", icon: <AuditOutlined />, permission: "audit:read" },
  { key: "system", label: "服务配置", icon: <SettingOutlined />, permission: "model:operate" },
];

function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="login-page"><div className="login-brand"><div className="brand-mark">妙</div><Title>妙讯运营后台</Title><Text>管理账号、Agent、产品与服务运行</Text></div><div className="login-panel"><Title level={3}>管理员登录</Title><Text type="secondary">使用已授权的管理员账号登录</Text>{error && <Alert type="error" showIcon message={error} className="login-error" />}<Form layout="vertical" onFinish={async (values) => { setBusy(true); setError(""); try { await authProvider.login(values); await onLogin(); } catch (e) { setError(e.message || "登录失败"); } finally { setBusy(false); } }}><Form.Item label="账号 / 手机号 / 邮箱" name="username" rules={[{ required: true, message: "请输入账号" }]}><Input autoComplete="username" size="large" /></Form.Item><Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}><Input.Password autoComplete="current-password" size="large" /></Form.Item><Button type="primary" htmlType="submit" block size="large" loading={busy}>登录</Button></Form></div></div>;
}

function Shell({ user, onLogout, sessionError }) {
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = user.adminPermissions || [];
  const allowed = pages.filter((page) => user.role === "admin" && (permissions.includes("*") || permissions.includes(page.permission)));
  const current = location.pathname.split("/")[1] || "overview";
  const selected = allowed.find((page) => page.key === current);
  return <Layout className="app-layout"><Sider breakpoint="lg" collapsedWidth="0" width={224} className="app-sider"><div className="sider-brand"><div className="brand-mark small">妙</div><div><strong>妙讯运营后台</strong><span>MARVELSCHAT ADMIN</span></div></div><Menu theme="dark" mode="inline" selectedKeys={[current]} items={allowed.map((page) => ({ key: page.key, icon: page.icon, label: <Link to={`/${page.key}`}>{page.label}</Link> }))} /></Sider><Layout><Header className="app-header"><div><Text type="secondary">妙讯运营后台</Text><span className="header-divider">/</span><Text>{selected?.label || "后台"}</Text></div><div className="header-user"><Avatar size="small" style={{ background: "#dbece8", color: "#17685e" }}>{String(user.displayName || "管").slice(0, 1)}</Avatar><span>{user.displayName || user.email || "管理员"}</span><Button type="text" icon={<LogoutOutlined />} onClick={async () => { await onLogout(); navigate("/login"); }}>退出</Button></div></Header><Content className="app-content">{sessionError && <Alert type="warning" showIcon closable message="管理员身份暂时无法向服务端刷新" description={sessionError.message || "请检查后台服务连接后重试。"} style={{ marginBottom: 18 }} />}{selected ? <ResourcesPage resource={current} user={user} /> : allowed.length ? <Navigate to={`/${allowed[0].key}`} replace /> : <Alert type="warning" showIcon message="当前账号没有后台访问权限" />}</Content></Layout></Layout>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null); const [sessionError, setSessionError] = useState(null);
  const sync = async () => { const result = await authProvider.check(); setUser(result.authenticated ? (result.user || readAuth().user) : null); setSessionError(result.error || null); setReady(true); };
  useEffect(() => { sync(); }, []);
  if (!ready) return <div className="loading-screen"><Spin size="large" tip="正在检查管理员身份" /></div>;
  return <AntApp><Routes><Route path="/login" element={user ? <Navigate to="/overview" replace /> : <Login onLogin={sync} />} /><Route path="/*" element={user ? <Shell user={user} sessionError={sessionError} onLogout={async () => { await authProvider.logout(); setUser(null); setSessionError(null); }} /> : <Navigate to="/login" replace />} /></Routes></AntApp>;
}
