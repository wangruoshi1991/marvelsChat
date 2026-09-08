import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const { createMediaRetrievalRepository } = await import("../src/media-retrieval-repository.js");
const {
  createDescriptorProvenance,
  createEmbeddingProvenance,
} = await import("../src/media-retrieval-provenance.js");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const RUN_A = "33333333-3333-4333-8333-333333333333";
const ASSET_A = "44444444-4444-4444-8444-444444444444";

function makeRepository({ respond = () => [] } = {}) {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    return respond(String(sql), params, calls);
  };
  const connection = {
    query,
    execute: async (sql, params = []) => [await query(sql, params)],
  };
  const repository = createMediaRetrievalRepository({
    query,
    withTransaction: async (work) => work(connection),
    now: () => new Date("2026-08-06T00:00:00.000Z"),
    idFactory: (() => {
      const values = [
        RUN_A,
        "55555555-5555-4555-8555-555555555555",
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777777",
      ];
      return () => values.shift() || "88888888-8888-4888-8888-888888888888";
    })(),
    traceIdFactory: () => "a".repeat(32),
  });
  return { calls, repository };
}

function hasSql(calls, fragment) {
  return calls.some((call) => call.sql.replace(/\s+/g, " ").includes(fragment));
}

function vector() {
  return Array.from({ length: 1024 }, () => 0.1);
}

function indexingProvenance() {
  return {
    descriptorProvenance: createDescriptorProvenance({
      modelId: "test-caption-model",
      modelVersion: "v1",
      configuration: { provider: "contract-test" },
    }),
    embeddingProvenance: createEmbeddingProvenance({
      modelId: "test-embedding-model",
      modelVersion: "v1",
      dimension: 1024,
      normalization: "provider-native-dense-v1",
      configuration: { provider: "contract-test", outputType: "dense" },
    }),
  };
}

function assetFingerprint({ id = ASSET_A, storageKey = "private/a.jpg", byteSize = 1, updatedAt = "2026-08-06T00:00:00.000Z" } = {}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ id, storageKey, byteSize, updatedAt }))
    .digest("hex");
}

test("createOrGetMediaRetrievalRun redacts its input summary and reuses a user-owned idempotent run", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM agent_runs") && sql.includes("idempotency_key")) return [];
      if (sql.includes("INSERT INTO agent_runs")) return [];
      if (sql.includes("SELECT id") && sql.includes("FROM agent_runs")) return [{ id: RUN_A }];
      if (sql.includes("SELECT COALESCE(MAX(sequence)")) return [{ next_sequence: 1 }];
      if (sql.includes("INSERT INTO agent_run_events")) return [];
      if (sql.includes("SELECT *") && sql.includes("FROM agent_runs") && sql.includes("WHERE id = ?")) {
        return [{
          id: RUN_A,
          user_id: USER_A,
          agent_id: "media-retrieval",
          status: "pending",
          lifecycle_status: "accepted",
          run_type: "media-index",
          trace_id: "a".repeat(32),
          attempt: 1,
          created_at: "2026-08-06T00:00:00.000Z",
        }];
      }
      return [];
    },
  });

  const first = await repository.createOrGetMediaRetrievalRun({
    userId: USER_A,
    runType: "media-index",
    idempotencyKey: "enable-0001",
    inputSummary: { query: "private text", assetCount: 2, password: "must-not-persist" },
  });

  assert.equal(first.reused, false);
  assert.equal(first.run.id, RUN_A);
  assert.equal(first.run.lifecycleStatus, "accepted");
  assert.equal(first.run.traceId, "a".repeat(32));
  const insert = calls.find((call) => call.sql.includes("INSERT INTO agent_runs"));
  assert.ok(insert);
  assert.equal(JSON.stringify(insert.params).includes("private text"), false);
  assert.equal(JSON.stringify(insert.params).includes("must-not-persist"), false);
  assert.equal(hasSql(calls, "WHERE user_id = ? AND agent_id = 'media-retrieval' AND idempotency_key = ?"), true);
  assert.equal(hasSql(calls, "INSERT INTO agent_run_events"), true);

  const replay = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM agent_runs") && sql.includes("idempotency_key")) {
        return [{
          id: RUN_A,
          user_id: USER_A,
          agent_id: "media-retrieval",
          status: "pending",
          lifecycle_status: "accepted",
          run_type: "media-index",
          trace_id: "a".repeat(32),
          attempt: 1,
        }];
      }
      return [];
    },
  });
  const second = await replay.repository.createOrGetMediaRetrievalRun({
    userId: USER_A,
    runType: "media-index",
    idempotencyKey: "enable-0001",
  });
  assert.equal(second.reused, true);
  assert.equal(second.run.id, RUN_A);
  assert.equal(hasSql(replay.calls, "INSERT INTO agent_runs"), false);
});

