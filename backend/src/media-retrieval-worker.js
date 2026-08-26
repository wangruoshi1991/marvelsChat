import crypto from "crypto";
import { config } from "./config.js";
import { query, withTransaction } from "./db.js";
import { putPrivateObjectToOss } from "./asset-storage-service.js";
import {
  createEphemeralProviderUrl,
  extractRepresentativeFrames,
  loadOwnedMediaBytes,
  normalizeImageForProvider,
} from "./media-retrieval-media.js";
import { createMediaRetrievalProvider } from "./media-retrieval-provider.js";
import { createMediaRetrievalRepository } from "./media-retrieval-repository.js";
import { processMediaRetrievalJob } from "./media-retrieval-service.js";
import {
  createOssGetSignedUrl,
  deleteOssObject,
  fetchOssObject,
} from "./oss-service.js";

const sleep = (milliseconds, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener?.("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

export function createMediaRetrievalWorkerDependencies({
  repository = createMediaRetrievalRepository({ query, withTransaction }),
  provider = createMediaRetrievalProvider({ config }),
  media,
} = {}) {
  return {
    repository,
    provider,
    media: media || {
      loadOwnedMediaBytes: (input) => loadOwnedMediaBytes({ ...input, fetchOssObject }),
      normalizeImageForProvider,
      extractRepresentativeFrames,
      createEphemeralProviderUrl: (input) =>
        createEphemeralProviderUrl({
          ...input,
          putPrivateObject: putPrivateObjectToOss,
          createGetSignedUrl: createOssGetSignedUrl,
          deleteObject: deleteOssObject,
        }),
      deleteEphemeralProviderObject: ({ objectKey }) => deleteOssObject({ objectKey }),
    },
  };
}

export async function runMediaRetrievalWorker({
  repository,
  provider,
  media,
  signal,
  workerId = `media-retrieval-${crypto.randomUUID()}`,
  pollMs = config.mediaRetrieval.workerPollMs,
  now = () => Date.now(),
} = {}) {
  if (!repository || !provider || !media) {
    throw new TypeError("Media retrieval worker requires repository, provider, and media dependencies.");
  }
  let lastRetentionAt = 0;
  await repository.heartbeatMediaRetrievalWorker({ workerId, state: "starting" });
  while (!signal?.aborted) {
    await repository.heartbeatMediaRetrievalWorker({ workerId, state: "ready" });
    if (now() - lastRetentionAt >= 24 * 60 * 60 * 1000) {
      await repository.runMediaRetrievalRetentionSweep({ now: new Date(now()) });
      lastRetentionAt = now();
    }
    await repository.reclaimExpiredMediaRetrievalJobs();
    const cleanupTask = typeof repository.claimMediaRetrievalTemporaryCleanup === "function"
      ? await repository.claimMediaRetrievalTemporaryCleanup({ workerId })
      : null;
    if (cleanupTask) {
      try {
        if (typeof media.deleteEphemeralProviderObject !== "function") throw new Error("cleanup dependency unavailable");
        await media.deleteEphemeralProviderObject({ objectKey: cleanupTask.objectKey || cleanupTask.object_key });
        await repository.completeMediaRetrievalTemporaryCleanup({ cleanupTaskId: cleanupTask.id, workerId });
      } catch {
        await repository.retryMediaRetrievalTemporaryCleanup?.({ cleanupTaskId: cleanupTask.id, workerId });
      }
      continue;
    }
    const outbox = await repository.claimMediaRetrievalLifecycleOutbox({ workerId });
    if (outbox) {
      await repository.createAssetPurgeRunAndJob({ outboxId: outbox.id, workerId });
      continue;
    }
    const job = await repository.claimNextMediaRetrievalJob({ workerId });
    if (job) {
      await processMediaRetrievalJob({ job, repository, provider, media, workerId });
      continue;
    }
    await sleep(pollMs, signal);
  }
  await repository.heartbeatMediaRetrievalWorker({ workerId, state: "stopped" });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const dependencies = createMediaRetrievalWorkerDependencies();
  runMediaRetrievalWorker({ ...dependencies, signal: controller.signal }).catch((error) => {
    console.error("Media retrieval worker stopped unexpectedly.");
    process.exitCode = 1;
  });
}
