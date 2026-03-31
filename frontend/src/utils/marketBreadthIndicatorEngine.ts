/**
 * 市场宽度指标引擎 (Market Breadth Indicator Engine)
 * - 涨跌家数比
 * - 新高新低比
 * - 均线上方占比
 * - McClellan振荡器
 * - Arms Index (TRIN)
 * - 综合宽度评分
 */

export interface BreadthData {
  advancing: number;
  declining: number;
  unchanged: number;
  newHigh: number;
  newLow: number;
  aboveMA20: number;
  aboveMA60: number;
  aboveMA200: number;
  totalStocks: number;
  advVolume: number;
  decVolume: number;
  advIssues: number;
  decIssues: number;
}

export interface BreadthIndicators {
  advanceDeclineRatio: number;
  advanceDeclineLine: number;
  newHighLowRatio: number;
  maBreadth: {
    ma20: number;
    ma60: number;
    ma200: number;
  };
  mcclellanOscillator: number;
  trin: number;
  breadthThrust: number;
  composite: number;
}

export interface BreadthSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  indicator: string;
  value: number;
  threshold: number;
  description: string;
  strength: number;
}

/**
 * 计算涨跌比
 */
export function calculateADRatio(data: BreadthData): number {
  if (data.declining === 0) return data.advancing > 0 ? 10 : 1;
  return Math.round((data.advancing / data.declining) * 100) / 100;
}

/**
 * 计算涨跌线 (Advance-Decline Line)
 */
export function calculateADLine(history: BreadthData[]): number[] {
  const adLine: number[] = [];
  let cumulative = 0;

  for (const data of history) {
    cumulative += data.advancing - data.declining;
    adLine.push(cumulative);
  }

  return adLine;
}

/**
 * 计算McClellan振荡器
 */
export function calculateMcClellanOscillator(
  history: BreadthData[]
): number {
  if (history.length < 20) return 0;

  // Net Advances
  const netAdvances = history.map(d => d.advancing - d.declining);

  // EMA19 and EMA39
  const ema19 = calculateEMA(netAdvances, 19);
  const ema39 = calculateEMA(netAdvances, 39);

  const last19 = ema19[ema19.length - 1] || 0;
  const last39 = ema39[ema39.length - 1] || 0;

  return Math.round((last19 - last39) * 100) / 100;
}

function calculateEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];

  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }

  return ema;
}

/**
 * 计算Arms Index (TRIN)
 */
export function calculateTRIN(data: BreadthData): number {
  const advRatio = data.advIssues > 0 ? data.advVolume / data.advIssues : 0;
  const decRatio = data.decIssues > 0 ? data.decVolume / data.decIssues : 1;

  if (decRatio === 0) return advRatio > 0 ? 0 : 1;
  return Math.round((advRatio / decRatio) * 100) / 100;
}

/**
 * 计算Breadth Thrust
 */
export function calculateBreadthThrust(history: BreadthData[]): number {
  if (history.length < 10) return 0;

  const recent10 = history.slice(-10);
  let advSum = 0;
  let totalSum = 0;

  for (const d of recent10) {
    advSum += d.advancing;
    totalSum += d.advancing + d.declining + d.unchanged;
  }

  return totalSum > 0 ? Math.round((advSum / totalSum) * 10000) / 10000 : 0;
}

/**
 * 计算均线宽度
 */
export function calculateMABreadth(data: BreadthData): {
  ma20: number;
  ma60: number;
  ma200: number;
} {
  const total = data.totalStocks || 1;
  return {
    ma20: Math.round(data.aboveMA20 / total * 10000) / 100,
    ma60: Math.round(data.aboveMA60 / total * 10000) / 100,
    ma200: Math.round(data.aboveMA200 / total * 10000) / 100,
  };
}

/**
 * 综合市场宽度分析
 */
