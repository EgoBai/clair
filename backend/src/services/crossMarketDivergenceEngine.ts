/**
 * CrossMarketDivergenceEngine - 跨市场背离引擎
 * 检测不同市场/指数之间的背离信号
 */

export interface MarketSeries {
  name: string;
  values: number[];     // 价格序列
}

export interface DivergenceResult {
  marketA: string;
  marketB: string;
  correlation: number;
  rollingCorr: number;
  priceDivergence: number;
  momentumDivergence: number;
  volumeDivergence: number;
  divergent: boolean;
  direction: 'A_leading' | 'B_leading' | 'converging';
  signal: 'reversal_warning' | 'trend_confirm' | 'neutral';
  strength: number; // 0~1
}

export interface DivergenceConfig {
  lookback: number;
  rollingWindow: number;
  divergenceThreshold: number;
  corrBreakThreshold: number;
}

const DEFAULT_CONFIG: DivergenceConfig = {
  lookback: 60,
  rollingWindow: 20,
  divergenceThreshold: 0.15,
  corrBreakThreshold: 0.3,
};

function correlation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const sx = x.slice(-n), sy = y.slice(-n);
  const mx = sx.reduce((s, v) => s + v, 0) / n;
  const my = sy.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (sx[i] - mx) * (sy[i] - my);
    dx += (sx[i] - mx) ** 2;
    dy += (sy[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

function normalizedReturn(prices: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    rets.push(prices[i - 1] > 0 ? (prices[i] - prices[i - 1]) / prices[i - 1] : 0);
  }
  return rets;
}

export function detectDivergence(
  marketA: MarketSeries,
  marketB: MarketSeries,
  config: Partial<DivergenceConfig> = {}
): DivergenceResult | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (marketA.values.length < cfg.lookback || marketB.values.length < cfg.lookback) return null;

  const a = marketA.values.slice(-cfg.lookback);
  const b = marketB.values.slice(-cfg.lookback);

  const fullCorr = correlation(a, b);

  // 滚动相关性
  const recentA = a.slice(-cfg.rollingWindow);
  const recentB = b.slice(-cfg.rollingWindow);
  const rollingCorr = correlation(recentA, recentB);

  // 价格背离: 归一化后的涨跌幅差异
  const normA = a[a.length - 1] / a[0] - 1;
  const normB = b[b.length - 1] / b[0] - 1;
  const priceDivergence = normA - normB;

  // 动量背离
  const retA = normalizedReturn(a);
  const retB = normalizedReturn(b);
  const momA = retA.slice(-10).reduce((s, v) => s + v, 0);
  const momB = retB.slice(-10).reduce((s, v) => s + v, 0);
  const momentumDivergence = momA - momB;

  // 量背离 (价格方向 vs 动量方向)
  const priceDirA = normA > 0 ? 1 : -1;
  const momDirA = momA > 0 ? 1 : -1;
  const volumeDivergence = priceDirA !== momDirA ? Math.abs(normA - momA) : 0;

  const divergent = Math.abs(priceDivergence) > cfg.divergenceThreshold ||
    (fullCorr > 0.5 && rollingCorr < cfg.corrBreakThreshold);

  let direction: DivergenceResult['direction'];
  if (divergent) {
    direction = Math.abs(momA) > Math.abs(momB) ? 'A_leading' : 'B_leading';
  } else {
    direction = 'converging';
  }

  let signal: DivergenceResult['signal'];
  if (divergent && fullCorr > 0.5) signal = 'reversal_warning';
  else if (!divergent && fullCorr > 0.7) signal = 'trend_confirm';
  else signal = 'neutral';

  const strength = Math.min(1, Math.abs(priceDivergence) * 3 + Math.abs(rollingCorr - fullCorr) * 2);

  return {
    marketA: marketA.name,
    marketB: marketB.name,
    correlation: fullCorr,
    rollingCorr,
    priceDivergence,
    momentumDivergence,
    volumeDivergence,
    divergent,
    direction,
    signal,
    strength: Math.round(strength * 100) / 100,
  };
}

export function scanAllPairs(
  markets: MarketSeries[],
  config: Partial<DivergenceConfig> = {}
): DivergenceResult[] {
  const results: DivergenceResult[] = [];
  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      const r = detectDivergence(markets[i], markets[j], config);
      if (r) results.push(r);
    }
  }
  return results.sort((a, b) => b.strength - a.strength);
}
