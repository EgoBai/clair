/**
 * 统计套利引擎 - 均值回归/Z-Score/Ornstein-Uhlenbeck/最优入场出场
 */

export interface OUParams {
  theta: number; // 均值回归速度
  mu: number; // 长期均值
  sigma: number; // 波动率
  halfLife: number; // 半衰期
}

export interface StatArbSignal {
  ticker: string;
  currentValue: number;
  zScore: number;
  ouScore: number; // OU过程标准化值
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  expectedReturn: number;
  holdingPeriod: number;
  sharpeEstimate: number;
  kellyFraction: number; // Kelly最优仓位
}

export interface MeanReversionBacktest {
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgHoldingDays: number;
  monthlyReturns: number[];
}

/**
 * 拟合Ornstein-Uhlenbeck过程
 */
export function fitOUProcess(series: number[]): OUParams {
  if (series.length < 10) {
    return { theta: 0, mu: series[0] || 0, sigma: 0, halfLife: 0 };
  }

  const n = series.length;
  const y = series.slice(1);
  const x = series.slice(0, -1);

  // OLS: y = α + β*x + ε
  const meanX = x.reduce((a, b) => a + b, 0) / x.length;
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;

  let num = 0, den = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - meanX) * (y[i] - meanY);
    den += (x[i] - meanX) ** 2;
  }
  const beta = den > 0 ? num / den : 1;
  const alpha = meanY - beta * meanX;

  // OU参数
  const theta = -Math.log(Math.abs(beta)) * 252; // 年化
  const mu = alpha / (1 - beta);
  const residuals = y.map((yi, i) => yi - (alpha + beta * x[i]));
  const sigma = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (n - 2)) * Math.sqrt(252);
  const halfLife = theta > 0 ? Math.round(Math.log(2) / theta * 252) : n;

  return {
    theta: Math.round(theta * 10000) / 10000,
    mu: Math.round(mu * 10000) / 10000,
    sigma: Math.round(sigma * 10000) / 10000,
    halfLife: Math.min(halfLife, 252),
  };
}

/**
 * 生成统计套利信号
 */
export function generateStatArbSignal(
  ticker: string,
  series: number[],
  lookback: number = 60,
): StatArbSignal {
  const recent = series.slice(-lookback);
  const current = recent[recent.length - 1];

  if (recent.length < 10) {
    return {
      ticker, currentValue: current, zScore: 0, ouScore: 0, signal: 'neutral',
      entryPrice: current, targetPrice: current, stopLoss: current,
      expectedReturn: 0, holdingPeriod: 0, sharpeEstimate: 0, kellyFraction: 0,
    };
  }

  // Z-Score
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const std = Math.sqrt(recent.reduce((s, v) => s + (v - mean) ** 2, 0) / (recent.length - 1));
  const zScore = std > 0 ? (current - mean) / std : 0;

  // OU参数
  const ou = fitOUProcess(recent);
  const ouScore = ou.sigma > 0 ? (current - ou.mu) / (ou.sigma / Math.sqrt(ou.theta / 252 || 0.01)) : 0;

  // 信号
  let signal: StatArbSignal['signal'];
  const combined = (zScore + ouScore) / 2;
  if (combined < -2) signal = 'strong_buy';
  else if (combined < -1) signal = 'buy';
  else if (combined > 2) signal = 'strong_sell';
  else if (combined > 1) signal = 'sell';
  else signal = 'neutral';

  // 入场/目标/止损
  const entryPrice = current;
  const targetPrice = ou.mu; // OU均值
  const stopLoss = signal.includes('buy')
    ? current - 2 * std
    : current + 2 * std;

  const expectedReturn = Math.abs((targetPrice - current) / current) * 100;
  const holdingPeriod = ou.halfLife;

  // Sharpe估算
  const avgReturn = expectedReturn / holdingPeriod * 252;
  const sharpeEstimate = ou.sigma > 0 ? avgReturn / ou.sigma : 0;

  // Kelly
  const winProb = 0.5 + Math.abs(zScore) * 0.1;
  const winLoss = expectedReturn / (Math.abs(current - stopLoss) / current * 100 || 1);
  const kellyFraction = Math.max(0, (winProb * winLoss - (1 - winProb)) / winLoss);

  return {
    ticker,
    currentValue: Math.round(current * 100) / 100,
    zScore: Math.round(zScore * 100) / 100,
    ouScore: Math.round(ouScore * 100) / 100,
    signal,
    entryPrice: Math.round(entryPrice * 100) / 100,
    targetPrice: Math.round(targetPrice * 100) / 100,
    stopLoss: Math.round(stopLoss * 100) / 100,
    expectedReturn: Math.round(expectedReturn * 100) / 100,
    holdingPeriod,
    sharpeEstimate: Math.round(sharpeEstimate * 100) / 100,
    kellyFraction: Math.round(kellyFraction * 1000) / 1000,
  };
}

