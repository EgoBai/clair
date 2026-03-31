/**
 * 跨品种价差分析引擎
 * - 品种间价差计算
 * - 价差均值/标准差
 * - 价差偏离信号
 * - 均值回归概率
 * - 价差趋势分析
 */
export interface SpreadData {
  date: string;
  leg1Price: number;
  leg2Price: number;
  spread: number;
}

export interface SpreadAnalysis {
  currentSpread: number;
  meanSpread: number;
  stdSpread: number;
  zScore: number;
  percentile: number;
  trend: 'widening' | 'narrowing' | 'stable';
  meanReversionProb: number;
  signal: 'buy_spread' | 'sell_spread' | 'neutral';
  entryLevel: number;
  targetLevel: number;
  stopLevel: number;
  riskReward: number;
  alerts: string[];
}

export function analyzeSpread(
  data: SpreadData[],
  lookback: number = 60
): SpreadAnalysis {
  if (data.length < 5) throw new Error('价差数据不足');

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const spreads = sorted.map(d => d.leg1Price - d.leg2Price);
  const recent = spreads.slice(-lookback);
  const currentSpread = recent[recent.length - 1];

  const meanSpread = recent.reduce((s, v) => s + v, 0) / recent.length;
  const stdSpread = Math.sqrt(recent.reduce((s, v) => s + (v - meanSpread) ** 2, 0) / recent.length);
  const zScore = stdSpread > 0 ? (currentSpread - meanSpread) / stdSpread : 0;

  // 百分位
  const sortedSpreads = [...recent].sort((a, b) => a - b);
  const rank = sortedSpreads.filter(v => v <= currentSpread).length;
  const percentile = rank / sortedSpreads.length;

  // 趋势
  const shortMA = recent.slice(-10).reduce((s, v) => s + v, 0) / Math.min(10, recent.length);
  const longMA = recent.slice(-30).reduce((s, v) => s + v, 0) / Math.min(30, recent.length);
  const trend = shortMA > longMA + stdSpread * 0.1 ? 'widening'
    : shortMA < longMA - stdSpread * 0.1 ? 'narrowing' : 'stable';

  // 均值回归概率
  const halfLife = computeHalfLife(recent);
  const meanReversionProb = halfLife > 0 ? Math.min(1, 10 / halfLife) : 0.5;

  // 信号
  let signal: 'buy_spread' | 'sell_spread' | 'neutral' = 'neutral';
  if (zScore < -2) signal = 'buy_spread';
  else if (zScore > 2) signal = 'sell_spread';
  else if (zScore < -1.5 && trend === 'narrowing') signal = 'buy_spread';
  else if (zScore > 1.5 && trend === 'widening') signal = 'sell_spread';

  // 入场/目标/止损
  const entryLevel = currentSpread;
  const targetLevel = meanSpread;
  const stopLevel = signal === 'buy_spread'
    ? currentSpread - 2 * stdSpread
    : currentSpread + 2 * stdSpread;
  const riskReward = Math.abs(targetLevel - entryLevel) / Math.max(Math.abs(stopLevel - entryLevel), 0.001);

  const alerts: string[] = [];
  if (Math.abs(zScore) > 2.5) alerts.push('价差严重偏离均值');
  if (Math.abs(zScore) > 3) alerts.push('价差处于极端水平');
  if (stdSpread / Math.abs(meanSpread) > 0.5) alerts.push('价差波动率偏高');

  return {
    currentSpread,
    meanSpread,
    stdSpread,
    zScore,
    percentile,
    trend,
    meanReversionProb,
    signal,
    entryLevel,
    targetLevel,
    stopLevel,
    riskReward,
    alerts,
  };
}

function computeHalfLife(series: number[]): number {
  if (series.length < 10) return -1;
  const diffs = series.slice(1).map((v, i) => v - series[i]);
  const lags = series.slice(0, -1);
  const meanLag = lags.reduce((s, v) => s + v, 0) / lags.length;
  const meanDiff = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  
  let cov = 0, varLag = 0;
  for (let i = 0; i < lags.length; i++) {
    cov += (lags[i] - meanLag) * (diffs[i] - meanDiff);
    varLag += (lags[i] - meanLag) ** 2;
  }
  const beta = varLag > 0 ? cov / varLag : 0;
  return beta < 0 ? -Math.log(2) / Math.log(1 + beta) : -1;
}
