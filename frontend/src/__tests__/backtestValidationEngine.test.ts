import { describe, it, expect } from 'vitest';

// 量化选股回测验证引擎
interface BacktestConfig {
  startDate: string;
  endDate: string;
  universe: string[];
  rebalanceFreq: 'daily' | 'weekly' | 'monthly';
  benchmark: string;
  commission: number;
  slippage: number;
}

interface BacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  calmarRatio: number;
  turnover: number;
  alpha: number;
  beta: number;
}

interface DailyReturn {
  date: string;
  portfolioReturn: number;
  benchmarkReturn: number;
}

function calcBacktestMetrics(returns: DailyReturn[], riskFreeRate: number = 0.03): BacktestResult {
  const portReturns = returns.map(r => r.portfolioReturn);
  const benchReturns = returns.map(r => r.benchmarkReturn);
  const n = portReturns.length;

  // Total return
  const totalReturn = portReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
  const benchTotalReturn = benchReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;

  // Annualized
  const years = n / 252;
  const annualizedReturn = Math.pow(1 + totalReturn, 1 / years) - 1;

  // Sharpe
  const avgReturn = portReturns.reduce((a, b) => a + b, 0) / n;
  const variance = portReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const dailyRiskFree = riskFreeRate / 252;
  const sharpeRatio = stdDev > 0 ? ((avgReturn - dailyRiskFree) / stdDev) * Math.sqrt(252) : 0;

  // Max Drawdown
  let peak = 0, maxDD = 0, cumReturn = 1;
  portReturns.forEach(r => {
    cumReturn *= (1 + r);
    peak = Math.max(peak, cumReturn);
    maxDD = Math.min(maxDD, (cumReturn - peak) / peak);
  });

  // Win rate
  const wins = portReturns.filter(r => r > 0);
  const winRate = wins.length / n;

  // Profit factor
  const grossProfit = portReturns.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(portReturns.filter(r => r < 0).reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 1;

  // Calmar
  const calmarRatio = maxDD !== 0 ? annualizedReturn / Math.abs(maxDD) : 0;

  // Beta & Alpha
  let sumXY = 0, sumYY = 0;
  const avgBench = benchReturns.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) {
    sumXY += (portReturns[i] - avgReturn) * (benchReturns[i] - avgBench);
    sumYY += (benchReturns[i] - avgBench) ** 2;
  }
  const beta = sumYY > 0 ? sumXY / sumYY : 1;
  const alpha = annualizedReturn - beta * (Math.pow(1 + benchTotalReturn, 1 / years) - 1);

  // Turnover
  const turnover = 0.5;

  return {
    totalReturn, annualizedReturn, sharpeRatio, maxDrawdown: Math.abs(maxDD),
    winRate, profitFactor, calmarRatio, turnover, alpha, beta,
  };
}

function validateBacktestConfig(config: BacktestConfig): string[] {
  const errors: string[] = [];
  if (new Date(config.startDate) >= new Date(config.endDate)) errors.push('结束日期必须晚于开始日期');
  if (config.universe.length === 0) errors.push('股票池不能为空');
  if (config.commission < 0 || config.commission > 0.01) errors.push('佣金率应在0-1%之间');
  if (config.slippage < 0 || config.slippage > 0.01) errors.push('滑点应在0-1%之间');
  return errors;
}

function calcRollingSharpe(returns: number[], window: number = 63): number[] {
  const result: number[] = [];
  for (let i = window - 1; i < returns.length; i++) {
    const slice = returns.slice(i - window + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / window;
    const std = Math.sqrt(slice.reduce((s, r) => s + (r - avg) ** 2, 0) / (window - 1));
    result.push(std > 0 ? (avg / std) * Math.sqrt(252) : 0);
  }
  return result;
}

describe('量化选股回测验证引擎', () => {
  const dailyReturns: DailyReturn[] = Array.from({ length: 252 }, (_, i) => ({
    date: `2024-${String(Math.floor(i / 21) + 1).padStart(2, '0')}-${String((i % 21) + 1).padStart(2, '0')}`,
    portfolioReturn: 0.001 + (Math.random() - 0.45) * 0.02,
    benchmarkReturn: 0.0005 + (Math.random() - 0.5) * 0.015,
  }));

  it('应计算回测指标', () => {
    const result = calcBacktestMetrics(dailyReturns);
    expect(result.totalReturn).toBeDefined();
    expect(result.sharpeRatio).toBeDefined();
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeGreaterThan(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
  });

  it('夏普比率应在合理范围', () => {
    const result = calcBacktestMetrics(dailyReturns);
    expect(result.sharpeRatio).toBeGreaterThan(-5);
    expect(result.sharpeRatio).toBeLessThan(10);
  });

  it('应验证回测配置', () => {
    const config: BacktestConfig = {
      startDate: '2024-01-01', endDate: '2024-12-31',
      universe: ['600519', '000858'], rebalanceFreq: 'monthly',
      benchmark: '000300', commission: 0.0003, slippage: 0.001,
    };
    expect(validateBacktestConfig(config)).toEqual([]);
  });

  it('无效配置应报错', () => {
    const config: BacktestConfig = {
      startDate: '2024-12-31', endDate: '2024-01-01',
      universe: [], rebalanceFreq: 'daily',
      benchmark: '000300', commission: 0.02, slippage: 0.02,
    };
    const errors = validateBacktestConfig(config);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('应计算滚动夏普', () => {
    const returns = dailyReturns.map(r => r.portfolioReturn);
    const rolling = calcRollingSharpe(returns, 20);
    expect(rolling.length).toBe(returns.length - 19);
  });

  it('盈利因子应大于0', () => {
    const result = calcBacktestMetrics(dailyReturns);
    expect(result.profitFactor).toBeGreaterThan(0);
  });

  it('Calmar比率应与收益和回撤相关', () => {
    const result = calcBacktestMetrics(dailyReturns);
    if (result.maxDrawdown > 0) {
      expect(result.calmarRatio).toBeCloseTo(result.annualizedReturn / result.maxDrawdown, 2);
    }
  });

  it('总收益应与每日收益一致', () => {
    const result = calcBacktestMetrics(dailyReturns);
    const manualTotal = dailyReturns.reduce((acc, r) => acc * (1 + r.portfolioReturn), 1) - 1;
    expect(result.totalReturn).toBeCloseTo(manualTotal, 5);
  });

  it('Beta应有定义', () => {
    const result = calcBacktestMetrics(dailyReturns);
    expect(typeof result.beta).toBe('number');
  });

  it('Alpha应有定义', () => {
    const result = calcBacktestMetrics(dailyReturns);
    expect(typeof result.alpha).toBe('number');
  });
});
