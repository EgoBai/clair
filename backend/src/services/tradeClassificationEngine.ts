/**
 * TradeClassificationEngine - 交易分类引擎
 * Lee-Ready算法、Bulk算法等交易方向分类
 */

export interface Tick { price: number; bid: number; ask: number; }

export function leeReady(tick: Tick): 'BUY' | 'SELL' {
  const mid = (tick.bid + tick.ask) / 2;
  if (tick.price > mid) return 'BUY';
  if (tick.price < mid) return 'SELL';
  return tick.price >= tick.ask ? 'BUY' : 'SELL';
}

export function bulkClassify(ticks: Tick[]): { buys: number; sells: number } {
  let buys = 0, sells = 0;
  ticks.forEach(t => {
    if (leeReady(t) === 'BUY') buys++;
    else sells++;
  });
  return { buys, sells };
}

export function tradeSign(tick: Tick): number {
  const mid = (tick.bid + tick.ask) / 2;
  const spread = tick.ask - tick.bid;
  if (spread <= 0) return 0;
  return (tick.price - mid) / (spread / 2);
}

export function signedVolume(ticks: Tick[], volumes: number[]): number {
  let result = 0;
  const n = Math.min(ticks.length, volumes.length);
  for (let i = 0; i < n; i++) {
    result += tradeSign(ticks[i]) * volumes[i];
  }
  return result;
}

export function tradeAggressiveness(tick: Tick): 'AGGRESSIVE' | 'PASSIVE' | 'AT_TOUCH' {
  if (tick.price >= tick.ask || tick.price <= tick.bid) return 'AGGRESSIVE';
  if (tick.price === tick.bid || tick.price === tick.ask) return 'AT_TOUCH';
  return 'PASSIVE';
}
