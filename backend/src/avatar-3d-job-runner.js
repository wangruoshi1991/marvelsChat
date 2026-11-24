import { config } from "./config.js";
import { avatar3dLifecycleService } from "./avatar-3d-lifecycle-service.js";
import { avatar3dRepository } from "./avatar-3d-repository.js";
import { avatar3dStorage } from "./avatar-3d-storage.js";

const cleanupIntervalMs = 60 * 1000;
const cleanupPageSize = 50;
const cleanupPagesPerPass = 4;
const defaultLogger = { error: (entry) => console.error(JSON.stringify(entry)) };
const safeRunnerErrorCode = (error) => {
  const code = error?.details?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,80}$/.test(code)
    ? code
    : "UNEXPECTED_RUNNER_ERROR";
};

export function createAvatar3dJobRunner({
  repository = avatar3dRepository,
  service = avatar3dLifecycleService,
  storage = avatar3dStorage,
  enabled = () => config.avatar3d.enabled,
  now = () => new Date(),
  intervalMs = 5000,
  batchSize = 2,
  claimLeaseMs = 120_000,
  logger = defaultLogger,
} = {}) {
  let timer = null;
  let inFlight = null;
  let stopping = false;
  let lastCleanupAt = 0;

  const runCleanup = async () => {
    let succeeded = true;
    for (let page = 0; page < cleanupPagesPerPass; page += 1) {
      const assets = await repository.listExpiredPrivateAssets({ before: now(), limit: cleanupPageSize });
      for (const asset of assets) {
        const target = {
          assetKind: asset.asset_kind,
          assetId: asset.asset_id,
          storageKey: asset.storage_key,
        };
        try {
          await storage.deleteAvatarObjects([target.storageKey]);
          await repository.markPrivateAssetDeleted(target);
        } catch (error) {
          succeeded = false;
          const errorCode = safeRunnerErrorCode(error);
          logger.error({ type: "avatar_3d_cleanup_error", assetKind: target.assetKind,
            assetId: target.assetId, errorCode });
          try {
            await repository.recordPrivateAssetCleanupFailure({ ...target, errorCode });
          } catch (recordError) {
            logger.error({ type: "avatar_3d_cleanup_record_error", assetKind: target.assetKind,
              assetId: target.assetId, errorCode: safeRunnerErrorCode(recordError) });
          }
        }
      }
      if (assets.length < cleanupPageSize) {
        lastCleanupAt = now().getTime();
        return succeeded;
      }
    }
    return succeeded;
  };

  const executeRun = async () => {
    try {
      for (let index = 0; index < batchSize && !stopping; index += 1) {
        const job = await repository.claimNextStep({
          leaseMs: claimLeaseMs,
        });
        if (!job) break;
        let renewTimer = null;
        let renewal = null;
        try {
          if (job.claimToken) {
            renewTimer = setInterval(() => {
              if (renewal) return;
              renewal = repository.renewJobClaim({
                jobId: job.id, claimToken: job.claimToken, leaseMs: claimLeaseMs,
              }).then((renewed) => {
                if (!renewed) clearInterval(renewTimer);
              }).catch((error) => {
                logger.error({
                  type: "avatar_3d_claim_renew_error",
                  jobId: job.id,
                  errorCode: safeRunnerErrorCode(error),
                  errorName: error?.name || "Error",
                });
              }).finally(() => { renewal = null; });
            }, Math.max(1, Math.floor(claimLeaseMs / 4)));
            renewTimer.unref?.();
          }
          await service.processJob(job);
        } catch (error) {
          logger.error({
            type: "avatar_3d_job_runner_error",
            jobId: job.id,
            jobStatus: job.status,
            errorCode: safeRunnerErrorCode(error),
            errorName: error?.name || "Error",
          });
          await repository.releaseJobClaim?.({ jobId: job.id, claimToken: job.claimToken });
        } finally {
          if (renewTimer) clearInterval(renewTimer);
          await renewal;
        }
      }
      if (!stopping && now().getTime() - lastCleanupAt >= cleanupIntervalMs) await runCleanup();
      return { skipped: false };
    } catch (error) {
      logger.error({
        type: "avatar_3d_job_runner_error",
        jobId: null,
        errorCode: safeRunnerErrorCode(error),
        errorName: error?.name || "Error",
      });
      return { skipped: false };
    } finally {
      inFlight = null;
    }
  };

  const runOnce = () => {
    if (!enabled() || stopping || inFlight) return Promise.resolve({ skipped: true });
    inFlight = executeRun();
    return inFlight;
  };

  const start = () => {
    if (timer) return;
    stopping = false;
    void runOnce();
    timer = setInterval(() => void runOnce(), intervalMs);
    timer.unref?.();
  };

  const stop = async () => {
    stopping = true;
    if (timer) clearInterval(timer);
    timer = null;
    await inFlight;
  };

  return { runOnce, runCleanup, start, stop };
}

export const avatar3dJobRunner = createAvatar3dJobRunner();
