import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./uploadQueue";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("mapWithConcurrency", () => {
  it("runs at most two workers and preserves result order", async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    let active = 0;
    let maximumActive = 0;
    const resultPromise = mapWithConcurrency([0, 1, 2, 3], 2, async (item) => {
      started.push(item);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await gates[item].promise;
      active -= 1;
      return item * 10;
    });

    await flush();
    expect(started).toEqual([0, 1]);
    gates[1].resolve();
    await flush();
    expect(started).toEqual([0, 1, 2]);
    gates[0].resolve();
    await flush();
    expect(started).toEqual([0, 1, 2, 3]);
    gates[2].resolve();
    gates[3].resolve();

    await expect(resultPromise).resolves.toEqual([0, 10, 20, 30]);
    expect(maximumActive).toBe(2);
  });

  it("stops scheduling after the first error and waits for started work", async () => {
    const secondGate = deferred();
    const started: number[] = [];
    const resultPromise = mapWithConcurrency([0, 1, 2], 2, async (item) => {
      started.push(item);
      if (item === 0) throw new Error("upload failed");
      await secondGate.promise;
      return item;
    });
    let settled = false;
    const observed = resultPromise.finally(() => {
      settled = true;
    });

    await flush();
    expect(started).toEqual([0, 1]);
    expect(settled).toBe(false);
    secondGate.resolve();

    await expect(observed).rejects.toThrow("upload failed");
    expect(started).toEqual([0, 1]);
  });

  it("rejects invalid concurrency limits", async () => {
    await expect(mapWithConcurrency([1], 0, async (item) => item)).rejects.toThrow(
      "Concurrency limit must be a positive integer",
    );
    await expect(mapWithConcurrency([1], 1.5, async (item) => item)).rejects.toThrow(
      "Concurrency limit must be a positive integer",
    );
  });
});
