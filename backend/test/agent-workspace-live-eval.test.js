import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listAgents } from "../../agents/registry.js";
import { readLiveEvaluationCases, gradeLiveWorkspaceDecision, runWorkspaceLiveEvaluation, createRegisteredEvaluationCatalogueSnapshot,
  createAuthorizedEvaluationCatalogueSnapshot } from "../scripts/agent-workspace-live-eval.js";

const planningStep = (key, capability, goal, dependsOn = []) => ({ key, agentId: capability === "media.select" ? "album-manager" : "site-builder", capability, goal, dependsOn, contextRefIndexes: [] });
const outputs = [
  { type: "plan", summary: "纯文字页面", steps: [planningStep("intro", "site.compose", "制作摄影兴趣的纯文字私有介绍页面，无需素材")] },
  { type: "plan", summary: "先选材再制作", steps: [planningStep("find", "media.select", "寻找海边日落照片，找不到明确告知"), planningStep("compose", "site.compose", "使用选材成果制作私有页面，不公开", ["find"])] },
  { type: "plan", summary: "两组独立查找", steps: [planningStep("seaside", "media.select", "寻找海边日落照片"), planningStep("cat", "media.select", "寻找室内猫咪照片")] },
  { type: "clarify", question: "当前没有购票和支付能力，无法执行；请补充已支持的目标。" },
];
const textDataset = new URL("../../agents/evals/workspace/text-goals-v1.jsonl", import.meta.url);
const contributionStep = (key, agentId, capability, goal, dependsOn = []) => ({ key, agentId, capability, goal, dependsOn, contextRefIndexes: [] });
const textOutputs = [
  { type: "plan", summary: "整理公开项目记录", steps: [contributionStep("brief", "file-preprocessor", "text.summarize", "整理项目摘要，突出进度、风险和下一步")] },
  { type: "plan", summary: "先分镜，再依据成果写脚本", steps: [
    contributionStep("story", "comic-diary", "comic.storyboard", "把公开故事整理为文字分镜"),
    contributionStep("script", "video-production", "video.script", "依据交付的分镜写30秒视频脚本，延续事件顺序", ["story"]),
  ] },
  { type: "plan", summary: "分别创作，最后汇总", steps: [
    contributionStep("story", "comic-diary", "comic.storyboard", "编写公开故事的文字分镜"),
    contributionStep("appearance", "virtual-character", "character.advise", "独立提出主角形象建议"),
    contributionStep("synthesis", "miaoxun-butler", "text.synthesize", "汇总两份专业成果并指出冲突设定", ["story", "appearance"]),
  ] },
  { type: "plan", summary: "直接编写文字脚本", steps: [contributionStep("script", "video-production", "video.script", "编写30秒修伞店视频脚本，表现收到旧伞、修补和交还")] },
  { type: "clarify", question: "当前不支持生成漫画最终图片，无法交付这类成品。" },
];
const fushengRuntime = { profile: "fusheng-gpt-6.1-sol", baseUrl: "https://fushengyunsuan.cn/v1/chat/completions",
  model: "gpt-6.1-sol", apiKey: "test-secret-never-network" };
const response = (output, overrides = {}) => new Response(JSON.stringify({ model: "deepseek-v4.1-flash",
  usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
  choices: [{ finish_reason: "stop", message: { content: typeof output === "string" ? output : JSON.stringify(output) } }], ...overrides }));
const events = async report => (await fs.readFile(report, "utf8")).trim().split("\n").map(line => JSON.parse(line));
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-live-eval-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const catalogueSnapshot = await createRegisteredEvaluationCatalogueSnapshot();
  return { runtime: { baseUrl: "https://api.deepseek.com/chat/completions", apiKey: "test-secret-never-network", model: "deepseek-v4-flash" },
    catalogueSnapshot,
    maxCostFen: 100, maxCalls: 4, prices: { inputYuanPerMillion: 2, outputYuanPerMillion: 8 }, reportPath: path.join(dir, "new-report.jsonl") };
}

