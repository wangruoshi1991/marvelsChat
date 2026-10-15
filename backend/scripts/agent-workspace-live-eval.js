import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { costFen, resolveEvaluationCostContract, runBoundedLiveEvaluation } from "./live-eval-provider.js";
import { getAgent, listAgents } from "../../agents/registry.js";
import { validateWorkspaceDecision } from "../src/agent-workspace-plan.js";
import { listExecutableWorkspaceCapabilities, listUnavailableWorkspaceCapabilities } from "../src/agent-workspace-capabilities.js";

const defaultDataset = fileURLToPath(new URL("../../agents/evals/workspace/live-goals-v1.jsonl", import.meta.url));
const hash = value => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest("hex");
const boundedText = (min, max) => z.string().min(min).max(max);
const catalogueEntrySchema = z.object({
  agentId: boundedText(1, 120), agentVersion: z.string().regex(/^\d+\.\d+\.\d+$/), capability: boundedText(1, 120),
  description: boundedText(1, 500), inputKinds: z.array(boundedText(1, 60)).max(4), dependencyKinds: z.array(boundedText(1, 60)).max(2),
  outputKind: z.enum(["media_selection", "site_draft", "text_result"]), requiredScopes: z.array(boundedText(1, 60)).min(1).max(10),
}).strict();
const unavailableCapabilitySchema = z.object({ agentId: boundedText(1, 120), capability: boundedText(1, 120), requiredScopes: z.array(boundedText(1, 120)).min(1).max(40), agentName: boundedText(1, 120), description: boundedText(1, 500),
  reason: z.enum(["authorization_required", "new_task_required"]) }).strict();
const snapshotSchema = z.object({ source: z.enum(["current-authorized", "registered-evaluation"]), checkedAt: z.string().datetime(),
  entries: z.array(catalogueEntrySchema).max(10), unavailableCapabilities: z.array(unavailableCapabilitySchema).max(10) }).strict();
const caseSchema = z.object({ catalogueSource: z.enum(["current-authorized", "registered-evaluation"]), id: z.string().regex(/^[a-z0-9-]{1,100}$/), input: z.object({ goal: boundedText(1, 2000) }).strict(),
  expected: z.object({ behavior: boundedText(1, 1000), shape: z.enum(["direct-site", "media-then-site", "parallel-media", "missing-capability", "direct-text", "text-then-text", "parallel-text-synthesis"]),
    capabilities: z.array(z.object({ agentId: boundedText(1, 120), capability: boundedText(1, 120) }).strict()).min(1).max(3).optional(),
    clarification: z.enum(["unsupported-product", "missing-authorization"]).optional(),
    goalTerms: z.array(boundedText(1, 80)).max(6).optional(), absentCapabilities: z.array(boundedText(1, 120)).max(5).optional(), selectionTerms: z.array(z.array(boundedText(1, 80)).min(1).max(4)).length(2).optional() }).strict(),
  tags: z.array(boundedText(1, 60)).min(1).max(10) }).strict().superRefine((item, context) => {
    if (item.expected.shape === "parallel-media" ? !item.expected.selectionTerms : !item.expected.goalTerms?.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Each live shape requires pinned goal-condition assertions" });
    }
    if ((item.expected.shape === "missing-capability") !== Boolean(item.expected.clarification)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Missing-capability cases require a distinct clarification contract" });
    }
    if (item.expected.clarification === "missing-authorization" && !item.expected.absentCapabilities?.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Missing authorization requires exact absent capability expectations" });
    }
    const counts = { "direct-text": 1, "text-then-text": 2, "parallel-text-synthesis": 3 };
    const count = counts[item.expected.shape];
    if (count ? item.expected.capabilities?.length !== count : item.expected.capabilities !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Text planning cases require their explicit ordered capability expectations" });
    }
    if (count && (new Set(item.expected.capabilities?.map(entry => `${entry.agentId}/${entry.capability}`)).size !== count ||
      item.expected.capabilities?.some(entry => ["media.select", "site.compose"].includes(entry.capability)) ||
      (item.expected.shape === "parallel-text-synthesis" && item.expected.capabilities?.[2]?.capability !== "text.synthesize"))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Text planning expectations must be distinct text executors with explicit synthesis" });
    }
  });

