import { describe, it, expect } from 'vitest';

// 投资组合风险引擎测试
describe('Portfolio Risk Engine', () => {
  interface Position {
    symbol: string;
    shares: number;
    costPrice: number;
    currentPrice: number;
    sector?: string;
  }

  const calcPortfolioMetrics = (positions: Position[]) => {
    let totalCost = 0;
    let totalValue = 0;
    const weights: Record<string, number> = {};
    const sectorWeights: Record<string, number> = {};

    for (const p of positions) {
      const cost = p.shares * p.costPrice;
      const value = p.shares * p.currentPrice;
      totalCost += cost;
      totalValue += value;
    }

    for (const p of positions) {
      const value = p.shares * p.currentPrice;
      weights[p.symbol] = value / totalValue;
      if (p.sector) {
        sectorWeights[p.sector] = (sectorWeights[p.sector] || 0) + value / totalValue;
      }
    }

    return {
      totalCost,
      totalValue,
      totalPnL: totalValue - totalCost,
      totalReturn: (totalValue - totalCost) / totalCost,
      weights,
      sectorWeights,
    };
  };

  const calcPortfolioRisk = (positions: Position[], dailyReturns: number[][]) => {
    const n = dailyReturns[0]?.length ?? 0;
    if (n < 2) return { volatility: 0, maxDrawdown: 0, sharpe: 0, var95: 0 };

    const portfolioReturns: number[] = [];
    const weights = positions.map(p => (p.shares * p.currentPrice) /
      positions.reduce((s, x) => s + x.shares * x.currentPrice, 0));

    for (let day = 0; day < dailyReturns.length; day++) {
      let r = 0;
      for (let i = 0; i < positions.length; i++) {
        r += weights[i] * (dailyReturns[day]?.[i] ?? 0);
      }
      portfolioReturns.push(r);
    }

    const mean = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    const variance = portfolioReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / portfolioReturns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252);

    let peak = 1, maxDd = 0, cumReturn = 1;
    for (const r of portfolioReturns) {
      cumReturn *= (1 + r);
      if (cumReturn > peak) peak = cumReturn;
      const dd = (peak - cumReturn) / peak;
      if (dd > maxDd) maxDd = dd;
    }

    const sharpe = volatility === 0 ? 0 : (mean * 252) / volatility;
    const sorted = [...portfolioReturns].sort((a, b) => a - b);
    const varIdx = Math.floor(sorted.length * 0.05);
    const var95 = -sorted[varIdx];

    return { volatility, maxDrawdown: maxDd, sharpe, var95 };
  };

  it('should calculate total portfolio value', () => {
    const positions: Position[] = [
      { symbol: '600519', shares: 100, costPrice: 100, currentPrice: 120 },
      { symbol: '000858', shares: 200, costPrice: 50, currentPrice: 55 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    expect(metrics.totalValue).toBe(100 * 120 + 200 * 55);
    expect(metrics.totalCost).toBe(100 * 100 + 200 * 50);
  });

  it('should calculate total PnL correctly', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 12 },
      { symbol: 'B', shares: 100, costPrice: 20, currentPrice: 18 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    expect(metrics.totalPnL).toBe(100 * 2 + 100 * (-2));
  });

  it('weights should sum to 1', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 12 },
      { symbol: 'B', shares: 200, costPrice: 5, currentPrice: 6 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    const totalWeight = Object.values(metrics.weights).reduce((a, b) => a + b, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
  });

  it('sector weights should sum to 1', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 12, sector: '白酒' },
      { symbol: 'B', shares: 200, costPrice: 5, currentPrice: 6, sector: '科技' },
    ];
    const metrics = calcPortfolioMetrics(positions);
    const total = Object.values(metrics.sectorWeights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('volatility should be non-negative', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    const returns = Array.from({ length: 30 }, () => [(Math.random() - 0.5) * 0.05]);
    const risk = calcPortfolioRisk(positions, returns);
    expect(risk.volatility).toBeGreaterThanOrEqual(0);
  });

  it('max drawdown should be 0-1', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    const returns = Array.from({ length: 50 }, () => [(Math.random() - 0.5) * 0.03]);
    const risk = calcPortfolioRisk(positions, returns);
    expect(risk.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(risk.maxDrawdown).toBeLessThanOrEqual(1);
  });

  it('VaR 95 should be non-negative', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    const returns = Array.from({ length: 100 }, () => [(Math.random() - 0.5) * 0.04]);
    const risk = calcPortfolioRisk(positions, returns);
    expect(risk.var95).toBeGreaterThanOrEqual(0);
  });

  it('empty positions should have zero metrics', () => {
    const metrics = calcPortfolioMetrics([]);
    expect(metrics.totalValue).toBe(0);
    expect(metrics.totalCost).toBe(0);
    expect(metrics.totalPnL).toBe(0);
  });

  it('single position risk calculation', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    const returns = Array.from({ length: 30 }, () => [0.01]);
    const risk = calcPortfolioRisk(positions, returns);
    expect(risk.volatility).toBe(0);
    expect(risk.maxDrawdown).toBe(0);
  });

  it('rebalancing suggestion: overweight detection', () => {
    const positions: Position[] = [
      { symbol: 'A', shares: 900, costPrice: 10, currentPrice: 10 },
      { symbol: 'B', shares: 100, costPrice: 10, currentPrice: 10 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    expect(metrics.weights['A']).toBeGreaterThan(0.8);
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
  });
});

