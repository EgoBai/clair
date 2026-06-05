/**
 * VolatilityAdjustedMomentumEngine - 波动率调整动量引擎
 * 将原始动量除以同期波动率，得到风险调整后的动量信号
 */

export interface PriceSeries {
  date: string;
  close: number;
  volume: number;
}

export interface VolAdjMomentumResult {
  rawMomentum: number;
  realizedVol: number;
  volAdjMomentum: number;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  confidence: number;
  percentile: number;
}

export interface VolAdjConfig {
  lookbackPeriod: number;       // 动量回看期 (默认20)
  volPeriod: number;            // 波动率计算期 (默认20)
  annualizeFactor: number;      // 年化因子 (默认252)
  buyThreshold: number;         // 买入阈值 (默认0.5)
  sellThreshold: number;        // 卖出阈值 (默认-0.5)
  strongMultiplier: number;     // 强信号倍数 (默认2.0)
}

const DEFAULT_CONFIG: VolAdjConfig = {
  lookbackPeriod: 20,
  volPeriod: 20,
  annualizeFactor: 252,
  buyThreshold: 0.5,
  sellThreshold: -0.5,
  strongMultiplier: 2.0,
};

export function computeVolAdjMomentum(
  prices: PriceSeries[],
  config: Partial<VolAdjConfig> = {}
): VolAdjMomentumResult | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { lookbackPeriod, volPeriod, annualizeFactor, buyThreshold, sellThreshold, strongMultiplier } = cfg;
  const minLen = Math.max(lookbackPeriod, volPeriod) + 1;

  if (prices.length < minLen) return null;

  // 对数收益率
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i].close <= 0 || prices[i - 1].close <= 0) continue;
    logReturns.push(Math.log(prices[i].close / prices[i - 1].close));
  }

  if (logReturns.length < minLen - 1) return null;

  // 原始动量 = 累计对数收益率
  const recentReturns = logReturns.slice(-lookbackPeriod);
  const rawMomentum = recentReturns.reduce((s, r) => s + r, 0);

  // 已实现波动率 (年化)
  const volReturns = logReturns.slice(-volPeriod);
  const mean = volReturns.reduce((s, r) => s + r, 0) / volReturns.length;
  const variance = volReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (volReturns.length - 1);
  const realizedVol = Math.sqrt(variance * annualizeFactor);

  // 波动率调整动量
  const volAdjMomentum = realizedVol > 0 ? rawMomentum / realizedVol : 0;

  // 信号判断
  let signal: VolAdjMomentumResult['signal'];
  if (volAdjMomentum > buyThreshold * strongMultiplier) signal = 'strong_buy';
  else if (volAdjMomentum > buyThreshold) signal = 'buy';
  else if (volAdjMomentum < sellThreshold * strongMultiplier) signal = 'strong_sell';
  else if (volAdjMomentum < sellThreshold) signal = 'sell';
  else signal = 'neutral';

  // 置信度: 基于数据点充足度和信号强度
  const dataSufficiency = Math.min(1, logReturns.length / (minLen * 2));
  const signalStrength = Math.min(1, Math.abs(volAdjMomentum) / (Math.abs(buyThreshold) * strongMultiplier));
  const confidence = Math.round((dataSufficiency * 0.4 + signalStrength * 0.6) * 100) / 100;

  // 百分位 (简化: 基于正态假设)
  const z = volAdjMomentum;
  const percentile = Math.round((1 - Math.exp(-1.6 * Math.abs(z))) * 50 * (z >= 0 ? 1 : -1) + 50);

  return { rawMomentum, realizedVol, volAdjMomentum, signal, confidence, percentile };
}

export function batchVolAdjMomentum(
  stocksMap: Record<string, PriceSeries[]>,
  config: Partial<VolAdjConfig> = {}
): Record<string, VolAdjMomentumResult | null> {
  const results: Record<string, VolAdjMomentumResult | null> = {};
  for (const [code, prices] of Object.entries(stocksMap)) {
    results[code] = computeVolAdjMomentum(prices, config);
  }
  return results;
}

export function rankByVolAdjMomentum(
  stocksMap: Record<string, PriceSeries[]>,
  config: Partial<VolAdjConfig> = {}
): Array<{ code: string; result: VolAdjMomentumResult }> {
  const batch = batchVolAdjMomentum(stocksMap, config);
  const ranked = Object.entries(batch)
    .filter((entry): entry is [string, VolAdjMomentumResult] => entry[1] !== null)
    .map(([code, result]) => ({ code, result }))
    .sort((a, b) => b.result.volAdjMomentum - a.result.volAdjMomentum);
  return ranked;
}
