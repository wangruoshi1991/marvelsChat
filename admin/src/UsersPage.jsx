import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber,
  Modal, Row, Select, Space, Table, Tag, Typography, message,
} from "antd";
import {
  KeyOutlined, LockOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
  StopOutlined, UserOutlined,
} from "@ant-design/icons";
import { readAuth, request } from "./platform.js";

const { Title, Text } = Typography;
const LANGUAGES = [
  ["zh", "中文"], ["en", "英语"], ["ja", "日语"], ["ko", "韩语"], ["fr", "法语"],
  ["de", "德语"], ["es", "西班牙语"], ["pt", "葡萄牙语"], ["ru", "俄语"], ["ar", "阿拉伯语"],
];
const permissionOptions = [
  ["*", "全部权限"], ["users:read", "查看用户"], ["users:write", "管理用户"],
  ["agents:manage", "管理 Agent"], ["products:read", "查看产品"], ["products:write", "管理产品"],
  ["tasks:read", "查看任务"], ["tasks:write", "管理任务"], ["audit:read", "查看审计"],
  ["model:operate", "操作模型"],
];
const statusLabel = { active: "启用", disabled: "停用" };
const roleLabel = { admin: "管理员", user: "普通用户" };
const idempotency = (action, id) => `admin-user-${action}-${id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function StatusTag({ value }) { return <Tag color={value === "active" ? "green" : "red"}>{statusLabel[value] || value || "未知"}</Tag>; }
function hasPermission(permission) {
  const auth = readAuth();
  const permissions = auth.user?.adminPermissions || [];
  return auth.user?.role === "admin" && (permissions.includes("*") || permissions.includes(permission));
}
function confirmAction(title, content, action) {
  return new Promise((resolve, reject) => {
    Modal.confirm({ title, content, okText: "确认", cancelText: "取消", okButtonProps: { danger: true },
      onOk: async () => { try { await action(); resolve(true); } catch (error) { reject(error); } },
      onCancel: () => resolve(false) });
  });
}
function formatDate(value) { return value ? new Date(value).toLocaleString("zh-CN") : "--"; }

function CreateUserModal({ open, onClose, onCreated, superAdmin }) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const submit = async (values) => {
    try {
      const confirmed = await confirmAction("确认创建账号？", `将为 ${values.email} 写入真实用户表并记录审计。`, async () => {
        setBusy(true);
        await request("/api/admin/users", { method: "POST", body: JSON.stringify(values) });
      });
      if (!confirmed) return;
      message.success("账号已创建"); form.resetFields(); onClose(); onCreated();
    } catch (error) { message.error(error.message || "创建账号失败"); }
    finally { setBusy(false); }
  };
  return <Modal open={open} title="创建账号" onCancel={onClose} footer={null} destroyOnClose>
    <Form form={form} layout="vertical" onFinish={submit} initialValues={{ role: "user", status: "active" }}>
      <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}><Input autoComplete="off" /></Form.Item>
      <Form.Item name="displayName" label="显示名" rules={[{ required: true, message: "请输入显示名" }]}><Input /></Form.Item>
      <Form.Item name="password" label="临时密码" rules={[{ required: true, min: 8, message: "至少 8 位密码" }]}><Input.Password autoComplete="new-password" /></Form.Item>
      <Row gutter={12}><Col span={12}><Form.Item name="role" label="角色"><Select options={Object.entries(roleLabel).filter(([value]) => value !== "admin" || superAdmin).map(([value, label]) => ({ value, label }))} /></Form.Item></Col><Col span={12}><Form.Item name="status" label="状态"><Select options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))} /></Form.Item></Col></Row>
      <Button type="primary" htmlType="submit" loading={busy} block>创建账号</Button>
    </Form>
  </Modal>;
}

function UserDetail({ detail, canWrite, canManageAgents, superAdmin, actorId, onReload, onClose }) {
  const [profileForm] = Form.useForm();
  const [permissionForm] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const user = detail?.user || {};
  const canMutateTarget = canWrite && (user.role !== "admin" || superAdmin) && user.id !== actorId;
  const profile = detail?.profile || {};
  const run = async (operation, success) => { try { setBusy(true); await operation(); message.success(success); await onReload(); } catch (error) { message.error(error.message || "操作失败"); } finally { setBusy(false); } };
  const updateStatus = () => confirmAction("确认变更账号状态？", "停用账号会立即撤销其登录会话。", () => run(() => request(`/api/admin/users/${encodeURIComponent(user.id)}/status`, { method: "PATCH", headers: { "Idempotency-Key": idempotency("status", user.id) }, body: JSON.stringify({ status: user.status === "active" ? "disabled" : "active" }) }), "状态已更新"));
  const updateRole = () => confirmAction("确认变更账号角色？", "角色变化会影响后台权限，请确认目标账号和权限范围。", () => run(() => request(`/api/admin/users/${encodeURIComponent(user.id)}/role`, { method: "PATCH", headers: { "Idempotency-Key": idempotency("role", user.id) }, body: JSON.stringify({ role: user.role === "admin" ? "user" : "admin" }) }), "角色已更新"));
  const revokeSessions = () => confirmAction("确认撤销全部会话？", "该账号将在所有设备上退出登录。", () => run(() => request(`/api/admin/users/${encodeURIComponent(user.id)}/revoke-sessions`, { method: "POST", headers: { "Idempotency-Key": idempotency("sessions", user.id) } }), "会话已撤销"));
  const resetPassword = () => { let value = ""; Modal.confirm({ title: "重置密码", content: <Input.Password placeholder="新的临时密码（至少 8 位）" onChange={(event) => { value = event.target.value; }} />, okText: "确认重置", cancelText: "取消", okButtonProps: { danger: true }, onOk: () => { if (value.length < 8) { message.error("临时密码至少需要 8 位"); return Promise.reject(new Error("invalid")); } return run(() => request(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, { method: "POST", headers: { "Idempotency-Key": idempotency("password", user.id) }, body: JSON.stringify({ password: value }) }), "密码已重置"); } }); };
  const saveProfile = async (values) => run(() => request(`/api/admin/users/${encodeURIComponent(user.id)}/profile`, { method: "PATCH", body: JSON.stringify({ ...values, experienceYears: values.experienceYears ?? null, languages: values.languages || [] }) }), "资料已保存");
  const savePermissions = async (values) => run(() => request(`/api/admin/users/${encodeURIComponent(user.id)}/permissions`, { method: "PATCH", body: JSON.stringify({ permissions: values.permissions || [] }) }), "权限已保存");
  const revokeAgent = (agent) => confirmAction("确认撤销 Agent 授权？", `将撤销“${agent.name || agent.id}”的授权，用户需要重新确认产品权限。`, () => run(() => request(`/api/admin/users/${encodeURIComponent(user.id)}/agents/${encodeURIComponent(agent.id)}`, { method: "PATCH", headers: { "Idempotency-Key": idempotency("agent-revoke", `${user.id}-${agent.id}`) }, body: JSON.stringify({ enabled: false, grantedScopes: [] }) }), "Agent 授权已撤销"));
  return <Drawer open={Boolean(detail)} onClose={onClose} width={680} title={<Space><UserOutlined />{user.displayName || "账号详情"}</Space>} extra={<Button icon={<ReloadOutlined />} onClick={onReload}>刷新</Button>}>
    {busy && <Alert type="info" showIcon message="正在保存，请稍候" style={{ marginBottom: 16 }} />}
    <Descriptions bordered size="small" column={1} items={[{ label: "邮箱", children: user.email || "--" }, { label: "AI ID", children: user.aiId || "--" }, { label: "角色", children: roleLabel[user.role] || user.role }, { label: "状态", children: <StatusTag value={user.status} /> }, { label: "会话", children: `${detail?.sessions?.active ?? 0} 活跃 / ${detail?.sessions?.total ?? 0} 总计 / ${detail?.sessions?.revoked ?? 0} 已撤销` }, { label: "创建时间", children: formatDate(user.createdAt) }]} />
    {canMutateTarget && <Card title="账号操作" size="small" style={{ marginTop: 16 }}><Space wrap><Button icon={<StopOutlined />} onClick={updateStatus}>{user.status === "active" ? "停用账号" : "启用账号"}</Button>{superAdmin && <Button onClick={updateRole}>设为{user.role === "admin" ? "普通用户" : "管理员"}</Button>}<Button onClick={revokeSessions}>撤销全部会话</Button><Button icon={<KeyOutlined />} onClick={resetPassword}>重置密码</Button></Space></Card>}
    <Card title="账号资料" size="small" style={{ marginTop: 16 }}><Form form={profileForm} layout="vertical" onFinish={saveProfile} initialValues={{ nickname: profile.nickname || user.displayName, bio: profile.bio || "", community: profile.community || "", activityArea: profile.activityArea || "", headline: profile.headline || "", publicLocation: profile.publicLocation || "", experienceYears: profile.experienceYears ?? undefined, languages: profile.languages || [] }}><Form.Item name="nickname" label="昵称" rules={[{ required: true }]}><Input disabled={!canWrite} /></Form.Item><Form.Item name="bio" label="简介"><Input.TextArea rows={3} disabled={!canWrite} /></Form.Item><Row gutter={12}><Col span={12}><Form.Item name="community" label="社区"><Input disabled={!canWrite} /></Form.Item></Col><Col span={12}><Form.Item name="activityArea" label="活动区域"><Input disabled={!canWrite} /></Form.Item></Col><Col span={12}><Form.Item name="headline" label="身份标题"><Input disabled={!canWrite} /></Form.Item></Col><Col span={12}><Form.Item name="publicLocation" label="公开城市"><Input disabled={!canWrite} /></Form.Item></Col><Col span={12}><Form.Item name="experienceYears" label="从业年限"><InputNumber min={0} max={80} style={{ width: "100%" }} disabled={!canWrite} /></Form.Item></Col><Col span={12}><Form.Item name="languages" label="语言"><Select mode="multiple" options={LANGUAGES.map(([value, label]) => ({ value, label }))} disabled={!canWrite} /></Form.Item></Col></Row>{canWrite && <Button type="primary" htmlType="submit">保存资料</Button>}</Form></Card>
    {user.role === "admin" && superAdmin && user.id !== actorId && <Card title="后台权限" size="small" style={{ marginTop: 16 }}><Form form={permissionForm} onFinish={savePermissions} initialValues={{ permissions: user.adminPermissions || [] }}><Form.Item name="permissions"><Select mode="multiple" options={permissionOptions.map(([value, label]) => ({ value, label }))} /></Form.Item><Button type="primary" htmlType="submit">保存权限</Button></Form></Card>}
    {canManageAgents && <Card title="Agent 授权（仅撤销）" size="small" style={{ marginTop: 16 }}><Table size="small" rowKey={(row) => row.id} pagination={false} dataSource={detail?.agents || []} columns={[{ title: "Agent", render: (_, row) => row.name || row.id }, { title: "状态", render: (_, row) => row.enabled ? <Tag color="green">已启用</Tag> : <Tag>未启用</Tag> }, { title: "权限", render: (_, row) => (row.grantedScopes || []).join(", ") || "无" }, { title: "操作", render: (_, row) => row.enabled ? <Button danger size="small" onClick={() => revokeAgent(row)}>撤销</Button> : null }]} locale={{ emptyText: "暂无 Agent 授权记录" }} /></Card>}
    <Card title="最近会话" size="small" style={{ marginTop: 16 }}><Table size="small" rowKey={(row) => row.id} pagination={false} dataSource={detail?.threads || []} columns={[{ title: "标题", dataIndex: "title", render: (value) => value || "未命名会话" }, { title: "Agent", dataIndex: "agentId", render: (value) => value || "普通会话" }, { title: "更新时间", render: (_, row) => formatDate(row.updatedAt || row.lastMessageAt) }]} locale={{ emptyText: "暂无会话记录" }} /></Card>
  </Drawer>;
}

export function UsersPage() {
  const canRead = hasPermission("users:read");
  const canWrite = hasPermission("users:write");
  const canManageAgents = hasPermission("agents:manage");
  const superAdmin = hasPermission("*");
  const actorId = readAuth().user?.id;
  const [filters, setFilters] = useState({ query: "", status: "", role: "" });
  const [draft, setDraft] = useState(filters);
  const [page, setPage] = useState(1); const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null); const [detail, setDetail] = useState(null); const [detailLoading, setDetailLoading] = useState(false); const [createOpen, setCreateOpen] = useState(false);
  const load = useCallback(async (nextPage = page) => { setLoading(true); setError(""); try { const params = new URLSearchParams({ page: String(nextPage), pageSize: "20" }); Object.entries(filters).forEach(([key, value]) => { if (String(value || "").trim()) params.set(key, String(value).trim()); }); const value = await request(`/api/admin/users?${params}`); setData({ items: value?.items || [], total: Number(value?.total || 0) }); setPage(nextPage); } catch (e) { setError(e.message || "读取用户失败"); } finally { setLoading(false); } }, [filters, page]);
  const loadDetail = useCallback(async (id = selectedId) => { if (!id) return; setDetailLoading(true); try { setDetail(await request(`/api/admin/users/${encodeURIComponent(id)}`)); } catch (e) { message.error(e.message || "读取用户详情失败"); } finally { setDetailLoading(false); } }, [selectedId]);
  useEffect(() => { if (canRead) load(1); }, [canRead, filters]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);
  const columns = useMemo(() => [{ title: "账号", render: (_, row) => <Space><UserOutlined /><span><strong>{row.displayName || "--"}</strong><br /><Text type="secondary">{row.email || row.phoneNumber || row.aiId || "--"}</Text></span></Space> }, { title: "角色", dataIndex: "role", render: (value) => roleLabel[value] || value }, { title: "状态", dataIndex: "status", render: (value) => <StatusTag value={value} /> }, { title: "会话", dataIndex: "activeSessionCount" }, { title: "消息", dataIndex: "messageCount" }, { title: "Agent", dataIndex: "agentCount" }, { title: "最近登录", dataIndex: "lastLoginAt", render: formatDate }], []);
  if (!canRead) return <Alert type="warning" showIcon message="当前账号没有 users:read 权限" />;
  return <div className="page-surface"><Space direction="vertical" size="large" style={{ width: "100%" }}><Space style={{ width: "100%", justifyContent: "space-between" }} wrap><div><Title level={2}>用户与权限</Title><Text type="secondary">管理真实账号、资料、会话和授权记录。</Text></div><Space>{canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建账号</Button>}<Button icon={<ReloadOutlined />} onClick={() => load(page)}>刷新</Button></Space></Space><Card><Space wrap><Input allowClear prefix={<SearchOutlined />} placeholder="昵称、邮箱、手机号或 AI ID" value={draft.query} onChange={(e) => setDraft({ ...draft, query: e.target.value })} onPressEnter={() => { setFilters(draft); setPage(1); }} /><Select allowClear placeholder="状态" value={draft.status || undefined} onChange={(value) => setDraft({ ...draft, status: value || "" })} options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))} /><Select allowClear placeholder="角色" value={draft.role || undefined} onChange={(value) => setDraft({ ...draft, role: value || "" })} options={Object.entries(roleLabel).map(([value, label]) => ({ value, label }))} /><Button onClick={() => { setFilters(draft); setPage(1); }}>筛选</Button><Button onClick={() => { const empty = { query: "", status: "", role: "" }; setDraft(empty); setFilters(empty); setPage(1); }}>清空</Button></Space></Card>{error && <Alert type="error" showIcon message={error} action={<Button onClick={() => load(page)}>重试</Button>} />}<Table rowKey="id" loading={loading} columns={columns} dataSource={data.items} onRow={(row) => ({ onClick: () => setSelectedId(row.id), style: { cursor: "pointer" } })} pagination={{ current: page, pageSize: 20, total: data.total, showSizeChanger: false, showTotal: (total) => `共 ${total} 条`, onChange: (next) => load(next) }} locale={{ emptyText: "暂无真实用户数据" }} /></Space><CreateUserModal open={createOpen} superAdmin={superAdmin} onClose={() => setCreateOpen(false)} onCreated={() => load(1)} /><UserDetail detail={detailLoading ? null : detail} canWrite={canWrite && (detail?.user?.role !== "admin" || superAdmin)} canManageAgents={canManageAgents} superAdmin={superAdmin} actorId={actorId} onReload={() => Promise.all([load(page), loadDetail(selectedId)])} onClose={() => { setSelectedId(null); setDetail(null); }} /></div>;
}

export default UsersPage;
