import { describe, it, expect } from 'vitest';

// Risk Metrics Calculations
function calculateVaR(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  return Math.abs(sorted[index] || 0);
}

function calculateCVaR(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.floor((1 - confidence) * sorted.length);
  const tail = sorted.slice(0, cutoff + 1);
  if (tail.length === 0) return 0;
  return Math.abs(tail.reduce((a, b) => a + b, 0) / tail.length);
}

function calculateBeta(stockReturns: number[], marketReturns: number[]): number {
  if (stockReturns.length !== marketReturns.length || stockReturns.length === 0) return 0;
  const n = stockReturns.length;
  const stockMean = stockReturns.reduce((a, b) => a + b, 0) / n;
  const marketMean = marketReturns.reduce((a, b) => a + b, 0) / n;
  
  let covariance = 0;
  let marketVariance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (stockReturns[i] - stockMean) * (marketReturns[i] - marketMean);
    marketVariance += (marketReturns[i] - marketMean) ** 2;
  }
  return marketVariance === 0 ? 0 : covariance / marketVariance;
}

function calculateAlpha(stockReturns: number[], marketReturns: number[], riskFreeRate: number = 0.02): number {
  const beta = calculateBeta(stockReturns, marketReturns);
  const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
  const marketMean = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
  return stockMean - (riskFreeRate + beta * (marketMean - riskFreeRate));
}

function calculateTreynorRatio(returns: number[], riskFreeRate: number, beta: number): number {
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const excessReturn = meanReturn - riskFreeRate;
  return beta === 0 ? 0 : excessReturn / beta;
}

function calculateInformationRatio(portfolioReturns: number[], benchmarkReturns: number[]): number {
  const n = portfolioReturns.length;
  if (n === 0 || n !== benchmarkReturns.length) return 0;
  
  const trackingErrors: number[] = [];
  for (let i = 0; i < n; i++) {
    trackingErrors.push(portfolioReturns[i] - benchmarkReturns[i]);
  }
  const meanTE = trackingErrors.reduce((a, b) => a + b, 0) / n;
  const stdTE = Math.sqrt(trackingErrors.reduce((sum, te) => sum + (te - meanTE) ** 2, 0) / n);
  return stdTE === 0 ? 0 : meanTE / stdTE;
}

function calculateCalmarRatio(returns: number[], maxDrawdown: number): number {
  if (maxDrawdown === 0) return 0;
  const annualReturn = returns.reduce((a, b) => a + b, 0) / returns.length * 252;
  return annualReturn / Math.abs(maxDrawdown);
}

function calculateOmegaRatio(returns: number[], threshold: number = 0): number {
  let gains = 0, losses = 0;
  for (const r of returns) {
    if (r > threshold) gains += r - threshold;
    else losses += threshold - r;
  }
  return losses === 0 ? Infinity : gains / losses;
}

describe('Risk Metrics Engine', () => {
  describe('Value at Risk (VaR)', () => {
    it('should calculate VaR for normal returns', () => {
      const returns = [-0.05, -0.03, -0.02, 0.01, 0.02, 0.03, 0.04];
      const var95 = calculateVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
      expect(var95).toBeLessThanOrEqual(0.05);
    });

    it('should return 0 for empty array', () => {
      expect(calculateVaR([], 0.95)).toBe(0);
    });

    it('should return higher VaR for higher confidence', () => {
      const returns = [-0.1, -0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.05, 0.08, 0.1];
      const var95 = calculateVaR(returns, 0.95);
      const var99 = calculateVaR(returns, 0.99);
      expect(var99).toBeGreaterThanOrEqual(var95);
    });

    it('should handle all positive returns', () => {
      const returns = [0.01, 0.02, 0.03, 0.04, 0.05];
      const var95 = calculateVaR(returns, 0.95);
      expect(var95).toBeGreaterThanOrEqual(0);
    });

    it('should handle all negative returns', () => {
      const returns = [-0.01, -0.02, -0.03, -0.04, -0.05];
      const var95 = calculateVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });
  });

  describe('Conditional VaR (CVaR)', () => {
    it('should calculate CVaR', () => {
      const returns = [-0.1, -0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.05];
      const cvar = calculateCVaR(returns, 0.95);
      expect(cvar).toBeGreaterThan(0);
    });

    it('should return 0 for empty array', () => {
      expect(calculateCVaR([])).toBe(0);
    });

    it('should be >= VaR at same confidence', () => {
      const returns = [-0.1, -0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.05, 0.08, 0.1];
      const var95 = calculateVaR(returns, 0.95);
      const cvar95 = calculateCVaR(returns, 0.95);
      expect(cvar95).toBeGreaterThanOrEqual(var95);
    });
  });

  describe('Beta Calculation', () => {
    it('should calculate beta for correlated returns', () => {
      const stock = [0.02, 0.04, -0.01, 0.03, -0.02];
      const market = [0.01, 0.03, -0.01, 0.02, -0.01];
      const beta = calculateBeta(stock, market);
      expect(beta).toBeGreaterThan(0);
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
    });

    it('should calculate beta < 1 for defensive stock', () => {
      const stock = [0.005, 0.01, -0.005, 0.01, -0.005];
      const market = [0.02, 0.04, -0.02, 0.03, -0.02];
      const beta = calculateBeta(stock, market);
      expect(beta).toBeGreaterThan(0);
      expect(beta).toBeLessThan(1);
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

  describe('Information Ratio', () => {
    it('should calculate positive IR for outperforming portfolio', () => {
      const portfolio = [0.02, 0.03, 0.01, 0.04, 0.02];
      const benchmark = [0.01, 0.02, 0.01, 0.02, 0.01];
      const ir = calculateInformationRatio(portfolio, benchmark);
      expect(ir).toBeGreaterThan(0);
    });

    it('should return 0 for mismatched lengths', () => {
      expect(calculateInformationRatio([1], [])).toBe(0);
    });

    it('should return 0 for identical returns', () => {
      const returns = [0.01, 0.02, 0.03];
      expect(calculateInformationRatio(returns, returns)).toBe(0);
    });
  });

  describe('Calmar Ratio', () => {
    it('should calculate positive Calmar for profitable strategy', () => {
      const returns = [0.01, 0.02, -0.005, 0.015, 0.01];
      const calmar = calculateCalmarRatio(returns, -0.05);
      expect(calmar).toBeGreaterThan(0);
    });

    it('should return 0 for zero drawdown', () => {
      expect(calculateCalmarRatio([0.01, 0.02], 0)).toBe(0);
    });

    it('should return negative for losing strategy', () => {
      const returns = [-0.01, -0.02, -0.01, -0.015];
      const calmar = calculateCalmarRatio(returns, -0.1);
      expect(calmar).toBeLessThan(0);
    });
  });

  describe('Omega Ratio', () => {
    it('should calculate Omega > 1 for profitable returns', () => {
      const returns = [0.01, 0.02, -0.005, 0.015, 0.01];
      const omega = calculateOmegaRatio(returns, 0);
      expect(omega).toBeGreaterThan(1);
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
    });
  });
});
