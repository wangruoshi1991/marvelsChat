import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.DEFAULT_ADMIN_ENABLED ||= "false";

const { evaluateAlbumAssistant } = await import("../scripts/album-assistant-eval.js");

test("album evaluation fixtures exercise current tools with complete index coverage without a provider", async () => {
  const suite = (await readFile(new URL("../../agents/album-assistant-eval.jsonl", import.meta.url), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line));
  let runtimeCalls = 0;
  let toolCalls = 0;
  const report = await evaluateAlbumAssistant({
    run: async ({ input, tools }) => {
      const example = suite[runtimeCalls++];
      assert.equal(input, example.input);
      if (example.expectedTool) {
        const args = { query: example.terms.join(" ") || input, kind: example.kind };
        if (example.albumRequired) {
          const { albums } = await tools.execute("list_albums", {});
          args.albumId = albums[0].id;
        }
        const result = await tools.execute(example.expectedTool, args);
        toolCalls += 1;
        assert.deepEqual(result.accountIndexCoverage, {
          indexedAssets: 1, unavailableAssets: 0, pendingAssets: 0, totalAssets: 1,
        });
        assert.equal(result.state, example.results?.length ? "found" : "empty");
      }
      return { reply: "Done.", tokenUsage: null };
    },
  });
  assert.equal(runtimeCalls, suite.length);
  assert.equal(toolCalls, suite.filter(example => example.expectedTool).length);
  assert.equal(report.total, suite.length);
  assert.equal(report.passed, report.total, JSON.stringify(report.records.filter(record => !record.passed)));
});
