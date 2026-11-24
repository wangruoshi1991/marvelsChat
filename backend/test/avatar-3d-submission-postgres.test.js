import assert from "node:assert/strict";
import { createHash, randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { avatar3dRepository, createAvatar3dRepository } from "../src/avatar-3d-repository.js";
import { createAvatar3dLifecycleService } from "../src/avatar-3d-lifecycle-service.js";
import { createAvatar3dJobRunner } from "../src/avatar-3d-job-runner.js";
import { closeDatabase, createConnectionAdapter, query } from "../src/db.js";

const digest = key => createHash("sha256").update(key).digest("hex");
const integration = {
  skip: process.env.RUN_AVATAR_3D_SUBMISSION_INTEGRATION !== "1" && "Requires a migrated disposable PostgreSQL database",
};
const requireDisposableDatabase = async (t) => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  t.after(closeDatabase);
  const [target] = await query("SELECT current_database() AS name");
  assert.match(target.name, /_migration_test$/);
};

test("3D submission lookup and concurrent admission on disposable PostgreSQL", integration, async t => {
  await requireDisposableDatabase(t);

  const owner = randomUUID(), other = randomUUID();
  const photo = randomUUID();
  try {
    for (const id of [owner, other]) {
      await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'unused',?,?)",
        [id, id + "@example.invalid", "Avatar QA " + id.slice(0, 8), String(randomInt(100000000000, 999999999999))]);
    }
    await query(`INSERT INTO avatar_3d_job_photos
      (id,user_id,original_filename,source_mime_type,source_byte_size,source_storage_key,status)
      VALUES (?,?,'qa.jpg','image/jpeg',10,?,'ready')`, [photo, owner, "qa/" + photo]);
    const input = {
      userId: owner, idempotencyKeyHash: digest(randomUUID()), sourcePhotoId: photo,
      promptPlan: {}, promptPlanVersion: "avatar-multiview-v1", qualityPreset: "ultra",
      geometryQuality: "ultra", textureQuality: "detailed", acceptedCostVersion: "2026-07-20",
      estimatedCostFen: 420, referenceCostVersion: "2026-07-20", referenceEstimatedCostFen: 200,
      acceptedAdultSubject: true, consentVersion: "avatar-face-first-v1", dailyLimit: 3,
    };
    const lookup = (userId = owner, idempotencyKeyHash = input.idempotencyKeyHash) =>
      avatar3dRepository.findSubmission({userId, idempotencyKeyHash});
    const snapshot = () => query(`SELECT row_to_json(j) AS job, row_to_json(r) AS reference,
      row_to_json(p) AS photo FROM avatar_3d_jobs j
      JOIN avatar_3d_reference_sets r ON r.job_id=j.id AND r.user_id=j.user_id
      JOIN avatar_3d_job_photos p ON p.job_id=j.id AND p.user_id=j.user_id
      WHERE j.user_id=?`, [owner]);
    const [first, second] = await Promise.all([
      avatar3dRepository.createFaceFirstJob(input), avatar3dRepository.createFaceFirstJob(input),
    ]);
    assert.deepEqual([first.created, second.created].sort(), [false, true]);
    assert.equal(first.job.id, second.job.id);
    assert.equal(first.referenceSet.id, second.referenceSet.id);
    await assert.rejects(avatar3dRepository.createFaceFirstJob({...input, idempotencyKeyHash: digest(randomUUID())}),
      {status: 409, details: {code: "ACTIVE_JOB_EXISTS"}});
    const before = await snapshot();
    assert.equal(before.length, 1);
    assert.equal((await lookup()).status, "queued_references");
    assert.equal(await lookup(other), null);
    assert.equal(await lookup(owner, digest(randomUUID())), null);
    assert.deepEqual(await snapshot(), before);

    await query("UPDATE avatar_3d_jobs SET status='cancelled', finished_at=clock_timestamp() WHERE id=?", [first.job.id]);
    const terminal = await snapshot();
    assert.equal((await lookup()).id, first.job.id);
    assert.equal((await lookup()).status, "cancelled");
    assert.deepEqual(await snapshot(), terminal);
    await query("UPDATE avatar_3d_jobs SET deleted_at=clock_timestamp() WHERE id=?", [first.job.id]);
    assert.equal(await lookup(), null);
  } finally {
    await query("DELETE FROM users WHERE id IN (?,?)", [owner, other]);
  }
});

const seedOwner = async (t) => {
  const owner = randomUUID();
  await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'unused','Avatar QA',?)",
    [owner, owner + "@example.invalid", String(randomInt(100000000000, 999999999999))]);
  t.after(() => query("DELETE FROM users WHERE id=?", [owner]));
  return owner;
};

