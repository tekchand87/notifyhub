// Bounded concurrency primitives shared by Kafka and retry processing.

const MAX_WORKER_CONCURRENCY = 1_000;

export const getWorkerConcurrency = () => {
  const configured = Number(process.env.WORKER_CONCURRENCY);
  if (!Number.isSafeInteger(configured) || configured < 1) return 10;
  return Math.min(configured, MAX_WORKER_CONCURRENCY);
};

/**
 * Process items with a fixed number of workers. Unlike Promise.all(items.map),
 * this never creates unbounded in-flight external deliveries.
 */
export const mapWithConcurrency = async (items, concurrency, handler) => {
  const limit = Math.min(Math.max(1, concurrency), items.length);
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await handler(items[index], index);
    }
  });
  await Promise.all(workers);
};
