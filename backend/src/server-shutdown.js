const defaultShutdownTimeoutMs = 75_000;

const closeHttpServer = (server) => new Promise((resolve, reject) => {
  if (!server.listening) {
    resolve();
    return;
  }
  server.close((error) => error ? reject(error) : resolve());
  server.closeIdleConnections?.();
});

const withTimeout = async (operation, timeoutMs, onTimeout) => {
  let timer;
  try {
    await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new Error("Graceful shutdown timed out."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export function createGracefulShutdown({
  server,
  realtimeGateway,
  jobRunner,
  closeDatabase,
  timeoutMs = defaultShutdownTimeoutMs,
  logger = console,
} = {}) {
  let shutdownPromise = null;

  const shutdown = (signal = "manual") => {
    if (shutdownPromise) return shutdownPromise;
    logger.info(JSON.stringify({ type: "server_shutdown_started", signal }));
    const draining = Promise.all([
      closeHttpServer(server),
      realtimeGateway.close(),
      jobRunner.stop(),
    ]);
    shutdownPromise = (async () => {
      try {
        await withTimeout(draining, timeoutMs, () => server.closeAllConnections?.());
        await closeDatabase();
        logger.info(JSON.stringify({ type: "server_shutdown_completed", signal }));
      } catch (error) {
        server.closeAllConnections?.();
        try {
          await closeDatabase();
        } catch {
          // The original shutdown failure remains the actionable error.
        }
        throw error;
      }
    })();
    return shutdownPromise;
  };

  return { shutdown };
}

export function installGracefulShutdown(options, processRef = process) {
  const controller = createGracefulShutdown(options);
  for (const signal of ["SIGTERM", "SIGINT"]) {
    processRef.once(signal, () => {
      void controller.shutdown(signal).catch((error) => {
        options.logger?.error?.(JSON.stringify({
          type: "server_shutdown_failed",
          signal,
          errorName: error?.name || "Error",
        }));
        processRef.exitCode = 1;
      });
    });
  }
  return controller;
}