test("live dataset contains public initial goals without private data or fabricated completed results", async () => {
  const cases = await readLiveEvaluationCases();
  assert.equal(cases.length, 5);
  assert.deepEqual(cases.map(item => item.expected.shape), ["direct-site", "media-then-site", "parallel-media", "missing-capability", "missing-capability"]);
  assert.ok(cases.every(item => Object.keys(item.input).length === 1));
});

test("strict live grader checks appropriate division, dependencies and requested conditions", async t => {
  const options = await setup(t); const cases = (await readLiveEvaluationCases()).filter(item => item.catalogueSource === "registered-evaluation");
  for (const [index, item] of cases.entries()) assert.equal(gradeLiveWorkspaceDecision(item, JSON.stringify(outputs[index]), options.catalogueSnapshot.entries).passed, true);
  assert.equal(gradeLiveWorkspaceDecision(cases[0], JSON.stringify(outputs[1]), options.catalogueSnapshot.entries).passed, false, "extra agent is not harmless JSON success");
  const adaptive = { ...outputs[1], steps: [outputs[1].steps[0]] };
  assert.equal(gradeLiveWorkspaceDecision(cases[1], JSON.stringify(adaptive), options.catalogueSnapshot.entries).passed, true, "planner may wait for a real retrieval result before deciding the next step");
  const noDependency = structuredClone(outputs[1]); noDependency.steps[1].dependsOn = [];
  assert.equal(gradeLiveWorkspaceDecision(cases[1], JSON.stringify(noDependency), options.catalogueSnapshot.entries).passed, false);
  const lostTerm = structuredClone(outputs[2]); lostTerm.steps[1].goal = "寻找海边日落照片";
  assert.equal(gradeLiveWorkspaceDecision(cases[2], JSON.stringify(lostTerm), options.catalogueSnapshot.entries).passed, false);
  assert.equal(gradeLiveWorkspaceDecision(cases[3], JSON.stringify(outputs[0]), options.catalogueSnapshot.entries).passed, false);
});

test("clarification grader rejects real unsupported-product registration and internal-key failures", async t => {
  const options = await setup(t);
  const item = (await readLiveEvaluationCases()).find(value => value.expected.clarification === "unsupported-product");
  const grade = question => gradeLiveWorkspaceDecision(item, JSON.stringify({ type: "clarify", question }), options.catalogueSnapshot.entries);
  const actual = "当前已授权的可用能力只有相册媒体检索（album-manager: media.select）和私有建站草稿生成（site-builder: site.compose），没有任何购票或支付执行器（缺少可查询车次余票、下单出票及支付票款的能力与相应授权），因此无法购买明天上海到北京的高铁票并支付。请问你是否可以在工作空间中授权并注册购票/支付相关能力，或提供其他可执行的方式？在此之前我不会把该任务转为建站或相册搜索，也不会声称已完成购票。";
  assert.deepEqual(grade(actual).failures.sort(), ["internal_keys_in_user_text", "invented_unsupported_capability_recovery"].sort());
  assert.ok(grade("当前不支持购票和支付。请到我 → 我的 Agent 授权购票服务后新建任务。").failures.includes("invented_unsupported_capability_recovery"));
  assert.equal(grade("妙讯目前不支持购票与支付，无法购买或支付高铁票。").passed, true);
});

test("missing authorization requires a structured exact supported capability request", async t => {
  const options = await setup(t);
  const item = (await readLiveEvaluationCases()).find(value => value.expected.clarification === "missing-authorization");
  const agents = await listAgents();
  const snapshot = await createAuthorizedEvaluationCatalogueSnapshot({ grants: agents.map(agent => ({
    agentId: agent.key, enabled: agent.key !== "site-builder", grantedScopes: agent.permissions,
  })) });
  const grade = decision => gradeLiveWorkspaceDecision(item, JSON.stringify(decision), snapshot.entries, snapshot.unavailableCapabilities);
  const request = { type: "request_access", summary: "摄影兴趣页面需要建站 Agent 的页面生成能力",
    capabilities: [{ agentId: "site-builder", capability: "site.compose" }] };
  assert.equal(grade(request).passed, true);
  assert.deepEqual(grade({ type: "clarify", question: "请去我 → 我的 Agent 授权后新建任务" }).failures, ["missing_structured_authorization_request"]);
  assert.equal(grade({ ...request, capabilities: [{ agentId: "ticket-agent", capability: "tickets.buy" }] }).passed, false);
  assert.equal(grade({ ...request, capabilities: [{ agentId: "album-manager", capability: "media.select" }] }).passed, false);
  assert.ok(grade({ ...request, summary: "建站需要 site-builder / site.compose" }).failures.includes("internal_keys_in_user_text"));
  assert.equal(gradeLiveWorkspaceDecision(item, JSON.stringify(request), options.catalogueSnapshot.entries).passed, false);
});

