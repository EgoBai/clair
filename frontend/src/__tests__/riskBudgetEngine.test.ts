import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateCovarianceMatrix,
  calculateCorrelationFromCovariance,
  calculatePortfolioVariance,
  calculatePortfolioReturn,
  calculateRiskContributions,
  riskParityAllocation,
  riskBudgetAllocation,
  meanVarianceOptimize,
  generateEfficientFrontier,
  maxSharpePortfolio,
  minVariancePortfolio,
  runStressTest,
  calculateTrackingError,
  calculateFactorExposures,
  PortfolioConstructor,
  type Asset,
  type RiskBudget,
  type StressTestScenario,
} from '../utils/riskBudgetEngine';

const mockReturns: Record<string, number[]> = {
  A: [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.01, 0.02, 0.03, 0.01],
  B: [0.005, -0.01, 0.015, -0.005, 0.01, 0.005, -0.005, 0.01, 0.015, 0.005],
  C: [-0.01, 0.02, -0.015, 0.01, -0.005, -0.01, 0.015, -0.01, -0.02, -0.005],
};

describe('calculateCovarianceMatrix', () => {
  it('should calculate covariance matrix', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    expect(cov['A']['A']).toBeGreaterThan(0);
    expect(cov['B']['B']).toBeGreaterThan(0);
    expect(cov['C']['C']).toBeGreaterThan(0);
    expect(cov['A']['B']).toBeCloseTo(cov['B']['A'], 10);
  });

  it('should have diagonal as variance', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    expect(cov['A']['A']).toBeGreaterThan(0);
  });
});

describe('calculateCorrelationFromCovariance', () => {
  it('should have 1 on diagonal', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const corr = calculateCorrelationFromCovariance(cov);
    expect(corr['A']['A']).toBeCloseTo(1, 5);
    expect(corr['B']['B']).toBeCloseTo(1, 5);
  });

  it('should be symmetric', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const corr = calculateCorrelationFromCovariance(cov);
    expect(corr['A']['B']).toBeCloseTo(corr['B']['A'], 10);
  });

  it('should be bounded by [-1, 1]', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const corr = calculateCorrelationFromCovariance(cov);
    for (const c1 of Object.keys(corr)) {
      for (const c2 of Object.keys(corr[c1])) {
        expect(corr[c1][c2]).toBeGreaterThanOrEqual(-1.001);
        expect(corr[c1][c2]).toBeLessThanOrEqual(1.001);
      }
    }
  });
});

describe('calculatePortfolioVariance', () => {
  it('should return positive variance', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const weights = { A: 0.4, B: 0.3, C: 0.3 };
    const variance = calculatePortfolioVariance(weights, cov);
    expect(variance).toBeGreaterThan(0);
  });

  it('should be zero for zero weights', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const weights = { A: 0, B: 0, C: 0 };
    expect(calculatePortfolioVariance(weights, cov)).toBe(0);
  });
});

describe('calculatePortfolioReturn', () => {
  it('should calculate weighted return', () => {
    const weights = { A: 0.5, B: 0.5 };
    const expectedReturns = { A: 0.1, B: 0.05 };
    expect(calculatePortfolioReturn(weights, expectedReturns)).toBeCloseTo(0.075, 5);
  });

  it('should return 0 for zero weights', () => {
    expect(calculatePortfolioReturn({}, { A: 0.1 })).toBe(0);
  });
});

describe('calculateRiskContributions', () => {
  it('should sum to approximately 1', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const weights = { A: 0.4, B: 0.3, C: 0.3 };
    const rc = calculateRiskContributions(weights, cov);
    const sum = Object.values(rc).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it('should return zeros for zero variance', () => {
    const cov = { A: { A: 0 } };
    const rc = calculateRiskContributions({ A: 1 }, cov);
    expect(rc['A']).toBe(0);
  });
});

describe('riskParityAllocation', () => {
  it('should allocate equal risk contributions', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const weights = riskParityAllocation(cov);
    expect(Object.keys(weights).length).toBe(3);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it('should return empty for empty covariance', () => {
    expect(riskParityAllocation({})).toEqual({});
  });
});

describe('riskBudgetAllocation', () => {
  it('should respect budget constraints', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const budgets: RiskBudget[] = [
      { code: 'A', targetRisk: 0.5, minWeight: 0.1, maxWeight: 0.8 },
      { code: 'B', targetRisk: 0.3, minWeight: 0.1, maxWeight: 0.8 },
      { code: 'C', targetRisk: 0.2, minWeight: 0.1, maxWeight: 0.8 },
    ];
    const weights = riskBudgetAllocation(budgets, cov);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 2);
  });

  it('should return empty for empty budgets', () => {
    expect(riskBudgetAllocation([], {})).toEqual({});
  });
});