test("owner-scoped retrieval methods never query a run, profile, event, or segment without user_id", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM agent_runs") && sql.includes("WHERE id = ?")) return [];
      if (sql.includes("FROM agent_run_events")) return [];
      if (sql.includes("FROM media_retrieval_profiles")) return [];
      if (sql.includes("FROM media_retrieval_segments")) return [];
      return [];
    },
  });

  assert.equal(await repository.getAgentRunForUser({ userId: USER_B, agentRunId: RUN_A }), null);
  assert.deepEqual(
    await repository.listAgentRunEventsForUser({ userId: USER_B, agentRunId: RUN_A, afterSequence: 0 }),
    [],
  );
  assert.equal(await repository.getMediaRetrievalProfile({ userId: USER_B }), null);
  assert.deepEqual(
    await repository.searchMediaRetrievalSegments({
      userId: USER_B,
      vector: null,
      lexicalTerms: [],
      kind: null,
      albumId: null,
      limit: 10,
    }),
    [],
  );

  const protectedSelects = calls.filter((call) => /FROM (agent_runs|agent_run_events|media_retrieval_profiles|media_retrieval_segments)/.test(call.sql));
  assert.ok(protectedSelects.length >= 4);
  for (const call of protectedSelects) {
    assert.match(call.sql, /user_id\s*=\s*\?/i);
  }
  assert.equal(calls.some((call) => call.params.includes(USER_A)), false);
});

test("appendAgentRunEvent assigns monotonic sequences and treats delivery keys as idempotent", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("SELECT id") && sql.includes("FROM agent_runs")) return [{ id: RUN_A }];
      if (sql.includes("SELECT sequence") && sql.includes("delivery_key")) return [];
      if (sql.includes("SELECT COALESCE(MAX(sequence)")) return [{ next_sequence: 4 }];
      if (sql.includes("INSERT INTO agent_run_events")) {
        return [{
          id: "55555555-5555-4555-8555-555555555555",
          sequence: 4,
          lifecycle_status: "queued",
          event_type: "queued",
          visibility: "client",
          payload: {},
          created_at: "2026-08-06T00:00:00.000Z",
        }];
      }
      return [];
    },
  });

  const event = await repository.appendAgentRunEvent({
    userId: USER_A,
    agentRunId: RUN_A,
    lifecycleStatus: "queued",
    eventType: "queued",
    deliveryKey: "run-queued-0001",
  });

  assert.equal(event.sequence, 4);
  assert.equal(event.lifecycleStatus, "queued");
  assert.equal(hasSql(calls, "WHERE agent_run_id = ? AND delivery_key = ?"), true);
  assert.equal(hasSql(calls, "COALESCE(MAX(sequence), 0) + 1"), true);
});

test("budget reservation blocks before provider dispatch when controls have no budget", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM media_retrieval_operator_controls") && sql.includes("FOR UPDATE")) {
        return [{
          agent_enabled: true,
          provider_calls_enabled: true,
          index_requests_enabled: true,
          user_daily_request_limit: 3,
          user_monthly_budget_fen: 100,
          global_daily_budget_fen: 0,
        }];
      }
      if (sql.includes("FROM media_retrieval_cost_daily_rollups") && sql.includes("scope = 'user'")) {
        return [{ action_count: 0, reserved_fen: 0, estimated_fen: 0, unknown_fen: 0 }];
      }
      if (sql.includes("FROM media_retrieval_cost_daily_rollups") && sql.includes("scope = 'global'")) {
        return [{ action_count: 0, reserved_fen: 0, estimated_fen: 0, unknown_fen: 0 }];
      }
      return [];
    },
  });

  const result = await repository.reserveProviderBudget({
    userId: USER_A,
    agentRunId: RUN_A,
    jobId: null,
    operation: "query-embedding",
    reserveFen: 1,
    countUserAction: true,
  });

  assert.deepEqual(result, { reserved: false, reasonCode: "retrieval_budget_exhausted" });
  assert.equal(hasSql(calls, "INSERT INTO media_retrieval_cost_ledger"), false);
});

