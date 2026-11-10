import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Typography,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { apiOrigin, readAuth, request } from "./platform.js";
import { avatarPreviewFrame, validateAvatarFile } from "./publishing-model.js";

const { Text } = Typography;
const colorRule = [
  {
    required: true,
    pattern: /^#[0-9a-fA-F]{6}$/,
    message: "请输入 #RRGGBB 颜色",
  },
];
const shapeNames = {
  circle: "圆形",
  squircle: "连续圆角",
  rounded: "圆角矩形",
};

export function IdentityPreview({ identity }) {
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const image = identity?.avatar;
  const imageMode = identity?.avatarKind === "agent-image";
  useEffect(() => {
    setImageUrl("");
    setError("");
    if (!imageMode || !image?.assetId || !image?.sha256) return;
    const controller = new AbortController();
    let localUrl;
    const token = readAuth().token;
    fetch(
      `${apiOrigin()}/api/admin/agent-avatar-assets/${encodeURIComponent(
        image.assetId
      )}/${encodeURIComponent(image.sha256)}.webp`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`头像预览读取失败（${response.status}）`);
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        localUrl = URL.createObjectURL(blob);
        setImageUrl(localUrl);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => {
      controller.abort();
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [imageMode, image?.assetId, image?.sha256]);
  const previewContent = imageMode ? (
    imageUrl ? (
      <img
        src={imageUrl}
        alt={identity?.displayName || "头像预览"}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    ) : (
      <Text type="secondary" style={{ fontSize: 10 }}>
        {error ? "失败" : image?.assetId ? "读取中" : "待上传"}
      </Text>
    )
  ) : (
    String(identity?.mark || "").slice(0, 4)
  );
  return (
    <Space align="start" style={{ marginBottom: 18 }}>
      <div aria-label="身份头像预览" style={avatarPreviewFrame(identity, 76)}>
        {previewContent}
      </div>
      <Space direction="vertical" size={4}>
        <Text strong>{identity?.displayName || "填写显示名称"}</Text>
        <Text type="secondary">
          {identity?.description || "身份预览会随表单更新"}
        </Text>
        <Space align="center">
          {[32, 48].map((size) => (
            <div
              key={size}
              aria-label={`${size} 像素手机头像预览`}
              style={avatarPreviewFrame(identity, size)}
            >
              {previewContent}
            </div>
          ))}
          <Text type="secondary">手机常用尺寸</Text>
        </Space>
        {error && <Text type="danger">{error}</Text>}
      </Space>
    </Space>
  );
}

function AvatarAssetInput({ value, onChange, disabled, onBusyChange, id }) {
  const fileInput = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      validateAvatarFile(file);
      setBusy(true);
      onBusyChange?.(true);
      const asset = await request("/api/admin/agent-avatar-assets", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "Idempotency-Key": `admin-avatar-${globalThis.crypto.randomUUID()}`,
        },
        body: file,
      });
      onChange?.(asset);
    } catch (failure) {
      setError(
        `${failure.message}${
          failure.requestId ? `（请求 ID：${failure.requestId}）` : ""
        }`
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space>
        <Button
          icon={<UploadOutlined />}
          loading={busy}
          disabled={disabled || busy}
          onClick={() => fileInput.current?.click()}
        >
          {value ? "更换头像图片" : "上传头像图片"}
        </Button>
        <input
          id={id}
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="选择头像图片"
          disabled={disabled || busy}
          onChange={upload}
          style={{ display: "none" }}
        />
      </Space>
      <Text type="secondary">
        PNG / JPEG / WebP，最大 2 MB。服务端生成 512 × 512
        头像，非正方形图片按中心裁切。建议主体居中并留出边缘，透明区域使用身份底色；不支持外部图片地址。
      </Text>
      {value?.assetId && (
        <Text type="secondary">
          已上传 · {value.width} × {value.height} · {value.mimeType}
        </Text>
      )}
      {error && <Alert type="error" showIcon message={error} />}
    </Space>
  );
}

export function IdentityFields({
  form,
  disabled = false,
  onUploadBusyChange,
  showPresentationFields = true,
  presentation,
}) {
  const identity = Form.useWatch("identity", form) || {};
  return (
    <>
      <IdentityPreview identity={{ ...identity, ...presentation }} />
      {showPresentationFields && (
        <>
          <Form.Item
            name={["identity", "displayName"]}
            label="身份显示名称"
            rules={[
              {
                required: true,
                whitespace: true,
                max: 120,
                message: "请输入 1–120 字显示名称",
              },
            ]}
          >
            <Input disabled={disabled} />
          </Form.Item>
          <Form.Item
            name={["identity", "description"]}
            label="身份简介"
            rules={[{ max: 2000 }]}
          >
            <Input.TextArea
              rows={2}
              maxLength={2000}
              showCount
              disabled={disabled}
            />
          </Form.Item>
        </>
      )}
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            name={["identity", "avatarKind"]}
            label="头像方式"
            rules={[{ required: true }]}
          >
            <Select
              disabled={disabled}
              options={[
                { value: "agent-mark", label: "图形标记" },
                { value: "agent-image", label: "上传图片" },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name={["identity", "shape"]}
            label="头像形状"
            rules={[{ required: true }]}
          >
            <Select
              disabled={disabled}
              options={Object.entries(shapeNames).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item
        noStyle
        shouldUpdate={(previous, current) =>
          previous.identity?.avatarKind !== current.identity?.avatarKind
        }
      >
        {({ getFieldValue }) =>
          getFieldValue(["identity", "avatarKind"]) === "agent-image" ? (
            <>
              <Alert
                type="warning"
                showIcon
                message="图片头像发布需要配套 App 版本支持"
                description="可上传并保存草稿。服务端在客户端验收和分发完成前会阻止图片身份进入审核或发布，请按真实门禁结果处理。"
                style={{ marginBottom: 16 }}
              />
              <Form.Item
                name={["identity", "avatar"]}
                label="头像文件"
                rules={[{ required: true, message: "请上传头像图片" }]}
              >
                <AvatarAssetInput
                  disabled={disabled}
                  onBusyChange={onUploadBusyChange}
                />
              </Form.Item>
            </>
          ) : null
        }
      </Form.Item>
      <Form.Item
        name={["identity", "mark"]}
        label="统一标记"
        extra="图形头像与 App 的统一身份合同均保留此字段。"
        rules={[
          {
            required: true,
            whitespace: true,
            max: 40,
            message: "请输入 1–40 字标记",
          },
        ]}
      >
        <Input disabled={disabled} />
      </Form.Item>
      <Row gutter={16}>
        {[
          ["background", "背景色"],
          ["foreground", "前景色"],
          ["accent", "强调色"],
        ].map(([name, label]) => (
          <Col xs={24} sm={8} key={name}>
            <Form.Item
              name={["identity", name]}
              label={label}
              rules={colorRule}
            >
              <Input
                disabled={disabled}
                maxLength={7}
                prefix={
                  <span
                    aria-hidden
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      border: "1px solid #ccc",
                      background: identity[name],
                    }}
                  />
                }
              />
            </Form.Item>
          </Col>
        ))}
      </Row>
    </>
  );
}
