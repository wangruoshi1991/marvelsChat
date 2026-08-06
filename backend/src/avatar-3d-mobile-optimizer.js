import { Worker } from "node:worker_threads";
import { HttpError } from "./http-error.js";

const defaultTimeoutMs = 60_000;

const optimizationError = () => new HttpError(
  502,
  "Avatar model could not be prepared for the App.",
  { code: "MOBILE_MODEL_OPTIMIZATION_FAILED" },
);

export function optimizeAvatarGlbForMobile(
  source,
  { timeoutMs = defaultTimeoutMs, WorkerClass = Worker } = {},
) {
  if (!Buffer.isBuffer(source) || source.length === 0) {
    return Promise.reject(optimizationError());
  }

  const input = Uint8Array.from(source);
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new WorkerClass(
        new URL("./avatar-3d-mobile-optimizer-worker.js", import.meta.url),
        {
          resourceLimits: { maxOldGenerationSizeMb: 1024 },
          transferList: [input.buffer],
          workerData: input.buffer,
        },
      );
    } catch {
      reject(optimizationError());
      return;
    }
    let settled = false;
    let timeout;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      callback();
    };
    timeout = setTimeout(
      () => finish(() => reject(optimizationError())),
      timeoutMs,
    );

    worker.once("message", (message) => {
      if (!message?.ok || !(message.body instanceof ArrayBuffer)) {
        finish(() => reject(optimizationError()));
        return;
      }
      finish(() => resolve({
        body: Buffer.from(message.body),
        metrics: message.metrics || {},
      }));
    });
    worker.once("error", () => finish(() => reject(optimizationError())));
    worker.once("exit", () => {
      if (!settled) finish(() => reject(optimizationError()));
    });
  });
}
