import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  App as AntApp,
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
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { readAuth, request } from "./platform.js";
import { IdentityFields, IdentityPreview } from "./PublishingIdentity.jsx";
import {
  buildIdentity,
  buildProductFields,
  identityFormValues,
} from "./publishing-model.js";

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
const statusColors = {
  draft: "gold",
  review: "blue",
  published: "green",
  unpublished: "orange",
  paused: "orange",
  retired: "default",
  archived: "default",
  enabled: "green",
  disabled: "default",
  unavailable: "red",
  reconsent_required: "orange",
};
const statusLabels = {
  ...Object.fromEntries(
    [...releaseStatuses, ...productStatuses].map((item) => [
      item.value,
      item.label,
    ])
  ),
  enabled: "已授权",
  disabled: "已撤权",
  unavailable: "不可用",
  reconsent_required: "需重新授权",
};
const keyRule = [
  {
    required: true,
    pattern: /^[a-z][a-z0-9-]{0,79}$/,
    message: "以小写字母开头，使用小写字母、数字、短横线，最长 80 位",
  },
];
const versionRule = [
  {
    required: true,
    pattern: /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    message: "请输入语义版本，例如 1.0.0",
  },
];
const historyColumns = [
  {
    title: "原状态",
    width: 95,
    dataIndex: "fromStatus",
    render: (value) => (value ? <StatusTag value={value} /> : "创建"),
  },
  {
    title: "新状态",
    width: 95,
    dataIndex: "toStatus",
    render: (value) => <StatusTag value={value} />,
  },
  {
    title: "原因",
    dataIndex: "reason",
    width: 240,
    render: (value) =>
      value ? (
        <Text style={{ maxWidth: 220 }} ellipsis={{ tooltip: value }}>
          {value}
        </Text>
      ) : (
        "--"
      ),
  },
  {
    title: "操作者",
    width: 220,
    dataIndex: "actorEmail",
    render: (value) =>
      value ? (
        <Text style={{ maxWidth: 200 }} ellipsis={{ tooltip: value }}>
          {value}
        </Text>
      ) : (
        "系统"
      ),
  },
  { title: "时间", dataIndex: "createdAt", width: 200 },
];
const dependencyColumns = [
  { title: "Agent", dataIndex: "agentKey" },
  { title: "版本", dataIndex: "version" },
  {
    title: "release",
    key: "status",
    render: (_, row) => (
      <StatusTag value={row.releaseStatus || row.catalogStatus} />
    ),
  },
  {
    title: "就绪",
    dataIndex: "readiness",
    render: (value) =>
      value?.ready ? (
        <Tag color="green">通过</Tag>
      ) : (
        <Tag color="red">未通过</Tag>
      ),
  },
  {
    title: "声明权限",
    key: "scopes",
    render: (_, row) => (row.scopes || row.declaredScopes)?.join("、") || "无",
  },
];

export function hasAdminPermission(user, permission) {
  const permissions = Array.isArray(user?.adminPermissions)
    ? user.adminPermissions
    : [];
  return (
    user?.role === "admin" &&
    (permissions.includes("*") || permissions.includes(permission))
  );
}
function currentUser(user) {
  return user || readAuth()?.user || null;
}
function idempotencyKey(action, id = "new") {
  return `admin-publishing-${action}-${id}-${globalThis.crypto.randomUUID()}`;
}
function errorText(error, fallback = "请求失败") {
  return `${error?.message || fallback}${
    error?.requestId ? `（请求 ID：${error.requestId}）` : ""
  }`;
}
function StatusTag({ value }) {
  return (
    <Tag color={statusColors[value] || "default"}>
      {statusLabels[value] || value || "未知"}
    </Tag>
  );
}
function Readiness({ value }) {
  return value?.ready ? (
    <Tag color="green">已就绪</Tag>
  ) : (
    <Text type="danger">{value?.missing?.join("、") || "未通过就绪检查"}</Text>
  );
}
function registryIdentityValues(agent) {
  return identityFormValues(
    {
      key: agent?.key,
      displayName: agent?.name,
      description: agent?.description,
      ...agent?.identity,
    },
    agent?.key
  );
}
function PageHeading({ title, description, onRefresh, extra }) {
  return (
    <div className="page-title">
      <div>
        <Title level={2}>{title}</Title>
        <Text type="secondary">{description}</Text>
      </div>
      <Space wrap>
        {extra}
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新
        </Button>
      </Space>
    </div>
  );
}
function PermissionDenied({ permission }) {
  return (
    <Alert
      type="warning"
      showIcon
      message="无权访问此页面"
      description={`当前管理员没有 ${permission} 权限。`}
    />
  );
}

