import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber,
  Modal, Row, Select, Space, Table, Tag, Typography, message,
} from "antd";
import {
  KeyOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
  StopOutlined, UserOutlined,
} from "@ant-design/icons";
import { readAuth, request } from "./platform.js";
import { createUserDetailLoader } from "./user-detail-loader.js";
import { detailColumn } from "./components/detail-column.jsx";
import { buildAdminProfileUpdate, profileLanguageOptions } from "../admin-core.js";

const { Title, Text } = Typography;
const permissionOptions = [
  ["*", "全部权限"], ["users:read", "查看用户"], ["users:write", "管理用户"],
  ["agents:manage", "管理 Agent"], ["products:read", "查看产品"], ["products:write", "管理产品"],
  ["tasks:read", "查看任务"], ["tasks:write", "管理任务"], ["audit:read", "查看审计"],
  ["model:operate", "操作模型"],
];
const statusLabel = { active: "启用", disabled: "停用" };
const roleLabel = { admin: "管理员", user: "普通用户" };
const temporaryPasswordError = "临时密码须为 8 至 128 个字符，并包含英文大小写字母";
const hasValidTemporaryPassword = password =>
  typeof password === "string" &&
  password.length >= 8 && password.length <= 128 &&
  /[A-Z]/.test(password) && /[a-z]/.test(password);