const seedJob = async (owner, stage) => {
  const photo = randomUUID();
  await query(`INSERT INTO avatar_3d_job_photos
    (id,user_id,original_filename,source_mime_type,source_byte_size,source_storage_key,normalized_storage_key,status)
    VALUES (?,?,'qa.jpg','image/jpeg',10,?,?,'ready')`, [photo, owner, "source/" + photo, "normalized/" + photo]);
  const { job, referenceSet } = await avatar3dRepository.createFaceFirstJob({
    userId: owner, idempotencyKeyHash: digest(randomUUID()), sourcePhotoId: photo,
    promptPlan: {}, promptPlanVersion: "avatar-multiview-v1", qualityPreset: "standard",
    geometryQuality: "standard", textureQuality: "standard", acceptedCostVersion: "fixture",
    estimatedCostFen: 420, referenceCostVersion: "fixture", referenceEstimatedCostFen: 200,
    acceptedAdultSubject: true, consentVersion: "fixture", dailyLimit: 3,
  });
  if (stage === "model") {
    await query("UPDATE avatar_3d_jobs SET status='queued_3d' WHERE id=?", [job.id]);
    await query("UPDATE avatar_3d_reference_sets SET status='accepted' WHERE id=?", [referenceSet.id]);
    for (const [index, view] of ["front", "left", "back", "right"].entries()) {
      await query(`INSERT INTO avatar_3d_reference_images
        (id,reference_set_id,job_id,user_id,view,sequence_index,storage_key,mime_type,byte_size,width,height)
        VALUES (?,?,?,?,?,?,?,'image/jpeg',10,10,10)`,
      [randomUUID(), referenceSet.id, job.id, owner, view, index, "fixture/" + view]);
    }
  }
  return job;
};

for (const stage of ["references", "model"]) {
  test(`${stage} submission uses a live PostgreSQL lease and rejects a late receipt after re-claim`, integration, async t => {
    await requireDisposableDatabase(t);
    const secondClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await secondClient.connect();
    t.after(() => secondClient.end());
    const connection = createConnectionAdapter(secondClient);
    const secondRepository = createAvatar3dRepository({
      queryFn: connection.query,
      transactionFn: async (work) => {
        await secondClient.query("BEGIN");
        try {
          const result = await work(connection);
          await secondClient.query("COMMIT");
          return result;
        } catch (error) {
          await secondClient.query("ROLLBACK");
          throw error;
        }
      },
    });
    const firstBackend = (repo) => ({
      ...repo,
      listExpiredPrivateAssets: async () => [],
    });
    for (const expired of [false, true]) {
      await t.test(expired ? "expired owner" : "active owner", async st => {
        const owner = await seedOwner(st);
        const original = await seedJob(owner, stage);
        const entered = Promise.withResolvers();
        const reply = Promise.withResolvers();
        const errors = [];
        let submissions = 0;
        const submit = async () => {
          submissions++;
          entered.resolve();
          return reply.promise;
        };
        const provider = { submit };
        const storage = { createProviderReadUrl: () => "https://example.invalid/synthetic-image" };
        const runner = (repo) => {
          const repository = firstBackend(repo);
          return createAvatar3dJobRunner({
            repository,
            service: createAvatar3dLifecycleService({
              repository, storage, wanMultiview: { submitWanMultiviewJob: submit },
              providers: { resolve: () => provider }, runtime: { retentionDays: 1 },
            }),
            storage, enabled: () => true, batchSize: 1,
            logger: { error: (entry) => errors.push(entry) },
          });
        };
        const initial = runner(avatar3dRepository).runOnce();
        const successReceipt = {
          taskId: "fixture-task", requestId: "fixture-request", state: "processing",
          progress: 10, providerStatus: "RUNNING",
        };
        try {
          await Promise.race([
            entered.promise,
            initial.then(() => { throw new Error(JSON.stringify(errors)); }),
          ]);
          const read = () => secondRepository.getJob({ userId: owner, jobId: original.id, includePrivate: true });
          const submitting = await read();
          assert.equal(submitting.status, stage === "model" ? "submitting_3d" : "submitting_references");
          assert.ok(submitting.claimToken);
          await runner(secondRepository).runOnce();
          assert.equal((await read()).claimToken, submitting.claimToken);
          assert.equal(submissions, 1);

          if (expired) {
            await query("UPDATE avatar_3d_jobs SET claim_lease_until=clock_timestamp()-INTERVAL '1 second' WHERE id=?", [original.id]);
            await runner(secondRepository).runOnce();
            assert.equal((await read()).status, "submission_unknown");
          }
          reply.resolve(successReceipt);
          await initial;
          const final = await read();
          assert.equal(submissions, 1);
          assert.equal(final.status, expired
            ? "submission_unknown" : stage === "model" ? "processing_3d" : "processing_references");
          const reference = await secondRepository.getReferenceSetForJob({
            userId: owner, jobId: original.id, includePrivate: true,
          });
          assert.equal(stage === "model" ? final.modelProviderTaskId : reference.providerTaskId,
            expired ? null : "fixture-task");
          if (expired) assert.equal(errors.length, 1);
          else assert.deepEqual(errors, []);

          if (stage === "model" && !expired) {
            const modelOwner = await secondRepository.claimNextStep();
            const input = { userId: owner, jobId: original.id, title: "fixture", providerTaskId: "fixture-task" };
            assert.equal(await avatar3dRepository.createPreparingModel({
              ...input, claimToken: submitting.claimToken,
            }), null);
            const model = await secondRepository.createPreparingModel({
              ...input, claimToken: modelOwner.claimToken,
            });
            assert.equal(model.status, "preparing");
            await secondRepository.transitionJob({
              userId: owner, jobId: original.id, fromStatus: "processing_3d", toStatus: "persisting",
              modelId: model.id, claimToken: modelOwner.claimToken,
            });
            const persistingOwner = await secondRepository.claimNextStep();
            const glb = {
              storageKey: "fixture/web.glb", contentType: "model/gltf-binary", byteSize: 32,
              mobile: { storageKey: "fixture/mobile.glb", contentType: "model/gltf-binary", byteSize: 16 },
            };
            assert.equal(await avatar3dRepository.completePreparingModel({
              userId: owner, jobId: original.id, glb, claimToken: modelOwner.claimToken,
            }), null);
            assert.equal((await secondRepository.completePreparingModel({
              userId: owner, jobId: original.id, glb, claimToken: persistingOwner.claimToken,
            })).status, "active");
          }
        } finally {
          reply.resolve(successReceipt);
          await initial;
        }
      });
    }
  });
}