export function analyzeMarketBreadth(
  current: BreadthData,
  history: BreadthData[]
): {
  indicators: BreadthIndicators;
  signals: BreadthSignal[];
} {
  const adRatio = calculateADRatio(current);
  const adLine = calculateADLine(history);
  const mcclellan = calculateMcClellanOscillator(history);
  const trin = calculateTRIN(current);
  const breadthThrust = calculateBreadthThrust(history);
  const maBreadth = calculateMABreadth(current);
  const newHighLowRatio = current.newLow > 0
    ? Math.round(current.newHigh / current.newLow * 100) / 100
    : current.newHigh > 0 ? 10 : 1;

  // 综合评分
  const adScore = Math.min(100, Math.max(0, adRatio * 30));
  const hlScore = Math.min(100, Math.max(0, newHighLowRatio * 20));
  const maScore = maBreadth.ma20;
  const mcScore = Math.min(100, Math.max(0, 50 + mcclellan));
  const trinScore = Math.min(100, Math.max(0, (2 - trin) * 50));
  const composite = Math.round((adScore + hlScore + maScore + mcScore + trinScore) / 5);

  const indicators: BreadthIndicators = {
    advanceDeclineRatio: adRatio,
    advanceDeclineLine: adLine[adLine.length - 1] || 0,
    newHighLowRatio,
    maBreadth,
    mcclellanOscillator: mcclellan,
    trin,
    breadthThrust,
    composite,
  };

  // 信号检测
  const signals: BreadthSignal[] = [];

  if (adRatio > 3) {
    signals.push({
      type: 'bullish',
      indicator: '涨跌比',
      value: adRatio,
      threshold: 3,
      description: `涨跌比${adRatio.toFixed(2)}，市场极度强势`,
      strength: Math.min(100, Math.round(adRatio * 20)),
    });
  } else if (adRatio < 0.3) {
    signals.push({
      type: 'bearish',
      indicator: '涨跌比',
      value: adRatio,
      threshold: 0.3,
      description: `涨跌比${adRatio.toFixed(2)}，市场极度弱势`,
      strength: Math.min(100, Math.round((1 / Math.max(adRatio, 0.01)) * 10)),
    });
  }

  if (mcclellan > 100) {
    signals.push({
      type: 'bullish',
      indicator: 'McClellan',
      value: mcclellan,
      threshold: 100,
      description: `McClellan振荡器${mcclellan.toFixed(0)}，超买`,
      strength: Math.min(100, Math.round(mcclellan / 2)),
    });
  } else if (mcclellan < -100) {
    signals.push({
      type: 'bearish',
      indicator: 'McClellan',
      value: mcclellan,
      threshold: -100,
      description: `McClellan振荡器${mcclellan.toFixed(0)}，超卖`,
      strength: Math.min(100, Math.round(Math.abs(mcclellan) / 2)),
    });
  }

  if (trin < 0.5) {
    signals.push({
      type: 'bullish',
      indicator: 'TRIN',
      value: trin,
      threshold: 0.5,
      description: `TRIN=${trin.toFixed(2)}，买盘强劲`,
      strength: Math.min(100, Math.round((1 - trin) * 100)),
    });
  } else if (trin > 2) {
    signals.push({
      type: 'bearish',
      indicator: 'TRIN',
      value: trin,
      threshold: 2,
      description: `TRIN=${trin.toFixed(2)}，卖盘沉重`,
      strength: Math.min(100, Math.round(trin * 30)),
    });
  }

  if (breadthThrust > 0.615) {
    signals.push({
      type: 'bullish',
      indicator: 'Breadth Thrust',
      value: breadthThrust,
      threshold: 0.615,
      description: `Breadth Thrust=${breadthThrust.toFixed(3)}，强势买入信号`,
      strength: 90,
    });
  }

  if (maBreadth.ma200 > 80) {
    signals.push({
      type: 'bullish',
      indicator: 'MA200宽度',
      value: maBreadth.ma200,
      threshold: 80,
      description: `${maBreadth.ma200.toFixed(1)}%股票在200日均线上方，牛市环境`,
      strength: Math.round(maBreadth.ma200),
    });
  } else if (maBreadth.ma200 < 20) {
    signals.push({
      type: 'bearish',
      indicator: 'MA200宽度',
      value: maBreadth.ma200,
      threshold: 20,
      description: `仅${maBreadth.ma200.toFixed(1)}%股票在200日均线上方，熊市环境`,
      strength: Math.round(100 - maBreadth.ma200),
    });
  }

  return { indicators, signals };
}