test("operator controls retain values omitted by a partial admin update", async () => {
  const current = {
    agent_enabled: true,
    provider_calls_enabled: true,
    index_requests_enabled: true,
    user_daily_request_limit: 3,
    user_monthly_budget_fen: 3000,
    global_daily_budget_fen: 800,
    caption_reserve_fen: 20,
    embedding_reserve_fen: 10,
    lifecycle: "limited_release",
  };
  const { calls, repository } = makeRepository({
    respond: (sql, params) => {
      if (sql.includes("SELECT * FROM media_retrieval_operator_controls")) return [current];
      if (sql.includes("UPDATE media_retrieval_operator_controls")) return [{
        ...current,
        provider_calls_enabled: params[1],
      }];
      return [];
    },
  });

  await repository.updateMediaRetrievalOperatorControls({
    agentEnabled: undefined,
    providerCallsEnabled: false,
    indexRequestsEnabled: undefined,
    globalDailyBudgetFen: undefined,
    lifecycle: undefined,
  });

  const update = calls.find((call) => call.sql.includes("UPDATE media_retrieval_operator_controls"));
  assert.ok(update);
  assert.deepEqual(update.params, [true, false, true, 3, 3000, 800, 20, 10, "limited_release"]);
});

test("operator controls persist supplied user limits and operation-specific provider reservations", async () => {
  const current = {
    agent_enabled: true,
    provider_calls_enabled: false,
    index_requests_enabled: true,
    user_daily_request_limit: 0,
    user_monthly_budget_fen: 0,
    global_daily_budget_fen: 0,
    caption_reserve_fen: 0,
    embedding_reserve_fen: 0,
    lifecycle: "sandbox",
  };
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("SELECT * FROM media_retrieval_operator_controls")) return [current];
      if (sql.includes("UPDATE media_retrieval_operator_controls")) return [current];
      return [];
    },
  });

  await repository.updateMediaRetrievalOperatorControls({
    userDailyRequestLimit: 9,
    userMonthlyBudgetFen: 9000,
    globalDailyBudgetFen: 5000,
    captionReserveFen: 40,
    embeddingReserveFen: 20,
  });

  const update = calls.find((call) => call.sql.includes("UPDATE media_retrieval_operator_controls"));
  assert.deepEqual(update.params, [true, false, true, 9, 9000, 5000, 40, 20, "sandbox"]);
});

test("budget rollups use UTC and settlement updates the original reservation day", async () => {
  const reservationCreatedAt = "2026-08-05T23:59:59.000Z";
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM media_retrieval_cost_ledger") && sql.includes("FOR UPDATE")) {
        return [{
          id: "reservation-1",
          user_id: USER_A,
          amount_fen: 1,
          created_at: reservationCreatedAt,
        }];
      }
      return [];
    },
  });

  await repository.settleProviderBudget({
    reservationId: "reservation-1",
    disposition: "estimated",
    amountFen: 1,
  });

  const rollupUpdates = calls.filter((call) => call.sql.includes("UPDATE media_retrieval_cost_daily_rollups"));
  assert.equal(rollupUpdates.length, 2);
  for (const update of rollupUpdates) {
    assert.match(update.sql, /\?::timestamptz AT TIME ZONE 'UTC'/);
    assert.ok(update.params.includes(reservationCreatedAt));
  }
});

