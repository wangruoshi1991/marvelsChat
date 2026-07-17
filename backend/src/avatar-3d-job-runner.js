import { config } from "./config.js";
import { avatar3dLifecycleService } from "./avatar-3d-lifecycle-service.js";
import { avatar3dRepository } from "./avatar-3d-repository.js";
import { avatar3dStorage } from "./avatar-3d-storage.js";

const hourMs = 60 * 60 * 1000;
const defaultLogger = { error: (entry) => console.error(JSON.stringify(entry)) };

export function createAvatar3dJobRunner({
  repository = avatar3dRepository,
  service = avatar3dLifecycleService,
  storage = avatar3dStorage,
  enabled = () => config.avatar3d.enabled,
  now = () => new Date(),
  intervalMs = 5000,
  batchSize = 2,
  claimStaleAfterMs = 2 * 60 * 1000,
  logger = defaultLogger,
} = {}) {
  let timer = null;
  let running = false;
  let lastCleanupAt = 0;

  const runCleanup = async () => {
    const assets = await repository.listExpiredPrivateAssets({ before: now(), limit: 50 });
    try {
      for (const asset of assets) {
        await storage.deleteAvatarObjects([asset.storage_key]);
        await repository.markPrivateAssetDeleted({
          assetKind: asset.asset_kind,
          assetId: asset.asset_id,
        });
      }
      lastCleanupAt = now().getTime();
      return true;
    } catch (error) {
      logger.error({ type: "avatar_3d_cleanup_error", errorName: error?.name || "Error" });
      return false;
    }
  };

  const runOnce = async () => {
    if (!enabled() || running) return { skipped: true };
    running = true;
    try {
      for (let index = 0; index < batchSize; index += 1) {
        const job = await repository.claimNextStep({
          staleBefore: new Date(now().getTime() - claimStaleAfterMs),
        });
        if (!job) break;
        try {
          await service.processJob(job);
        } catch (error) {
          await repository.releaseJobClaim?.({ jobId: job.id });
          logger.error({
            type: "avatar_3d_job_runner_error",
            jobId: job.id,
            errorName: error?.name || "Error",
          });
        }
      }
      if (now().getTime() - lastCleanupAt >= hourMs) await runCleanup();
      return { skipped: false };
    } catch (error) {
      logger.error({
        type: "avatar_3d_job_runner_error",
        jobId: null,
        errorName: error?.name || "Error",
      });
      return { skipped: false };
    } finally {
      running = false;
    }
  };

  const start = () => {
    if (timer) return;
    void runOnce();
    timer = setInterval(() => void runOnce(), intervalMs);
    timer.unref?.();
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  return { runOnce, runCleanup, start, stop };
}

export const avatar3dJobRunner = createAvatar3dJobRunner();