// This catalogue represents tested registered executors for public planning
// evaluation only. It is never a user's grant and cannot authorize any tool.
export async function createRegisteredEvaluationCatalogueSnapshot({ now = () => Date.now() } = {}) {
  const registeredAgents = await listAgents();
  const entries = listExecutableWorkspaceCapabilities({ registeredAgents,
    grants: registeredAgents.map(agent => ({ agentId: agent.key, enabled: true, grantedScopes: agent.permissions })) });
  return { source: "registered-evaluation", checkedAt: new Date(now()).toISOString(), entries, unavailableCapabilities: [] };
}

// Pass the actual read-only grant rows to this builder. It returns only typed
// executable declarations and non-private diagnostics, never raw grant rows.
export async function createAuthorizedEvaluationCatalogueSnapshot({ grants, now = () => Date.now() } = {}) {
  const checkedGrants = z.array(z.object({ agentId: boundedText(1, 120), enabled: z.boolean(),
    grantedScopes: z.array(boundedText(1, 120)).max(30) }).strict()).max(100).parse(grants);
  if (new Set(checkedGrants.map(grant => grant.agentId)).size !== checkedGrants.length) throw new Error("Authorized catalogue grant rows must be unique");
  const registeredAgents = await listAgents();
  return { source: "current-authorized", checkedAt: new Date(now()).toISOString(),
    entries: listExecutableWorkspaceCapabilities({ registeredAgents, grants: checkedGrants }),
    unavailableCapabilities: listUnavailableWorkspaceCapabilities({ registeredAgents, grants: checkedGrants }) };
}

export async function readLiveEvaluationCases(file = defaultDataset) {
  const bytes = await fs.readFile(file);
  if (bytes.length > 65536) throw new Error("Evaluation dataset exceeds the byte limit");
  const cases = bytes.toString("utf8").trim().split("\n").map(line => caseSchema.parse(JSON.parse(line)));
  if (cases.length < 1 || cases.length > 16 || new Set(cases.map(item => item.id)).size !== cases.length) throw new Error("Evaluation requires one to sixteen unique cases");
  return cases;
}