test("retention uses UTC rollups and scopes event deletion to this Agent only", async () => {
  const { calls, repository } = makeRepository({ respond: () => [] });

  await repository.runMediaRetrievalRetentionSweep({ now: new Date("2026-08-06T00:00:00.000Z") });

  const rollups = calls.filter((call) => call.sql.includes("INSERT INTO media_retrieval_cost_daily_rollups"));
  assert.equal(rollups.length, 2);
  for (const rollup of rollups) assert.match(rollup.sql, /created_at AT TIME ZONE 'UTC'/);
  const eventDeletion = calls.find((call) => call.sql.includes("DELETE FROM agent_run_events"));
  assert.ok(eventDeletion);
  assert.match(eventDeletion.sql, /run\.agent_id = 'media-retrieval'/);
});

test("workers claim jobs and lifecycle records with SKIP LOCKED", async () => {
  const { calls, repository } = makeRepository({ respond: () => [] });

  assert.equal(await repository.claimNextMediaRetrievalJob({ workerId: "worker-one" }), null);
  assert.equal(await repository.claimMediaRetrievalLifecycleOutbox({ workerId: "worker-one" }), null);

  assert.equal(hasSql(calls, "FOR UPDATE SKIP LOCKED"), true);
  assert.equal(hasSql(calls, "FROM media_retrieval_jobs"), true);
  assert.equal(hasSql(calls, "FROM media_retrieval_lifecycle_outbox"), true);
});

test("expired running jobs with reserved or unknown provider charges are blocked, while settled estimated work may resume", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("failure_code = 'retrieval_unknown_charge_no_retry'")) {
        return [{ id: "expired-job", user_id: USER_A, agent_run_id: RUN_A }];
      }
      if (sql.includes("SET disposition = 'unknown'")) {
        return [{ user_id: USER_A, amount_fen: 25, created_at: "2026-08-06T00:00:00.000Z" }];
      }
      return [];
    },
  });

  const result = await repository.reclaimExpiredMediaRetrievalJobs();

  assert.deepEqual(result, { blocked: 1, requeued: 0 });
  assert.equal(hasSql(calls, "failure_code = 'retrieval_unknown_charge_no_retry'"), true);
  assert.equal(hasSql(calls, "disposition IN ('reserved', 'unknown')"), true);
  assert.equal(hasSql(calls, "SET disposition = 'unknown'"), true);
  assert.equal(hasSql(calls, "unknown_fen = unknown_fen + ?"), true);
  assert.equal(hasSql(calls, "SET status = 'queued'"), true);
});

test("purgeMediaRetrievalArtifacts physically deletes derived artifacts and verifies residue in the database", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("DELETE FROM media_retrieval_segments")) return [{ id: "segment-1" }, { id: "segment-2" }];
      if (sql.includes("COUNT(*) AS residue_count")) return [{ residue_count: "0" }];
      return [];
    },
  });

  const result = await repository.purgeMediaRetrievalArtifacts({
    userId: USER_A,
    mediaAssetId: ASSET_A,
    jobId: "purge-job",
  });

  assert.deepEqual(result, { deletedSegments: 2, deletedSnapshots: 0, residueCount: 0 });
  assert.equal(hasSql(calls, "DELETE FROM media_retrieval_segments"), true);
  assert.equal(hasSql(calls, "COUNT(*) AS residue_count"), true);
  const residueCheck = calls.find((call) => call.sql.includes("COUNT(*) AS residue_count"));
  assert.match(residueCheck.sql, /descriptor/i);
  assert.match(residueCheck.sql, /embedding/i);
  assert.ok(residueCheck.params.includes(USER_A));
  assert.ok(residueCheck.params.includes(ASSET_A));
});