const requestKey = () => globalThis.crypto?.randomUUID?.() || `admin-user-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function StatusTag({ value }) { return <Tag color={value === "active" ? "green" : "red"}>{statusLabel[value] || value || "未知"}</Tag>; }
function hasPermission(permission) {
  const auth = readAuth();
  const permissions = auth.user?.adminPermissions || [];
  return auth.user?.role === "admin" && (permissions.includes("*") || permissions.includes(permission));
}
function AccountConfirmation({ action, onCancel, onSaved }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(requestKey);
  const submit = async () => {
    if (busy) return;
    if (action.password && !hasValidTemporaryPassword(password)) {
      setError(temporaryPasswordError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action.submit(password, key);
    } catch (failure) {
      setError(failure.message || "操作失败");
      setBusy(false);
      return;
    }
    onSaved(action.success);
  };
  return (
    <Modal open title={action.title} okText={action.password ? "确认重置" : "确认"}
      cancelText="取消" okButtonProps={{ danger: true, "aria-label": action.password ? "确认重置" : "确认" }}
      cancelButtonProps={{ disabled: busy }}
      confirmLoading={busy} keyboard={!busy} maskClosable={false} closable={!busy}
      onOk={submit} onCancel={() => { if (!busy) onCancel(); }}>
      {action.description}
      {action.password && <Input.Password aria-label="新的临时密码" autoComplete="new-password" disabled={busy}
        placeholder="8 至 128 个字符，含英文大小写字母" value={password} onChange={event => {
          setPassword(event.target.value);
          setKey(requestKey());
          setError("");
        }} />}
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
  );
}
function formatDate(value) { return value ? new Date(value).toLocaleString("zh-CN") : "--"; }

function CreateUserModal({ open, onClose, onCreated, superAdmin }) {
  const [form] = Form.useForm();
  const [action, setAction] = useState(null);
  const submit = values => setAction({
    title: "确认创建账号？",
    description: `将为 ${values.email} 写入真实用户表并记录审计。`,
    success: "账号已创建",
    submit: () => request("/api/admin/users", { method: "POST", body: JSON.stringify(values) }),
  });
  const created = success => {
    setAction(null);
    message.success(success);
    form.resetFields();
    onClose();
    onCreated();
  };
  return <Modal open={open} title="创建账号" onCancel={onClose} footer={null} destroyOnHidden>
    {action && <AccountConfirmation action={action} onCancel={() => setAction(null)} onSaved={created} />}
    <Form form={form} layout="vertical" onFinish={submit} initialValues={{ role: "user", status: "active" }}>
      <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}><Input autoComplete="off" /></Form.Item>
      <Form.Item name="displayName" label="显示名" rules={[{ required: true, message: "请输入显示名" }]}><Input /></Form.Item>
      <Form.Item name="password" label="临时密码" rules={[{ validator: (_, value) => hasValidTemporaryPassword(value) ? Promise.resolve() : Promise.reject(new Error(temporaryPasswordError)) }]}><Input.Password autoComplete="new-password" placeholder="8 至 128 个字符，含英文大小写字母" /></Form.Item>
      <Row gutter={12}><Col span={12}><Form.Item name="role" label="角色"><Select options={Object.entries(roleLabel).filter(([value]) => value !== "admin" || superAdmin).map(([value, label]) => ({ value, label }))} /></Form.Item></Col><Col span={12}><Form.Item name="status" label="状态"><Select options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))} /></Form.Item></Col></Row>
      <Button type="primary" htmlType="submit" block>创建账号</Button>
    </Form>
  </Modal>;
}

function UserDetail({ loading, error, detail, canWrite, canManageAgents, superAdmin, actorId, onReload }) {
  const [profileForm] = Form.useForm();
  const [permissionForm] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const user = detail?.user || {};
  const canMutateTarget = canWrite && (user.role !== "admin" || superAdmin) && user.id !== actorId;
  const profile = detail?.profile || {};
  const [action, setAction] = useState(null);
  const [saveError, setSaveError] = useState("");
  const userPath = `/api/admin/users/${encodeURIComponent(user.id)}`;
  const confirmChange = (title, description, success, suffix, method, body, password = false) => {
    setAction({ title, description, success, password, submit: (entry, key) =>
      request(`${userPath}/${suffix}`, {
        method, headers: { "Idempotency-Key": key },
        ...(password || body ? { body: JSON.stringify(password ? { password: entry } : body) } : {}),
      })
    });
  };
  const afterConfirmation = success => {
    setAction(null);
    message.success(success);
    onReload();
  };
  const updateStatus = () => confirmChange("确认变更账号状态？", "停用账号会立即撤销其登录会话。",
    "状态已更新", "status", "PATCH", { status: user.status === "active" ? "disabled" : "active" });
  const updateRole = () => confirmChange("确认变更账号角色？", "角色变化会影响后台权限，请确认目标账号和权限范围。",
    "角色已更新", "role", "PATCH", { role: user.role === "admin" ? "user" : "admin" });
  const revokeSessions = () => confirmChange("确认撤销全部会话？", "该账号将在所有设备上退出登录。",
    "会话已撤销", "revoke-sessions", "POST");
  const resetPassword = () => confirmChange("重置密码", null, "密码已重置", "reset-password", "POST", null, true);
  const revokeAgent = agent => confirmChange("确认撤销 Agent 授权？", `将撤销“${agent.name || agent.id}”的授权，用户需要重新确认产品权限。`,
    "Agent 授权已撤销", `agents/${encodeURIComponent(agent.id)}`, "PATCH", { enabled: false, grantedScopes: [] });
  const saveForm = async (suffix, body, success) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setSaveError("");
    try {
      await request(`${userPath}/${suffix}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (failure) {
      setSaveError(failure.message || "保存失败");
      return;
    } finally {
      saving.current = false;
      setBusy(false);
    }
    message.success(success);
    onReload();
  };
  const saveProfile = (values) => {
    if (saving.current) return;
    try {
      void saveForm("profile", buildAdminProfileUpdate(values), "资料已保存");
    } catch (failure) {
      setSaveError(failure.message);
    }
  };
  const savePermissions = values => saveForm("permissions", { permissions: values.permissions || [] }, "权限已保存");
  return <>
    {action && <AccountConfirmation action={action} onCancel={() => setAction(null)} onSaved={afterConfirmation} />}
    {saveError && <Alert type="error" showIcon message={saveError} />}
    {loading && <Alert type="info" showIcon message="正在读取所选账号详情" />}
    {error && <Alert type="error" showIcon message="用户详情读取失败" description={<>{error.message}{error.requestId && <div>请求 ID：{error.requestId}</div>}</>} action={<Button onClick={onReload}>重试</Button>} />}
    {detail && <>
    {busy && <Alert type="info" showIcon message="正在保存，请稍候" style={{ marginBottom: 16 }} />}
    <Descriptions bordered size="small" column={1} items={[{ label: "邮箱", children: user.email || "--" }, { label: "AI ID", children: user.aiId || "--" }, { label: "角色", children: roleLabel[user.role] || user.role }, { label: "状态", children: <StatusTag value={user.status} /> }, { label: "会话", children: `${detail?.sessions?.active ?? 0} 活跃 / ${detail?.sessions?.total ?? 0} 总计 / ${detail?.sessions?.revoked ?? 0} 已撤销` }, { label: "创建时间", children: formatDate(user.createdAt) }]} />
    {canMutateTarget && <Card title="账号操作" size="small" style={{ marginTop: 16 }}><Space wrap><Button icon={<StopOutlined />} onClick={updateStatus}>{user.status === "active" ? "停用账号" : "启用账号"}</Button>{superAdmin && <Button onClick={updateRole}>设为{user.role === "admin" ? "普通用户" : "管理员"}</Button>}<Button onClick={revokeSessions}>撤销全部会话</Button><Button icon={<KeyOutlined />} onClick={resetPassword}>重置密码</Button></Space></Card>}
    <Card title="账号资料" size="small" style={{ marginTop: 16 }}>
      <Form
        form={profileForm}
        layout="vertical"
        onFinish={saveProfile}
        disabled={!canWrite || busy}
        aria-busy={busy}
        initialValues={{
          nickname: profile.nickname || user.displayName,
          bio: profile.bio || "",
          community: profile.community || "",
          activityArea: profile.activityArea || "",
          headline: profile.headline || "",
          publicLocation: profile.publicLocation || "",
          experienceYears: profile.experienceYears ?? undefined,
          languages: profile.languages || [],
        }}
      >
        <Form.Item name="nickname" label="昵称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="bio" label="简介"><Input.TextArea rows={3} /></Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="community" label="社区"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="activityArea" label="活动区域"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="headline" label="身份标题"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="publicLocation" label="公开城市" extra="公开资料，不更改 GPS 位置。"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="experienceYears" label="从业年限"><InputNumber min={0} max={80} style={{ width: "100%" }} /></Form.Item></Col>
          <Col span={12}>
            <Form.Item name="languages" label="语言">
              <Select mode="multiple" allowClear options={profileLanguageOptions.map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
        </Row>
        {canWrite && <Button type="primary" htmlType="submit" loading={busy}>保存资料</Button>}
      </Form>
    </Card>
    {user.role === "admin" && superAdmin && user.id !== actorId && <Card title="后台权限" size="small" style={{ marginTop: 16 }}><Form form={permissionForm} onFinish={savePermissions} initialValues={{ permissions: user.adminPermissions || [] }}><Form.Item name="permissions"><Select mode="multiple" options={permissionOptions.map(([value, label]) => ({ value, label }))} /></Form.Item><Button type="primary" htmlType="submit">保存权限</Button></Form></Card>}
    {canManageAgents && <Card title="Agent 授权（仅撤销）" size="small" style={{ marginTop: 16 }}><Table size="small" scroll={{ x: 620 }} rowKey={(row) => row.id} pagination={false} dataSource={detail?.agents || []} columns={[{ title: "Agent", render: (_, row) => row.name || row.id }, { title: "状态", render: (_, row) => row.enabled ? <Tag color="green">已启用</Tag> : <Tag>未启用</Tag> }, { title: "权限", render: (_, row) => (row.grantedScopes || []).join(", ") || "无" }, { title: "操作", render: (_, row) => row.enabled ? <Button danger size="small" onClick={() => revokeAgent(row)}>撤销</Button> : null }]} locale={{ emptyText: "暂无 Agent 授权记录" }} /></Card>}
    <Card title="最近会话元数据（最多 100 条）" size="small" style={{ marginTop: 16 }}><Table size="small" scroll={{ x: 620 }} rowKey={(row) => row.id} pagination={false} dataSource={detail?.threads || []} columns={[{ title: "会话 ID", dataIndex: "id", render: (value) => <Text code>{value}</Text> }, { title: "类型", dataIndex: "kind" }, { title: "Agent", dataIndex: "agentId", render: (value) => value || "普通会话" }, { title: "更新时间", render: (_, row) => formatDate(row.updatedAt || row.lastMessageAt) }]} locale={{ emptyText: "暂无会话记录" }} /></Card>
    </>}
  </>;
}