test("internal identifiers are forbidden in user summaries and goals while structured fields remain valid", async t => {
  const options = await setup(t); const [item] = await readLiveEvaluationCases();
  for (const field of ["summary", "goal"]) {
    const output = structuredClone(outputs[0]);
    if (field === "summary") output.summary += "：site-builder / site.compose";
    else output.steps[0].goal += "：site-builder / site.compose";
    assert.deepEqual(gradeLiveWorkspaceDecision(item, JSON.stringify(output), options.catalogueSnapshot.entries).failures, ["internal_keys_in_user_text"]);
  }
  assert.equal(gradeLiveWorkspaceDecision(item, JSON.stringify(outputs[0]), options.catalogueSnapshot.entries).passed, true);
  const materialCase = (await readLiveEvaluationCases()).find(value => value.expected.shape === "media-then-site");
  const materialOutput = structuredClone(outputs[1]);
  materialOutput.steps[1].goal = `使用 ${materialOutput.steps[0].key} 交付的真实照片生成私有页面`;
  assert.deepEqual(gradeLiveWorkspaceDecision(materialCase, JSON.stringify(materialOutput), options.catalogueSnapshot.entries).failures, ["internal_keys_in_user_text"]);
});

test("every dispatch is durable before request and receipts retain actual model and usage", async t => {
  const options = await setup(t); let calls = 0;
  const summary = await runWorkspaceLiveEvaluation({ ...options, fetchImpl: async (_url, request) => {
    const records = await events(options.reportPath);
    assert.equal(records.at(-1).type, "dispatch"); assert.equal(records.at(-1).callNumber, calls + 1);
    const body = JSON.parse(request.body);
    assert.equal(body.max_tokens, 4096);
    assert.deepEqual(body.response_format, { type: "json_object" });
    const context = JSON.parse(body.messages[1].content);
    assert.equal(Object.hasOwn(context, "remainingLimits"), false);
    assert.deepEqual(context.source, { page: "miao", module: "task-composer" });
    assert.deepEqual(context.steps, []); assert.deepEqual(context.contextRefs, []); assert.deepEqual(context.selectedContext, []);
    assert.deepEqual(context.unavailableCapabilities, []);
    assert.equal(request.redirect, "error");
    return response(outputs[calls++]);
  } });
  assert.equal(summary.passed, true); assert.equal(calls, 4);
  const records = await events(options.reportPath);
  assert.equal(records.filter(item => item.type === "receipt").length, 4);
  assert.ok(records.filter(item => item.type === "receipt").every(item => item.responseModel === "deepseek-v4.1-flash" && item.usage.total === 1200));
  assert.equal(summary.retainedReservationFen, 0);
  assert.ok(summary.estimatedCostFen <= summary.calls, "explicit peak-price per-call ceil is conservative");
  assert.equal(JSON.stringify(records).includes(options.runtime.apiKey), false);
  assert.equal((await fs.stat(options.reportPath)).mode & 0o777, 0o600);
});

