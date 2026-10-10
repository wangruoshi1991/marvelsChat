import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { runAgent, getModelRuntimeStatus } from "../src/agent-runtime.js";
import { createAlbumAssistantTools } from "../src/album-assistant-tools.js";

export async function evaluateAlbumAssistant({ run = runAgent } = {}) {
  const suite = (await readFile(new URL("../../agents/album-assistant-eval.jsonl", import.meta.url), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line));
  const records = [];
  const albumId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  for (const example of suite) {
    const calls = [];
    const tools = createAlbumAssistantTools({ userId: "synthetic-owner", inputMessageId: example.id,
      assertAccess: async () => {}, listAlbums: async () => [{ id: albumId, title: "旅行" }],
      service: {
        getMediaRetrievalStatus: async () => ({ enabled: true, availability: { canStartRun: true }, backfill: { indexedAssets: 1, totalAssets: 1 } }),
        searchMediaRetrieval: async args => {
          calls.push(args);
          return { agentRunId: "synthetic-run", results: example.results || [] };
        },
      } });
    const start = Date.now();
    try {
      const result = await run({ agentId: "album-manager", input: example.input,
        user: { id: "synthetic-owner", displayName: "公开测试" },
        messages: [...(example.history || []), { senderType: "user", content: example.input }], tools });
      const search = calls[0];
      const passed = (example.expectedTool ? calls.length === 1 : calls.length === 0)
        && (!example.kind || search?.kind === example.kind)
        && (!example.albumRequired || search?.albumId === albumId)
        && (!example.noAlbum || !search?.albumId)
        && example.terms.every(term => search?.query.includes(term))
        && (!example.replyForbiddenPattern || !new RegExp(example.replyForbiddenPattern, "i").test(result.reply));
      records.push({ id: example.id, tags: example.tags, passed, latencyMs: Date.now() - start,
        tokenUsage: result.tokenUsage, toolCalls: calls.map(({ query, kind, albumId: scope }) => ({ query, kind, albumId: scope })), reply: result.reply });
    } catch (error) {
      records.push({ id: example.id, tags: example.tags, passed: false, latencyMs: Date.now() - start, error: "agent-evaluation-failed", errorName: error.name, status: error.status || null });
    }
  }
  return { type: "real-model-routing-with-synthetic-tool-results", runtime: {
    provider: getModelRuntimeStatus().provider, model: getModelRuntimeStatus().model,
  }, passed: records.filter(record => record.passed).length, total: records.length, records };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (!process.argv.includes("--allow-paid")) throw new Error("Explicit --allow-paid is required for this real-model evaluation.");
  const results = await evaluateAlbumAssistant();
  console.log(JSON.stringify(results, null, 2));
  if (results.passed !== results.total) process.exitCode = 1;
}
