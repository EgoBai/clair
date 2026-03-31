/**
 * 相对强度分析引擎(RS Rating)
 * - 与基准指数比较的相对强度
 * - RS评级(0-100)
 * - 趋势判断
 * - 强度背离检测
 * - 板块相对强度排名
 */
export interface RSInput {
  stockPrices: number[]; // 股票价格序列
  benchmarkPrices: number[]; // 基准指数价格序列
  period: number; // 计算周期(天), 默认252
}

export interface RSResult {
  rsRatio: number; // 相对强度比率
  rsRating: number; // RS评级(0-100)
  rsTrend: 'improving' | 'stable' | 'deteriorating';
  rsPercentile: number; // 百分位
  stockReturn: number; // 个股收益率
  benchmarkReturn: number; // 基准收益率
  alpha: number; // 超额收益
  isOutperforming: boolean;
  consecutiveOutperformDays: number;
  strengthSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
}

export function calculateRelativeStrength(input: RSInput): RSResult {
  const { stockPrices, benchmarkPrices, period = 252 } = input;

  const minLen = Math.min(stockPrices.length, benchmarkPrices.length);
  if (minLen < period) throw new Error(`至少需要${period}个数据点`);

  const sp = stockPrices.slice(-minLen);
  const bp = benchmarkPrices.slice(-minLen);

  // 计算不同周期的收益率
  const calcReturn = (prices: number[], days: number) => {
    const end = prices[prices.length - 1];
    const start = prices[Math.max(0, prices.length - 1 - days)];
    return (end - start) / Math.max(start, 0.001);
  };

  const stockReturn = calcReturn(sp, period);
  const benchmarkReturn = calcReturn(bp, period);
  const alpha = stockReturn - benchmarkReturn;

  // RS比率
  const rsRatio = sp[sp.length - 1] / Math.max(bp[bp.length - 1], 0.001);
  const rsStart = sp[Math.max(0, sp.length - period)] / Math.max(bp[Math.max(0, bp.length - period)], 0.001);
  const rsChange = rsRatio / Math.max(rsStart, 0.001);

  // RS评级 (0-100)
  // 使用滚动窗口计算百分位
  const windowSize = Math.min(period, minLen);
  const rsHistory: number[] = [];
  for (let i = period; i < minLen; i++) {
    const sR = (sp[i] - sp[i - period]) / Math.max(sp[i - period], 0.001);
    const bR = (bp[i] - bp[i - period]) / Math.max(bp[i - period], 0.001);
    rsHistory.push(sR - bR);
  }

  let rsRating = 50;
  if (rsHistory.length > 0) {
    const sorted = [...rsHistory].sort((a, b) => a - b);
    const rank = sorted.findIndex(v => v >= alpha);
    rsRating = Math.round((rank >= 0 ? rank : sorted.length) / sorted.length * 100);
  }

  // 趋势判断
  const recent30 = rsHistory.slice(-30);
  const older30 = rsHistory.slice(-60, -30);
  const recentAvg = recent30.length > 0 ? recent30.reduce((s, v) => s + v, 0) / recent30.length : 0;
  const olderAvg = older30.length > 0 ? older30.reduce((s, v) => s + v, 0) / older30.length : 0;

  let rsTrend: RSResult['rsTrend'];
  if (recentAvg > olderAvg + 0.01) rsTrend = 'improving';
  else if (recentAvg < olderAvg - 0.01) rsTrend = 'deteriorating';
  else rsTrend = 'stable';

  // 连续跑赢天数
  let consecutiveOutperformDays = 0;
  for (let i = minLen - 1; i >= 1; i--) {
    const sDayReturn = (sp[i] - sp[i - 1]) / Math.max(sp[i - 1], 0.001);
    const bDayReturn = (bp[i] - bp[i - 1]) / Math.max(bp[i - 1], 0.001);
    if (sDayReturn > bDayReturn) consecutiveOutperformDays++;
    else break;
  }

  // 信号
  let strengthSignal: RSResult['strengthSignal'];
  if (rsRating >= 80 && rsTrend === 'improving') strengthSignal = 'strong_buy';
  else if (rsRating >= 70) strengthSignal = 'buy';
  else if (rsRating <= 20 && rsTrend === 'deteriorating') strengthSignal = 'strong_sell';
  else if (rsRating <= 30) strengthSignal = 'sell';
  else strengthSignal = 'neutral';

  return {
    rsRatio: Math.round(rsRatio * 10000) / 10000,
    rsRating,
    rsTrend,
    rsPercentile: rsRating,
    stockReturn: Math.round(stockReturn * 10000) / 10000,
    benchmarkReturn: Math.round(benchmarkReturn * 10000) / 10000,
    alpha: Math.round(alpha * 10000) / 10000,
    isOutperforming: alpha > 0,
    consecutiveOutperformDays,
    strengthSignal,
  };
}