test("unknown provider result is not retried and retains its reserved worst-case cost", async t => {
  const options = await setup(t); let calls = 0;
  const summary = await runWorkspaceLiveEvaluation({ ...options, fetchImpl: async () => { calls++; throw new TypeError("network interrupted"); } });
  assert.equal(calls, 1); assert.equal(summary.error.code, "LIVE_EVAL_RESPONSE_UNKNOWN");
  assert.ok(summary.retainedReservationFen > 0); assert.equal(summary.estimatedCostFen, 0);
  const records = await events(options.reportPath); assert.equal(records.filter(item => item.type === "receipt").length, 0);
  assert.equal(records.filter(item => item.type === "dispatch").length, 1);
});

test("missing usage, unexpected model and truncated answer never produce a passing quality report", async t => {
  for (const kind of ["missing-usage", "unexpected-model", "truncated"]) {
    const options = await setup(t); let calls = 0;
    const summary = await runWorkspaceLiveEvaluation({ ...options, fetchImpl: async () => {
      calls++;
      if (kind === "missing-usage") return response(outputs[0], { usage: null });
      if (kind === "unexpected-model") return response(outputs[0], { model: "different-cost-model" });
      return response(outputs[calls - 1], { choices: [{ finish_reason: "length", message: { content: JSON.stringify(outputs[calls - 1]) } }] });
    } });
    assert.equal(summary.passed, false);
    assert.equal(calls, kind === "truncated" ? 4 : 1);
    if (kind === "missing-usage") assert.ok(summary.retainedReservationFen > 0);
  }
});

test("cost/call/request bounds, obsolete catalogue and existing report block all network calls", async t => {
  for (const kind of ["cost", "calls", "request-bytes", "snapshot", "existing-report", "price", "redirect-origin"]) {
    const options = await setup(t); let calls = 0;
    const changes = {};
    if (kind === "cost") changes.maxCostFen = 1;
    if (kind === "calls") changes.maxCalls = 3;
    if (kind === "request-bytes") changes.maxRequestBytes = 1024;
    if (kind === "snapshot") changes.catalogueSnapshot = { ...options.catalogueSnapshot, checkedAt: new Date(Date.now() - 3600000).toISOString() };
    if (kind === "existing-report") await fs.writeFile(options.reportPath, "do not overwrite");
    if (kind === "price") changes.prices = { inputYuanPerMillion: 0.1, outputYuanPerMillion: 1 };
    if (kind === "redirect-origin") changes.runtime = { ...options.runtime, baseUrl: "https://unverified.invalid/chat/completions" };
    await assert.rejects(runWorkspaceLiveEvaluation({ ...options, ...changes, fetchImpl: async () => { calls++; return response(outputs[0]); } }));
    assert.equal(calls, 0, kind);
    if (kind === "existing-report") assert.equal(await fs.readFile(options.reportPath, "utf8"), "do not overwrite");
  }
});

test("provider body bytes and returned tokens are bounded with no automatic second call", async t => {
  for (const kind of ["body", "output-tokens", "input-tokens"]) {
    const options = await setup(t); let calls = 0;
    const summary = await runWorkspaceLiveEvaluation({ ...options, fetchImpl: async () => {
      calls++;
      if (kind === "body") return new Response("a".repeat(131073));
      return response(outputs[0], { usage: kind === "output-tokens"
        ? { prompt_tokens: 1000, completion_tokens: 4097, total_tokens: 5097 }
        : { prompt_tokens: 100000, completion_tokens: 200, total_tokens: 100200 } });
    } });
    assert.equal(summary.passed, false); assert.equal(calls, 1);
    assert.equal(summary.error.code, kind === "body" ? "LIVE_EVAL_RESPONSE_UNKNOWN" : "LIVE_EVAL_RECEIPT_OUTSIDE_RESERVED_CONTRACT");
  }
});

test("current catalogue must be a real registered declaration without forged version or scopes", async t => {
  for (const kind of ["version", "scope", "source", "missing-specialist"]) {
    const options = await setup(t); const snapshot = structuredClone(options.catalogueSnapshot); let calls = 0;
    if (kind === "version") snapshot.entries[0].agentVersion = "9.9.9";
    if (kind === "scope") snapshot.entries[0].requiredScopes = ["agents:invoke"];
    if (kind === "source") snapshot.source = "pretend-granted";
    if (kind === "missing-specialist") snapshot.entries.pop();
    await assert.rejects(runWorkspaceLiveEvaluation({ ...options, catalogueSnapshot: snapshot, fetchImpl: async () => { calls++; } }));
    assert.equal(calls, 0);
  }
});


