import { afterEach, describe, expect, it } from "vitest";
import { getWorkerConcurrency, mapWithConcurrency } from "../modules/worker/worker.concurrency.js";

const originalConcurrency = process.env.WORKER_CONCURRENCY;

afterEach(() => {
  if (originalConcurrency === undefined) delete process.env.WORKER_CONCURRENCY;
  else process.env.WORKER_CONCURRENCY = originalConcurrency;
});

describe("worker concurrency configuration", () => {
  it("uses a safe default and validates configured values", () => {
    delete process.env.WORKER_CONCURRENCY;
    expect(getWorkerConcurrency()).toBe(10);

    process.env.WORKER_CONCURRENCY = "20";
    expect(getWorkerConcurrency()).toBe(20);

    process.env.WORKER_CONCURRENCY = "0";
    expect(getWorkerConcurrency()).toBe(10);
  });
});

describe("mapWithConcurrency", () => {
  it("never exceeds the configured number of active deliveries", async () => {
    let active = 0;
    let maximumActive = 0;
    const completed = [];

    await mapWithConcurrency(Array.from({ length: 25 }, (_, i) => i), 5, async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed.push(item);
      active -= 1;
    });

    expect(maximumActive).toBe(5);
    expect(completed).toHaveLength(25);
  });

  it("supports an empty retry batch", async () => {
    await expect(mapWithConcurrency([], 10, async () => {})).resolves.toBeUndefined();
  });
});
