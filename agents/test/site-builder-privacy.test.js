import assert from "node:assert/strict";
import test from "node:test";

import siteBuilder from "../site-builder.agent.js";

test("site builder excludes storage identifiers from model context", async () => {
  const plan = await siteBuilder.plan({
    input: "做一个摄影主页",
    user: { displayName: "测试用户", aiId: "900000000000001" },
    appContext: {
      profile: { nickname: "测试用户", stationConfig: { language: "zh" } },
      stationContent: {
        mediaAssets: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            kind: "image",
            mimeType: "image/jpeg",
            width: 1200,
            height: 900,
            caption: "海边",
            status: "uploaded",
            storageKey: "users/private/original.jpg",
            originalFilename: "身份证旁的自拍.jpg",
          },
        ],
      },
    },
  });

  assert.match(plan.user, /11111111-1111-4111-8111-111111111111/);
  assert.match(plan.user, /海边/);
  assert.doesNotMatch(plan.user, /users\/private\/original\.jpg/);
  assert.doesNotMatch(plan.user, /身份证旁的自拍\.jpg/);
  assert.doesNotMatch(plan.user, /storageKey|originalFilename/);
});
