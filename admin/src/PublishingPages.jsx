import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { readAuth, request } from "./platform.js";

const { Text, Title } = Typography;
const PAGE_SIZE = 20;

const releaseStatuses = [
  { value: "draft", label: "草稿" },
  { value: "review", label: "审核中" },
  { value: "published", label: "已发布" },
  { value: "unpublished", label: "已下架" },
];
const productStatuses = [
  { value: "draft", label: "草稿" },
  { value: "review", label: "审核中" },
  { value: "published", label: "已发布" },
  { value: "paused", label: "已暂停" },
  { value: "retired", label: "已退役" },
];
const statusColors = { draft: "gold", review: "blue", published: "green", unpublished: "orange", paused: "orange", retired: "default", archived: "default" };
const statusLabels = Object.fromEntries([...releaseStatuses, ...productStatuses].map((item) => [item.value, item.label]));
const historyColumns = [{ title: "原状态", dataIndex: "fromStatus", render: (value) => value ? <StatusTag value={value} /> : "创建" }, { title: "新状态", dataIndex: "toStatus", render: (value) => <StatusTag value={value} /> }, { title: "原因", dataIndex: "reason", render: (value) => value || "--" }, { title: "操作者", dataIndex: "actorEmail", render: (value) => value || "系统" }, { title: "时间", dataIndex: "createdAt" }];

export function hasAdminPermission(user, permission) {
  const permissions = Array.isArray(user?.adminPermissions) ? user.adminPermissions : [];
  return user?.role === "admin" && (permissions.includes("*") || permissions.includes(permission));
}

function currentUser(user) {
  return user || readAuth()?.user || null;
}

function idempotencyKey(action, id = "new") {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `admin-publishing-${action}-${id}-${suffix}`;
}

function errorText(error, fallback = "请求失败") {
  const suffix = error?.requestId ? `（请求 ID：${error.requestId}）` : "";
  return `${error?.message || fallback}${suffix}`;
}

function StatusTag({ value }) {
  return <Tag color={statusColors[value] || "default"}>{statusLabels[value] || value || "未知"}</Tag>;
}

function PageHeading({ title, description, onRefresh, extra }) {
  return <div className="page-title">
    <div><Title level={2}>{title}</Title><Text type="secondary">{description}</Text></div>
    <Space>{extra}<Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button></Space>
  </div>;
}

function PermissionDenied({ permission }) {
  return <Alert type="warning" showIcon message="无权访问此页面" description={`当前管理员没有 ${permission} 权限。服务端权限是最终边界。`} />;
}

function usePagedList(endpoint, { query, status }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);

  const load = useCallback(async (nextPage = page) => {
    const requestSequence = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
      if (query) params.set("query", query);
      if (status) params.set("status", status);
      const value = await request(`${endpoint}?${params.toString()}`);
      if (requestSequence !== sequence.current) return;
      const items = Array.isArray(value) ? value : value?.items || value?.rows || [];
      setResult({ items, total: Number(value?.total ?? items.length) });
      setPage(Number(value?.page || nextPage));
    } catch (requestError) {
      if (requestSequence !== sequence.current) return;
      setError(errorText(requestError, "读取列表失败"));
    } finally {
      if (requestSequence === sequence.current) setLoading(false);
    }
  }, [endpoint, page, query, status]);

  useEffect(() => { load(1); return () => { sequence.current += 1; }; }, [endpoint, query, status]);
  return { ...result, page, loading, error, load, setError };
}

function SearchToolbar({ statusOptions, onSubmit, initialStatus = "" }) {
  const [form] = Form.useForm();
  useEffect(() => { form.setFieldsValue({ status: initialStatus }); }, [form, initialStatus]);
  return <Form form={form} layout="inline" className="toolbar" initialValues={{ status: initialStatus }} onFinish={(values) => onSubmit({ query: String(values.query || "").trim(), status: values.status || "" })}>
    <Form.Item name="query"><Input allowClear prefix={<SearchOutlined />} placeholder="搜索 key、名称或版本" /></Form.Item>
    <Form.Item name="status"><Select allowClear placeholder="全部状态" style={{ minWidth: 130 }} options={statusOptions} /></Form.Item>
    <Form.Item><Button type="primary" htmlType="submit">查询</Button></Form.Item>
    <Form.Item><Button onClick={() => { form.resetFields(); onSubmit({ query: "", status: "" }); }}>清空</Button></Form.Item>
  </Form>;
}

