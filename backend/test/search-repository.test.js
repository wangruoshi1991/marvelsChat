import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  SEARCH_HISTORY_LIMIT,
  createSearchHistoryRepository,
} = await import("../src/search-repository.js");

const resultRows = [
  {
    id: "history-1",
    query_text: "发布会",
    scope: "contacts",
    created_at: "2026-07-16T00:00:00.000Z",
  },
];

function repositoryHarness() {
  const directQueries = [];
  const transactionQueries = [];
  const repository = createSearchHistoryRepository({
    queryFn: async (sql, params) => {
      directQueries.push({sql, params});
      return sql.includes("SELECT *") ? resultRows : [];
    },
    transactionFn: async (work) =>
      work({
        query: async (sql, params) => {
          transactionQueries.push({sql, params});
          return [];
        },
      }),
  });
  return {directQueries, repository, transactionQueries};
}

test("search history upserts case-insensitively and prunes to the limit", async () => {
  const harness = repositoryHarness();
  const history = await harness.repository.save({
    userId: "user-1",
    queryText: "  发布会  ",
    scope: "contacts",
  });

  assert.equal(SEARCH_HISTORY_LIMIT, 12);
  assert.equal(history[0].query, "发布会");
  assert.match(harness.transactionQueries[0].sql, /ON CONFLICT \(user_id, lower\(query_text\)\)/);
  assert.deepEqual(harness.transactionQueries[0].params.slice(1), [
    "user-1",
    "发布会",
    "contacts",
  ]);
  assert.match(
    harness.transactionQueries[1].sql,
    new RegExp(`OFFSET ${SEARCH_HISTORY_LIMIT}`),
  );
  assert.match(harness.directQueries[0].sql, /LIMIT 12/);
});

test("single-item deletion prunes legacy overflow before deleting", async () => {
  const harness = repositoryHarness();
  await harness.repository.deleteItem({
    userId: "user-1",
    historyId: "history-1",
  });

  assert.match(harness.transactionQueries[0].sql, /OFFSET 12/);
  assert.match(harness.transactionQueries[1].sql, /user_id = \? AND id = \?/);
  assert.deepEqual(harness.transactionQueries[1].params, [
    "user-1",
    "history-1",
  ]);
});

test("blank search history is rejected before opening a transaction", async () => {
  const harness = repositoryHarness();
  await assert.rejects(
    harness.repository.save({userId: "user-1", queryText: "   "}),
    /Search query is required/,
  );
  assert.equal(harness.transactionQueries.length, 0);
});