test("registered evaluation catalogue is derived from executable contracts and is never represented as production grants", async t => {
  const snapshot = await createRegisteredEvaluationCatalogueSnapshot();
  assert.equal(snapshot.source, "registered-evaluation");
  assert.deepEqual(snapshot.entries.map(entry => entry.capability).sort(), [
    "character.advise", "comic.storyboard", "file.summary", "media.select", "model.advise", "site.compose",
    "text.summarize", "text.synthesize", "video.script",
  ]);
  assert.deepEqual(snapshot.unavailableCapabilities, []);
  const options = await setup(t);
  assert.deepEqual(options.catalogueSnapshot.entries, snapshot.entries);
});

test("current authorized missing-site case uses only actual supplied grants and permits no invented specialist", async t => {
  const options = await setup(t);
  const agents = await listAgents();
  const grants = agents.map(agent => ({ agentId: agent.key, enabled: true,
    grantedScopes: agent.key === "site-builder" ? agent.permissions.filter(scope => scope !== "album:read") : agent.permissions }));
  const snapshot = await createAuthorizedEvaluationCatalogueSnapshot({ grants });
  let calls = 0;
  const summary = await runWorkspaceLiveEvaluation({ ...options, catalogueSnapshot: snapshot, maxCalls: 1,
    runtime: { ...options.runtime, model: "deepseek-flash" }, fetchImpl: async (_url, request) => {
      calls++;
      const context = JSON.parse(JSON.parse(request.body).messages[1].content);
      assert.deepEqual(context.availableCapabilities.map(entry => entry.capability).sort(), [
        "character.advise", "comic.storyboard", "file.summary", "media.select", "model.advise",
        "text.summarize", "text.synthesize", "video.script",
      ]);
      assert.deepEqual(context.unavailableCapabilities.map(entry => ({ agentName: entry.agentName, reason: entry.reason })), [{ agentName: "建站 Agent", reason: "authorization_required" }]);
      assert.deepEqual(Object.keys(context.unavailableCapabilities[0]).sort(), ["agentId", "agentName", "capability", "description", "reason", "requiredScopes"]);
      return response({ type: "request_access", summary: "摄影兴趣页面需要建站 Agent 的能力", capabilities: [{ agentId: "site-builder", capability: "site.compose" }] }, { model: "deepseek-flash" });
    } });
  assert.equal(calls, 1); assert.equal(summary.passed, true);
  assert.equal(summary.catalogueSource, "current-authorized");
  assert.equal(summary.completedCases, 1);
});

test("unsupported or inconsistent unavailable diagnostics block the provider before any dispatch", async t => {
  const agents = await listAgents();
  const grants = agents.map(agent => ({ agentId: agent.key, enabled: true,
    grantedScopes: agent.key === "site-builder" ? agent.permissions.filter(scope => scope !== "album:read") : agent.permissions }));
  const snapshot = await createAuthorizedEvaluationCatalogueSnapshot({ grants });
  for (const kind of ["missing", "reason", "agent", "description", "extra-field", "registered-diagnostic"]) {
    const options = await setup(t); let calls = 0;
    const changed = structuredClone(kind === "registered-diagnostic" ? options.catalogueSnapshot : snapshot);
    if (kind === "missing") changed.unavailableCapabilities = [];
    if (kind === "reason") changed.unavailableCapabilities[0].reason = "new_task_required";
    if (kind === "agent") changed.unavailableCapabilities[0].agentName = "购票 Agent";
    if (kind === "description") changed.unavailableCapabilities[0].description = "购票并支付";
    if (kind === "extra-field") changed.unavailableCapabilities[0].privateGrant = "not allowed";
    if (kind === "registered-diagnostic") changed.unavailableCapabilities = snapshot.unavailableCapabilities;
    await assert.rejects(runWorkspaceLiveEvaluation({ ...options, catalogueSnapshot: changed, fetchImpl: async () => { calls++; } }));
    assert.equal(calls, 0, kind);
  }
  await assert.rejects(createAuthorizedEvaluationCatalogueSnapshot({ grants: [...grants, grants[0]] }), /unique/);
});

