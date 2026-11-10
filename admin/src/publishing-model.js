export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function validateAvatarFile(file) {
  if (!file || !IMAGE_TYPES.includes(file.type))
    throw new Error("请选择 PNG、JPEG 或 WebP 图片");
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("图片大小必须在 1 字节至 2 MB 之间");
}

export function avatarPreviewFrame(identity, size) {
  const borderRadius =
    identity?.shape === "circle"
      ? size / 2
      : identity?.shape === "rounded"
        ? Math.min(12, size * 0.24)
        : Math.min(16, size * 0.32);
  return {
    width: size,
    height: size,
    flexShrink: 0,
    overflow: "hidden",
    borderRadius,
    border: "3px solid #FFFFFF",
    boxSizing: "border-box",
    background: identity?.background || identity?.colors?.background,
    color: identity?.foreground || identity?.colors?.foreground,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: Math.round(size * 0.4),
    fontWeight: 800,
  };
}

export function identityFormValues(identity = {}, key = "") {
  return {
    key: identity.key || key,
    avatarKind: identity.avatarKind || "agent-mark",
    displayName: identity.displayName || "",
    description: identity.description || "",
    mark: identity.mark || "",
    shape: identity.shape || "squircle",
    background: identity.colors?.background || "#E9EDF5",
    foreground: identity.colors?.foreground || "#172B4D",
    accent: identity.colors?.accent || "#1677FF",
    avatar: identity.avatar,
  };
}

export function buildIdentity(
  values,
  key,
  timestamp = new Date().toISOString()
) {
  if (values?.avatarKind === "agent-image" && !values.avatar?.assetId)
    throw new Error("请先上传并保存头像图片");
  return {
    key,
    avatarKind: values.avatarKind,
    ...(values.avatarKind === "agent-image" ? { avatar: values.avatar } : {}),
    displayName: String(values.displayName || "").trim(),
    description: String(values.description || ""),
    mark: String(values.mark || "").trim(),
    shape: values.shape,
    colors: {
      background: values.background,
      foreground: values.foreground,
      accent: values.accent,
    },
    published: false,
    source: "admin",
    updatedAt: timestamp,
  };
}

export function bindPublishedDependencies(ids, releases) {
  if (!Array.isArray(ids) || !ids.length)
    throw new Error("请至少选择一个已发布 Agent release");
  if (new Set(ids).size !== ids.length)
    throw new Error("不能重复绑定同一 release");
  const keys = new Set();
  return ids.map((id) => {
    const release = releases.find((item) => item.id === id);
    if (!release || release.catalogStatus !== "published")
      throw new Error("所选 release 已不可用，请刷新已发布版本");
    if (!Array.isArray(release.declaredScopes))
      throw new Error("release 缺少权限合同，请检查服务端数据");
    if (keys.has(release.agentKey))
      throw new Error("同一个 Agent 只能绑定一个 release，请调整选择");
    keys.add(release.agentKey);
    return {
      agentKey: release.agentKey,
      agentReleaseId: release.id,
      version: release.version,
      scopes: [...release.declaredScopes],
    };
  });
}

export function buildProductFields(values, releases) {
  return {
    version: values.version,
    displayName: String(values.displayName || "").trim(),
    description: values.description || "",
    identity: buildIdentity(
      {
        ...values.identity,
        displayName: values.displayName,
        description: values.description || "",
      },
      values.productKey
    ),
    supportedPlatforms: values.supportedPlatforms,
    dependencies: bindPublishedDependencies(values.releaseIds, releases),
  };
}