// Literal assertions preserve critical requested conditions. They are graders
// for these public regression goals, never production keyword routing.
export function gradeLiveWorkspaceDecision(item, reply, catalogue, unavailableCapabilities = []) {
  const workspace = { goal: item.input.goal, nodes: [], contextRefs: [],
    limits: { deadlineSeconds: 600 }, usage: { coordinatorTurns: 1, modelCalls: 1 } };
  let decision;
  try { decision = validateWorkspaceDecision(reply, { workspace, catalogue, unavailableCapabilities }); }
  catch { return { passed: false, failures: ["invalid_execution_contract"] }; }
  const failures = [];
  const steps = decision.type === "plan" ? decision.steps : [];
  const userText = [decision.summary, decision.question, ...steps.map(node => node.goal)].filter(Boolean).join("\n");
  const internalKeys = [...catalogue.flatMap(entry => [entry.agentId, entry.capability]),
    ...steps.flatMap(node => [node.key, ...node.dependsOn]), ...(item.expected.absentCapabilities || [])];
  if (internalKeys.some(key => userText.includes(key)) || /\b(?:agentId|capability|contextRefIndexes|workspaceId)\b|\b[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*\b|\b[a-z][a-z0-9_]*-(?:agent|manager|builder|butler)\b/iu.test(userText)) {
    failures.push("internal_keys_in_user_text");
  }
  const media = steps.filter(node => node.capability === "media.select");
  const sites = steps.filter(node => node.capability === "site.compose");
  const includes = (text, terms) => terms.every(term => text.includes(term));
  switch (item.expected.shape) {
    case "direct-site":
      if (decision.type !== "plan" || steps.length !== 1 || sites.length !== 1 || sites[0].dependsOn.length) failures.push("unnecessary_or_wrong_agent");
      else if (!includes(sites[0].goal, item.expected.goalTerms)) failures.push("goal_conditions_lost");
      break;
    case "media-then-site":
      if (decision.type !== "plan" || media.length !== 1 || media[0].dependsOn.length ||
        !((steps.length === 1 && sites.length === 0) || (steps.length === 2 && sites.length === 1 &&
          sites[0].dependsOn.length === 1 && sites[0].dependsOn[0] === media[0].key))) failures.push("missing_typed_material_handoff");
      else if (!includes(media[0].goal, item.expected.goalTerms)) failures.push("material_conditions_lost");
      break;
    case "parallel-media":
      if (decision.type !== "plan" || steps.length !== 2 || media.length !== 2 || media.some(node => node.dependsOn.length)) failures.push("wrong_parallel_division");
      else if (!item.expected.selectionTerms.every(terms => media.some(node => includes(node.goal, terms)))) failures.push("independent_selection_conditions_lost");
      break;
    case "direct-text":
    case "text-then-text":
    case "parallel-text-synthesis": {
      const expected = item.expected.capabilities;
      const signature = value => `${value.agentId}/${value.capability}`;
      const bySignature = new Map(steps.map(node => [signature(node), node]));
      const first = bySignature.get(signature(expected[0]));
      const second = expected[1] && bySignature.get(signature(expected[1]));
      const synthesis = expected[2] && bySignature.get(signature(expected[2]));
      const unexpected = steps.some(node => !expected.some(entry => signature(entry) === signature(node)));
      if (decision.type !== "plan" || unexpected || bySignature.size !== steps.length || !first || first.dependsOn.length) {
        failures.push("unnecessary_or_wrong_agent");
      } else if (item.expected.shape === "direct-text") {
        if (steps.length !== 1) failures.push("unnecessary_or_wrong_agent");
      } else if (item.expected.shape === "text-then-text") {
        // Initial planning may wait for a real contribution before delegating
        // its consumer. A complete initial plan must make that dependency real.
        if (steps.length > 2 || (second && (second.dependsOn.length !== 1 || second.dependsOn[0] !== first.key))) {
          failures.push("missing_typed_text_handoff");
        }
      } else if (!second || second.dependsOn.length || steps.length < 2 || steps.length > 3 ||
        (synthesis && (synthesis.dependsOn.length !== 2 || ![first.key, second.key].every(key => synthesis.dependsOn.includes(key))))) {
        failures.push("wrong_parallel_text_synthesis");
      }
      if (!includes(userText, item.expected.goalTerms)) failures.push("goal_conditions_lost");
      break;
    }
    case "missing-capability":
      if (item.expected.clarification === "missing-authorization") {
        if (decision.type !== "request_access") failures.push("missing_structured_authorization_request");
        else if (decision.requirements.length !== item.expected.absentCapabilities.length || !item.expected.absentCapabilities.every(capability =>
          decision.requirements.some(requirement => requirement.capability === capability && requirement.reason === "authorization_required"))) {
          failures.push("missing_required_capability");
        }
        break;
      }
      if (decision.type !== "clarify") failures.push("unsupported_goal_was_replaced_or_claimed_complete");
      else {
        const question = decision.question;
        if (!includes(question, item.expected.goalTerms) || !/(没有|缺少|未接入|不可用|无法|不支持|不能)/u.test(question)) failures.push("missing_capability_not_explained");
        if (item.expected.clarification === "unsupported-product" &&
          /(?:请|建议|可(?:以)?|能否|是否|先|前往|进入|打开)[^。！？!?；;\n]{0,100}(?:注册|接入|添加|开通|授权|启用)/u.test(question)) {
          failures.push("invented_unsupported_capability_recovery");
        }

      }
      break;
  }
  return { passed: failures.length === 0, failures, decision };
}

export async function runWorkspaceLiveEvaluation({ runtime, catalogueSnapshot, maxCostFen, maxCalls,
  prices, reportPath, cases = null, datasetPath = defaultDataset, maxOutputTokens = 4096,
  maxRequestBytes = 65536, maxResponseBytes = 131072, timeoutMs = 45000, fetchImpl = globalThis.fetch, now = () => Date.now(),
} = {}) {
  const costContract = resolveEvaluationCostContract({ runtime, maxCostFen, prices });
  prices = costContract.prices;
  z.number().int().min(1).max(16).parse(maxCalls);
  z.number().int().min(128).max(4096).parse(maxOutputTokens);
  z.number().int().min(1024).max(65536).parse(maxRequestBytes);
  z.number().int().min(1024).max(131072).parse(maxResponseBytes);
  z.number().int().min(100).max(60000).parse(timeoutMs);
  const snapshot = snapshotSchema.parse(catalogueSnapshot);
  const snapshotAge = now() - Date.parse(snapshot.checkedAt);
  if (snapshotAge < -60000 || snapshotAge > 15 * 60000) throw new Error("Current authorized catalogue snapshot must be at most 15 minutes old");
  // Registered-evaluation entries are produced only by registered executor
  // validation. The separately supplied current-authorized snapshot contains
  // actual read-only grants, never permissions invented for a planning case.
  const registeredEvaluation = await createRegisteredEvaluationCatalogueSnapshot({ now });
  if (snapshot.source === "registered-evaluation" && (hash(snapshot.entries) !== hash(registeredEvaluation.entries) || snapshot.unavailableCapabilities.length)) {
    throw new Error("Registered-evaluation catalogue must contain the current validated executor catalogue");
  }
  for (const entry of snapshot.entries) {
    const agent = await getAgent(entry.agentId);
    const declaration = agent?.workspaceCapabilities?.find(value => value.capability === entry.capability);
    if (!declaration || agent.version !== entry.agentVersion || hash({ agentId: agent.key, agentVersion: agent.version, ...declaration }) !== hash(entry)) {
      throw new Error("Authorized capability snapshot differs from registered executor declarations");
    }
  }
  if (snapshot.source === "current-authorized") {
    // A complete current-authorized snapshot lists every executable capability
    // granted at its checkedAt. Each present Agent must have a complete grant;
    // reconstruct presence to check omissions/diagnostics against that catalogue.
    // this is validation data, never a user's grant or an execution authority.
    const registeredAgents = await listAgents();
    const catalogueGrants = registeredAgents.map(agent => ({ agentId: agent.key,
      enabled: snapshot.entries.some(entry => entry.agentId === agent.key), grantedScopes: [...agent.permissions] }));
    const validatedEntries = listExecutableWorkspaceCapabilities({ registeredAgents, grants: catalogueGrants });
    const diagnostics = listUnavailableWorkspaceCapabilities({ registeredAgents, grants: catalogueGrants });
    if (hash(snapshot.entries) !== hash(validatedEntries) || hash(snapshot.unavailableCapabilities) !== hash(diagnostics)) {
      throw new Error("Authorized unavailable diagnostics must match the actual registered capabilities absent from the current complete grants catalogue");
    }
  }
  const suppliedCases = cases ? cases.map(item => caseSchema.parse(item)) : await readLiveEvaluationCases(datasetPath);
  const evaluationCases = suppliedCases.filter(item => item.catalogueSource === snapshot.source);
  if (!evaluationCases.length || evaluationCases.length > 16 || maxCalls < evaluationCases.length || new Set(evaluationCases.map(item => item.id)).size !== evaluationCases.length) throw new Error("Call cap must cover each unique evaluation case once");
  for (const item of evaluationCases) if (item.expected.absentCapabilities?.some(capability => snapshot.entries.some(entry => entry.capability === capability))) {
    throw new Error("Missing-capability case does not match the current authorized catalogue");
  }
  const coordinator = await getAgent("miaoxun-butler");
  if (!coordinator?.coordinate) throw new Error("Registered coordinator is unavailable");
  const prepared = [];
  for (const item of evaluationCases) {
    const plan = await coordinator.coordinate({ input: item.input.goal, appContext: { source: { page: "miao", module: "task-composer" },
      contextRefs: [], selectedContext: [], followups: [], steps: [], availableCapabilities: snapshot.entries,
      unavailableCapabilities: snapshot.unavailableCapabilities } });
    const body = JSON.stringify({ model: runtime.model, max_tokens: maxOutputTokens, temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: plan.system }, { role: "user", content: plan.user }] });
    const requestBytes = Buffer.byteLength(body, "utf8");
    if (requestBytes > maxRequestBytes) throw new Error("Evaluation request exceeds the hard byte limit");
    // UTF-8 bytes conservatively bound input tokens, including serialized
    // framing; no optimistic tokenizer estimate or cache discount is applied.
    prepared.push({ item, body, requestBytes, reservedCostFen: prices === null ? null : costFen(requestBytes, maxOutputTokens, prices), promptHash: hash(plan) });
  }
  if (maxCostFen !== null && prepared.reduce((sum, item) => sum + item.reservedCostFen, 0) > maxCostFen) throw new Error("Worst-case evaluation reservation exceeds the explicit cost cap");
  return runBoundedLiveEvaluation({ runtime: { ...runtime, profile: runtime.profile || "direct-deepseek-flash" }, prepared,
    maxCostFen, maxCalls, prices, reportPath, maxOutputTokens, maxRequestBytes, maxResponseBytes, timeoutMs, fetchImpl, now,
    metadata: { coordinatorVersion: coordinator.version, catalogueSource: snapshot.source, datasetHash: hash(evaluationCases),
      catalogueHash: hash(snapshot.entries), unavailableCapabilitiesHash: hash(snapshot.unavailableCapabilities), catalogueCheckedAt: snapshot.checkedAt },
    summaryMetadata: { catalogueSource: snapshot.source, actualModelQualityScope: snapshot.source === "registered-evaluation"
      ? "planning against validated registered executors only; no production grants or specialist/tool execution"
      : "initial planning against a current authorized capability snapshot only; no specialist execution or production data writes" },
    grade: (item, reply) => gradeLiveWorkspaceDecision(item, reply, snapshot.entries, snapshot.unavailableCapabilities),
  });
}

