import { describe, it, expect } from 'vitest';
// ── 生产实现绑定（M2 影子治理批次 41a）───────────────────────────────────────
//
// 一、原自抄实现的问题
//   1. 风险指标全部自造：波动率用总体方差（/n）、夏普无年化与无风险利率、VaR 用自切片分位数，
//      与生产组合风险引擎的样本方差（/(n-1)）、年化口径、历史模拟法（金额口径）全不一致。
//   2. 市场状态自造枚举 'sideways'：生产 regimeDetectionEngine.detectTrend 的横向档是 'neutral'，
//      且判据是线性回归斜率 |slope| <= 0.01 元/根，不是「20 根涨跌幅 ±3%」。
//   3. 市场宽度自造 adv/(adv+decl)：生产 calculateMarketBreadth 的 breadthPercent = (adv-decl)/total，
//      值域 [-1,1]，并附带 signal 档位。
//   4. 数据质量自造「h<l / h<o / 负价」字符串数组：生产 validateOHLCV 返回 7 项具名检查
//      （high_gte_low / high_bounds / low_bounds / non_negative_volume / positive_prices /
//      date_ordering / price_continuity），且 positive_prices 判 <=0 而非 <0。
//   5. 涨跌停自造 10%/5% 两档：生产 calculatePriceLimit 还覆盖新股 44%、科创/北交 20%（新股 60%），
//      并按 roundTo(…,2) 取整。
//   6. 随机性：volatility / maxDrawdown / VaR / 横向行情 4 处用例用未播种随机数造数，
//      断言不可复现——本版全部换成固定序列常量。
//
// 二、绑定生产实现（file:line + 选型理由）
//   • frontend/src/utils/riskManagementEngine.ts:64 calculatePortfolioRisk
//     —— 组合市值/成本/盈亏、历史模拟法 VaR（金额口径）、回撤、Beta、跟踪误差、HHI、行业暴露。
//     选它而非 portfolioRiskBudgetEngine.calculateVaR（:150 参数法、返回收益率口径），
//     因为原用例的 VaR 由日收益分位数反推，属历史模拟法；参数法口径在注释中登记，未用于断言。
//   • frontend/src/utils/performanceAttributionEngine.ts:112 calculateRiskMetrics
//     —— 年化波动率(样本方差)、夏普、索提诺、Beta、跟踪误差、信息比率、最大回撤。
//     选它而非 riskAdjustedReturnEngine（:27，round 2 位、下行风险用总体方差兜底），
//     因为本组用例需要 4 位精度与「无下行」明确语义；另一套口径此处登记不使用。
//   • frontend/src/utils/backtestPerformanceAnalyzer.ts:171/185/248
//     calculateSortinoRatio / calculateCalmarRatio / calculateOmegaRatio
//     —— 索提诺无下行返回 Infinity（另一套 performanceAttributionEngine 用 0.001 兜底，
//     两套口径不同，本组选「可区分无下行」的 Infinity 语义）。
//   • frontend/src/utils/regimeDetectionEngine.ts:53 detectTrend
//     —— 唯一同契约的「价格序列→趋势方向」导出；横向档 'neutral'。
//   • frontend/src/utils/regimeDetectionEngine.ts:296 calculateMarketBreadth
//     —— 唯一同契约的市场宽度导出。
//   • frontend/src/utils/tradingCalendarEngine.ts:138 calculatePriceLimit
//     —— 唯一按板块/ST/新股给出涨跌停价的导出。
//   • frontend/src/utils/dataQualityEngine.ts:57 validateOHLCV
//     —— 唯一 OHLCV 结构校验导出（7 项具名检查）。
//
// 三、未迁移清单及原因
//   • 组合权重逐标拆解（weights）：生产 calculatePortfolioRisk 只暴露 totalValue 与 sectorExposure，
//     不导出逐标的权重；HHI（concentrationRisk）不是权重，故权重保留内联并额外用 HHI 断言佐证。
//   • detectVolatility（价格序列 + 0.02/0.005 绝对阈值）：生产 calculateVolatilityRegime 入参是
//     收益率序列、滚动窗口 60 硬下限、按波动率分位数分档（非绝对阈值），契约不同，保留内联。
//   • CAPM / Treynor / Jensen alpha：生产无独立导出（BacktestAnalyzer.compareWithBenchmark:528
//     是实例方法且 alpha 用交易盈亏回归），保留内联。
//   • 均值回归偏离、月度季节性：生产无同契约独立导出，保留内联。
//   • 价格跳变异常（百分比阈值）：生产 detectOutliers 是 3σ z-score 口径，实测对
//     [100,101,102,120,105,106] 返回空数组，与「相邻涨跌 >10%」语义无关，保留内联。
//   • 数据质量评分（字段完整率）、缺失字段、去重：generateQualityReport 用当前墙钟时间算 timeliness，
//     score 随运行时间变化且口径是 7 项检查加权，不可作确定断言；保留内联纯规格 helper。
//   • 涨跌停布尔判定 isAtLimitUp：生产无布尔导出，保留内联但由 calculatePriceLimit 供价。