// 市场状态检测
describe('Market Regime Detection', () => {
  const detectTrend = (prices: number[], period: number = 20): 'up' | 'down' | 'sideways' => {
    if (prices.length < period) return 'sideways';
    const recent = prices.slice(-period);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const change = (last - first) / first;
    if (change > 0.03) return 'up';
    if (change < -0.03) return 'down';
    return 'sideways';
  };

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
    expect(detectTrend(prices)).toBe('up');
  });

  it('falling prices should detect downtrend', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 130 - i);
    expect(detectTrend(prices)).toBe('down');
  });

  it('flat prices should detect sideways', () => {
    const prices = Array.from({ length: 30 }, () => 100 + Math.random() * 0.5);
    expect(detectTrend(prices)).toBe('sideways');
  });

  it('high volatility detection', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
    expect(detectVolatility(prices)).toBe('high');
  });

  it('low volatility detection', () => {
    const prices = Array.from({ length: 30 }, () => 100 + Math.random() * 0.1);
    expect(detectVolatility(prices)).toBe('low');
  });

  it('insufficient data should return defaults', () => {
    expect(detectTrend([1, 2, 3])).toBe('sideways');
    expect(detectVolatility([1, 2, 3])).toBe('normal');
  });

  it('mean reversion detection', () => {
    const prices = [100, 110, 105, 115, 108, 112, 107, 113];
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const last = prices[prices.length - 1];
    const deviation = (last - mean) / mean;
    expect(Math.abs(deviation)).toBeLessThan(0.1);
  });

  it('market breadth calculation', () => {
    const advancing = 2500;
    const declining = 1500;
    const breadth = advancing / (advancing + declining);
    expect(breadth).toBeGreaterThan(0.5);
  });

  it('seasonality pattern detection', () => {
    const monthlyReturns = [0.02, -0.01, 0.03, 0.01, -0.02, 0.04, 0.01, -0.01, 0.02, 0.03, 0.02, 0.05];
    const avg = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
    expect(avg).toBeGreaterThan(0);
    // December tends to be higher
    expect(monthlyReturns[11]).toBeGreaterThan(avg);
  });
});

