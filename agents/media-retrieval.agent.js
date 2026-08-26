export default {
  key: "media-retrieval",
  name: "媒体检索 Agent",
  version: "0.1.0",
  category: "media-retrieval",
  description: "在用户已上传的私有图片和视频中进行受控语义检索。",
  capabilities: [
    "private-media-index",
    "semantic-media-search",
    "video-frame-retrieval",
  ],
  permissions: [
    "private-media:read",
    "private-media-index:write",
    "agent-runs:read",
  ],
  identity: {
    avatarKind: "agent-mark",
    mark: "检",
    shape: "squircle",
    colors: { background: "#14532d", foreground: "#ffffff", accent: "#facc15" },
  },
};
