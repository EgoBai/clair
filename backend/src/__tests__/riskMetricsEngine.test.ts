import { describe, it, expect } from 'vitest';
import {
  calculateVaR,
  calculateCVaR as calculateParametricCVaR,
} from '../../../frontend/src/utils/portfolioRiskBudgetEngine';
import {
  calculateCalmarRatio,
  calculateCVaR as calculateHistoricalCVaR,
  calculateOmegaRatio,
} from '../../../frontend/src/utils/backtestPerformanceAnalyzer';
import { calculateBeta } from '../../../frontend/src/utils/correlationMatrix';
import { calculateInformationRatio } from '../../../frontend/src/utils/globalCorrelationEngine';

/**
 * 风险指标测试（影子测试迁移 · 批次 11）
 *
 * 生产真源：
 *   frontend/src/utils/portfolioRiskBudgetEngine.ts
 *     → calculateVaR(L144-152) / calculateCVaR(L154-164)：参数法，入参是期望收益与风险，不是收益序列
 *   frontend/src/utils/backtestPerformanceAnalyzer.ts
 *     → calculateCVaR(L254-260)：历史尾部均值（带符号）/ calculateCalmarRatio(L185-190) / calculateOmegaRatio(L248-252)
 *   frontend/src/utils/correlationMatrix.ts
 *     → calculateBeta(L86-90)：calculateBeta(stockReturns, marketReturns)
 *   frontend/src/utils/globalCorrelationEngine.ts
 *     → calculateInformationRatio(L367-385)
 *
 * 旧断言修正（旧行号指迁移前版本）：
 *   1) VaR：旧 L4-9 是历史模拟法（收益序列分位数取绝对值）；生产只有参数法
 *      calculateVaR(expectedReturn, risk, confidence, holdingPeriod)，5 条用例改按参数法断言。
 *      旧 L86「空数组→0」在参数法无对应入参，改为零期望/零风险边界（生产公式返回 -0，用 toBeCloseTo 判 0）。
 *   2) 历史 CVaR：旧 L17 对尾部均值取 Math.abs，生产 L259 返回带符号均值；旧 L113 的 >0 改为 -0.1。
 *   3) CVaR ≥ VaR：生产无历史 VaR 配对，改用 portfolioRiskBudgetEngine 同源参数法比较。
 *   4) Beta：旧 L20-33 与 correlationMatrix L86-90 同为 cov/var；补精确值防止参数顺序颠倒仍「>0 蒙混」。
 *      注意 globalCorrelationEngine L222-235 的 calculateBeta(marketReturns, stockReturns) 参数顺序相反、
 *      用原始二阶矩而非协方差，契约不同，本组不采用。
 *   5) Calmar：生产签名 (annualizedReturn, maxDrawdown)，旧 L61-65 传收益序列并自行×252；
 *      生产 maxDrawdown===0 → Infinity（旧为 0），且调用方 L422-424 传正的 drawdownPercent（旧 L220 传 -0.05）。
 *   6) Omega：生产 L248-252 与旧 L67-74 公式一致，补精确值。
 *   7) IR：生产 L367-385 用 min 长度 + 样本标准差(n-1)，旧 L48-59 要求等长 + 总体标准差(n)；补精确值 √2。
 *
 * 未迁移（生产无对应实现，保留本地 helper）：
 *   - calculateAlpha：生产无独立 CAPM alpha；仅 BacktestAnalyzer.compareWithBenchmark 内部按交易收益算，
 *     需 trades 实例，无法替代 (stockReturns, marketReturns, riskFreeRate)。
 *   - calculateTreynorRatio：backend/src/utils/performanceAnalyzer.ts L277-280 的 calcTreynor 为 private，
 *     入参 (annualizedReturn, dailyReturns) 且内部自算 beta，与旧 (returns, riskFreeRate, beta) 契约不同。
 */

// 未迁移：生产无 CAPM alpha 函数（见文件头第 1 条未迁移说明）
function calculateAlpha(stockReturns: number[], marketReturns: number[], riskFreeRate: number = 0.02): number {
  const beta = calculateBeta(stockReturns, marketReturns);
  const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
  const marketMean = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
  return stockMean - (riskFreeRate + beta * (marketMean - riskFreeRate));
}

// 未迁移：生产 calcTreynor 为 private 且契约不同（见文件头第 2 条未迁移说明）
function calculateTreynorRatio(returns: number[], riskFreeRate: number, beta: number): number {
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const excessReturn = meanReturn - riskFreeRate;
  return beta === 0 ? 0 : excessReturn / beta;
}