// 高级金融指标
describe('Advanced Financial Indicators', () => {
  const calcCAPM = (riskFree: number, marketReturn: number, beta: number): number => {
    return riskFree + beta * (marketReturn - riskFree);
  };

  const calcBeta = (stockReturns: number[], marketReturns: number[]): number => {
    const n = Math.min(stockReturns.length, marketReturns.length);
    const sMean = stockReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const mMean = marketReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    let cov = 0, mVar = 0;
    for (let i = 0; i < n; i++) {
      cov += (stockReturns[i] - sMean) * (marketReturns[i] - mMean);
      mVar += (marketReturns[i] - mMean) ** 2;
    }
    return mVar === 0 ? 0 : cov / mVar;
  };

  const calcTreynor = (portfolioReturn: number, riskFree: number, beta: number): number => {
    return beta === 0 ? 0 : (portfolioReturn - riskFree) / beta;
  };

  const calcJensenAlpha = (portfolioReturn: number, riskFree: number, beta: number, marketReturn: number): number => {
    return portfolioReturn - (riskFree + beta * (marketReturn - riskFree));
  };

  const calcSortino = (returns: number[], riskFree: number = 0): number => {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downside = returns.filter(r => r < riskFree);
    if (downside.length === 0) return 0;
    const downsideVariance = downside.reduce((a, b) => a + (b - riskFree) ** 2, 0) / downside.length;
    const downsideDev = Math.sqrt(downsideVariance);
    return downsideDev === 0 ? 0 : (mean - riskFree) / downsideDev * Math.sqrt(252);
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
    expect(calcBeta(ret, ret)).toBeCloseTo(1, 5);
  });

  it('beta of uncorrelated returns should be near 0', () => {
    const stock = [0.01, -0.01, 0.01, -0.01];
    const market = [0.02, 0.02, -0.02, -0.02];
    expect(Math.abs(calcBeta(stock, market))).toBeLessThan(1);
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
    const sortino = calcSortino(returns, 0);
    expect(sortino).toBeGreaterThan(0);
  });

  it('Sortino ratio with all positive returns', () => {
    const returns = [0.01, 0.02, 0.015, 0.01, 0.008];
    const sortino = calcSortino(returns, 0);
    expect(sortino).toBe(0); // no downside
  });

  it('Information Ratio calculation', () => {
    const portfolioReturns = [0.01, 0.02, -0.01, 0.015];
    const benchmarkReturns = [0.008, 0.015, -0.005, 0.01];
    const activeReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    const mean = activeReturns.reduce((a, b) => a + b, 0) / activeReturns.length;
    const variance = activeReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / activeReturns.length;
    const trackingError = Math.sqrt(variance);
    const ir = trackingError === 0 ? 0 : mean / trackingError;
    expect(typeof ir).toBe('number');
    expect(Number.isFinite(ir)).toBe(true);
  });

  it('tracking error should be non-negative', () => {
    const p = [0.01, 0.02, -0.01];
    const b = [0.008, 0.015, -0.005];
    const diff = p.map((r, i) => r - b[i]);
    const mean = diff.reduce((a, b) => a + b, 0) / diff.length;
    const te = Math.sqrt(diff.reduce((a, b) => a + (b - mean) ** 2, 0) / diff.length);
    expect(te).toBeGreaterThanOrEqual(0);
  });

  it('Calmar Ratio calculation', () => {
    const annualReturn = 0.15;
    const maxDrawdown = 0.1;
    const calmar = annualReturn / maxDrawdown;
    expect(calmar).toBeCloseTo(1.5, 10);
  });

  it('Omega Ratio calculation', () => {
    const returns = [0.03, -0.01, 0.02, -0.02, 0.04, 0.01, -0.01];
    const threshold = 0;
    const gains = returns.filter(r => r > threshold).reduce((a, b) => a + b, 0);
    const losses = Math.abs(returns.filter(r => r < threshold).reduce((a, b) => a + b, 0));
    const omega = losses === 0 ? Infinity : gains / losses;
    expect(omega).toBeGreaterThan(0);
  });
});

// 数据质量管理
describe('Data Quality Management', () => {
  const validateOHLC = (o: number, h: number, l: number, c: number): string[] => {
    const errors: string[] = [];
    if (h < l) errors.push('high < low');
    if (h < o) errors.push('high < open');
    if (h < c) errors.push('high < close');
    if (l > o) errors.push('low > open');
    if (l > c) errors.push('low > close');
    if (o < 0 || h < 0 || l < 0 || c < 0) errors.push('negative price');
    return errors;
  };

  const detectAnomalies = (prices: number[], threshold: number = 0.1): number[] => {
    const anomalies: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]);
      if (change > threshold) anomalies.push(i);
    }
    return anomalies;
  };

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

  it('valid OHLC should pass', () => {
    expect(validateOHLC(10, 12, 9, 11)).toEqual([]);
  });

  it('high < low should fail', () => {
    expect(validateOHLC(10, 8, 9, 11)).toContain('high < low');
  });

  it('high < close should fail', () => {
    expect(validateOHLC(10, 12, 9, 15)).toContain('high < close');
  });

  it('negative price should fail', () => {
    expect(validateOHLC(-1, 12, 9, 11)).toContain('negative price');
  });

  it('low > open should fail', () => {
    expect(validateOHLC(10, 12, 15, 11)).toContain('low > open');
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
    const row = { price: 100, volume: null, date: '2024-01-01' };
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
    const seen = new Set();
    const unique = data.filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
    expect(unique.length).toBe(3);
  });

  it('price limit detection (A股涨跌停)', () => {
    const prevClose = 10;
    const limitUp = prevClose * 1.1;
    const limitDown = prevClose * 0.9;
    expect(limitUp).toBe(11);
    expect(limitDown).toBe(9);

    const isAtLimitUp = (price: number) => Math.abs(price - limitUp) < 0.001;
    expect(isAtLimitUp(11)).toBe(true);
    expect(isAtLimitUp(10.5)).toBe(false);
  });
});