function readFlags(argv) {
  const allowed = new Set(["provider-profile", "catalogue-file", "max-cost-fen", "max-calls", "report", "input-yuan-per-million", "output-yuan-per-million", "max-output-tokens", "dataset"]);
  const flags = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]?.replace(/^--/, "");
    if (!argv[index]?.startsWith("--") || !allowed.has(flag) || flags[flag] !== undefined || argv[index + 1] === undefined) throw new Error("Invalid live evaluation arguments");
    flags[flag] = argv[index + 1];
  }
  for (const required of ["catalogue-file", "max-cost-fen", "max-calls", "report"]) if (!flags[required]) throw new Error(`Missing --${required}`);
  if (flags["max-cost-fen"] === "none" && (flags["input-yuan-per-million"] || flags["output-yuan-per-million"])) throw new Error("Unpriced evaluation must not supply cost estimates");
  if (flags["max-cost-fen"] !== "none" && (!flags["input-yuan-per-million"] || !flags["output-yuan-per-million"])) throw new Error("Priced evaluation requires explicit input and output prices");
  return flags;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = readFlags(process.argv.slice(2));
    const summary = await runWorkspaceLiveEvaluation({ runtime: { profile: flags["provider-profile"] || "direct-deepseek-flash", baseUrl: process.env.NEW_API_BASE_URL, apiKey: process.env.NEW_API_KEY, model: process.env.NEW_API_MODEL },
      catalogueSnapshot: JSON.parse(await fs.readFile(flags["catalogue-file"], "utf8")), maxCostFen: flags["max-cost-fen"] === "none" ? null : Number(flags["max-cost-fen"]), maxCalls: Number(flags["max-calls"]),
      reportPath: flags.report, prices: flags["max-cost-fen"] === "none" ? null : { inputYuanPerMillion: Number(flags["input-yuan-per-million"]), outputYuanPerMillion: Number(flags["output-yuan-per-million"]) },
      ...(flags["max-output-tokens"] ? { maxOutputTokens: Number(flags["max-output-tokens"]) } : {}), ...(flags.dataset ? { datasetPath: flags.dataset } : {}) });
    console.log(JSON.stringify({ passed: summary.passed, completedCases: summary.completedCases, expectedCases: summary.expectedCases,
      calls: summary.calls, estimatedCostFen: summary.estimatedCostFen, retainedReservationFen: summary.retainedReservationFen, error: summary.error }));
    if (!summary.passed) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ passed: false, code: "LIVE_EVAL_SETUP_OR_REPORT_FAILED", message: "Check explicit options and private report; no automatic retry." }));
    process.exitCode = 1;
  }
}