interface Position {
  symbol: string;
  shares: number;
  costPrice: number;
  currentPrice: number;
  sector?: string;
}

import {
  calculatePortfolioRisk as calculateProdPortfolioRisk,
  type Position as ProdPosition,
} from '../../../frontend/src/utils/riskManagementEngine';
import { calculateRiskMetrics } from '../../../frontend/src/utils/performanceAttributionEngine';
import {
  calculateSortinoRatio,
  calculateCalmarRatio,
  calculateOmegaRatio,
} from '../../../frontend/src/utils/backtestPerformanceAnalyzer';
import {
  detectTrend,
  calculateMarketBreadth,
} from '../../../frontend/src/utils/regimeDetectionEngine';
import { calculatePriceLimit } from '../../../frontend/src/utils/tradingCalendarEngine';
import { validateOHLCV, type OHLCVRecord } from '../../../frontend/src/utils/dataQualityEngine';

// 影子 Position（shares/costPrice）→ 生产 Position（quantity/avgCost）。字段名不同，语义一致。
const toProdPositions = (positions: Position[]): ProdPosition[] =>
  positions.map(p => ({
    symbol: p.symbol,
    quantity: p.shares,
    avgCost: p.costPrice,
    currentPrice: p.currentPrice,
    sector: p.sector as string,
  }));

// 生产无同契约导出：逐标权重（calculatePortfolioRisk 不返回 weights），保留内联。
const calcWeights = (positions: Position[]): Record<string, number> => {
  const totalValue = positions.reduce((s, p) => s + p.shares * p.currentPrice, 0);
  const weights: Record<string, number> = {};
  if (totalValue === 0) return weights;
  for (const p of positions) {
    weights[p.symbol] = (p.shares * p.currentPrice) / totalValue;
  }
  return weights;
};

const calcPortfolioMetrics = (positions: Position[]) => {
  const risk = calculateProdPortfolioRisk(toProdPositions(positions), [], []);
  // 生产 calculatePortfolioRisk 不返回成本总额（只由 totalPnL/totalPnLPct 反推），成本按定义内联求和。
  const totalCost = positions.reduce((s, p) => s + p.shares * p.costPrice, 0);
  return {
    totalCost,
    totalValue: risk.totalValue,
    totalPnL: risk.totalPnL,
    totalReturn: risk.totalPnLPct,
    concentrationRisk: risk.concentrationRisk,
    weights: calcWeights(positions),
  };
};

// 组合日收益 = Σ 权重 × 个券日收益；权重聚合生产无导出，内联后交给生产做风险度量。
const portfolioReturnsOf = (positions: Position[], dailyReturns: number[][]): number[] => {
  const weights = calcWeights(positions);
  return dailyReturns.map(day =>
    positions.reduce((sum, p, i) => sum + (weights[p.symbol] ?? 0) * (day?.[i] ?? 0), 0),
  );
};