describe('Risk Metrics Engine', () => {
  describe('Value at Risk (VaR) - 参数法（portfolioRiskBudgetEngine）', () => {
    it('should calculate VaR for normal returns', () => {
      // 生产参数法：VaR = -(μ·hp - z·σ·√hp)，正数表示损失
      const var95 = calculateVaR(0.001, 0.02, 0.95);
      expect(var95).toBeCloseTo(0.0319, 10);
      expect(var95).toBeGreaterThan(0);
      expect(var95).toBeLessThanOrEqual(0.05);
    });

    it('should return 0 for zero return and zero risk', () => {
      // 旧用例为「空收益序列→0」；生产参数法无样本概念，零期望+零风险是同一公式的下界
      expect(calculateVaR(0, 0, 0.95)).toBeCloseTo(0, 12);
    });

    it('should return higher VaR for higher confidence', () => {
      const var95 = calculateVaR(0.001, 0.02, 0.95);
      const var99 = calculateVaR(0.001, 0.02, 0.99);
      expect(var99).toBeCloseTo(0.04552, 10);
      expect(var99).toBeGreaterThanOrEqual(var95);
    });

    it('should handle all positive returns', () => {
      // 正期望收益超过 z×风险时参数法 VaR 为负（预期盈利）；旧绝对值口径为 ≥0
      const var95 = calculateVaR(0.03, 0.01, 0.95);
      expect(var95).toBeCloseTo(-0.01355, 10);
      expect(var95).toBeLessThan(0);
    });

    it('should handle all negative returns', () => {
      const var95 = calculateVaR(-0.02, 0.01, 0.95);
      expect(var95).toBeCloseTo(0.03645, 10);
      expect(var95).toBeGreaterThan(0);
    });
  });

  describe('Conditional VaR (CVaR) - 历史尾部（backtestPerformanceAnalyzer）', () => {
    it('should calculate CVaR', () => {
      const returns = [-0.1, -0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.05];
      const cvar = calculateHistoricalCVaR(returns, 0.95);
      // 生产取尾部实际均值（带符号）：最差 5% 仅 1 个样本 -0.1；旧断言取绝对值后 >0
      expect(cvar).toBeCloseTo(-0.1, 12);
      expect(cvar).toBeLessThan(0);
    });

    it('should return 0 for empty array', () => {
      expect(calculateHistoricalCVaR([])).toBe(0);
    });

    it('should be >= VaR at same confidence', () => {
      // 历史 CVaR 无配对的历史 VaR；改用同源参数法（portfolioRiskBudgetEngine）比较
      const var95 = calculateVaR(0.001, 0.02, 0.95);
      const cvar95 = calculateParametricCVaR(0.001, 0.02, 0.95);
      expect(cvar95).toBeCloseTo(0.04024432443679253, 10);
      expect(cvar95).toBeGreaterThanOrEqual(var95);
    });
  });

  describe('Beta Calculation - correlationMatrix', () => {
    it('should calculate beta for correlated returns', () => {
      const stock = [0.02, 0.04, -0.01, 0.03, -0.02];
      const market = [0.01, 0.03, -0.01, 0.02, -0.01];
      const beta = calculateBeta(stock, market);
      expect(beta).toBeGreaterThan(0);
      expect(beta).toBeCloseTo(1.421875, 10);
    });

    it('should return 0 for mismatched lengths', () => {
      expect(calculateBeta([1, 2], [1])).toBe(0);
    });

    it('should return 0 for empty arrays', () => {
      expect(calculateBeta([], [])).toBe(0);
    });

    it('should return 0 for zero market variance', () => {
      const beta = calculateBeta([0.01, 0.02], [0.01, 0.01]);
      expect(beta).toBe(0);
    });

    it('should calculate beta > 1 for aggressive stock', () => {
      const stock = [0.04, 0.06, -0.03, 0.05, -0.04];
      const market = [0.01, 0.02, -0.01, 0.02, -0.01];
      const beta = calculateBeta(stock, market);
      expect(beta).toBeGreaterThan(1);
      expect(beta).toBeCloseTo(3.065217391304348, 10);
    });

    it('should calculate beta < 1 for defensive stock', () => {
      const stock = [0.005, 0.01, -0.005, 0.01, -0.005];
      const market = [0.02, 0.04, -0.02, 0.03, -0.02];
      const beta = calculateBeta(stock, market);
      expect(beta).toBeGreaterThan(0);
      expect(beta).toBeLessThan(1);
      expect(beta).toBeCloseTo(0.265625, 10);
    });
  });

  describe('Alpha Calculation', () => {
    it('should calculate positive alpha', () => {
      const stock = [0.03, 0.04, 0.02, 0.05, 0.03];
      const market = [0.01, 0.02, 0.01, 0.02, 0.01];
      const alpha = calculateAlpha(stock, market, 0.001);
      expect(alpha).toBeGreaterThan(0);
    });

    it('should calculate negative alpha for underperforming stock', () => {
      const stock = [0.005, 0.01, 0.005, 0.01, 0.005];
      const market = [0.02, 0.03, 0.02, 0.03, 0.02];
      const alpha = calculateAlpha(stock, market, 0.01);
      expect(alpha).toBeLessThan(0);
    });
  });

  describe('Treynor Ratio', () => {
    it('should calculate positive Treynor ratio', () => {
      const returns = [0.02, 0.03, 0.01, 0.04, 0.02];
      const treynor = calculateTreynorRatio(returns, 0.005, 1.2);
      expect(treynor).toBeGreaterThan(0);
    });

    it('should return 0 for zero beta', () => {
      expect(calculateTreynorRatio([0.01, 0.02], 0.005, 0)).toBe(0);
    });

    it('should handle negative excess return', () => {
      const returns = [0.001, 0.002, 0.001];
      const treynor = calculateTreynorRatio(returns, 0.01, 1.0);
      expect(treynor).toBeLessThan(0);
    });
  });

  describe('Information Ratio - globalCorrelationEngine', () => {
    it('should calculate positive IR for outperforming portfolio', () => {
      const portfolio = [0.02, 0.03, 0.01, 0.04, 0.02];
      const benchmark = [0.01, 0.02, 0.01, 0.02, 0.01];
      const ir = calculateInformationRatio(portfolio, benchmark);
      expect(ir).toBeGreaterThan(0);
      // meanExcess=0.01，样本标准差 √0.00005，IR=√2（旧总体标准差口径为 1.5811…）
      expect(ir).toBeCloseTo(Math.SQRT2, 10);
    });

    it('should return 0 for mismatched lengths', () => {
      expect(calculateInformationRatio([1], [])).toBe(0);
    });

    it('should return 0 for identical returns', () => {
      const returns = [0.01, 0.02, 0.03];
      expect(calculateInformationRatio(returns, returns)).toBe(0);
    });
  });

  describe('Calmar Ratio - backtestPerformanceAnalyzer', () => {
    it('should calculate positive Calmar for profitable strategy', () => {
      // 生产签名 (annualizedReturn, maxDrawdown)；maxDrawdown 传正幅度（生产调用方 L422-424）
      const calmar = calculateCalmarRatio(0.15, 0.05);
      expect(calmar).toBeCloseTo(3, 12);
      expect(calmar).toBeGreaterThan(0);
    });

    it('should return Infinity for zero drawdown', () => {
      // 旧自抄返回 0；生产 L189 在 maxDrawdown===0 时返回 Infinity
      expect(calculateCalmarRatio(0.01, 0)).toBe(Infinity);
    });

    it('should return negative for losing strategy', () => {
      const calmar = calculateCalmarRatio(-0.1, 0.1);
      expect(calmar).toBeCloseTo(-1, 12);
      expect(calmar).toBeLessThan(0);
    });
  });

  describe('Omega Ratio - backtestPerformanceAnalyzer', () => {
    it('should calculate Omega > 1 for profitable returns', () => {
      const returns = [0.01, 0.02, -0.005, 0.015, 0.01];
      const omega = calculateOmegaRatio(returns, 0);
      expect(omega).toBeGreaterThan(1);
      expect(omega).toBeCloseTo(11, 10);
    });

    it('should return Infinity when no losses', () => {
      const returns = [0.01, 0.02, 0.03];
      expect(calculateOmegaRatio(returns, 0)).toBe(Infinity);
    });

    it('should return 0 when no gains', () => {
      const returns = [-0.01, -0.02, -0.03];
      expect(calculateOmegaRatio(returns, 0)).toBe(0);
    });

    it('should handle custom threshold', () => {
      const returns = [0.02, 0.03, 0.01, 0.04];
      const omega = calculateOmegaRatio(returns, 0.025);
      expect(omega).toBeGreaterThan(0);
      expect(omega).toBeLessThan(Infinity);
      expect(omega).toBeCloseTo(1, 10);
    });
  });
});