test("final segment persistence rejects a revoked profile before inserting any segment", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM media_retrieval_jobs AS job")) {
        return [{
          job_id: "index-job",
          job_user_id: USER_A,
          job_media_asset_id: ASSET_A,
          job_content_fingerprint: assetFingerprint(),
          job_processing_version: "v1",
          profile_epoch: 1,
          index_epoch: 2,
          index_state: "purging",
          consent_version: "media-retrieval-consent-v1",
          job_status: "running",
          asset_id: ASSET_A,
          asset_status: "uploaded",
          deleted_at: null,
          storage_key: "private/a.jpg",
          byte_size: 1,
          updated_at: "2026-08-06T00:00:00.000Z",
        }];
      }
      return [];
    },
  });

  const result = await repository.persistMediaRetrievalSegments({
    userId: USER_A,
    agentRunId: RUN_A,
    jobId: "index-job",
    workerId: "worker-a",
    mediaAssetId: ASSET_A,
    processingVersion: "v1",
    contentFingerprint: assetFingerprint(),
    segments: [{
      segmentIndex: 0,
      sourceKind: "image",
      frameTimestampMs: null,
      descriptor: { summary: "yellow dress" },
      embedding: vector(),
      ...indexingProvenance(),
    }],
  });

  assert.deepEqual(result, { status: "invalidated", reasonCode: "retrieval_not_enabled", persistedCount: 0 });
  assert.equal(hasSql(calls, "INSERT INTO media_retrieval_segments"), false);
});

test("provider dispatch verification binds an index call to live consent, epoch, owner, claim, lease, fingerprint, and processing version", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM media_retrieval_jobs AS job") && sql.includes("job.claimed_by = ?")) {
        return [{
          job_id: "index-job",
          job_user_id: USER_A,
          job_media_asset_id: ASSET_A,
          job_content_fingerprint: assetFingerprint(),
          job_processing_version: "v1",
          job_profile_epoch: 4,
          job_status: "running",
          job_claimed_by: "worker-a",
          profile_index_epoch: 4,
          index_state: "enabled",
          consent_version: "media-retrieval-consent-v1",
          asset_id: ASSET_A,
          asset_status: "uploaded",
          deleted_at: null,
          storage_key: "private/a.jpg",
          byte_size: 1,
          updated_at: "2026-08-06T00:00:00.000Z",
        }];
      }
      return [];
    },
  });

  const verified = await repository.verifyMediaRetrievalJobDispatch({
    jobId: "index-job",
    workerId: "worker-a",
    userId: USER_A,
    mediaAssetId: ASSET_A,
    profileEpoch: 4,
    contentFingerprint: assetFingerprint(),
    processingVersion: "v1",
  });

  assert.deepEqual(verified, { allowed: true, reasonCode: null });
  const select = calls.find((call) => call.sql.includes("job.claimed_by = ?"));
  assert.ok(select);
  assert.match(select.sql, /FOR UPDATE OF job, profile, asset/i);
  assert.match(select.sql, /lease_expires_at > CURRENT_TIMESTAMP/i);
  assert.deepEqual(select.params, ["index-job", USER_A, "worker-a"]);
});

test("provider dispatch verification fails closed when consent or epoch is no longer current", async () => {
  const { repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM media_retrieval_jobs AS job") && sql.includes("job.claimed_by = ?")) {
        return [{
          job_id: "index-job",
          job_user_id: USER_A,
          job_media_asset_id: ASSET_A,
          job_content_fingerprint: assetFingerprint(),
          job_processing_version: "v1",
          job_profile_epoch: 4,
          job_status: "running",
          job_claimed_by: "worker-a",
          profile_index_epoch: 5,
          index_state: "purging",
          consent_version: null,
          asset_id: ASSET_A,
          asset_status: "uploaded",
          deleted_at: null,
          storage_key: "private/a.jpg",
          byte_size: 1,
          updated_at: "2026-08-06T00:00:00.000Z",
        }];
      }
      return [];
    },
  });

  const verified = await repository.verifyMediaRetrievalJobDispatch({
    jobId: "index-job",
    workerId: "worker-a",
    userId: USER_A,
    mediaAssetId: ASSET_A,
    profileEpoch: 4,
    contentFingerprint: assetFingerprint(),
    processingVersion: "v1",
  });

  assert.deepEqual(verified, { allowed: false, reasonCode: "retrieval_not_enabled" });
});

test("temporary cleanup failures are persisted as an owner-scoped retry task", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("INSERT INTO media_retrieval_temporary_cleanup_tasks")) {
        return [{ id: "cleanup-task", status: "queued" }];
      }
      return [];
    },
  });

  const outcome = await repository.enqueueMediaRetrievalTemporaryCleanup({
    userId: USER_A,
    jobId: "index-job",
    objectKey: `users/${USER_A}/media-retrieval-tmp/object.webp`,
  });

  assert.deepEqual(outcome, { queued: true, cleanupTaskId: "cleanup-task" });
  const insert = calls.find((call) => call.sql.includes("INSERT INTO media_retrieval_temporary_cleanup_tasks"));
  assert.ok(insert);
  assert.equal(insert.params.includes(`users/${USER_A}/media-retrieval-tmp/object.webp`), true);
  assert.equal(insert.params.includes(USER_A), true);
});