test("private asset cleanup moves beyond a failed page and resumes by object after restart", integration, async t => {
  await requireDisposableDatabase(t);
  const owner = await seedOwner(t);
  const objects = new Set();
  for (let i = 0; i < 51; i++) {
    const key = `fixture/${owner}/${i}`;
    objects.add(key);
    await query(`INSERT INTO avatar_3d_job_photos
      (id,user_id,original_filename,source_mime_type,source_byte_size,source_storage_key,retention_until)
      VALUES (?,?,'qa.jpg','image/jpeg',10,?,clock_timestamp()-INTERVAL '1 hour'+(?::integer*INTERVAL '1 second'))`,
    [randomUUID(), owner, key, i]);
  }
  let available = false;
  const runner = () => createAvatar3dJobRunner({
    storage: { deleteAvatarObjects: async ([key]) => {
      if (!available && !key.endsWith("/50")) throw new Error("synthetic storage failure");
      objects.delete(key);
    } },
    logger: { error: () => {} },
  });
  assert.equal(await runner().runCleanup(), false);
  assert.equal(objects.size, 50);
  const [first] = await query(`SELECT count(*)::int AS retry_count, min(attempts)::int AS attempts
    FROM avatar_3d_private_asset_cleanup_retries WHERE storage_key LIKE ?`, [`fixture/${owner}/%`]);
  assert.deepEqual(first, { retry_count: 50, attempts: 1 });
  const [before] = await query("SELECT count(*)::int AS deleted FROM avatar_3d_job_photos WHERE user_id=? AND deleted_at IS NOT NULL", [owner]);
  assert.equal(before.deleted, 1);

  available = true;
  await runner().runCleanup();
  assert.equal(objects.size, 50);
  await query("UPDATE avatar_3d_private_asset_cleanup_retries SET retry_at=clock_timestamp() WHERE storage_key LIKE ?", [`fixture/${owner}/%`]);
  assert.equal(await runner().runCleanup(), true);
  assert.equal(objects.size, 0);
  const [after] = await query("SELECT count(*)::int AS deleted FROM avatar_3d_job_photos WHERE user_id=? AND deleted_at IS NOT NULL", [owner]);
  assert.equal(after.deleted, 51);
  assert.deepEqual(await query("SELECT 1 FROM avatar_3d_private_asset_cleanup_retries WHERE storage_key LIKE ?", [`fixture/${owner}/%`]), []);
});