// 生产指标 + 生产历史模拟法 VaR 一起取，避免用例各算一套。
const analyzePortfolio = (positions: Position[], dailyReturns: number[][]) => {
  const portfolioReturns = portfolioReturnsOf(positions, dailyReturns);
  const benchmarkReturns = portfolioReturns.map(r => r * 0.5);
  return {
    metrics: calculateRiskMetrics(portfolioReturns, benchmarkReturns),
    risk: calculateProdPortfolioRisk(toProdPositions(positions), benchmarkReturns, portfolioReturns),
    portfolioReturns,
  };
};

describe('Portfolio Risk Engine', () => {
  it('should calculate total portfolio value', () => {
    const positions: Position[] = [
      { symbol: '600519', shares: 100, costPrice: 100, currentPrice: 120 },
      { symbol: '000858', shares: 200, costPrice: 50, currentPrice: 55 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    expect(metrics.totalValue).toBe(100 * 120 + 200 * 55);
    expect(metrics.totalCost).toBe(100 * 100 + 200 * 50);
    expect(metrics.totalPnL).toBe(23000 - 20000);
  });

  it('should calculate total PnL correctly', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 12 },
      { symbol: 'B', shares: 100, costPrice: 20, currentPrice: 18 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    expect(metrics.totalPnL).toBe(100 * 2 + 100 * (-2));
    expect(metrics.totalReturn).toBe(0);
  });

  it('weights should sum to 1', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 12 },
      { symbol: 'B', shares: 200, costPrice: 5, currentPrice: 6 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    const totalWeight = Object.values(metrics.weights).reduce((a, b) => a + b, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
    // 两标的等权时生产 HHI = 0.5，佐证权重口径与生产一致。
    expect(metrics.concentrationRisk).toBeCloseTo(0.5, 5);
  });

  it('sector weights should sum to 1', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 12, sector: '白酒' },
      { symbol: 'B', shares: 200, costPrice: 5, currentPrice: 6, sector: '科技' },
    ];
    const risk = calculateProdPortfolioRisk(toProdPositions(positions), [], []);
    const exposure = risk.sectorExposure;
    const total = Array.from(exposure.values()).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(exposure.get('白酒')).toBeCloseTo(0.5, 5);
    expect(exposure.get('科技')).toBeCloseTo(0.5, 5);
  });

  it('volatility should be non-negative', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    // 旧用例用未播种随机数造数（不可复现），改为固定 ±1% 交替序列。
    const returns = Array.from({ length: 30 }, (_, i) => [i % 2 === 0 ? 0.01 : -0.01]);
    const { metrics } = analyzePortfolio(positions, returns);
    expect(metrics.totalRisk).toBeGreaterThanOrEqual(0);
    expect(metrics.totalRisk).toBeGreaterThan(0);
  });

  it('max drawdown should be 0-1', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    const returns = Array.from({ length: 50 }, (_, i) => [((i % 5) - 2) * 0.01]);
    const { metrics } = analyzePortfolio(positions, returns);
    expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(metrics.maxDrawdown).toBeLessThanOrEqual(1);
  });

  it('VaR 95 should be non-negative', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    const returns = Array.from({ length: 100 }, (_, i) => [((i % 7) - 3) * 0.008]);
    const { risk } = analyzePortfolio(positions, returns);
    // 生产 var95 为金额口径：-sorted[floor(n*0.05)] × 组合市值（1000 元），故非负且为正。
    expect(risk.var95).toBeGreaterThanOrEqual(0);
    expect(risk.var95).toBeGreaterThan(0);
    // 99% 分位更靠尾部，金额不小于 95% 分位。
    expect(risk.var99).toBeGreaterThanOrEqual(risk.var95);
  });

  it('empty positions should have zero metrics', () => {
    const metrics = calcPortfolioMetrics([]);
    expect(metrics.totalValue).toBe(0);
    expect(metrics.totalCost).toBe(0);
    expect(metrics.totalPnL).toBe(0);
    // 生产对空组合：PnL 比例 0、VaR 0、Beta 兜底 1（不是 NaN/Infinity）。
    const risk = calculateProdPortfolioRisk([], [], []);
    expect(risk.totalPnLPct).toBe(0);
    expect(risk.var95).toBe(0);
    expect(risk.maxDrawdown).toBe(0);
    expect(risk.beta).toBe(1);
  });

  it('single position risk calculation', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    const returns = Array.from({ length: 30 }, () => [0.01]);
    const { metrics, risk } = analyzePortfolio(positions, returns);
    // 恒定收益 → 样本方差 0、无回撤；生产返回 0 而非 NaN。
    expect(metrics.totalRisk).toBe(0);
    expect(metrics.maxDrawdown).toBe(0);
    expect(risk.maxDrawdown).toBe(0);
    expect(Number.isFinite(metrics.sharpeRatio)).toBe(true);
  });

  it('rebalancing suggestion: overweight detection', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 900, costPrice: 10, currentPrice: 10 },
      { symbol: 'B', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    expect(metrics.weights['A']).toBeGreaterThan(0.8);
    // 生产 HHI = 0.9² + 0.1² = 0.82，与权重同向且落在同量级。
    expect(metrics.concentrationRisk).toBeCloseTo(0.82, 5);
  });

  it('losing position should reduce total return', () => {
    const winning: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 15 },
    ];
    const losing: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 15 },
      { symbol: 'B', shares: 100, costPrice: 10, currentPrice: 5 },
    ];
    const m1 = calcPortfolioMetrics(winning);
    const m2 = calcPortfolioMetrics(losing);
    expect(m2.totalReturn).toBeLessThan(m1.totalReturn);
    expect(m1.totalReturn).toBeCloseTo(0.5, 6);
    expect(m2.totalReturn).toBe(0);
  });
});