export function UsersPage() {
  const canRead = hasPermission("users:read");
  const canWrite = hasPermission("users:write");
  const canManageAgents = hasPermission("agents:manage");
  const superAdmin = hasPermission("*");
  const actorId = readAuth().user?.id;
  const [draft, setDraft] = useState({ query: "", status: "", role: "" });
  const [listQuery, setListQuery] = useState({ page: 1, filters: draft });
  const { page } = listQuery;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailState, setDetailState] = useState({
    id: null,
    detail: null,
    loading: false,
    error: null,
    revision: 0,
  });
  const detailLoader = useMemo(
    () => createUserDetailLoader({ request, onChange: setDetailState }),
    []
  );
  const [createOpen, setCreateOpen] = useState(false);
  const detail = detailState.detail;
  useEffect(() => () => detailLoader.cancel(), [detailLoader]);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    async function readPage() {
      setData(null);
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(listQuery.page), pageSize: "20" });
        Object.entries(listQuery.filters).forEach(([key, value]) => {
          if (String(value || "").trim()) params.set(key, String(value).trim());
        });
        const value = await request(`/api/admin/users?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!Array.isArray(value?.items) || !Number.isSafeInteger(value.total) || value.total < 0) {
          throw new Error("后台用户列表响应格式错误");
        }
        setData(value);
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message || "读取用户失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void readPage();
    return () => controller.abort();
  }, [canRead, listQuery]);
  const refreshList = () => setListQuery(current => ({ ...current }));
  const goToPage = next => setListQuery(current => ({ ...current, page: next }));
  const applyFilters = filters => setListQuery({ filters, page: 1 });
  const columns = useMemo(
    () => [
      {
        title: "账号",
        render: (_, row) => (
          <Space>
            <UserOutlined />
            <span>
              <strong>{row.displayName || "--"}</strong>
              <br />
              <Text type="secondary">{row.email || row.phoneNumber || row.aiId || "--"}</Text>
            </span>
          </Space>
        ),
      },
      { title: "角色", dataIndex: "role", render: (value) => roleLabel[value] || value },
      { title: "状态", dataIndex: "status", render: (value) => <StatusTag value={value} /> },
      { title: "会话", dataIndex: "activeSessionCount" },
      { title: "消息", dataIndex: "messageCount" },
      { title: "Agent", dataIndex: "agentCount" },
      { title: "最近登录", dataIndex: "lastLoginAt", render: formatDate },
      detailColumn(
        (row) => `查看用户 ${row.displayName || row.id} 详情`,
        (row) => detailLoader.open(row.id)
      ),
    ],
    [detailLoader]
  );
  const reloadDetail = () => {
    refreshList();
    return detailLoader.refresh();
  };
  if (!canRead) return <Alert type="warning" showIcon message="当前账号没有 users:read 权限" />;
  return (
    <div className="page-surface">
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <div>
            <Title level={2}>用户与权限</Title>
            <Text type="secondary">管理真实账号、资料、会话和授权记录。</Text>
          </div>
          <Space>
            {canWrite && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                创建账号
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={refreshList}>
              刷新
            </Button>
          </Space>
        </Space>
        <Card>
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="昵称、邮箱、手机号或 AI ID"
              value={draft.query}
              onChange={(e) => setDraft({ ...draft, query: e.target.value })}
              onPressEnter={() => applyFilters(draft)}
            />
            <Select
              allowClear
              placeholder="状态"
              value={draft.status || undefined}
              onChange={(value) => setDraft({ ...draft, status: value || "" })}
              options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))}
            />
            <Select
              allowClear
              placeholder="角色"
              value={draft.role || undefined}
              onChange={(value) => setDraft({ ...draft, role: value || "" })}
              options={Object.entries(roleLabel).map(([value, label]) => ({ value, label }))}
            />
            <Button
              onClick={() => applyFilters(draft)}
            >
              筛选
            </Button>
            <Button
              onClick={() => {
                const empty = { query: "", status: "", role: "" };
                setDraft(empty);
                applyFilters(empty);
              }}
            >
              清空
            </Button>
          </Space>
        </Card>
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            action={<Button onClick={refreshList}>重试</Button>}
          />
        )}
        <Table
          rowKey="id"
          scroll={{ x: 1000 }}
          loading={loading}
          columns={columns}
          dataSource={data?.items ?? []}
          onRow={(row) => ({
            onClick: () => detailLoader.open(row.id),
            style: { cursor: "pointer" },
          })}
          pagination={{
            current: page,
            pageSize: 20,
            total: data?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            onChange: goToPage,
          }}
          locale={{ emptyText: "暂无真实用户数据" }}
        />
      </Space>
      <CreateUserModal
        open={createOpen}
        superAdmin={superAdmin}
        onClose={() => setCreateOpen(false)}
        onCreated={() => goToPage(1)}
      />
      <Drawer
        open={Boolean(detailState.id)}
        width={680}
        title={<Space><UserOutlined />{detail?.user?.displayName || "账号详情"}</Space>}
        extra={<Button icon={<ReloadOutlined />} onClick={reloadDetail} loading={detailState.loading}>刷新</Button>}
        onClose={() => detailLoader.close()}
      >
        <UserDetail
          key={`${detailState.id || "closed"}-${detailState.revision}`}
          loading={detailState.loading}
          error={detailState.error}
          detail={detail}
          canWrite={canWrite && (detail?.user?.role !== "admin" || superAdmin)}
          canManageAgents={canManageAgents}
          superAdmin={superAdmin}
          actorId={actorId}
          onReload={reloadDetail}
        />
      </Drawer>
    </div>
  );
}

export default UsersPage;
