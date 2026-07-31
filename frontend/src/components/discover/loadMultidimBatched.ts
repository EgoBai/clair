/**
 * 多因子数据全量分批加载器
 *
 * 背景：原实现 `finalScores.slice(0, 15)` 只预载前 15 个板块，其余板块要么无数据、
 * 要么被 buildDemoMultidim 用演示值填充，造成「数据完整」的错觉。
 *
 * 本模块改为**全量**获取：
 *   - 每批 DEFAULT_BATCH_SIZE(20) 个板块，最多 DEFAULT_CONCURRENCY(3) 个批次并发，避免打爆后端
 *     （后端 POST /api/sectors/multidim-v3/batch 内部对 codes 是串行 SQL 计算）
 *   - 每批返回即回调 onChunk，页面渐进式渲染；未加载完成的板块显示 loading 占位，
 *     绝不用演示值填充真实板块
 *   - 支持 AbortSignal，切换行业/概念或卸载时取消在途请求
 */

import type { ApiMeta } from './DataSourceIndicator';

export const DEFAULT_BATCH_SIZE = 20;
export const DEFAULT_CONCURRENCY = 3;

export interface BatchLoadResult {
  /** 成功返回数据的板块数 */
  okCount: number;
  /** 请求失败的批次数 */
  failedBatches: number;
  /** 总批次数 */
  totalBatches: number;
  /** 后端返回的 meta（取最后一个非 live 的，若全为 live 则取任一 live） */
  meta?: ApiMeta;
  /** 是否被中止 */
  aborted: boolean;
}

export interface BatchLoadOptions<T> {
  mode: 'industry' | 'concept';
  batchSize?: number;
  concurrency?: number;
  signal?: AbortSignal;
  /** 每批成功返回时回调（渐进式渲染） */
  onChunk: (items: T[], loadedCodes: string[]) => void;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** meta 严重程度：unavailable > stale > live，用于聚合多批次结果 */
const SEVERITY: Record<ApiMeta['source'], number> = { live: 0, stale: 1, unavailable: 2 };

export async function loadMultidimAll<T extends { industry: string }>(
  codes: string[],
  opts: BatchLoadOptions<T>,
): Promise<BatchLoadResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const batches = chunk(codes, batchSize);

  const result: BatchLoadResult = {
    okCount: 0, failedBatches: 0, totalBatches: batches.length, aborted: false,
  };

  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < batches.length) {
      if (opts.signal?.aborted) { result.aborted = true; return; }
      const batch = batches[cursor++];
      try {
        const r = await fetch('/api/sectors/multidim-v3/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes: batch, mode: opts.mode }),
          signal: opts.signal,
        });
        const d = await r.json();
        const sectors: T[] = d?.data?.sectors ?? [];

        // 聚合 meta（后端未上线时为 undefined，调用方退化处理）
        const meta: ApiMeta | undefined = d?.meta ?? d?.data?.meta;
        if (meta?.source && (!result.meta || SEVERITY[meta.source] > SEVERITY[result.meta.source])) {
          result.meta = meta;
        }

        if (sectors.length > 0) {
          result.okCount += sectors.length;
          if (!opts.signal?.aborted) opts.onChunk(sectors, batch);
        } else {
          // 该批无数据：不填充演示值，交由调用方以 loading/缺失态呈现
          if (!opts.signal?.aborted) opts.onChunk([], batch);
        }
      } catch (e) {
        if (opts.signal?.aborted) { result.aborted = true; return; }
        result.failedBatches += 1;
        // 失败批次同样上报已处理的 code，避免这些板块永久停留在 loading 态
        opts.onChunk([], batch);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));
  return result;
}
