/**
 * Batch Operations Service
 * 批量操作服务 - 批量处理优化
 */

export interface BatchConfig {
  maxBatchSize: number;
  maxWaitMs: number;
  processFn: (items: unknown[]) => Promise<unknown[]>;
}

interface PendingItem {
  item: unknown;
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
}

export class BatchProcessor {
  private pending: PendingItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing: boolean = false;
  private config: BatchConfig;

  constructor(config: BatchConfig) {
    this.config = config;
  }

  add<T>(item: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      this.pending.push({
        item,
        resolve: resolve as (result: unknown) => void,
        reject,
      });

      if (this.pending.length >= this.config.maxBatchSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.config.maxWaitMs);
      }
    });
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.pending.length === 0 || this.processing) return;

    this.processing = true;
    const batch = this.pending.splice(0, this.config.maxBatchSize);

    try {
      const items = batch.map(b => b.item);
      const results = await this.config.processFn(items);

      batch.forEach((b, i) => {
        b.resolve(results[i]);
      });
    } catch (error) {
      batch.forEach(b => b.reject(error));
    } finally {
      this.processing = false;
      if (this.pending.length > 0) {
        this.flush();
      }
    }
  }

  getPendingCount(): number {
    return this.pending.length;
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const error = new Error('Batch cleared');
    this.pending.forEach(b => b.reject(error));
    this.pending = [];
  }
}

/**
 * Parallel batch executor with concurrency control
 */
export async function batchExecute<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<Array<{ item: T; result?: R; error?: Error }>> {
  const results: Array<{ item: T; result?: R; error?: Error }> = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        const result = await fn(items[i]);
        results.push({ item: items[i], result });
      } catch (error) {
        results.push({ item: items[i], error: error as Error });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  // Sort results to match input order
  results.sort((a, b) => items.indexOf(a.item) - items.indexOf(b.item));
  return results;
}

/**
 * Chunk array into batches
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Process array in chunks with delay between batches
 */
export async function processInChunks<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  chunkSize: number = 10,
  delayMs: number = 100
): Promise<R[]> {
  const results: R[] = [];
  const chunks = chunk(items, chunkSize);

  for (let i = 0; i < chunks.length; i++) {
    const chunkResults = await Promise.all(chunks[i].map(fn));
    results.push(...chunkResults);

    if (i < chunks.length - 1 && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}
