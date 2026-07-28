export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Concurrency limit must be a positive integer");
  }
  if (!items.length) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let stopped = false;
  let failed = false;
  let firstError: unknown;

  const runWorker = async () => {
    while (!stopped) {
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (cause) {
        if (!failed) {
          failed = true;
          firstError = cause;
        }
        stopped = true;
      }
    }
  };

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  if (failed) throw firstError;
  return results;
}