test("final segment persistence supersedes every existing ready version before inserting the new active version", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM media_retrieval_jobs AS job")) {
        return [{
          job_id: "index-job",
          job_user_id: USER_A,
          job_media_asset_id: ASSET_A,
          job_content_fingerprint: assetFingerprint(),
          job_processing_version: "v1",
          profile_epoch: 1,
          index_epoch: 1,
          index_state: "enabled",
          consent_version: "media-retrieval-consent-v1",
          job_status: "running",
          asset_id: ASSET_A,
          asset_status: "uploaded",
          deleted_at: null,
          storage_key: "private/a.jpg",
          byte_size: 1,
          updated_at: "2026-08-06T00:00:00.000Z",
        }];
      }
      if (sql.includes("INSERT INTO media_retrieval_segments")) return [{ id: "new-segment" }];
      return [];
    },
  });

  const result = await repository.persistMediaRetrievalSegments({
    userId: USER_A,
    agentRunId: RUN_A,
    jobId: "index-job",
    workerId: "worker-a",
    mediaAssetId: ASSET_A,
    processingVersion: "v1",
    contentFingerprint: assetFingerprint(),
    segments: [{
      segmentIndex: 0,
      sourceKind: "image",
      frameTimestampMs: null,
      descriptor: { summary: "yellow dress" },
      embedding: vector(),
      ...indexingProvenance(),
    }],
  });

  assert.deepEqual(result, { status: "persisted", persistedCount: 1 });
  const supersedeIndex = calls.findIndex((call) => call.sql.includes("SET state = 'superseded'"));
  const insertIndex = calls.findIndex((call) => call.sql.includes("INSERT INTO media_retrieval_segments"));
  assert.ok(supersedeIndex >= 0);
  assert.ok(insertIndex > supersedeIndex);
  const supersede = calls[supersedeIndex];
  assert.match(supersede.sql, /media_asset_id = \?/);
  assert.match(supersede.sql, /state = 'ready'/);
});

test("B7 retrieval candidates retain only internal source fields needed for local evidence ranking", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => {
      if (sql.includes("FROM media_retrieval_segments")) {
        return [{
          media_asset_id: ASSET_A,
          frame_timestamp_ms: null,
          descriptor: { summary: "yellow dress", ocrText: ["SUMMER"] },
          caption: "Alice",
          tags: ["yellow"],
          metadata: { album: "summer" },
          kind: "image",
          score: 0.8,
          match_reasons: [],
        }];
      }
      return [];
    },
  });

  const candidates = await repository.searchMediaRetrievalSegments({
    userId: USER_A,
    vector: null,
    identityTerms: ["Alice"],
    limit: 10,
  });

  assert.equal(candidates[0].caption, "Alice");
  assert.deepEqual(candidates[0].tags, ["yellow"]);
  assert.deepEqual(candidates[0].descriptor.ocrText, ["SUMMER"]);
  assert.deepEqual(candidates[0].metadata, { album: "summer" });
  const select = calls.find((call) => call.sql.includes("FROM media_retrieval_segments"));
  assert.match(select.sql, /asset\.caption/i);
  assert.match(select.sql, /asset\.tags/i);
  assert.match(select.sql, /asset\.metadata/i);
});

test("B7 can fetch a larger internal candidate pool before local asset-level deduplication", async () => {
  const { calls, repository } = makeRepository({
    respond: (sql) => (sql.includes("FROM media_retrieval_segments") ? [] : []),
  });

  await repository.searchMediaRetrievalSegments({
    userId: USER_A,
    vector: vector(),
    identityTerms: [],
    limit: 80,
  });

  const select = calls.find((call) => call.sql.includes("FROM media_retrieval_segments"));
  assert.equal(select.params.at(-1), 80);
});