function usePagedList(endpoint, { query, status }, enabled) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const load = useCallback(
    async (nextPage = page) => {
      if (!enabled) return;
      const requestSequence = ++sequence.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(PAGE_SIZE),
        });
        if (query) params.set("query", query);
        if (status) params.set("status", status);
        const value = await request(`${endpoint}?${params}`);
        if (requestSequence !== sequence.current) return;
        if (
          !Array.isArray(value?.items) ||
          !Number.isFinite(Number(value.total))
        )
          throw new Error("服务端列表合同不完整，请联系维护人员");
        setResult({ items: value.items, total: Number(value.total) });
        setPage(Number(value.page || nextPage));
      } catch (failure) {
        if (requestSequence === sequence.current)
          setError(errorText(failure, "读取列表失败"));
      } finally {
        if (requestSequence === sequence.current) setLoading(false);
      }
    },
    [endpoint, page, query, status, enabled]
  );
  useEffect(() => {
    load(1);
    return () => {
      sequence.current += 1;
    };
  }, [endpoint, query, status, enabled]);
  return { ...result, page, loading, error, load };
}
function useDetail(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    if (path)
      request(path)
        .then((value) => {
          if (active) setData(value);
        })
        .catch((failure) => {
          if (active) setError(errorText(failure));
        });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, reload: () => setRevision((value) => value + 1) };
}
function SearchToolbar({ statusOptions, onSubmit }) {
  const [form] = Form.useForm();
  return (
    <Form
      form={form}
      layout="inline"
      className="toolbar"
      onFinish={(values) =>
        onSubmit({
          query: String(values.query || "").trim(),
          status: values.status || "",
        })
      }
    >
      <Form.Item name="query">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索 key、名称或版本"
        />
      </Form.Item>
      <Form.Item name="status">
        <Select
          allowClear
          placeholder="全部状态"
          style={{ minWidth: 130 }}
          options={statusOptions}
        />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit">
          查询
        </Button>
      </Form.Item>
      <Form.Item>
        <Button
          onClick={() => {
            form.resetFields();
            onSubmit({ query: "", status: "" });
          }}
        >
          清空
        </Button>
      </Form.Item>
    </Form>
  );
}
function ConfirmAction({
  title,
  content,
  disabled,
  loading,
  onConfirm,
  children,
  type = "default",
}) {
  const { modal } = AntApp.useApp();
  return (
    <Button
      type={type}
      size="small"
      disabled={disabled}
      loading={loading}
      onClick={() =>
        modal.confirm({
          title,
          content,
          okText: "确认",
          cancelText: "取消",
          okButtonProps: { danger: title.includes("暂停") },
          onOk: onConfirm,
        })
      }
    >
      {children}
    </Button>
  );
}
function ListTable({ list, columns, onSelect, empty }) {
  return (
    <>
      {list.error ? (
        <Alert
          type="error"
          showIcon
          message={list.error}
          action={<Button onClick={() => list.load()}>重试</Button>}
        />
      ) : (
        <Table
          rowKey="id"
          loading={list.loading}
          dataSource={list.items}
          columns={columns}
          scroll={{ x: 1080 }}
          locale={{ emptyText: <Empty description={empty} /> }}
          pagination={{
            current: list.page,
            pageSize: PAGE_SIZE,
            total: list.total,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page) => list.load(page),
          }}
          onRow={(row) => ({
            onClick: () => onSelect(row),
            style: { cursor: "pointer" },
          })}
        />
      )}
    </>
  );
}

