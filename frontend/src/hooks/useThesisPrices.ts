import { useEffect, useMemo, useState } from 'react';
import { batchGetQuotes } from '../services/api';

/** 观点检查用的最新收盘价。取不到就是 null，由调用方判定为「待验证」。 */
export type ThesisPriceMap = Record<string, number | null>;

interface QuoteLike {
  symbol?: string;
  latestQuote?: { closePrice?: number | null } | null;
}

function pickStocks(payload: unknown): QuoteLike[] {
  if (!payload || typeof payload !== 'object') return [];
  const outer = payload as { data?: unknown; stocks?: unknown };
  const body = (outer.data ?? outer) as { stocks?: unknown };
  return Array.isArray(body.stocks) ? (body.stocks as QuoteLike[]) : [];
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
        const next: ThesisPriceMap = {};
        for (const stock of pickStocks(response)) {
          if (stock.symbol) next[stock.symbol] = stock.latestQuote?.closePrice ?? null;
        }
        setPrices(next);
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