test("real camelCase planner keys fail the strict contract instead of being normalized or retried", async t => {
  const options = await setup(t);
  const item = (await readLiveEvaluationCases()).find(value => value.expected.shape === "media-then-site");
  const output = structuredClone(outputs[1]); output.steps[0].key = "findSeasideSunsetPhotos";
  output.steps[1].dependsOn = [output.steps[0].key];
  assert.deepEqual(gradeLiveWorkspaceDecision(item, JSON.stringify(output), options.catalogueSnapshot.entries).failures, ["invalid_execution_contract"]);
});

test("explicit text dataset preserves six public initial cases and the previous default baseline", async () => {
  const cases = await readLiveEvaluationCases(textDataset);
  assert.equal(cases.length, 6);
  assert.deepEqual(cases.map(item => item.expected.shape), [
    "direct-text", "text-then-text", "parallel-text-synthesis", "direct-text", "missing-capability", "missing-capability",
  ]);
  assert.equal(cases.filter(item => item.catalogueSource === "registered-evaluation").length, 5);
  assert.equal(cases.filter(item => item.catalogueSource === "current-authorized").length, 1);
  assert.ok(cases.every(item => Object.keys(item.input).length === 1 && item.tags.includes("initial-planning")));
  assert.equal((await readLiveEvaluationCases()).length, 5, "new cases are explicitly selected rather than replacing the accepted baseline");
});

test("single text specialists do not require media, pages or unnecessary collaborators", async t => {
  const options = await setup(t); const cases = await readLiveEvaluationCases(textDataset);
  for (const index of [0, 3]) {
    const item = cases[index]; const output = textOutputs[index];
    const grade = value => gradeLiveWorkspaceDecision(item, JSON.stringify(value), options.catalogueSnapshot.entries);
    assert.equal(grade(output).passed, true, item.id);
    const extraPage = structuredClone(output);
    extraPage.steps.push(planningStep("page", "site.compose", "制作介绍页面"));
    assert.ok(grade(extraPage).failures.includes("unnecessary_or_wrong_agent"));
    const extraSpecialist = structuredClone(output);
    extraSpecialist.steps.push(contributionStep("duplicate", output.steps[0].agentId, output.steps[0].capability, output.steps[0].goal));
    assert.ok(grade(extraSpecialist).failures.includes("unnecessary_or_wrong_agent"));
  }
  const lostDuration = structuredClone(textOutputs[3]); lostDuration.steps[0].goal = "编写修伞店视频脚本";
  assert.ok(gradeLiveWorkspaceDecision(cases[3], JSON.stringify(lostDuration), options.catalogueSnapshot.entries).failures.includes("goal_conditions_lost"));
});

test("text chains accept a real-result-first planning prefix and require typed dependency when both steps are planned", async t => {
  const options = await setup(t); const item = (await readLiveEvaluationCases(textDataset))[1];
  const grade = value => gradeLiveWorkspaceDecision(item, JSON.stringify(value), options.catalogueSnapshot.entries);
  assert.equal(grade(textOutputs[1]).passed, true);
  const prefix = structuredClone(textOutputs[1]); prefix.steps = [prefix.steps[0]];
  assert.equal(grade(prefix).passed, true, "initial planning may await the storyboard receipt before arranging its consumer");
  const missingDependency = structuredClone(textOutputs[1]); missingDependency.steps[1].dependsOn = [];
  assert.ok(grade(missingDependency).failures.includes("missing_typed_text_handoff"));
  const consumerFirst = structuredClone(textOutputs[1]); consumerFirst.steps = [consumerFirst.steps[1]]; consumerFirst.steps[0].dependsOn = [];
  assert.ok(grade(consumerFirst).failures.includes("unnecessary_or_wrong_agent"));
  const cyclic = structuredClone(textOutputs[1]); cyclic.steps[0].dependsOn = [cyclic.steps[1].key];
  assert.deepEqual(grade(cyclic).failures, ["invalid_execution_contract"]);
});