function ReleaseDraftModal({
  open,
  agents,
  registryLoading,
  registryError,
  initialAgentKey,
  sourceRelease,
  onClose,
  onCreated,
}) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const agentKey = Form.useWatch("agentKey", form);
  const agent = agents.find((item) => item.key === agentKey);
  const sourceCompatible =
    !sourceRelease ||
    (agent?.key === sourceRelease.agentKey &&
      agent?.version === sourceRelease.version);
  useEffect(() => {
    if (!open) return;
    setError("");
    form.resetFields();
    const key = sourceRelease?.agentKey || initialAgentKey;
    const selectedAgent = agents.find((item) => item.key === key);
    form.setFieldsValue({
      agentKey: key,
      identity: sourceRelease
        ? identityFormValues(sourceRelease.identity, key)
        : registryIdentityValues(selectedAgent),
    });
  }, [open, sourceRelease?.id, initialAgentKey]);
  const save = async (values) => {
    if (!agent || !sourceCompatible) {
      setError("请选择当前已部署的代码 Agent；旧运行版本不能创建身份修订。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const value = await request("/api/admin/agent-releases", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey("create-release", agent.key),
        },
        body: JSON.stringify({
          agentKey: agent.key,
          identity: buildIdentity(values.identity, agent.key),
          ...(sourceRelease ? { sourceReleaseId: sourceRelease.id } : {}),
        }),
      });
      message.success("Agent release 草稿已保存");
      onCreated(value);
    } catch (failure) {
      setError(errorText(failure, "创建草稿失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={sourceRelease ? "创建 Agent 身份修订" : "配置并创建 Agent 草稿"}
      width={760}
      open={open}
      onCancel={saving || uploading ? undefined : onClose}
      footer={null}
      destroyOnHidden
      styles={{
        body: {
          maxHeight: "calc(100vh - 190px)",
          overflowY: "auto",
          paddingRight: 8,
        },
      }}
    >
      <Alert
        type="info"
        showIcon
        message="选择已部署的代码能力，配置审核发布身份"
        description="运行逻辑、版本和权限来自代码 registry。此处只配置发布展示身份；提交审核和发布后，再绑定产品供用户明确授权。"
        style={{ marginBottom: 20 }}
      />
      {registryError && <Alert type="error" showIcon message={registryError} />}
      <Form name="release-draft" form={form} layout="vertical" onFinish={save}>
        <Form.Item
          name="agentKey"
          label="已部署代码 Agent"
          rules={[{ required: true, message: "请选择代码 Agent" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={registryLoading}
            disabled={Boolean(sourceRelease) || saving}
            placeholder="选择实际部署的能力"
            options={agents.map((item) => ({
              value: item.key,
              label: `${item.name} · ${item.key} · v${item.version}`,
            }))}
            onChange={(key) => {
              const selectedAgent = agents.find((item) => item.key === key);
              form.setFieldValue(
                "identity",
                registryIdentityValues(selectedAgent)
              );
            }}
          />
        </Form.Item>
        {agent && (
          <Descriptions
            bordered
            size="small"
            column={1}
            style={{ marginBottom: 20 }}
            items={[
              { label: "运行版本", children: agent.version },
              { label: "能力说明", children: agent.description },
              {
                label: "声明能力",
                children: agent.capabilities?.join("、") || "无",
              },
              {
                label: "能力边界 / 待接入",
                children:
                  agent.capabilityNeeds?.join("、") ||
                  "当前 registry 未声明额外待接入项；配置就绪仅代表环境门禁通过",
              },
              {
                label: "代码声明权限",
                children: agent.permissions?.join("、") || "无",
              },
              {
                label: "配置就绪",
                children: <Readiness value={agent.readiness} />,
              },
            ]}
          />
        )}
        {!sourceCompatible && (
          <Alert
            type="error"
            showIcon
            message="该 release 的运行版本已经不在当前 registry，不能在旧版本上修订。请从已部署代码创建草稿。"
            style={{ marginBottom: 16 }}
          />
        )}
        {sourceRelease && (
          <Alert
            type="info"
            showIcon
            message="旧 release 与已授权产品保持不变；修订生成独立草稿，需重新审核、发布和绑定产品。"
            style={{ marginBottom: 16 }}
          />
        )}
        <Divider orientation="left">发布展示身份</Divider>
        <IdentityFields
          form={form}
          disabled={!agent || saving}
          onUploadBusyChange={setUploading}
        />
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
          />
        )}
        <Space>
          <Button onClick={onClose} disabled={saving || uploading}>
            取消
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
            disabled={!agent || uploading || !sourceCompatible}
          >
            保存发布草稿
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}
function IdentityEditor({ release, onSaved }) {
  const { modal, message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const editable = release.catalogStatus === "draft";
  const save = async (values) => {
    setSaving(true);
    setError("");
    try {
      await request(`/api/admin/agent-releases/${release.id}/identity`, {
        method: "PATCH",
        headers: { "Idempotency-Key": idempotencyKey("identity", release.id) },
        body: JSON.stringify(buildIdentity(values.identity, release.agentKey)),
      });
      message.success("发布身份已保存");
      onSaved();
    } catch (failure) {
      setError(errorText(failure, "保存身份失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Divider orientation="left">发布展示身份</Divider>
      {!editable && (
        <Alert
          type="info"
          showIcon
          message={
            release.catalogStatus === "review"
              ? "审核中的身份已锁定，退回草稿后可编辑。"
              : "该版本身份已锁定；使用“创建身份修订”重新审核发布。"
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <Form
        name={`release-identity-${release.id}`}
        form={form}
        layout="vertical"
        initialValues={{
          identity: identityFormValues(release.identity, release.agentKey),
        }}
        onFinish={(values) =>
          modal.confirm({
            title: "保存发布身份？",
            content: "本次修改将更新草稿的身份合同，请核对名称、头像与权限。",
            okText: "保存",
            cancelText: "取消",
            onOk: () => save(values),
          })
        }
      >
        <IdentityFields
          form={form}
          disabled={!editable || saving}
          onUploadBusyChange={setUploading}
        />
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
          />
        )}
        {editable && (
          <Button
            type="primary"
            htmlType="submit"
            icon={<EditOutlined />}
            loading={saving}
            disabled={uploading}
          >
            保存发布身份
          </Button>
        )}
      </Form>
    </>
  );
}

export function AgentReleasesPage({ user: providedUser }) {
  const { message } = AntApp.useApp();
  const canRead = hasAdminPermission(
    currentUser(providedUser),
    "agents:manage"
  );
  const [filters, setFilters] = useState({ query: "", status: "" });
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("releases");
  const [draft, setDraft] = useState(null);
  const [action, setAction] = useState("");
  const [agents, setAgents] = useState([]);
  const [registryError, setRegistryError] = useState("");
  const [registryLoading, setRegistryLoading] = useState(false);
  const list = usePagedList("/api/admin/agent-releases", filters, canRead);
  const details = useDetail(
    canRead && selected?.id
      ? `/api/admin/agent-releases/${encodeURIComponent(selected.id)}`
      : null
  );
  const detail = details.data;
  const release =
    detail?.release && detail.release.id === selected?.id
      ? detail.release
      : null;
  const registrySequence = useRef(0);
  const loadRegistry = async () => {
    if (!canRead) return;
    const sequence = ++registrySequence.current;
    setRegistryLoading(true);
    setRegistryError("");
    try {
      const value = await request("/api/admin/agent-registry");
      if (!Array.isArray(value?.agents))
        throw new Error("服务端代码 registry 合同不完整");
      if (sequence === registrySequence.current) setAgents(value.agents);
    } catch (failure) {
      if (sequence === registrySequence.current)
        setRegistryError(errorText(failure));
    } finally {
      if (sequence === registrySequence.current) setRegistryLoading(false);
    }
  };
  useEffect(() => {
    loadRegistry();
    return () => {
      registrySequence.current += 1;
    };
  }, [canRead]);
  const refresh = () => {
    list.load(list.page);
    loadRegistry();
    if (selected) details.reload();
  };
  const act = async (kind, row) => {
    setAction(`${kind}:${row.id}`);
    try {
      await request(
        `/api/admin/agent-releases/${encodeURIComponent(row.id)}/${kind}`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey(kind, row.id) },
          body: JSON.stringify({}),
        }
      );
      message.success(
        {
          review: "已提交审核",
          publish: "Agent release 已发布",
          withdraw: "已退回草稿",
        }[kind]
      );
      refresh();
    } catch (failure) {
      message.error(errorText(failure));
    } finally {
      setAction("");
    }
  };
  const openDraft = (options = {}) => {
    setDraft(options);
    loadRegistry();
  };
  if (!canRead) return <PermissionDenied permission="agents:manage" />;
  const columns = [
    {
      title: "Agent",
      key: "agent",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <strong>{row.identity?.displayName || row.agentKey}</strong>
          <Text type="secondary">{row.agentKey}</Text>
        </Space>
      ),
    },
    { title: "运行版本", dataIndex: "version" },
    {
      title: "发布状态",
      dataIndex: "catalogStatus",
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: "身份",
      key: "identity",
      render: (_, row) =>
        row.identity ? (
          <Tag>
            {row.identity.avatarKind === "agent-image"
              ? "图片头像"
              : "图形标记"}
          </Tag>
        ) : (
          <Tag color="red">缺失</Tag>
        ),
    },
    {
      title: "运行就绪",
      dataIndex: "readiness",
      render: (value) => <Readiness value={value} />,
    },
    { title: "更新时间", dataIndex: "updatedAt" },
    {
      title: "操作",
      key: "actions",
      render: (_, row) => (
        <Space wrap onClick={(event) => event.stopPropagation()}>
          <Button size="small" onClick={() => setSelected(row)}>
            配置详情
          </Button>
          {row.catalogStatus === "draft" && (
            <ConfirmAction
              title="提交 Agent release 审核？"
              content="服务端会检查身份、运行合同和配置就绪状态。"
              loading={action === `review:${row.id}`}
              onConfirm={() => act("review", row)}
            >
              提交审核
            </ConfirmAction>
          )}
          {row.catalogStatus === "review" && (
            <ConfirmAction
              type="primary"
              title="发布 Agent release？"
              content="发布后可绑定产品。用户仍须明确授权产品后才能使用。"
              loading={action === `publish:${row.id}`}
              onConfirm={() => act("publish", row)}
            >
              发布
            </ConfirmAction>
          )}
        </Space>
      ),
    },
  ];
  return (
    <>
      <PageHeading
        title="Agent 发布"
        description="代码能力注册 → 配置发布身份 → 审核 release → 发布产品 → 用户授权。"
        onRefresh={refresh}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openDraft()}
          >
            新建 Agent 发布草稿
          </Button>
        }
      />
      <div className="page-surface">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "releases",
              label: "发布版本",
              children: (
                <>
                  <SearchToolbar
                    statusOptions={releaseStatuses}
                    onSubmit={setFilters}
                  />
                  <ListTable
                    list={list}
                    columns={columns}
                    onSelect={setSelected}
                    empty="暂无 Agent release，请先从已部署代码创建发布草稿"
                  />
                </>
              ),
            },
            {
              key: "registry",
              label: "已部署代码能力",
              children: (
                <>
                  <Alert
                    type="info"
                    showIcon
                    message="新增运行能力需开发并部署 Agent 代码"
                    description="此表只读取当前服务的真实 registry。名称、头像、颜色可在发布草稿中配置；运行逻辑、能力与权限由代码声明。"
                    style={{ marginBottom: 20 }}
                  />
                  {registryError && (
                    <Alert
                      type="error"
                      showIcon
                      message={registryError}
                      action={<Button onClick={loadRegistry}>重试</Button>}
                    />
                  )}
                  <Table
                    rowKey="key"
                    loading={registryLoading}
                    dataSource={agents}
                    pagination={false}
                    scroll={{ x: 1780 }}
                    columns={[
                      {
                        title: "代码 Agent",
                        key: "name",
                        width: 180,
                        render: (_, row) => (
                          <Space direction="vertical" size={0}>
                            <Text strong>{row.name}</Text>
                            <Text type="secondary">{row.key}</Text>
                          </Space>
                        ),
                      },
                      { title: "版本", dataIndex: "version", width: 90 },
                      {
                        title: "能力说明",
                        dataIndex: "description",
                        width: 300,
                      },
                      {
                        title: "声明权限",
                        dataIndex: "permissions",
                        width: 250,
                        render: (value) => value?.join("、") || "无",
                      },
                      {
                        title: "配置就绪",
                        dataIndex: "readiness",
                        width: 220,
                        render: (value) => <Readiness value={value} />,
                      },
                      {
                        title: "能力边界 / 待接入",
                        dataIndex: "capabilityNeeds",
                        width: 210,
                        render: (value) =>
                          value?.length ? (
                            <Text type="warning">{value.join("、")}</Text>
                          ) : (
                            <Text type="secondary">配置就绪仅代表环境门禁</Text>
                          ),
                      },
                      {
                        title: "现有发布版本",
                        dataIndex: "currentReleases",
                        width: 210,
                        render: (values) =>
                          values?.length ? (
                            <Space wrap>
                              {values.map((value) => (
                                <Button
                                  key={value.id}
                                  type="link"
                                  size="small"
                                  onClick={() => setSelected(value)}
                                >
                                  {statusLabels[value.catalogStatus] ||
                                    value.catalogStatus}{" "}
                                  · {value.contractHash?.slice(0, 8)}
                                </Button>
                              ))}
                            </Space>
                          ) : (
                            "尚未创建"
                          ),
                      },
                      {
                        title: "操作",
                        key: "actions",
                        width: 150,
                        render: (_, row) => (
                          <Button
                            size="small"
                            onClick={() => openDraft({ agentKey: row.key })}
                          >
                            配置发布身份
                          </Button>
                        ),
                      },
                    ]}
                    locale={{ emptyText: "当前服务没有可发布代码 Agent" }}
                  />
                </>
              ),
            },
          ]}
        />
      </div>
      <Drawer
        title={
          selected
            ? `${selected.agentKey} · v${selected.version}`
            : "Agent release 详情"
        }
        width={760}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        extra={
          <Button onClick={details.reload} icon={<ReloadOutlined />}>
            刷新详情
          </Button>
        }
      >
        {!detail && !details.error && (
          <Alert type="info" showIcon message="正在读取 release 详情" />
        )}
        {details.error && (
          <Alert type="error" showIcon message={details.error} />
        )}
        {release && (
          <>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                {
                  label: "发布状态",
                  children: <StatusTag value={release.catalogStatus} />,
                },
                {
                  label: "合同 hash",
                  children: (
                    <Text code copyable>
                      {release.contractHash}
                    </Text>
                  ),
                },
                {
                  label: "代码声明权限",
                  children: release.declaredScopes?.join("、") || "无",
                },
                {
                  label: "运行就绪",
                  children: <Readiness value={release.readiness} />,
                },
              ]}
            />
            <Space wrap style={{ marginTop: 16 }}>
              {release.catalogStatus === "draft" && (
                <ConfirmAction
                  title="提交 Agent release 审核？"
                  content="服务端会检查身份、运行合同和配置就绪状态。"
                  loading={action === `review:${release.id}`}
                  onConfirm={() => act("review", release)}
                >
                  提交审核
                </ConfirmAction>
              )}
              {release.catalogStatus === "review" && (
                <ConfirmAction
                  type="primary"
                  title="发布 Agent release？"
                  content="发布后可绑定产品，用户仍须明确授权。"
                  loading={action === `publish:${release.id}`}
                  onConfirm={() => act("publish", release)}
                >
                  发布
                </ConfirmAction>
              )}
              {release.catalogStatus === "review" && (
                <ConfirmAction
                  title="退回草稿？"
                  content="退回后可修改身份，需要重新提交审核。"
                  onConfirm={() => act("withdraw", release)}
                >
                  退回草稿
                </ConfirmAction>
              )}
              {["published", "unpublished", "archived"].includes(
                release.catalogStatus
              ) && (
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => openDraft({ sourceRelease: release })}
                >
                  创建身份修订
                </Button>
              )}
            </Space>
            <IdentityEditor
              key={`${release.id}-${release.contractHash}`}
              release={release}
              onSaved={refresh}
            />
            <Divider orientation="left">发布状态历史</Divider>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={detail.history || []}
              columns={historyColumns}
              scroll={{ x: 580 }}
            />
            <Divider orientation="left">关联产品</Divider>
            {detail.productsVisible === false ? (
              <Alert
                type="info"
                showIcon
                message="查看关联产品需要 products:read 权限"
              />
            ) : (
              <Table
                size="small"
                rowKey={(row) => `${row.id}-${row.version}`}
                pagination={false}
                dataSource={detail.products || []}
                columns={[
                  { title: "产品", dataIndex: "displayName" },
                  { title: "Key", dataIndex: "productKey" },
                  { title: "版本", dataIndex: "version" },
                  {
                    title: "状态",
                    dataIndex: "status",
                    render: (value) => <StatusTag value={value} />,
                  },
                ]}
                locale={{ emptyText: "尚未绑定产品" }}
              />
            )}
          </>
        )}
      </Drawer>
      <ReleaseDraftModal
        open={Boolean(draft)}
        agents={agents}
        registryLoading={registryLoading}
        registryError={registryError}
        initialAgentKey={draft?.agentKey}
        sourceRelease={draft?.sourceRelease}
        onClose={() => setDraft(null)}
        onCreated={(created) => {
          setDraft(null);
          refresh();
          setSelected(created);
        }}
      />
    </>
  );
}

