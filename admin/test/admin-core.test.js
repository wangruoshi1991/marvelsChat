import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminProfileUpdate } from "../admin-core.js";

test("profile updates distinguish omitted display years from zero and never write GPS fields", () => {
  const values = {
    nickname: "  测试用户  ",
    headline: "  独立设计师  ",
    publicLocation: "  上海  ",
    experienceYears: "0",
    languages: ["zh", "en"],
    latitude: 31.2,
    longitude: 121.5,
  };
  const update = buildAdminProfileUpdate(values);
  assert.equal(update.nickname, "测试用户");
  assert.equal(update.headline, "独立设计师");
  assert.equal(update.publicLocation, "上海");
  assert.equal(update.experienceYears, 0);
  assert.equal("latitude" in update, false);
  assert.equal("longitude" in update, false);
  assert.deepEqual(
    buildAdminProfileUpdate({ nickname: "测试用户", languages: [] }),
    {
      nickname: "测试用户",
      bio: "",
      community: "",
      activityArea: "",
      headline: "",
      publicLocation: "",
      experienceYears: null,
      languages: [],
    }
  );
});

test("profile updates reject invalid years, unsupported language codes and oversized identity text", () => {
  const values = { nickname: "测试用户", languages: [] };
  for (const experienceYears of ["-1", "81", "3.5", "NaN", "Infinity", "2年"]) {
    assert.throws(
      () => buildAdminProfileUpdate({ ...values, experienceYears }),
      /0 至 80/
    );
  }
  for (const languages of [["zh", "zh"], ["unknown"], "zh"]) {
    assert.throws(
      () => buildAdminProfileUpdate({ ...values, languages }),
      /选择语言/
    );
  }
  assert.equal(
    buildAdminProfileUpdate({ ...values, experienceYears: "80" })
      .experienceYears,
    80
  );
  assert.throws(
    () => buildAdminProfileUpdate({ ...values, headline: "字".repeat(81) }),
    /身份标题最多 80/
  );
  assert.throws(
    () =>
      buildAdminProfileUpdate({ ...values, publicLocation: "字".repeat(121) }),
    /公开城市最多 120/
  );
});
