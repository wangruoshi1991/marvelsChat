import { HttpError } from "./http-error.js";

export const avatar3dCostVersion = "2026-07-21";
export const avatar3dDefaultQualityPreset = "ultra";

const presetDefinitions = Object.freeze({
  standard: Object.freeze({
    label: "标准",
    description: "高清纹理，适合个人主页和日常查看",
    geometryQuality: "standard",
    textureQuality: "detailed",
  }),
  ultra: Object.freeze({
    label: "超精细",
    description: "适合大屏查看和专业处理",
    geometryQuality: "ultra",
    textureQuality: "detailed",
  }),
});

export const avatar3dQualityPresetIds = Object.freeze(Object.keys(presetDefinitions));

const qualityCost = (runtime, preset) => {
  const value = Number(runtime?.qualityCostsFen?.[preset]);
  if (Number.isFinite(value) && value >= 0) return value;
  const fallbacks = { standard: 280, ultra: 420 };
  return fallbacks[preset];
};

export function resolveAvatar3dQuality({ preset, style, runtime }) {
  const definition = presetDefinitions[preset];
  if (!definition) {
    throw new HttpError(400, "Avatar quality is invalid.", {
      code: "INVALID_QUALITY_PRESET",
    });
  }
  const styleCost = style === "cartoon" ? Number(runtime?.cartoonStyleCostFen || 0) : 0;
  return {
    id: preset,
    geometryQuality: definition.geometryQuality,
    textureQuality: definition.textureQuality,
    estimatedCostFen: qualityCost(runtime, preset) + styleCost,
  };
}

export function publicAvatar3dQualityCatalog(runtime) {
  return avatar3dQualityPresetIds.map((id) => ({
    id,
    label: presetDefinitions[id].label,
    description: presetDefinitions[id].description,
    estimatedCostFen: resolveAvatar3dQuality({ preset: id, style: "realistic", runtime })
      .estimatedCostFen,
  }));
}
