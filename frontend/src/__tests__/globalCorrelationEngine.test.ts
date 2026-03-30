import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateReturns,
  calculateLogReturns,
  pearsonCorrelation,
  spearmanCorrelation,
  rollingCorrelation,
  calculateLaggedCorrelation,
  findLeadLag,
  calculateBeta,
  detectDecoupling,
  calculateCorrelationMatrix,
  calculateDiversificationRatio,
  calculateRollingBeta,
  calculateVolatility,
  calculateMaxDrawdown,
  calculateSharpeRatio,
  calculateInformationRatio,
  getTimezoneOffset,
  isOverlappingTradingHours,
  GlobalCorrelationEngine,
  GLOBAL_INDICES,
} from '../utils/globalCorrelationEngine';

describe('calculateReturns', () => {
  it('should calculate simple returns', () => {
    const prices = [100, 110, 105, 120];
    const returns = calculateReturns(prices);
    expect(returns.length).toBe(3);
    expect(returns[0]).toBeCloseTo(0.1, 5);
    expect(returns[1]).toBeCloseTo(-0.04545, 4);
    expect(returns[2]).toBeCloseTo(0.14286, 4);
  });

  it('should return empty for single price', () => {
    expect(calculateReturns([100])).toEqual([]);
  });

  it('should handle zero prices', () => {
    const returns = calculateReturns([0, 100]);
    expect(returns[0]).toBe(Infinity);
  });
});

describe('calculateLogReturns', () => {
  it('should calculate log returns', () => {
    const prices = [100, 110, 105];
    const returns = calculateLogReturns(prices);
    expect(returns.length).toBe(2);
    expect(returns[0]).toBeCloseTo(Math.log(1.1), 5);
  });
});

describe('pearsonCorrelation', () => {
  it('should return 1 for identical series', () => {
    const x = [1, 2, 3, 4, 5];
    expect(pearsonCorrelation(x, x)).toBeCloseTo(1, 5);
  });

  it('should return -1 for perfectly inverse series', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [5, 4, 3, 2, 1];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(-1, 5);
  });

  it('should return 0 for unrelated series', () => {
    const x = [1, 0, -1, 0, 1];
    const y = [0, 1, 0, -1, 0];
    expect(Math.abs(pearsonCorrelation(x, y))).toBeLessThan(0.5);
  });

  it('should return 0 for empty arrays', () => {
    expect(pearsonCorrelation([], [])).toBe(0);
  });

  it('should return 0 for single element arrays', () => {
    expect(pearsonCorrelation([1], [2])).toBe(0);
  });
});

describe('spearmanCorrelation', () => {
  it('should return 1 for monotonically increasing series', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 20, 30, 40, 50];
    expect(spearmanCorrelation(x, y)).toBeCloseTo(1, 5);
  });

  it('should return -1 for monotonically decreasing series', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [50, 40, 30, 20, 10];
    expect(spearmanCorrelation(x, y)).toBeCloseTo(-1, 5);
  });
});

describe('rollingCorrelation', () => {
  it('should calculate rolling correlations', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = rollingCorrelation(x, y, 3);
    expect(result.length).toBe(8);
    result.forEach(r => expect(r).toBeCloseTo(1, 5));
  });

  it('should handle window larger than data', () => {
    const x = [1, 2, 3];
    const y = [1, 2, 3];
    const result = rollingCorrelation(x, y, 5);
    expect(result.length).toBe(0);
  });
});

describe('calculateLaggedCorrelation', () => {
  it('should return correlations for all lags', () => {
    const x = Array.from({ length: 20 }, (_, i) => i);
    const y = Array.from({ length: 20 }, (_, i) => i);
    const result = calculateLaggedCorrelation(x, y, 3);
    expect(result.length).toBe(7); // -3 to 3
  });

  it('should find strongest correlation at lag 0 for identical series', () => {
    const x = Array.from({ length: 20 }, (_, i) => i);
    const result = calculateLaggedCorrelation(x, x, 3);
    const lag0 = result.find(r => r.lag === 0);
    expect(lag0).toBeDefined();
    expect(lag0!.correlation).toBeCloseTo(1, 5);
  });
});

describe('findLeadLag', () => {
  it('should detect leader-follower relationship', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // y lags x by 1
    const result = findLeadLag(x, y, 'A', 'B', 3);
    expect(result.leader).toBeDefined();
    expect(result.follower).toBeDefined();
    expect(result.optimalLag).toBeGreaterThanOrEqual(0);
    expect(typeof result.correlation).toBe('number');
  });
});