// 市场状态检测
describe('Market Regime Detection', () => {
  // detectTrend / calculateMarketBreadth 已绑定生产，见文件头。
  // 生产无同契约导出：detectVolatility 是「价格序列 → 绝对波动阈值」口径，
  // calculateVolatilityRegime 收收益率序列且按分位数分档（window=60），故保留内联。
  const detectVolatility = (prices: number[], period: number = 20): 'high' | 'normal' | 'low' => {
    if (prices.length < period) return 'normal';
    const recent = prices.slice(-period);
    const returns: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      returns.push((recent[i] - recent[i - 1]) / recent[i - 1]);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    const vol = Math.sqrt(variance);
    if (vol > 0.02) return 'high';
    if (vol < 0.005) return 'low';
    return 'normal';
  };

  it('rising prices should detect uptrend', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(detectTrend(prices).direction).toBe('up');
    // 完美线性 → 生产趋势强度 R² = 1。
    expect(detectTrend(prices).strength).toBeCloseTo(1, 6);
  });

  it('falling prices should detect downtrend', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 130 - i);
    expect(detectTrend(prices).direction).toBe('down');
  });

  it('flat prices should detect sideways', () => {
    // 旧用例用未播种随机数造横向行情；改为固定 100 + 0.1×(i%3)，斜率≈0.0004。
    const prices = Array.from({ length: 30 }, (_, i) => 100 + (i % 3) * 0.1);
    // 旧断言错在哪（生产正确）：生产横向档位是 'neutral'，不是 'sideways'；
    // 且判据为回归斜率 |slope| <= 0.01（元/根），不是区间涨跌幅。
    expect(detectTrend(prices).direction).toBe('neutral');
    expect(detectTrend(prices).strength).toBeLessThan(0.01);
  });

  it('high volatility detection', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
    expect(detectVolatility(prices)).toBe('high');
  });

  it('low volatility detection', () => {
    // 旧用例用未播种随机数；改为固定 ±0.05 微幅序列（不到 0.5% 波动）。
    const prices = Array.from({ length: 30 }, (_, i) => 100 + (i % 3) * 0.05);
    expect(detectVolatility(prices)).toBe('low');
  });

  it('insufficient data should return defaults', () => {
    // 旧断言错在哪（生产正确）：生产数据不足返回 'neutral'，不是 'sideways'。
    expect(detectTrend([1, 2, 3]).direction).toBe('neutral');
    expect(detectTrend([1, 2, 3]).strength).toBe(0);
    expect(detectVolatility([1, 2, 3])).toBe('normal');
  });

  it('mean reversion detection', () => {
    // 生产无同契约独立导出：均值回归只在 riskScenarioEngine.runStressTest 内部使用。
    const prices = [100, 110, 105, 115, 108, 112, 107, 113];
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const last = prices[prices.length - 1];
    const deviation = (last - mean) / mean;
    expect(Math.abs(deviation)).toBeLessThan(0.1);
  });

  it('market breadth calculation', () => {
    const breadth = calculateMarketBreadth(2500, 1500, 0);
    // 旧断言错在哪（生产正确）：生产 breadthPercent = (adv-decl)/total = 0.25（值域 [-1,1]），
    // 不是 adv/(adv+decl)=0.625；旧断言 breadth > 0.5 在错误口径下才成立。
    expect(breadth.breadthPercent).toBeCloseTo(0.25, 6);
    expect(breadth.breadthPercent).toBeGreaterThan(-1);
    expect(breadth.breadthPercent).toBeLessThan(1);
    expect(breadth.signal).toBe('bullish');
  });

  it('seasonality pattern detection', () => {
    // 生产无同契约独立导出（月度季节性只在回测分析器内部按月分组）。
    const monthlyReturns = [0.02, -0.01, 0.03, 0.01, -0.02, 0.04, 0.01, -0.01, 0.02, 0.03, 0.02, 0.05];
    const avg = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
    expect(avg).toBeGreaterThan(0);
    // December tends to be higher
    expect(monthlyReturns[11]).toBeGreaterThan(avg);
  });
});

