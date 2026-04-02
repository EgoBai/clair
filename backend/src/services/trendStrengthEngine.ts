/**
 * TrendStrengthEngine - 趋势强度引擎
 * 综合ADX、DMI、趋势斜率等指标判断趋势强度
 */

export interface TrendBar {
  date: string;
  high: number;
  low: number;
  close: number;
}

export interface TrendResult {
  adx: number;
  plusDI: number;
  minusDI: number;
  trendSlope: number;
  trendScore: number;         // 0~100
  direction: 'up' | 'down' | 'sideways';
  strength: 'strong' | 'moderate' | 'weak';
  consistency: number;        // 0~1 趋势一致性
  duration: number;           // 趋势持续天数
  isTrending: boolean;
}

export interface TrendConfig {
  adxPeriod: number;
  slopeWindow: number;
  strongThreshold: number;
  weakThreshold: number;
}

const DEFAULT_CONFIG: TrendConfig = {
  adxPeriod: 14,
  slopeWindow: 20,
  strongThreshold: 25,
  weakThreshold: 15,
};

function computeTR(h: number, l: number, prevClose: number): number {
  return Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
}

function computeDMI(data: TrendBar[], period: number): { adx: number; plusDI: number; minusDI: number } {
  if (data.length < period + 1) return { adx: 0, plusDI: 0, minusDI: 0 };

  let atrSum = 0, plusDMSum = 0, minusDMSum = 0;
  for (let i = 1; i <= period; i++) {
    const tr = computeTR(data[i].high, data[i].low, data[i - 1].close);
    const upMove = data[i].high - data[i - 1].high;
    const downMove = data[i - 1].low - data[i].low;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    atrSum += tr;
    plusDMSum += plusDM;
    minusDMSum += minusDM;
  }

  const plusDI = atrSum > 0 ? (plusDMSum / atrSum) * 100 : 0;
  const minusDI = atrSum > 0 ? (minusDMSum / atrSum) * 100 : 0;
  const dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;

  return { adx: dx, plusDI, minusDI };
}

function computeSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function analyzeTrend(
  data: TrendBar[],
  config: Partial<TrendConfig> = {}
): TrendResult | null {
  if (data.length < 5) return null;
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const dmi = computeDMI(data, cfg.adxPeriod);
  const closes = data.map(d => d.close);
  const slope = computeSlope(closes.slice(-cfg.slopeWindow));

  // 趋势一致性
  let upDays = 0, downDays = 0;
  for (let i = 1; i < Math.min(cfg.slopeWindow, data.length); i++) {
    if (data[i].close > data[i - 1].close) upDays++;
    else if (data[i].close < data[i - 1].close) downDays++;
  }
  const total = Math.min(cfg.slopeWindow, data.length - 1);
  const consistency = total > 0 ? Math.max(upDays, downDays) / total : 0;

  // 趋势方向
  let direction: TrendResult['direction'];
  if (dmi.plusDI > dmi.minusDI && slope > 0) direction = 'up';
  else if (dmi.minusDI > dmi.plusDI && slope < 0) direction = 'down';
  else direction = 'sideways';

  // 趋势强度
  let strength: TrendResult['strength'];
  if (dmi.adx > cfg.strongThreshold) strength = 'strong';
  else if (dmi.adx > cfg.weakThreshold) strength = 'moderate';
  else strength = 'weak';

  // 趋势评分
  const trendScore = Math.min(100, Math.round(
    dmi.adx * 0.4 +
    consistency * 40 +
    Math.min(1, Math.abs(slope) / (closes[closes.length - 1] * 0.01)) * 20
  ));

  // 持续天数
  let duration = 0;
  const lastDir = direction;
  for (let i = data.length - 1; i > 0; i--) {
    const goingUp = data[i].close > data[i - 1].close;
    if ((lastDir === 'up' && goingUp) || (lastDir === 'down' && !goingUp)) duration++;
    else break;
  }

  return {
    adx: dmi.adx,
    plusDI: dmi.plusDI,
    minusDI: dmi.minusDI,
    trendSlope: slope,
    trendScore,
    direction,
    strength,
    consistency,
    duration,
    isTrending: dmi.adx > cfg.weakThreshold,
  };
}

export function trendMomentum(
  data: TrendBar[],
  config: Partial<TrendConfig> = {}
): { trend: TrendResult | null; momentum: number } {
  const trend = analyzeTrend(data, config);
  if (!trend || data.length < 2) return { trend, momentum: 0 };

  const recent = data.slice(-10);
  const returns = recent.map((d, i) => i > 0 ? (d.close - recent[i - 1].close) / recent[i - 1].close : 0);
  const momentum = returns.reduce((s, v) => s + v, 0);

  return { trend, momentum };
}