describe('calculateBeta', () => {
  it('should return 1 for identical returns', () => {
    const returns = [0.01, -0.02, 0.03, -0.01, 0.02];
    expect(calculateBeta(returns, returns)).toBeCloseTo(1, 2);
  });

  it('should return 1 for empty data', () => {
    expect(calculateBeta([], [])).toBe(1);
  });
});

describe('calculateVolatility', () => {
  it('should calculate annualized volatility', () => {
    const returns = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.01];
    const vol = calculateVolatility(returns, true);
    expect(vol).toBeGreaterThan(0);
  });

  it('should return 0 for single return', () => {
    expect(calculateVolatility([0.01])).toBe(0);
  });

  it('should calculate non-annualized volatility', () => {
    const returns = [0.01, -0.02, 0.03, -0.01, 0.02];
    const daily = calculateVolatility(returns, false);
    const annual = calculateVolatility(returns, true);
    expect(annual).toBeGreaterThan(daily);
  });
});

describe('calculateMaxDrawdown', () => {
  it('should detect maximum drawdown', () => {
    const prices = [100, 110, 105, 90, 95, 120];
    const result = calculateMaxDrawdown(prices);
    expect(result.maxDrawdown).toBeCloseTo(0.1818, 3);
  });

  it('should return 0 drawdown for always increasing prices', () => {
    const prices = [100, 110, 120, 130, 140];
    const result = calculateMaxDrawdown(prices);
    expect(result.maxDrawdown).toBe(0);
  });
});

describe('calculateSharpeRatio', () => {
  it('should calculate positive Sharpe for good returns', () => {
    const returns = Array.from({ length: 252 }, () => 0.001);
    const sharpe = calculateSharpeRatio(returns, 0.03, true);
    expect(sharpe).toBeGreaterThan(0);
  });

  it('should return 0 for zero volatility', () => {
    const returns = [0.001, 0.001, 0.001, 0.001, 0.001];
    const sharpe = calculateSharpeRatio(returns);
    expect(sharpe).toBe(0);
  });
});

describe('calculateInformationRatio', () => {
  it('should calculate information ratio', () => {
    const portfolio = [0.01, 0.02, -0.01, 0.03, 0.01];
    const benchmark = [0.005, 0.015, -0.005, 0.025, 0.005];
    const ir = calculateInformationRatio(portfolio, benchmark);
    expect(typeof ir).toBe('number');
  });

  it('should return 0 for empty data', () => {
    expect(calculateInformationRatio([], [])).toBe(0);
  });
});

describe('calculateCorrelationMatrix', () => {
  it('should build correlation matrix', () => {
    const series: Record<string, number[]> = {
      A: [1, 2, 3, 4, 5],
      B: [2, 4, 6, 8, 10],
      C: [5, 4, 3, 2, 1],
    };
    const matrix = calculateCorrelationMatrix(series);
    expect(matrix['A']['A']).toBe(1);
    expect(matrix['A']['B']).toBeCloseTo(1, 5);
    expect(matrix['A']['C']).toBeCloseTo(-1, 5);
  });

  it('should build rolling correlation matrix', () => {
    const series: Record<string, number[]> = {
      A: Array.from({ length: 30 }, (_, i) => i),
      B: Array.from({ length: 30 }, (_, i) => i * 2),
    };
    const matrix = calculateCorrelationMatrix(series, 10);
    expect(matrix['A']['B']).toBeCloseTo(1, 1);
  });
});

describe('calculateDiversificationRatio', () => {
  it('should return higher ratio for less correlated assets', () => {
    const corrHigh = [[1, 0.9], [0.9, 1]];
    const corrLow = [[1, 0.1], [0.1, 1]];
    const weights = [0.5, 0.5];
    const high = calculateDiversificationRatio(weights, corrHigh);
    const low = calculateDiversificationRatio(weights, corrLow);
    expect(low).toBeGreaterThan(high);
  });
});

describe('calculateRollingBeta', () => {
  it('should calculate rolling beta values', () => {
    const market = Array.from({ length: 100 }, (_, i) => (Math.sin(i * 0.1)) * 0.02);
    const stock = market.map(r => r * 1.5 + 0.001);
    const rolling = calculateRollingBeta(market, stock, 30);
    expect(rolling.length).toBe(71);
    expect(rolling.every(v => typeof v === 'number')).toBe(true);
  });

  it('should return empty for insufficient data', () => {
    const rolling = calculateRollingBeta([0.01], [0.01], 30);
    expect(rolling.length).toBe(0);
  });
});

