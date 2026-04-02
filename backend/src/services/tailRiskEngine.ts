/**
 * TailRiskEngine - 尾部风险引擎
 * CVaR、偏度、峰度等尾部风险度量
 */

export function calcCVaR(returns: number[], confidence: number): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.floor((1 - confidence) * sorted.length);
  if (cutoff === 0) return -sorted[0];
  const tail = sorted.slice(0, cutoff);
  return -tail.reduce((a, b) => a + b, 0) / tail.length;
}

export function calcSkewness(returns: number[]): number {
  const n = returns.length;
  if (n < 3) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const m2 = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const m3 = returns.reduce((a, b) => a + (b - mean) ** 3, 0) / n;
  if (m2 === 0) return 0;
  return m3 / (m2 ** 1.5);
}

export function calcKurtosis(returns: number[]): number {
  const n = returns.length;
  if (n < 4) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const m4 = returns.reduce((a, b) => a + (b - mean) ** 4, 0) / n;
  const m2 = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  if (m2 === 0) return 0;
  return m4 / (m2 ** 2) - 3;
}

export function maxDrawdown(prices: number[]): { maxDD: number; peak: number; trough: number } {
  if (prices.length === 0) return { maxDD: 0, peak: 0, trough: 0 };
  let peak = prices[0], maxDD = 0, peakIdx = 0, troughIdx = 0;
  let curPeak = prices[0], curPeakIdx = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > curPeak) { curPeak = prices[i]; curPeakIdx = i; }
    const dd = (curPeak - prices[i]) / curPeak;
    if (dd > maxDD) { maxDD = dd; peak = curPeak; peakIdx = curPeakIdx; troughIdx = i; }
  }
  return { maxDD, peak: peakIdx, trough: troughIdx };
}

export function tailRiskScore(returns: number[]): number {
  const skew = calcSkewness(returns);
  const kurt = calcKurtosis(returns);
  const cvar = calcCVaR(returns, 0.95);
  return Math.max(0, -skew * 0.3 + Math.max(0, kurt) * 0.1 + cvar * 0.6);
}
