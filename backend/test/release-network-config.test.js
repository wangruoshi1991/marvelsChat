import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readRepoFile = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8");

test("iOS Release uses the approved IP HTTPS origin without HTTP ATS exceptions", async () => {
  const [project, infoPlist] = await Promise.all([
    readRepoFile("MiaoxunRN/ios/MiaoxunRN.xcodeproj/project.pbxproj"),
    readRepoFile("MiaoxunRN/ios/MiaoxunRN/Info.plist"),
  ]);

  assert.match(project, /MIAOXUN_API_BASE_URL = "https:\/\/8\.153\.167\.11";/);
  assert.doesNotMatch(project, /MIAOXUN_TEMP_IP_TESTFLIGHT|http:\/\/8\.153\.167\.11/);
  assert.doesNotMatch(infoPlist, /NSExceptionDomains|NSExceptionAllowsInsecureHTTPLoads/);
  assert.match(infoPlist, /<key>NSAllowsArbitraryLoads<\/key>\s*<false\/>/);
});

test("mobile Release guards require HTTPS and reject loopback without banning public IPs", async () => {
  const [iosProject, androidBuild] = await Promise.all([
    readRepoFile("MiaoxunRN/ios/MiaoxunRN.xcodeproj/project.pbxproj"),
    readRepoFile("MiaoxunRN/android/app/build.gradle"),
  ]);

  for (const source of [iosProject, androidBuild]) {
    assert.match(source, /https/);
    assert.match(source, /localhost/);
    assert.match(source, /127\\?\.0\\?\.0\\?\.1|127\.0\.0\.1/);
  }
  assert.doesNotMatch(androidBuild, /Release builds require MIAOXUN_API_BASE_URL to be an HTTPS domain/);
  assert.doesNotMatch(androidBuild, /normalized ==~ \/\^https:.*\[0-9\]/);
});