// 高级金融指标
describe('Advanced Financial Indicators', () => {
  // 生产无同契约导出：CAPM / Treynor / Jensen alpha 均为内联公式。
  // 另一套口径登记：backtestPerformanceAnalyzer.ts:528 compareWithBenchmark 用交易盈亏做 CAPM 回归，
  // 属 BacktestAnalyzer 实例方法且输入是 TradeRecord，不是「收益率 + beta」函数。
  const calcCAPM = (riskFree: number, marketReturn: number, beta: number): number => {
    return riskFree + beta * (marketReturn - riskFree);
  };

  const calcTreynor = (portfolioReturn: number, riskFree: number, beta: number): number => {
    return beta === 0 ? 0 : (portfolioReturn - riskFree) / beta;
  };

  const calcJensenAlpha = (portfolioReturn: number, riskFree: number, beta: number, marketReturn: number): number => {
    return portfolioReturn - (riskFree + beta * (marketReturn - riskFree));
  };

  it('CAPM: high beta should give higher expected return', () => {
    const low = calcCAPM(0.03, 0.1, 0.5);
    const high = calcCAPM(0.03, 0.1, 1.5);
    expect(high).toBeGreaterThan(low);
  });

  it('CAPM: beta=1 gives market return', () => {
    expect(calcCAPM(0.03, 0.1, 1)).toBe(0.1);
  });

  it('CAPM: beta=0 gives risk-free rate', () => {
    expect(calcCAPM(0.03, 0.1, 0)).toBe(0.03);
  });

  it('beta of identical returns should be 1', () => {
    const ret = [0.01, 0.02, -0.01, 0.03, -0.02];
    // 生产 Beta = 样本协方差/基准样本方差，同一序列必为 1（保留 4 位）。
    expect(calculateRiskMetrics(ret, ret).beta).toBeCloseTo(1, 5);
  });

  it('beta of uncorrelated returns should be near 0', () => {
    const stock = [0.01, -0.01, 0.01, -0.01];
    const market = [0.02, 0.02, -0.02, -0.02];
    const beta = calculateRiskMetrics(stock, market).beta;
    expect(Math.abs(beta)).toBeLessThan(1);
    expect(Math.abs(beta)).toBeCloseTo(0, 4);
  });

  it('Treynor ratio should increase with return', () => {
    const t1 = calcTreynor(0.12, 0.03, 1);
    const t2 = calcTreynor(0.15, 0.03, 1);
    expect(t2).toBeGreaterThan(t1);
  });

  it('Jensen alpha positive means outperformance', () => {
    const alpha = calcJensenAlpha(0.15, 0.03, 1, 0.1);
    expect(alpha).toBeGreaterThan(0);
  });

  it('Jensen alpha zero means market performance', () => {
    const alpha = calcJensenAlpha(0.1, 0.03, 1, 0.1);
    expect(alpha).toBeCloseTo(0, 5);
  });

  it('Sortino ratio with positive returns', () => {
    const returns = [0.01, 0.02, -0.005, 0.015, -0.003, 0.01, 0.008, -0.01];
    // 生产下行方差只取负收益的平方均值（不减无风险利率），再年化。
    expect(calculateSortinoRatio(returns, 0)).toBeGreaterThan(0);
    expect(Number.isFinite(calculateSortinoRatio(returns, 0))).toBe(true);
  });

  it('Sortino ratio with all positive returns', () => {
    const returns = [0.01, 0.02, 0.015, 0.01, 0.008];
    // 旧断言错在哪（生产正确）：生产无下行收益时返回 Infinity（除零），不是 0；
    // 另一套 performanceAttributionEngine 用 0.001 兜底、riskAdjustedReturnEngine 回退总体方差，
    // 三者口径不同，本组按「无下行=无限风险调整收益」的 Infinity 口径断言。
    expect(calculateSortinoRatio(returns, 0)).toBe(Infinity);
  });

  it('Information Ratio calculation', () => {
    const portfolioReturns = [0.01, 0.02, -0.01, 0.015];
    const benchmarkReturns = [0.008, 0.015, -0.005, 0.01];
    const metrics = calculateRiskMetrics(portfolioReturns, benchmarkReturns);
    // 生产 IR = (组合年化超额) / 年化跟踪误差（样本方差），故为有限数值。
    expect(typeof metrics.informationRatio).toBe('number');
    expect(Number.isFinite(metrics.informationRatio)).toBe(true);
    expect(metrics.informationRatio).toBeCloseTo(5.8894, 3);
  });

  it('tracking error should be non-negative', () => {
    const p = [0.01, 0.02, -0.01];
    const b = [0.008, 0.015, -0.005];
    const metrics = calculateRiskMetrics(p, b);
    // 生产跟踪误差按样本方差（/n-1）年化：sqrt(var*252)，旧自抄按总体方差且不年化。
    expect(metrics.trackingError).toBeGreaterThanOrEqual(0);
    expect(metrics.trackingError).toBeCloseTo(0.0815, 3);
  });

  it('Calmar Ratio calculation', () => {
    // 生产直接吃「年化收益 + 最大回撤」，回撤为 0 时返回 Infinity（不是 0 或 NaN）。
    expect(calculateCalmarRatio(0.15, 0.1)).toBeCloseTo(1.5, 10);
    expect(calculateCalmarRatio(0.15, 0)).toBe(Infinity);
  });

  it('Omega Ratio calculation', () => {
    const returns = [0.03, -0.01, 0.02, -0.02, 0.04, 0.01, -0.01];
    // 生产阈值比较是 r > threshold 计收益、r <= threshold 计损失，与自抄 r < threshold 一致。
    expect(calculateOmegaRatio(returns, 0)).toBeGreaterThan(0);
    expect(calculateOmegaRatio(returns, 0)).toBeCloseTo(2.5, 6);
  });
});