function ProductFormModal({ configuration, onClose, onSaved }) {
  const { modal, message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const product = configuration?.product;
  const mode = configuration?.mode || "create";
  const open = Boolean(configuration);
  const selectedIds = Form.useWatch("releaseIds", form) || [];
  const productName = Form.useWatch("displayName", form);
  const productDescription = Form.useWatch("description", form);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    setLoadError("");
    setReleases([]);
    setLoading(true);
    form.resetFields();
    form.setFieldsValue({
      productKey: product?.productKey || "",
      version: mode === "edit" ? product?.version : "",
      displayName: product?.displayName || "",
      description: product?.description || "",
      supportedPlatforms: product?.supportedPlatforms || ["ios", "android"],
      releaseIds:
        product?.dependencies?.map((item) => item.agentReleaseId) || [],
      identity: identityFormValues(product?.identity, product?.productKey),
    });
    request("/api/admin/products/published-agent-releases")
      .then((value) => {
        if (!Array.isArray(value?.releases))
          throw new Error("服务端发布依赖合同不完整");
        if (active) setReleases(value.releases);
      })
      .catch((failure) => {
        if (active) setLoadError(errorText(failure, "读取已发布 Agent 失败"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, mode, product?.productVersionId]);
  const save = async (values) => {
    setSaving(true);
    setError("");
    try {
      const fields = buildProductFields(values, releases);
      const path =
        mode === "create"
          ? "/api/admin/products"
          : mode === "edit"
          ? `/api/admin/products/${product.id}/versions/${product.productVersionId}`
          : `/api/admin/products/${product.id}/versions`;
      const saved = await request(path, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: {
          "Idempotency-Key": idempotencyKey(`product-${mode}`, product?.id),
        },
        body: JSON.stringify(
          mode === "create"
            ? { productKey: values.productKey, ...fields, status: "draft" }
            : fields
        ),
      });
      message.success(
        mode === "edit" ? "产品草稿已保存" : "产品版本草稿已创建"
      );
      onSaved(saved);
    } catch (failure) {
      setError(errorText(failure, "保存产品失败"));
    } finally {
      setSaving(false);
    }
  };
  const unavailableIds = selectedIds.filter(
    (id) => !releases.some((release) => release.id === id)
  );
  return (
    <Modal
      title={
        mode === "edit"
          ? "编辑产品版本草稿"
          : mode === "version"
          ? "创建产品新版本"
          : "创建产品草稿"
      }
      open={open}
      width={840}
      onCancel={saving || uploading ? undefined : onClose}
      footer={null}
      destroyOnHidden
      styles={{
        body: {
          maxHeight: "calc(100vh - 190px)",
          overflowY: "auto",
          paddingRight: 8,
        },
      }}
    >
      <Alert
        type="info"
        showIcon
        message="产品将已发布 Agent 能力组成可授权的服务"
        description="发布不会替用户启用产品。新版本合同和权限变化必须经过审核发布，并由用户明确确认。"
        style={{ marginBottom: 20 }}
      />
      <Form
        name="product-contract"
        form={form}
        layout="vertical"
        onValuesChange={(changed) => {
          if (Object.hasOwn(changed, "displayName"))
            form.setFieldValue(
              ["identity", "displayName"],
              changed.displayName
            );
          if (Object.hasOwn(changed, "description"))
            form.setFieldValue(
              ["identity", "description"],
              changed.description
            );
        }}
        onFinish={(values) =>
          modal.confirm({
            title: mode === "edit" ? "保存产品草稿？" : "创建产品版本草稿？",
            content: "服务端会校验统一身份、实际发布 release、权限和版本合同。",
            okText: "保存草稿",
            cancelText: "取消",
            onOk: () => save(values),
          })
        }
      >
        <Divider orientation="left">基本信息</Divider>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="productKey" label="产品 key" rules={keyRule}>
              <Input
                disabled={mode !== "create" || saving}
                placeholder="例如 media-assistant"
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="version" label="产品版本" rules={versionRule}>
              <Input
                disabled={mode === "edit" || saving}
                placeholder="例如 1.0.0"
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="displayName"
          label="产品名称"
          rules={[{ required: true, whitespace: true, max: 120 }]}
        >
          <Input disabled={saving} />
        </Form.Item>
        <Form.Item name="description" label="产品介绍" rules={[{ max: 2000 }]}>
          <Input.TextArea
            rows={2}
            disabled={saving}
            maxLength={2000}
            showCount
          />
        </Form.Item>
        <Form.Item
          name="supportedPlatforms"
          label="支持平台"
          rules={[
            {
              required: true,
              type: "array",
              min: 1,
              message: "请至少选择一个平台",
            },
          ]}
        >
          <Select
            mode="multiple"
            disabled={saving}
            options={[
              { value: "ios", label: "iOS" },
              { value: "android", label: "Android" },
              { value: "web", label: "Web" },
            ]}
          />
        </Form.Item>
        <Divider orientation="left">发布能力与权限</Divider>
        {loadError && (
          <Alert
            type="error"
            showIcon
            message={loadError}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item
          name="releaseIds"
          label="绑定已发布 Agent release"
          extra="每个 Agent 只能绑定一个版本。声明权限随 release 精确绑定，不能通过表单增删权限。"
          rules={[
            {
              required: true,
              type: "array",
              min: 1,
              message: "请至少选择一个已发布 Agent",
            },
          ]}
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            loading={loading}
            disabled={saving || Boolean(loadError)}
            notFoundContent="暂无可选的已发布 Agent，请先完成 Agent 审核发布"
            placeholder="按 Agent 名称、key 或版本搜索"
            options={releases.map((item) => ({
              value: item.id,
              label: `${item.identity?.displayName || item.agentKey} · ${
                item.agentKey
              } · v${item.version} · ${item.contractHash?.slice(0, 8)}`,
            }))}
          />
        </Form.Item>
        {!loading && unavailableIds.length > 0 && (
          <Alert
            type="error"
            showIcon
            message="原绑定的部分 release 已不再发布，请移除后重新选择。"
            style={{ marginBottom: 16 }}
          />
        )}
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          scroll={{ x: 650 }}
          columns={dependencyColumns}
          dataSource={releases.filter((item) => selectedIds.includes(item.id))}
          locale={{ emptyText: "选择发布版本后展示真实权限合同" }}
        />
        <Divider orientation="left">产品展示身份</Divider>
        <Text type="secondary">
          统一使用上方产品名称与介绍。下面配置头像、形状、标记和颜色。
        </Text>
        <IdentityFields
          form={form}
          disabled={saving}
          onUploadBusyChange={setUploading}
          showPresentationFields={false}
          presentation={{
            displayName: productName,
            description: productDescription,
          }}
        />
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
          />
        )}
        <Space>
          <Button onClick={onClose} disabled={saving || uploading}>
            取消
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
            disabled={
              loading ||
              uploading ||
              Boolean(loadError) ||
              unavailableIds.length > 0
            }
          >
            保存产品草稿
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}

export function ProductsPage({ user: providedUser }) {
  const { message } = AntApp.useApp();
  const user = currentUser(providedUser);
  const canRead = hasAdminPermission(user, "products:read");
  const canWrite = hasAdminPermission(user, "products:write");
  const [filters, setFilters] = useState({ query: "", status: "" });
  const [configuration, setConfiguration] = useState(null);
  const [selected, setSelected] = useState(null);
  const [versionId, setVersionId] = useState("");
  const [action, setAction] = useState("");
  const list = usePagedList("/api/admin/products", filters, canRead);
  const details = useDetail(
    canRead && selected?.id
      ? `/api/admin/products/${encodeURIComponent(selected.id)}${
          versionId ? `?productVersionId=${encodeURIComponent(versionId)}` : ""
        }`
      : null
  );
  const detail = details.data;
  const product =
    detail?.product &&
    detail.product.id === selected?.id &&
    (!versionId || detail.product.productVersionId === versionId)
      ? detail.product
      : null;
  const selectProduct = (row) => {
    setVersionId(row.productVersionId || "");
    setSelected(row);
  };
  const refresh = () => {
    list.load(list.page);
    if (selected) details.reload();
  };
  const act = async (kind, row) => {
    if (!row.productVersionId) {
      message.error("缺少产品版本 ID，请刷新产品详情");
      return;
    }
    setAction(`${kind}:${row.productVersionId}`);
    try {
      await request(
        `/api/admin/products/${encodeURIComponent(row.id)}/${kind}`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey(kind, row.productVersionId),
          },
          body: JSON.stringify({ productVersionId: row.productVersionId }),
        }
      );
      message.success(
        {
          submit: "已提交产品审核",
          publish: "产品版本已发布",
          pause: "产品版本已暂停",
        }[kind]
      );
      refresh();
    } catch (failure) {
      message.error(errorText(failure));
    } finally {
      setAction("");
    }
  };
  const actions = (row) => (
    <Space wrap onClick={(event) => event.stopPropagation()}>
      {row.status === "draft" && (
        <>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setConfiguration({ mode: "edit", product: row })}
          >
            编辑草稿
          </Button>
          <ConfirmAction
            title="提交产品审核？"
            content="检查身份与所有依赖 release 的发布门禁。"
            loading={action === `submit:${row.productVersionId}`}
            onConfirm={() => act("submit", row)}
          >
            提交审核
          </ConfirmAction>
        </>
      )}
      {row.status === "review" && (
        <ConfirmAction
          type="primary"
          title="发布产品版本？"
          content="产品会进入 App 目录。用户仍需明确 consent 才能启用。"
          loading={action === `publish:${row.productVersionId}`}
          onConfirm={() => act("publish", row)}
        >
          发布
        </ConfirmAction>
      )}
      {row.status === "published" && (
        <ConfirmAction
          title="暂停产品版本？"
          content="该版本的 entitlement 将失效，相关 Agent 投影会清理。请确认影响范围。"
          loading={action === `pause:${row.productVersionId}`}
          onConfirm={() => act("pause", row)}
        >
          暂停
        </ConfirmAction>
      )}
      {row.status === "paused" && (
        <ConfirmAction
          title="恢复发布产品版本？"
          content="服务端会重新检查该版本合同和依赖；不会替用户重新确认权限。"
          loading={action === `publish:${row.productVersionId}`}
          onConfirm={() => act("publish", row)}
        >
          恢复发布
        </ConfirmAction>
      )}
    </Space>
  );
  if (!canRead) return <PermissionDenied permission="products:read" />;
  const columns = [
    {
      title: "产品",
      key: "product",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <strong>{row.displayName || row.productKey}</strong>
          <Text type="secondary">{row.productKey}</Text>
        </Space>
      ),
    },
    { title: "当前管理版本", dataIndex: "version" },
    {
      title: "版本状态",
      dataIndex: "status",
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: "平台",
      dataIndex: "supportedPlatforms",
      render: (values) => values?.join("、"),
    },
    {
      title: "依赖",
      dataIndex: "dependencies",
      render: (values) => `${values?.length || 0} 个 Agent`,
    },
    {
      title: "合同",
      dataIndex: "contractHash",
      render: (value) =>
        value ? (
          <Text code>{value.slice(0, 12)}…</Text>
        ) : (
          <Tag color="red">缺失</Tag>
        ),
    },
    { title: "更新时间", dataIndex: "updatedAt" },
    ...(canWrite
      ? [{ title: "操作", key: "actions", render: (_, row) => actions(row) }]
      : []),
  ];
  return (
    <>
      <PageHeading
        title="产品目录"
        description="按产品维护多版本草稿、发布依赖和用户授权合同；App 仅消费已发布版本。"
        onRefresh={refresh}
        extra={
          canWrite && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setConfiguration({ mode: "create" })}
            >
              创建产品草稿
            </Button>
          )
        }
      />
      <div className="page-surface">
        <SearchToolbar statusOptions={productStatuses} onSubmit={setFilters} />
        <ListTable
          list={list}
          columns={columns}
          onSelect={selectProduct}
          empty="暂无产品，请先发布 Agent release 后创建产品"
        />
      </div>
      <Drawer
        title={
          selected
            ? `${selected.displayName || selected.productKey} · 版本管理`
            : "产品详情"
        }
        width={820}
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setVersionId("");
        }}
        extra={
          <Button onClick={details.reload} icon={<ReloadOutlined />}>
            刷新详情
          </Button>
        }
      >
        {!detail && !details.error && (
          <Alert type="info" showIcon message="正在读取产品版本详情" />
        )}
        {details.error && (
          <Alert type="error" showIcon message={details.error} />
        )}
        {product && (
          <>
            <Space wrap style={{ marginBottom: 20 }}>
              <Text strong>查看版本</Text>
              <Select
                aria-label="查看产品版本"
                value={product.productVersionId}
                style={{ width: 240 }}
                options={(detail.versions || []).map((item) => ({
                  value: item.productVersionId,
                  label: `v${item.version} · ${
                    statusLabels[item.status] || item.status
                  }`,
                }))}
                onChange={setVersionId}
              />
              {canWrite && (
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setConfiguration({ mode: "version", product })}
                >
                  创建新版本
                </Button>
              )}
            </Space>
            <IdentityPreview identity={product.identity} />
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                { label: "产品 key", children: product.productKey },
                {
                  label: "版本 / 状态",
                  children: (
                    <Space>
                      {product.version}
                      <StatusTag value={product.status} />
                    </Space>
                  ),
                },
                { label: "产品介绍", children: product.description || "--" },
                {
                  label: "支持平台",
                  children: product.supportedPlatforms?.join("、"),
                },
                {
                  label: "合同 hash",
                  children: (
                    <Text code copyable>
                      {product.contractHash}
                    </Text>
                  ),
                },
              ]}
            />
            {canWrite && (
              <div style={{ marginTop: 16 }}>{actions(product)}</div>
            )}
            <Divider orientation="left">Agent 依赖与发布门禁</Divider>
            <Table
              size="small"
              rowKey={(row) => `${row.agentKey}-${row.agentReleaseId}`}
              pagination={false}
              dataSource={product.dependencies || []}
              columns={dependencyColumns}
              scroll={{ x: 700 }}
            />
            <Divider orientation="left">用户授权汇总</Divider>
            <Table
              size="small"
              rowKey="status"
              pagination={false}
              dataSource={detail.entitlementSummary || []}
              columns={[
                {
                  title: "授权状态",
                  dataIndex: "status",
                  render: (value) => <StatusTag value={value} />,
                },
                { title: "用户数", dataIndex: "count" },
              ]}
              locale={{ emptyText: "暂无该版本用户授权记录" }}
            />
            <Divider orientation="left">版本状态历史</Divider>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={detail.history || []}
              columns={historyColumns}
              scroll={{ x: 650 }}
            />
          </>
        )}
      </Drawer>
      <ProductFormModal
        configuration={configuration}
        onClose={() => setConfiguration(null)}
        onSaved={(saved) => {
          setConfiguration(null);
          list.load(1);
          if (saved?.id) selectProduct(saved);
          if (selected) details.reload();
        }}
      />
    </>
  );
}
export function PublishingPages({ resource, user }) {
  return resource === "products" ? (
    <ProductsPage user={user} />
  ) : (
    <AgentReleasesPage user={user} />
  );
}
export default PublishingPages;