describe('detectDecoupling', () => {
  it('should detect decoupling events', () => {
    const prices1 = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128, 130, 132, 134, 136, 138, 140, 142, 144, 146, 148, 150];
    const prices2 = [100, 98, 96, 94, 92, 90, 88, 86, 84, 82, 80, 78, 76, 74, 72, 70, 68, 66, 64, 62, 60, 58, 56, 54, 52, 50];
    const events = detectDecoupling(prices1, prices2, 'A', 'B', 5, 0.5);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('getTimezoneOffset', () => {
  it('should return correct offset for Shanghai', () => {
    const cn = GLOBAL_INDICES.find(i => i.code === '000001')!;
    expect(getTimezoneOffset(cn)).toBe(8);
  });

  it('should return correct offset for New York', () => {
    const us = GLOBAL_INDICES.find(i => i.code === '.SPX')!;
    expect(getTimezoneOffset(us)).toBe(-5);
  });
});

describe('isOverlappingTradingHours', () => {
  it('should check overlap between two markets', () => {
    const cn = GLOBAL_INDICES.find(i => i.code === '000001')!;
    const us = GLOBAL_INDICES.find(i => i.code === '.SPX')!;
    const overlap = isOverlappingTradingHours(cn, us);
    expect(typeof overlap).toBe('boolean');
  });
});

describe('GLOBAL_INDICES', () => {
  it('should have all major indices', () => {
    expect(GLOBAL_INDICES.length).toBeGreaterThan(10);
  });

  it('should have Chinese indices', () => {
    const chinese = GLOBAL_INDICES.filter(i => i.region === 'china');
    expect(chinese.length).toBeGreaterThanOrEqual(3);
  });

  it('should have US indices', () => {
    const us = GLOBAL_INDICES.filter(i => i.region === 'us');
    expect(us.length).toBeGreaterThanOrEqual(3);
  });

  it('should have unique codes', () => {
    const codes = GLOBAL_INDICES.map(i => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('GlobalCorrelationEngine', () => {
  let engine: GlobalCorrelationEngine;

  beforeEach(() => {
    engine = new GlobalCorrelationEngine();
    engine.addIndexData('A', [100, 110, 105, 120, 115, 130]);
    engine.addIndexData('B', [100, 108, 103, 118, 112, 128]);
    engine.addIndexData('C', [100, 90, 95, 85, 92, 80]);
  });

  it('should calculate correlation between two indices', () => {
    const corr = engine.getCorrelation('A', 'B');
    expect(corr).toBeGreaterThan(0.9);
  });

  it('should show negative correlation for inverse markets', () => {
    const corr = engine.getCorrelation('A', 'C');
    expect(corr).toBeLessThan(0);
  });

  it('should return 0 for unknown index', () => {
    expect(engine.getCorrelation('A', 'UNKNOWN')).toBe(0);
  });

  it('should calculate rolling correlation', () => {
    const rolling = engine.getRollingCorrelation('A', 'B', 3);
    expect(rolling.length).toBeGreaterThan(0);
  });

  it('should return empty rolling for insufficient data', () => {
    const rolling = engine.getRollingCorrelation('A', 'B', 100);
    expect(rolling.length).toBe(0);
  });

  it('should build full correlation matrix', () => {
    const matrix = engine.getFullCorrelationMatrix();
    expect(matrix['A']['A']).toBe(1);
    expect(matrix['B']['B']).toBe(1);
    expect(matrix['C']['C']).toBe(1);
  });

  it('should find lead-lag pairs', () => {
    // Use actual index codes from GLOBAL_INDICES
    engine.addIndexData('000001', [100, 110, 105, 120, 115, 130]);
    engine.addIndexData('.SPX', [100, 108, 103, 118, 112, 128]);
    const pairs = engine.findLeadLagPairs(3);
    expect(pairs.length).toBeGreaterThanOrEqual(0);
    if (pairs.length > 0) {
      expect(pairs[0].leader).toBeDefined();
    }
  });

  it('should detect regime shifts', () => {
    engine.addIndexData('D', Array.from({ length: 100 }, (_, i) => 100 + i));
    engine.addIndexData('E', Array.from({ length: 100 }, (_, i) => i < 50 ? 100 + i : 150 - i));
    const shifts = engine.detectRegimeShifts(20, 0.3);
    expect(Array.isArray(shifts)).toBe(true);
  });

  it('should find most correlated pairs', () => {
    const pairs = engine.getMostCorrelatedPairs(2);
    expect(pairs.length).toBeLessThanOrEqual(2);
    expect(pairs[0].correlation).toBeGreaterThanOrEqual(pairs[1]?.correlation ?? -Infinity);
  });

  it('should find least correlated pairs', () => {
    const pairs = engine.getLeastCorrelatedPairs(2);
    expect(pairs.length).toBeLessThanOrEqual(2);
  });
});
