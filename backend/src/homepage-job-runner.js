import { config } from "./config.js";
import { homepageLifecycleService } from "./homepage-lifecycle-service.js";
import { homepageRepository } from "./homepage-repository.js";

const defaultLogger = {
  error: (entry) => console.error(JSON.stringify(entry)),
};

export function createHomepageJobRunner({
  repository = homepageRepository,
  service = homepageLifecycleService,
  enabled = () => config.homepage.enabled,
  now = () => new Date(),
  staleAfterMs = 2 * 60 * 1000,
  intervalMs = 5000,
  batchSize = 4,
  logger = defaultLogger,
} = {}) {
  let timer = null;
  let running = false;

  const runOnce = async () => {
    if (!enabled() || running) return;
    running = true;
    try {
      await repository.requeueStaleGenerationJobs({
        staleBefore: new Date(now().getTime() - staleAfterMs),
      });
      const jobs = await repository.listQueuedGenerationJobs({ limit: batchSize });
      await Promise.all(jobs.map(async (job) => {
        try {
          await service.processGenerationJob({ user: { id: job.userId }, jobId: job.id });
        } catch (error) {
          logger.error({
            type: "homepage_job_runner_error",
            jobId: job.id,
            errorName: error?.name || "Error",
          });
        }
      }));
    } catch (error) {
      logger.error({
        type: "homepage_job_runner_error",
        jobId: null,
        errorName: error?.name || "Error",
      });
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

  return { runOnce, start, stop };
}

export const homepageJobRunner = createHomepageJobRunner();