test("parallel text planning permits independent roots or explicit synthesis of both, rejecting serial roots and unrelated work", async t => {
  const options = await setup(t); const item = (await readLiveEvaluationCases(textDataset))[2];
  const grade = value => gradeLiveWorkspaceDecision(item, JSON.stringify(value), options.catalogueSnapshot.entries);
  assert.equal(grade(textOutputs[2]).passed, true);
  const roots = structuredClone(textOutputs[2]); roots.steps = roots.steps.slice(0, 2).reverse();
  assert.equal(grade(roots).passed, true, "independent node order and deferred synthesis are both valid initial plans");
  const partialHandoff = structuredClone(textOutputs[2]); partialHandoff.steps[2].dependsOn = [partialHandoff.steps[0].key];
  assert.ok(grade(partialHandoff).failures.includes("wrong_parallel_text_synthesis"));
  const serialRoots = structuredClone(textOutputs[2]); serialRoots.steps[1].dependsOn = [serialRoots.steps[0].key];
  assert.ok(grade(serialRoots).failures.includes("wrong_parallel_text_synthesis"));
  const oneRoot = structuredClone(roots); oneRoot.steps = [oneRoot.steps[0]];
  assert.equal(grade(oneRoot).passed, false, "a prefix must still plan both requested independent contributions");
  const extraMedia = structuredClone(textOutputs[2]); extraMedia.steps.push(planningStep("photos", "media.select", "查找图片"));
  assert.ok(grade(extraMedia).failures.includes("unnecessary_or_wrong_agent"));
  assert.deepEqual(grade({ type: "complete", summary: "已完成综合方案", resultKey: "synthesis" }).failures, ["invalid_execution_contract"],
    "the initial planner cannot fabricate a synthesis receipt");
});

test("missing video permission requires the exact supported capability rather than a replacement or wider request", async t => {
  const options = await setup(t); const item = (await readLiveEvaluationCases(textDataset))[4];
  const agents = await listAgents();
  const snapshot = await createAuthorizedEvaluationCatalogueSnapshot({ grants: agents.map(agent => ({
    agentId: agent.key, enabled: !["video-production", "site-builder"].includes(agent.key), grantedScopes: agent.permissions,
  })) });
  const grade = value => gradeLiveWorkspaceDecision(item, JSON.stringify(value), snapshot.entries, snapshot.unavailableCapabilities);
  const request = { type: "request_access", summary: "视频脚本需要视频助手的授权",
    capabilities: [{ agentId: "video-production", capability: "video.script" }] };
  assert.equal(grade(request).passed, true);
  assert.equal(snapshot.entries.some(entry => entry.capability === "video.script"), false);
  assert.deepEqual(grade({ type: "clarify", question: "请先授权视频助手" }).failures, ["missing_structured_authorization_request"]);
  assert.ok(grade({ ...request, capabilities: [{ agentId: "site-builder", capability: "site.compose" }] }).failures.includes("missing_required_capability"));
  assert.equal(grade({ ...request, capabilities: [...request.capabilities, { agentId: "site-builder", capability: "site.compose" }] }).passed, false,
    "requesting the necessary permission must not hide an unrelated authorization request");
  assert.equal(gradeLiveWorkspaceDecision(item, JSON.stringify(request), options.catalogueSnapshot.entries).passed, false,
    "a fully available catalogue cannot justify requesting missing video access");
});

test("unimplemented final comic images cannot be replaced by the new text storyboard executor", async t => {
  const options = await setup(t); const item = (await readLiveEvaluationCases(textDataset))[5];
  const grade = value => gradeLiveWorkspaceDecision(item, JSON.stringify(value), options.catalogueSnapshot.entries);
  assert.equal(grade(textOutputs[4]).passed, true);
  assert.ok(grade(textOutputs[1]).failures.includes("unsupported_goal_was_replaced_or_claimed_complete"));
  assert.ok(grade({ type: "clarify", question: "当前不能生成漫画图片，请添加漫画助手并授权后生成。" }).failures.includes("invented_unsupported_capability_recovery"));
});