// 数据质量管理
describe('Data Quality Management', () => {
  // 生产无同契约导出：数据质量评分是字段完整率口径；generateQualityReport 的 score 依赖
  // 当前墙钟时间计算 timeliness（不确定），且口径为 7 项检查加权，故保留内联。
  const dataQualityScore = (data: Record<string, any>[], requiredFields: string[]): number => {
    if (data.length === 0) return 0;
    let totalChecks = 0;
    let passedChecks = 0;
    for (const row of data) {
      for (const field of requiredFields) {
        totalChecks++;
        if (row[field] !== null && row[field] !== undefined && row[field] !== '') {
          passedChecks++;
        }
      }
    }
    return totalChecks === 0 ? 0 : (passedChecks / totalChecks) * 100;
  };

  // 生产 detectOutliers 是 3σ z-score（实测对该序列返回空），与「相邻跳变 > 10%」契约不同，
  // 保留内联百分比跳变检测。
  const detectAnomalies = (prices: number[], threshold: number = 0.1): number[] => {
    const anomalies: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]);
      if (change > threshold) anomalies.push(i);
    }
    return anomalies;
  };

  const ohlcv = (open: number, high: number, low: number, close: number): OHLCVRecord[] => [
    { date: '2024-01-01', open, high, low, close, volume: 1000 },
  ];

  it('valid OHLC should pass', () => {
    const checks = validateOHLCV(ohlcv(10, 12, 9, 11));
    expect(checks).toHaveLength(7);
    expect(checks.every(c => c.passed)).toBe(true);
  });

  it('high < low should fail', () => {
    const checks = validateOHLCV(ohlcv(10, 8, 9, 11));
    expect(checks.find(c => c.name === 'high_gte_low')?.passed).toBe(false);
  });

  it('high < close should fail', () => {
    const checks = validateOHLCV(ohlcv(10, 12, 9, 15));
    expect(checks.find(c => c.name === 'high_bounds')?.passed).toBe(false);
  });

  it('negative price should fail', () => {
    const checks = validateOHLCV(ohlcv(-1, 12, 9, 11));
    // 生产 positive_prices 判 open/high/low/close <= 0，-1 命中。
    expect(checks.find(c => c.name === 'positive_prices')?.passed).toBe(false);
  });

  it('low > open should fail', () => {
    const checks = validateOHLCV(ohlcv(10, 12, 15, 11));
    expect(checks.find(c => c.name === 'low_bounds')?.passed).toBe(false);
  });

  it('should detect price anomalies', () => {
    const prices = [100, 101, 102, 120, 105, 106];
    const anomalies = detectAnomalies(prices, 0.1);
    expect(anomalies).toContain(3);
  });

  it('normal price changes should not be anomalies', () => {
    const prices = [100, 101, 102, 103, 104];
    const anomalies = detectAnomalies(prices, 0.1);
    expect(anomalies.length).toBe(0);
  });

  it('empty data quality should be 0', () => {
    expect(dataQualityScore([], ['a'])).toBe(0);
  });

  it('complete data quality should be 100', () => {
    const data = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    expect(dataQualityScore(data, ['a', 'b'])).toBe(100);
  });

  it('partial data quality should be between 0 and 100', () => {
    const data = [{ a: 1, b: null }, { a: undefined, b: 2 }];
    const score = dataQualityScore(data, ['a', 'b']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it('missing field detection', () => {
    const row: Record<string, unknown> = { price: 100, volume: null, date: '2024-01-01' };
    const missing = Object.entries(row).filter(([, v]) => v === null || v === undefined);
    expect(missing.length).toBe(1);
    expect(missing[0][0]).toBe('volume');
  });

  it('data deduplication', () => {
    const data = [
      { id: 1, value: 'a' },
      { id: 2, value: 'b' },
      { id: 1, value: 'a' },
      { id: 3, value: 'c' },
    ];
    const seen = new Set<number>();
    const unique = data.filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
    expect(unique.length).toBe(3);
  });

  it('price limit detection (A股涨跌停)', () => {
    const limits = calculatePriceLimit({
      code: '600519',
      date: '2024-01-02',
      prevClose: 10,
      isST: false,
      is新股: false,
      is科创板: false,
      is北交所: false,
    });
    expect(limits.upperLimit).toBe(11);
    expect(limits.lowerLimit).toBe(9);
    // 生产无布尔判定导出，保留内联；阈值由生产涨跌停价供给。
    const isAtLimitUp = (price: number) => Math.abs(price - limits.upperLimit) < 0.001;
    expect(isAtLimitUp(11)).toBe(true);
    expect(isAtLimitUp(10.5)).toBe(false);
  });
});
