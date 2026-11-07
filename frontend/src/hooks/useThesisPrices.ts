import { useEffect, useMemo, useState } from 'react';
import { batchGetQuotes } from '../services/api';

/** 观点检查用的最新收盘价。取不到就是 null，由调用方判定为「待验证」。 */
export type ThesisPriceMap = Record<string, number | null>;

interface QuoteLike {
  symbol?: string;
  latestQuote?: { closePrice?: number | null } | null;
}

/**
 * 从批量行情响应里取出股票数组。
 *
 * 线上真实契约是 `{ data: StockWithQuote[], success: true }`（见
 * `POST /api/stocks/batch/quotes` 实测），不是 `{ data: { stocks: [] } }`。
 * 这里同时兼容两种包装，避免后端一改外层就静默退化成「全部待验证」。
 */
export function pickStocks(payload: unknown): QuoteLike[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as { data?: unknown; stocks?: unknown };
  const candidates: unknown[] = [];

  if (Array.isArray(root.data)) candidates.push(root.data);
  if (root.data && typeof root.data === 'object') {
    const body = root.data as { stocks?: unknown; data?: unknown };
    if (Array.isArray(body.stocks)) candidates.push(body.stocks);
    if (Array.isArray(body.data)) candidates.push(body.data);
  }
  if (Array.isArray(root.stocks)) candidates.push(root.stocks);

  const found = candidates.find((item) => Array.isArray(item));
  return (found as QuoteLike[] | undefined) ?? [];
}

/** 把批量行情响应归一成「标的 -> 最新收盘价」。取不到价就是 null。 */
export function parseThesisPrices(payload: unknown): ThesisPriceMap {
  const next: ThesisPriceMap = {};
  for (const stock of pickStocks(payload)) {
    if (stock.symbol) next[stock.symbol] = stock.latestQuote?.closePrice ?? null;
  }
  return next;
}

/**
 * 批量取观点卡标的最新价。
 * 一次请求拉全部标的，失败时不抛错、不缓存假价格——调用方会显示「待验证」。
 */
export function useThesisPrices(symbols: string[]): ThesisPriceMap {
  const key = useMemo(
    () => Array.from(new Set(symbols.filter(Boolean))).sort().join(','),
    [symbols],
  );
  const [prices, setPrices] = useState<ThesisPriceMap>({});

  useEffect(() => {
    if (!key) {
      setPrices({});
      return;
    }
    let alive = true;
    batchGetQuotes(key.split(','))
      .then((response) => {
        if (!alive) return;
        setPrices(parseThesisPrices(response));
      })
      .catch(() => {
        // 行情失败不阻断观点列表：价格留空，结论显示「待验证」。
        if (alive) setPrices({});
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return prices;
}