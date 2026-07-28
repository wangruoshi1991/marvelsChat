import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  avatarMultiviewPromptVersion,
  buildAvatarMultiviewPrompt,
} = await import("../src/avatar-3d-multiview-prompt.js");

test("prompt planner emits a fixed four-view reconstruction contract", () => {
  const result = buildAvatarMultiviewPrompt({});

  assert.equal(result.version, avatarMultiviewPromptVersion);
  assert.deepEqual(result.plan, {
    bodyShape: "balanced",
    pose: "natural",
    outfit: "smart_casual",
    userDescription: "",
  });
  for (const phrase of [
    "同一位成年人",
    "正面、左侧、背面、右侧",
    "头顶和鞋底均完整",
    "自然 A-pose",
    "同一发型、同一服装、同一身体比例",
    "无文字、无水印、无道具、无其他人物",
    "不要虚构或改变可识别的脸部特征",
  ]) {
    assert.match(result.providerPrompt, new RegExp(phrase));
  }
});

test("prompt planner accepts only supported body, pose, and outfit choices", () => {
  for (const input of [
    { bodyShape: "strong" },
    { pose: "dynamic" },
    { outfit: "costume" },
  ]) {
    assert.throws(
      () => buildAvatarMultiviewPrompt(input),
      (error) => error?.details?.code === "INVALID_AVATAR_BRIEF",
    );
  }
});

test("prompt planner normalizes a short description and keeps fixed constraints authoritative", () => {
  const result = buildAvatarMultiviewPrompt({
    bodyShape: "athletic",
    pose: "natural",
    outfit: "sport",
    userDescription: "  蓝白色运动套装\n气质自信\u0000  ",
  });

  assert.equal(result.plan.userDescription, "蓝白色运动套装 气质自信");
  assert.match(result.providerPrompt, /健康自然的运动感/);
  assert.match(result.providerPrompt, /蓝白色运动套装 气质自信/);
  assert.ok(
    result.providerPrompt.indexOf("蓝白色运动套装 气质自信")
      < result.providerPrompt.indexOf("以下构图与一致性要求优先于用户补充描述"),
  );
  assert.equal(result.providerPrompt.includes("\u0000"), false);
});

test("prompt planner rejects overlong descriptions instead of silently changing them", () => {
  assert.throws(
    () => buildAvatarMultiviewPrompt({ userDescription: "衣".repeat(241) }),
    (error) => error?.details?.code === "AVATAR_BRIEF_TOO_LONG",
  );
});