describe('meanVarianceOptimize', () => {
  it('should optimize portfolio', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const expectedReturns = { A: 0.1, B: 0.05, C: 0.02 };
    const result = meanVarianceOptimize(expectedReturns, cov, 0.05);
    expect(result.expectedReturn).toBeCloseTo(0.05, 1);
    expect(result.expectedVolatility).toBeGreaterThan(0);
  });
});

describe('generateEfficientFrontier', () => {
  it('should generate frontier points', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const expectedReturns = { A: 0.1, B: 0.05, C: 0.02 };
    const frontier = generateEfficientFrontier(expectedReturns, cov, 10);
    expect(frontier.length).toBe(10);
    // Higher return should generally have higher volatility
    expect(frontier[frontier.length - 1].targetReturn).toBeGreaterThan(frontier[0].targetReturn);
  });
});

describe('maxSharpePortfolio', () => {
  it('should find maximum Sharpe ratio', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const expectedReturns = { A: 0.1, B: 0.05, C: 0.02 };
    const result = maxSharpePortfolio(expectedReturns, cov);
    expect(result.sharpeRatio).toBeGreaterThan(0);
  });
});

describe('minVariancePortfolio', () => {
  it('should find minimum variance', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const result = minVariancePortfolio(cov);
    expect(result.expectedVolatility).toBeGreaterThan(0);
  });
});

describe('runStressTest', () => {
  it('should run stress scenarios', () => {
    const weights = { A: 0.5, B: 0.3, C: 0.2 };
    const scenarios: StressTestScenario[] = [
      { name: 'Market Crash', shocks: { A: -0.3, B: -0.2, C: 0.1 } },
      { name: 'Rally', shocks: { A: 0.2, B: 0.15, C: -0.05 } },
    ];
    const results = runStressTest(weights, scenarios);
    expect(results.length).toBe(2);
    expect(results[0].scenario).toBe('Market Crash');
    expect(results[0].portfolioReturn).toBeLessThan(0);
    expect(results[1].scenario).toBe('Rally');
    expect(results[1].portfolioReturn).toBeGreaterThan(0);
  });
});

describe('calculateTrackingError', () => {
  it('should calculate tracking error', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const portWeights = { A: 0.5, B: 0.3, C: 0.2 };
    const benchWeights = { A: 0.33, B: 0.33, C: 0.34 };
    const te = calculateTrackingError(portWeights, benchWeights, cov);
    expect(te).toBeGreaterThan(0);
  });

  it('should be zero for identical weights', () => {
    const cov = calculateCovarianceMatrix(mockReturns);
    const weights = { A: 0.5, B: 0.3, C: 0.2 };
    expect(calculateTrackingError(weights, weights, cov)).toBeCloseTo(0, 5);
  });
});

describe('calculateFactorExposures', () => {
  it('should calculate factor exposures', () => {
    const weights = { A: 0.5, B: 0.3, C: 0.2 };
    const factorLoadings = {
      A: { market: 1.2, size: -0.5, value: 0.3 },
      B: { market: 0.8, size: 0.2, value: 0.7 },
      C: { market: 0.5, size: 0.8, value: -0.1 },
    };
    const exposures = calculateFactorExposures(weights, factorLoadings);
    expect(exposures['market']).toBeCloseTo(0.5 * 1.2 + 0.3 * 0.8 + 0.2 * 0.5, 5);
    expect(exposures['size']).toBeDefined();
    expect(exposures['value']).toBeDefined();
  });
});

describe('PortfolioConstructor', () => {
  let constructor: PortfolioConstructor;

  beforeEach(() => {
    constructor = new PortfolioConstructor();
    constructor.addAssets([
      { code: 'A', name: 'Asset A', expectedReturn: 0.1, volatility: 0.2 },
      { code: 'B', name: 'Asset B', expectedReturn: 0.05, volatility: 0.1 },
      { code: 'C', name: 'Asset C', expectedReturn: 0.02, volatility: 0.15 },
    ]);
    constructor.buildFromReturns(mockReturns);
  });

  it('should construct risk parity portfolio', () => {
    const result = constructor.riskParity();
    expect(Object.keys(result.weights).length).toBe(3);
    expect(result.expectedVolatility).toBeGreaterThan(0);
  });

  it('should construct risk budget portfolio', () => {
    const budgets: RiskBudget[] = [
      { code: 'A', targetRisk: 0.5, minWeight: 0.1, maxWeight: 0.8 },
      { code: 'B', targetRisk: 0.3, minWeight: 0.1, maxWeight: 0.8 },
      { code: 'C', targetRisk: 0.2, minWeight: 0.1, maxWeight: 0.8 },
    ];
    const result = constructor.riskBudget(budgets);
    expect(Object.keys(result.weights).length).toBe(3);
  });

  it('should construct mean-variance portfolio', () => {
    const result = constructor.meanVariance(0.05);
    expect(result.expectedReturn).toBeCloseTo(0.05, 1);
  });

  it('should generate efficient frontier', () => {
    const frontier = constructor.efficientFrontier(5);
    expect(frontier.length).toBe(5);
  });
});