/**
 * 均值回归回测
 */
export function backtestMeanReversion(
  series: number[],
  entryZScore: number = 2,
  exitZScore: number = 0,
  stopZScore: number = 3,
  lookback: number = 20,
): MeanReversionBacktest {
  if (series.length < lookback + 10) {
    return { totalTrades: 0, winRate: 0, avgReturn: 0, maxDrawdown: 0, sharpeRatio: 0, profitFactor: 0, avgHoldingDays: 0, monthlyReturns: [] };
  }

  const trades: Array<{ entry: number; exit: number; days: number; return: number }> = [];
  let position = 0;
  let entryPrice = 0;
  let entryDay = 0;

  for (let i = lookback; i < series.length; i++) {
    const window = series.slice(i - lookback, i);
    const mean = window.reduce((a, b) => a + b, 0) / lookback;
    const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / (lookback - 1));
    const zScore = std > 0 ? (series[i] - mean) / std : 0;

    if (position === 0) {
      if (zScore < -entryZScore) {
        position = 1; // 做多
        entryPrice = series[i];
        entryDay = i;
      } else if (zScore > entryZScore) {
        position = -1; // 做空
        entryPrice = series[i];
        entryDay = i;
      }
    } else if (position === 1) {
      if (zScore >= exitZScore || zScore < -stopZScore) {
        trades.push({ entry: entryPrice, exit: series[i], days: i - entryDay, return: (series[i] - entryPrice) / entryPrice });
        position = 0;
      }
    } else if (position === -1) {
      if (zScore <= exitZScore || zScore > stopZScore) {
        trades.push({ entry: entryPrice, exit: series[i], days: i - entryDay, return: (entryPrice - series[i]) / entryPrice });
        position = 0;
      }
    }
  }

  if (trades.length === 0) {
    return { totalTrades: 0, winRate: 0, avgReturn: 0, maxDrawdown: 0, sharpeRatio: 0, profitFactor: 0, avgHoldingDays: 0, monthlyReturns: [] };
  }

  const returns = trades.map(t => t.return);
  const winRate = returns.filter(r => r > 0).length / returns.length;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const avgHoldingDays = trades.reduce((s, t) => s + t.days, 0) / trades.length;

  // Max drawdown
  let peak = 0, cumReturn = 0, maxDD = 0;
  returns.forEach(r => {
    cumReturn += r;
    peak = Math.max(peak, cumReturn);
    maxDD = Math.min(maxDD, cumReturn - peak);
  });

  const stdReturn = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1));
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252 / avgHoldingDays) : 0;

  const wins = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const losses = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
  const profitFactor = losses > 0 ? wins / losses : wins > 0 ? Infinity : 0;

  return {
    totalTrades: trades.length,
    winRate: Math.round(winRate * 10000) / 10000,
    avgReturn: Math.round(avgReturn * 10000) / 10000,
    maxDrawdown: Math.round(maxDD * 10000) / 10000,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgHoldingDays: Math.round(avgHoldingDays * 10) / 10,
    monthlyReturns: [],
  };
}