function ConfirmAction({ title, content, disabled, loading, onConfirm, children, type = "default" }) {
  return <Button type={type} size="small" disabled={disabled} loading={loading} onClick={() => Modal.confirm({
    title,
    content,
    okText: "确认",
    cancelText: "取消",
    okButtonProps: { danger: title.includes("暂停") },
    onOk: onConfirm,
  })}>{children}</Button>;
}

function IdentityEditor({ release, onSaved, canWrite }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const identity = release?.identity || {};
  const save = async (values) => {
    setSaving(true);
    try {
      await request(`/api/admin/agent-releases/${encodeURIComponent(release.id)}/identity`, {
        method: "PATCH",
        headers: { "Idempotency-Key": idempotencyKey("identity", release.id) },
        body: JSON.stringify({
          key: values.key,
          avatarKind: values.avatarKind,
          displayName: values.displayName,
          description: values.description || "",
          mark: values.mark,
          shape: values.shape,
          colors: { background: values.background, foreground: values.foreground, accent: values.accent },
          published: Boolean(values.published),
          source: values.source || identity.source || "admin",
          updatedAt: values.updatedAt || identity.updatedAt || new Date().toISOString(),
        }),
      });
      message.success("Agent identity 已保存");
      onSaved();
    } catch (error) {
      message.error(errorText(error, "保存 identity 失败"));
    } finally {
      setSaving(false);
    }
  };
  return <>
    <Divider orientation="left">发布身份</Divider>
    <Text type="secondary">身份合同由服务端校验。source、published 和更新时间会由服务端规范化。</Text>
    <Form form={form} layout="vertical" initialValues={{ ...identity, key: identity.key || release.agentKey, avatarKind: identity.avatarKind || "agent-mark", background: identity.colors?.background, foreground: identity.colors?.foreground, accent: identity.colors?.accent, source: identity.source || "admin", updatedAt: identity.updatedAt }} onFinish={(values) => Modal.confirm({ title: "保存 Agent identity？", content: "保存后会更新该 release 的发布合同，确认继续吗？", okText: "保存", cancelText: "取消", onOk: () => save(values) })} style={{ marginTop: 12 }}>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="key" label="Agent key" rules={[{ required: true, pattern: /^[a-z][a-z0-9-]{0,79}$/, message: "请输入小写字母、数字或短横线" }]}><Input disabled /></Form.Item></Col>
        <Col span={12}><Form.Item name="avatarKind" label="头像类型" rules={[{ required: true }]}><Input disabled /></Form.Item></Col>
      </Row>
      <Form.Item name="displayName" label="显示名称" rules={[{ required: true, max: 120 }]}><Input disabled={!canWrite} /></Form.Item>
      <Form.Item name="description" label="描述" rules={[{ max: 2000 }]}><Input.TextArea rows={3} disabled={!canWrite} /></Form.Item>
      <Row gutter={12}>
        <Col span={8}><Form.Item name="mark" label="标记" rules={[{ required: true, max: 40 }]}><Input disabled={!canWrite} /></Form.Item></Col>
        <Col span={8}><Form.Item name="shape" label="形状" rules={[{ required: true }]}><Select disabled={!canWrite} options={["circle", "squircle", "rounded"].map((value) => ({ value, label: value }))} /></Form.Item></Col>
        <Col span={8}><Form.Item name="source" label="来源"><Input disabled /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={8}><Form.Item name="background" label="背景色" rules={[{ required: true, pattern: /^#[0-9a-fA-F]{6}$/, message: "请输入 #RRGGBB" }]}><Input disabled={!canWrite} /></Form.Item></Col>
        <Col span={8}><Form.Item name="foreground" label="前景色" rules={[{ required: true, pattern: /^#[0-9a-fA-F]{6}$/, message: "请输入 #RRGGBB" }]}><Input disabled={!canWrite} /></Form.Item></Col>
        <Col span={8}><Form.Item name="accent" label="强调色" rules={[{ required: true, pattern: /^#[0-9a-fA-F]{6}$/, message: "请输入 #RRGGBB" }]}><Input disabled={!canWrite} /></Form.Item></Col>
      </Row>
      <Form.Item name="updatedAt" hidden><Input /></Form.Item>
      <Button type="primary" htmlType="submit" icon={<EditOutlined />} disabled={!canWrite} loading={saving}>保存 identity</Button>
    </Form>
  </>;
}

export function AgentReleasesPage({ user: providedUser }) {
  const user = currentUser(providedUser);
  const canRead = hasAdminPermission(user, "agents:manage");
  const canWrite = canRead;
  const [filters, setFilters] = useState({ query: "", status: "" });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  useEffect(() => { let active = true; setDetail(null); setDetailError(""); if (selected?.id) request(`/api/admin/agent-releases/${encodeURIComponent(selected.id)}`).then((value) => { if (active) setDetail(value); }).catch((error) => { if (active) setDetailError(errorText(error, "读取 release 详情失败")); }); return () => { active = false; }; }, [selected?.id]);
  const [action, setAction] = useState("");
  const list = usePagedList("/api/admin/agent-releases", filters);

  const act = async (kind, row) => {
    setAction(`${kind}:${row.id}`);
    try {
      await request(`/api/admin/agent-releases/${encodeURIComponent(row.id)}/${kind}`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey(kind, row.id) } });
      message.success(kind === "review" ? "已提交审核" : "Agent release 已发布");
      setSelected(null);
      await list.load(list.page);
    } catch (error) {
      message.error(errorText(error, "Agent release 操作失败"));
    } finally {
      setAction("");
    }
  };

  if (!canRead) return <PermissionDenied permission="agents:manage" />;
  const columns = [
    { title: "Agent", key: "agent", render: (_, row) => <Space><strong>{row.identity?.displayName || row.agentKey || "--"}</strong><Text type="secondary">{row.agentKey || "--"}</Text></Space> },
    { title: "版本", dataIndex: "version" },
    { title: "状态", dataIndex: "catalogStatus", render: (value) => <StatusTag value={value} /> },
    { title: "身份", key: "identity", render: (_, row) => row.identity ? <Tag>查看合同</Tag> : <Tag color="red">缺失</Tag> },
    { title: "就绪", key: "readiness", render: (_, row) => row.readiness?.ready ? <Tag color="green">通过</Tag> : <Tag color="red">{row.readiness?.missing?.join("、") || "未通过"}</Tag> },
    { title: "更新时间", dataIndex: "updatedAt" },
    { title: "操作", key: "actions", render: (_, row) => <Space onClick={(event) => event.stopPropagation()}>
      {(row.catalogStatus === "draft" || row.catalogStatus === "unpublished") && <ConfirmAction title="提交 Agent release 审核？" content="服务端会再次检查身份、合同和配置就绪状态。" loading={action === `review:${row.id}`} onConfirm={() => act("review", row)}>提交审核</ConfirmAction>}
      {(row.catalogStatus === "review" || row.catalogStatus === "unpublished") && <ConfirmAction type="primary" title="发布 Agent release？" content="发布后该 release 可被产品目录引用，并进入 App catalog 投影。" loading={action === `publish:${row.id}`} onConfirm={() => act("publish", row)}>发布</ConfirmAction>}
    </Space> },
  ];
  return <>
    <PageHeading title="Agent 发布" description="管理 Agent release 的身份、合同、审核和发布生命周期。" onRefresh={() => list.load(1)} />
    <div className="page-surface">
      <SearchToolbar statusOptions={releaseStatuses} onSubmit={setFilters} initialStatus={filters.status} />
      {list.error && <Alert type="error" showIcon message={list.error} action={<Button onClick={() => list.load()}>重试</Button>} style={{ marginBottom: 16 }} />}
      {!list.error && <Table rowKey="id" loading={list.loading} dataSource={list.items} columns={columns} scroll={{ x: 1050 }} locale={{ emptyText: <Empty description="暂无真实 Agent release" /> }} pagination={{ current: list.page, pageSize: PAGE_SIZE, total: list.total, showSizeChanger: false, showTotal: (total) => `共 ${total} 条`, onChange: (nextPage) => list.load(nextPage) }} onRow={(row) => ({ onClick: () => { setDetail(null); setDetailError(""); setSelected(row); }, style: { cursor: "pointer" } })} />}
    </div>
    <Drawer title={selected ? `${selected.agentKey || "Agent"} · v${selected.version || "--"}` : "Agent release 详情"} width={620} open={Boolean(selected)} onClose={() => setSelected(null)}>
      {selected && !detail && !detailError && <Alert type="info" showIcon message="正在读取 release 详情" />}
      {detailError && <Alert type="error" showIcon message="release 详情读取失败" description={detailError} />}
      {detail?.release?.id === selected?.id && detail?.release && <>
        <Descriptions bordered column={1} size="small" items={[{ key: "status", label: "状态", children: <StatusTag value={detail.release.catalogStatus} /> }, { key: "contract", label: "合同 hash", children: detail.release.contractHash || "缺失" }, { key: "scopes", label: "声明权限", children: detail.release.declaredScopes?.join("、") || "未声明" }, { key: "readiness", label: "就绪检查", children: detail.release.readiness?.ready ? "通过" : detail.release.readiness?.missing?.join("、") || "未通过" }]} />
        <Divider orientation="left">发布状态历史</Divider><Table size="small" rowKey="id" pagination={false} dataSource={detail?.history || []} columns={historyColumns} loading={!detail && !detailError} locale={{ emptyText: "暂无状态变更记录" }} />
        <Divider orientation="left">关联产品</Divider>{detail.productsVisible === false ? <Alert type="info" showIcon message="当前账号无产品读取权限" description="关联产品需要 products:read 权限。" /> : <Table size="small" rowKey={(row) => `${row.id}-${row.version}`} pagination={false} dataSource={detail.products || []} columns={[{ title: "产品", dataIndex: "displayName" }, { title: "Key", dataIndex: "productKey" }, { title: "版本", dataIndex: "version" }, { title: "状态", dataIndex: "status", render: (value) => <StatusTag value={value} /> }]} locale={{ emptyText: "该 release 尚未绑定产品" }} />}
        {detail.release.catalogStatus === "published" && <Alert style={{ marginTop: 16 }} type="info" showIcon message="已发布的 release 不可修改身份，请注册新版本。" />}
        <IdentityEditor key={detail.release.id} release={detail.release} canWrite={canWrite && detail.release.catalogStatus !== "published"} onSaved={async () => { setSelected(null); await list.load(list.page); }} />
      </>}
    </Drawer>
  </>;
}

function ProductCreateModal({ open, onClose, onCreated, canWrite }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const create = async ({ body }) => {
    let value;
    try { value = JSON.parse(body); } catch { form.setFields([{ name: "body", errors: ["产品 JSON 合同格式无效"] }]); return; }
    if (!value || typeof value !== "object" || Array.isArray(value)) { form.setFields([{ name: "body", errors: ["产品合同必须是 JSON 对象"] }]); return; }
    setSaving(true);
    try {
      await request("/api/admin/products", { method: "POST", headers: { "Idempotency-Key": idempotencyKey("create-product", value.productKey || "new") }, body: JSON.stringify({ ...value, status: "draft" }) });
      message.success("产品草稿已创建");
      form.resetFields();
      onCreated();
    } catch (error) {
      message.error(errorText(error, "创建产品失败"));
    } finally { setSaving(false); }
  };
  return <Modal title="创建产品草稿" open={open} onCancel={onClose} footer={null} destroyOnClose>
    <Alert type="info" showIcon message="提交完整产品合同" description="必须包含 productKey、version、identity、supportedPlatforms 和至少一个 dependencies；服务端会重新校验所有 Agent release 门禁。" style={{ marginBottom: 16 }} />
    <Form form={form} layout="vertical" onFinish={(values) => Modal.confirm({ title: "创建产品草稿？", content: "将按所填写的完整合同创建产品草稿，服务端会校验依赖和身份。", okText: "创建", cancelText: "取消", onOk: () => create(values) })}>
      <Form.Item name="body" label="产品 JSON 合同" rules={[{ required: true, message: "请输入产品合同" }]}><Input.TextArea rows={16} spellCheck={false} placeholder={'粘贴完整 JSON 合同，例如包含：productKey、version、displayName、description、identity、supportedPlatforms、dependencies'} /></Form.Item>
      <Space><Button onClick={onClose}>取消</Button><Button type="primary" htmlType="submit" loading={saving} disabled={!canWrite}>创建草稿</Button></Space>
    </Form>
  </Modal>;
}

export function ProductsPage({ user: providedUser }) {
  const user = currentUser(providedUser);
  const canRead = hasAdminPermission(user, "products:read");
  const canWrite = hasAdminPermission(user, "products:write");
  const [filters, setFilters] = useState({ query: "", status: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  useEffect(() => { let active = true; setDetail(null); setDetailError(""); if (selected?.id) request(`/api/admin/products/${encodeURIComponent(selected.id)}`).then((value) => { if (active) setDetail(value); }).catch((error) => { if (active) setDetailError(errorText(error, "读取产品详情失败")); }); return () => { active = false; }; }, [selected?.id]);
  const [action, setAction] = useState("");
  const list = usePagedList("/api/admin/products", filters);
  const act = async (kind, row) => {
    setAction(`${kind}:${row.id}`);
    try {
      await request(`/api/admin/products/${encodeURIComponent(row.id)}/${kind}`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey(kind, row.id) } });
      message.success(kind === "submit" ? "已提交产品审核" : kind === "publish" ? "产品已发布" : "产品已暂停");
      setSelected(null);
      await list.load(list.page);
    } catch (error) { message.error(errorText(error, "产品操作失败")); }
    finally { setAction(""); }
  };
  if (!canRead) return <PermissionDenied permission="products:read" />;
  const columns = [
    { title: "产品", key: "product", render: (_, row) => <Space direction="vertical" size={0}><strong>{row.displayName || row.productKey || "--"}</strong><Text type="secondary">{row.productKey || "--"}</Text></Space> },
    { title: "版本", dataIndex: "version" },
    { title: "状态", dataIndex: "status", render: (value) => <StatusTag value={value} /> },
    { title: "平台", dataIndex: "supportedPlatforms", render: (values) => Array.isArray(values) && values.length ? values.join("、") : "--" },
    { title: "依赖", dataIndex: "dependencies", render: (values) => Array.isArray(values) ? `${values.length} 个 Agent` : "--" },
    { title: "合同", dataIndex: "contractHash", render: (value) => value ? <Text code>{value.slice(0, 12)}…</Text> : <Tag color="red">缺失</Tag> },
    { title: "更新时间", dataIndex: "updatedAt" },
    ...(canWrite ? [{ title: "操作", key: "actions", render: (_, row) => <Space onClick={(event) => event.stopPropagation()}>
      {row.status === "draft" && <ConfirmAction title="提交产品审核？" content="服务端会检查产品合同和所有依赖 release 的发布门禁。" loading={action === `submit:${row.id}`} onConfirm={() => act("submit", row)}>提交审核</ConfirmAction>}
      {row.status === "review" && <ConfirmAction type="primary" title="发布产品？" content="发布后产品会进入 App catalog，用户仍需明确 consent 才能启用。" loading={action === `publish:${row.id}`} onConfirm={() => act("publish", row)}>发布</ConfirmAction>}
      {row.status === "published" && <ConfirmAction title="暂停产品？" content="暂停会撤销现有 entitlement 的可用状态，并触发 Agent 投影清理。" loading={action === `pause:${row.id}`} onConfirm={() => act("pause", row)}>暂停</ConfirmAction>}
      {row.status === "paused" && <ConfirmAction type="primary" title="恢复发布产品？" content="服务端会重新检查当前合同和依赖门禁。" loading={action === `publish:${row.id}`} onConfirm={() => act("publish", row)}>恢复发布</ConfirmAction>}
    </Space> }] : []),
  ];
  return <>
    <PageHeading title="产品目录" description="创建、审核、发布和暂停产品版本，所有数据来自服务端产品目录。" onRefresh={() => list.load(1)} extra={canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建产品草稿</Button>} />
    <div className="page-surface">
      <SearchToolbar statusOptions={productStatuses} onSubmit={setFilters} initialStatus={filters.status} />
      {list.error && <Alert type="error" showIcon message={list.error} action={<Button onClick={() => list.load()}>重试</Button>} style={{ marginBottom: 16 }} />}
      {!list.error && <Table rowKey="id" loading={list.loading} dataSource={list.items} columns={columns} scroll={{ x: 1250 }} locale={{ emptyText: <Empty description="暂无真实产品版本" /> }} pagination={{ current: list.page, pageSize: PAGE_SIZE, total: list.total, showSizeChanger: false, showTotal: (total) => `共 ${total} 条`, onChange: (nextPage) => list.load(nextPage) }} onRow={(row) => ({ onClick: () => { setDetail(null); setDetailError(""); setSelected(row); }, style: { cursor: "pointer" } })} />}
    </div>
    <Drawer title={selected ? `${selected.displayName || selected.productKey} · v${selected.version || "--"}` : "产品详情"} width={620} open={Boolean(selected)} onClose={() => setSelected(null)}>
      {selected && !detail && !detailError && <Alert type="info" showIcon message="正在读取产品详情" />}
      {detailError && <Alert type="error" showIcon message="产品详情读取失败" description={detailError} />}
      {detail?.product?.id === selected?.id && detail?.product && <><Descriptions bordered column={1} size="small" items={[{ key: "status", label: "状态", children: <StatusTag value={detail.product.status} /> }, { key: "description", label: "描述", children: detail.product.description || "--" }, { key: "platforms", label: "平台", children: detail.product.supportedPlatforms?.join("、") || "--" }, { key: "contract", label: "合同 hash", children: detail.product.contractHash || "缺失" }]} /><Divider orientation="left">Agent 依赖与发布门禁</Divider>{detail.product.dependencies?.length ? <Table size="small" rowKey={(row) => `${row.agentKey}-${row.agentReleaseId}`} pagination={false} dataSource={detail.product.dependencies} columns={[{ title: "Agent", dataIndex: "agentKey" }, { title: "版本", dataIndex: "version" }, { title: "release", dataIndex: "releaseStatus", render: (value) => <StatusTag value={value} /> }, { title: "就绪", dataIndex: "readiness", render: (value) => value?.ready ? <Tag color="green">通过</Tag> : <Tag color="red">未通过</Tag> }, { title: "Scopes", dataIndex: "scopes", render: (value) => value?.join("、") || "无" }]} /> : <Empty description="未绑定 Agent 依赖" />}<Divider orientation="left">用户授权汇总</Divider><Table size="small" rowKey="status" pagination={false} dataSource={detail?.entitlementSummary || []} columns={[{ title: "授权状态", dataIndex: "status", render: (value) => <StatusTag value={value} /> }, { title: "用户数", dataIndex: "count" }]} loading={!detail && !detailError} locale={{ emptyText: "暂无用户授权记录" }} /><Divider orientation="left">产品状态历史</Divider><Table size="small" rowKey="id" pagination={false} dataSource={detail?.history || []} columns={historyColumns} loading={!detail && !detailError} locale={{ emptyText: "暂无状态变更记录" }} /></>}
    </Drawer>
    <ProductCreateModal open={createOpen} canWrite={canWrite} onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); await list.load(1); }} />
  </>;
}

export function PublishingPages({ resource, user }) {
  return resource === "products" ? <ProductsPage user={user} /> : <AgentReleasesPage user={user} />;
}

export default PublishingPages;
