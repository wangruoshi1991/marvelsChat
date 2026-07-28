import { HttpError } from "./http-error.js";

export const avatarMultiviewPromptVersion = "avatar-multiview-v1";

const bodyShapes = new Map([
  ["balanced", "身体比例匀称自然"],
  ["slender", "身形修长匀称，比例自然"],
  ["athletic", "健康自然的运动感，肌肉不过度夸张"],
]);

const poses = new Map([
  ["natural", "中性自然站姿"],
]);

const outfits = new Map([
  ["business", "简洁合体的商务服装"],
  ["smart_casual", "简洁合体的商务休闲服装"],
  ["casual", "结构清楚的日常休闲服装"],
  ["sport", "结构清楚的运动服装"],
  ["formal", "简洁合体的正式服装"],
]);

const invalidBrief = () => new HttpError(422, "Avatar preferences are invalid.", {
  code: "INVALID_AVATAR_BRIEF",
});

const normalizeDescription = (value) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw invalidBrief();
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length > 240) {
    throw new HttpError(422, "Avatar description is too long.", {
      code: "AVATAR_BRIEF_TOO_LONG",
    });
  }
  return normalized;
};

export const buildAvatarMultiviewPrompt = ({
  bodyShape = "balanced",
  pose = "natural",
  outfit = "smart_casual",
  userDescription = "",
} = {}) => {
  if (!bodyShapes.has(bodyShape) || !poses.has(pose) || !outfits.has(outfit)) {
    throw invalidBrief();
  }
  const normalizedDescription = normalizeDescription(userDescription);
  const preferences = [
    bodyShapes.get(bodyShape),
    poses.get(pose),
    outfits.get(outfit),
  ];
  if (normalizedDescription) preferences.push(`用户补充描述：${normalizedDescription}`);

  const providerPrompt = [
    "根据参考照片生成同一位成年人的写实全身人物四视图，用于后续 3D 重建。只保留参考照片中真实可见、可识别的脸部身份特征和发型，不要虚构或改变可识别的脸部特征，不进行夸张美颜。",
    `造型偏好：${preferences.join("；")}。照片中的身体和服装不是必须复刻的真实信息。`,
    "以下构图与一致性要求优先于用户补充描述：一次输出四张独立图片，顺序严格为正面、左侧、背面、右侧；四张必须是同一位成年人、同一身份、同一发型、同一服装、同一身体比例和同一颜色。",
    "每张均为全身完整入镜，头顶和鞋底均完整且不裁切；采用自然 A-pose，双臂与躯干分开，双腿不过度并拢；固定镜头高度、焦距和人物尺度。",
    "使用白色或浅灰纯背景、中性均匀光、写实照片风格；服装完整覆盖且结构清楚；无滤镜、无文字、无水印、无道具、无其他人物。",
  ].join("\n");

  return {
    version: avatarMultiviewPromptVersion,
    plan: {
      bodyShape,
      pose,
      outfit,
      userDescription: normalizedDescription,
    },
    providerPrompt,
  };
};