test("explicit Fusheng text planning records exact receipts with null cost and keeps bounded public prompts", async t => {
  const options = await setup(t); let calls = 0;
  const summary = await runWorkspaceLiveEvaluation({ ...options, runtime: fushengRuntime, datasetPath: textDataset,
    maxCalls: 5, maxCostFen: null, prices: null, fetchImpl: async (url, request) => {
      assert.equal(url, fushengRuntime.baseUrl);
      assert.equal(request.redirect, "error");
      assert.equal((await events(options.reportPath)).at(-1).type, "dispatch");
      const body = JSON.parse(request.body); assert.equal(body.model, "gpt-6.1-sol");
      const context = JSON.parse(body.messages[1].content);
      assert.deepEqual(context.steps, []); assert.deepEqual(context.contextRefs, []);
      assert.deepEqual(context.selectedContext, []); assert.deepEqual(context.unavailableCapabilities, []);
      assert.equal(context.availableCapabilities.length, 9);
      return response(textOutputs[calls++], { model: "gpt-6.1-sol" });
    } });
  assert.equal(summary.passed, true); assert.equal(calls, 5); assert.equal(summary.completedCases, 5);
  assert.equal(summary.estimatedCostFen, null); assert.equal(summary.retainedReservationFen, null); assert.equal(summary.unknownCalls, 0);
  const records = await events(options.reportPath);
  assert.equal(records[0].providerProfile, "fusheng-gpt-6.1-sol"); assert.equal(records[0].prices, null);
  assert.ok(records.filter(record => record.type === "dispatch").every(record => record.reservedCostFen === null));
  assert.ok(records.filter(record => record.type === "receipt").every(record => record.responseModel === "gpt-6.1-sol" && record.costUpperBoundFen === null));
  assert.equal(JSON.stringify(records).includes(fushengRuntime.apiKey), false);
  assert.equal((await fs.stat(options.reportPath)).mode & 0o777, 0o600);
});

test("unpriced Fusheng planning still requires usage and exact model receipts and stops without retry", async t => {
  for (const kind of ["usage", "model"]) {
    const options = await setup(t); let calls = 0;
    const summary = await runWorkspaceLiveEvaluation({ ...options, runtime: fushengRuntime, datasetPath: textDataset,
      maxCalls: 5, maxCostFen: null, prices: null, fetchImpl: async () => {
        calls++;
        return response(textOutputs[0], kind === "usage" ? { model: "gpt-6.1-sol", usage: null } : { model: "unverified-model" });
      } });
    assert.equal(summary.passed, false); assert.equal(calls, 1); assert.equal(summary.unknownCalls, 1);
    assert.equal(summary.error.code, kind === "usage" ? "LIVE_EVAL_RESPONSE_UNKNOWN" : "LIVE_EVAL_RECEIPT_OUTSIDE_RESERVED_CONTRACT");
    assert.equal(summary.estimatedCostFen, null); assert.equal(summary.retainedReservationFen, null);
    assert.equal((await events(options.reportPath)).filter(record => record.type === "dispatch").length, 1);
  }
});

test("Fusheng null-cost planning rejects fabricated prices and too-small call bounds before dispatch", async t => {
  for (const kind of ["prices", "cost-cap", "calls"]) {
    const options = await setup(t); let calls = 0;
    await assert.rejects(runWorkspaceLiveEvaluation({ ...options, runtime: fushengRuntime, datasetPath: textDataset,
      maxCalls: kind === "calls" ? 4 : 5, maxCostFen: kind === "cost-cap" ? 100 : null,
      prices: kind === "prices" ? options.prices : null, fetchImpl: async () => { calls++; return response(textOutputs[0], { model: "gpt-6.1-sol" }); } }));
    assert.equal(calls, 0, kind);
    await assert.rejects(fs.stat(options.reportPath), { code: "ENOENT" });
  }
});
