import { describe, it, expect } from 'vitest';

// Data Enrichment Pipeline Tests
describe('Data Enrichment Pipeline', () => {
  const enrichStockData = (raw: {
    code: string; name: string; price: number; prevClose: number;
    high: number; low: number; volume: number; amount: number;
  }) => {
    const change = raw.price - raw.prevClose;
    const changePercent = raw.prevClose !== 0 ? (change / raw.prevClose) * 100 : 0;
    const amplitude = raw.prevClose !== 0 ? ((raw.high - raw.low) / raw.prevClose) * 100 : 0;
    const turnoverRate = raw.volume > 0 ? raw.amount / raw.volume : 0;
    const avgPrice = raw.volume > 0 ? raw.amount / raw.volume : raw.price;

    return {
      ...raw,
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      amplitude: parseFloat(amplitude.toFixed(2)),
      avgPrice: parseFloat(avgPrice.toFixed(2)),
      isUp: change > 0,
      isDown: change < 0,
      isLimitUp: changePercent >= 9.9,
      isLimitDown: changePercent <= -9.9,
      market: raw.code.startsWith('6') ? 'SH' : 'SZ',
    };
  };

  it('should calculate all derived fields', () => {
    const result = enrichStockData({
      code: '600519', name: '贵州茅台', price: 1800,
      prevClose: 1775, high: 1820, low: 1780,
      volume: 1e6, amount: 1.8e9,
    });
    expect(result.change).toBe(25);
    expect(result.changePercent).toBeCloseTo(1.41, 1);
    expect(result.amplitude).toBeCloseTo(2.25, 1);
    expect(result.isUp).toBe(true);
    expect(result.market).toBe('SH');
  });

  it('should detect limit up', () => {
    const result = enrichStockData({
      code: '000001', name: '平安银行', price: 11,
      prevClose: 10, high: 11, low: 11,
      volume: 1e6, amount: 11e6,
    });
    expect(result.isLimitUp).toBe(true);
  });

  it('should detect limit down', () => {
    const result = enrichStockData({
      code: '000002', name: '万科', price: 9,
      prevClose: 10, high: 10, low: 9,
      volume: 1e6, amount: 9e6,
    });
    expect(result.isLimitDown).toBe(true);
  });

  it('should detect market from code', () => {
    expect(enrichStockData({
      code: '600519', name: '', price: 100, prevClose: 100,
      high: 100, low: 100, volume: 1, amount: 100,
    }).market).toBe('SH');

    expect(enrichStockData({
      code: '000001', name: '', price: 100, prevClose: 100,
      high: 100, low: 100, volume: 1, amount: 100,
    }).market).toBe('SZ');
  });

  it('should handle zero prevClose gracefully', () => {
    const result = enrichStockData({
      code: '600000', name: '', price: 10, prevClose: 0,
      high: 10, low: 10, volume: 1, amount: 10,
    });
    expect(result.changePercent).toBe(0);
    expect(result.amplitude).toBe(0);
  });
});

// Batch Processing Tests
describe('Batch Processing', () => {
  const processBatch = <T, R>(items: T[], processor: (item: T) => R, batchSize: number): R[] => {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      results.push(...batch.map(processor));
    }
    return results;
  };

  const deduplicateByKey = <T>(items: T[], keyFn: (item: T) => string): T[] => {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const groupBy = <T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> => {
    return items.reduce((acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  };

  const sortByMultiple = <T>(items: T[], ...sorts: Array<{ key: (item: T) => any; order: 'asc' | 'desc' }>): T[] => {
    return [...items].sort((a, b) => {
      for (const { key, order } of sorts) {
        const va = key(a);
        const vb = key(b);
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
        if (cmp !== 0) return order === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  };

  it('should process in batches', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const result = processBatch(items, x => x * 2, 3);
    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it('should deduplicate by key', () => {
    const items = [
      { code: '600519', name: '茅台' },
      { code: '600519', name: '茅台酒' },
      { code: '000001', name: '平安' },
    ];
    const result = deduplicateByKey(items, i => i.code);
    expect(result).toHaveLength(2);
  });

  it('should group by key', () => {
    const items = [
      { market: 'SH', code: '600519' },
      { market: 'SZ', code: '000001' },
      { market: 'SH', code: '600000' },
    ];
    const groups = groupBy(items, i => i.market);
    expect(groups['SH']).toHaveLength(2);
    expect(groups['SZ']).toHaveLength(1);
  });

  it('should sort by multiple fields', () => {
    const items = [
      { industry: '银行', change: 1.5 },
      { industry: '银行', change: -0.5 },
      { industry: '科技', change: 2.0 },
    ];
    const sorted = sortByMultiple(items, 
      { key: i => i.industry, order: 'asc' },
      { key: i => i.change, order: 'desc' }
    );
    expect(sorted[0].industry).toBe('科技');
    expect(sorted[1].industry).toBe('银行');
    expect(sorted[1].change).toBe(1.5);
  });

  it('should handle empty array', () => {
    expect(processBatch([], x => x, 10)).toEqual([]);
    expect(deduplicateByKey([], () => '')).toEqual([]);
    expect(groupBy([], () => '')).toEqual({});
  });
});

// Sector Index Calculation Tests
describe('Sector Index Calculation', () => {
  const calculateSectorIndex = (stocks: Array<{ weight: number; changePercent: number }>) => {
    if (stocks.length === 0) return 0;
    const totalWeight = stocks.reduce((s, x) => s + x.weight, 0);
    if (totalWeight === 0) return 0;
    return stocks.reduce((s, x) => s + (x.weight / totalWeight) * x.changePercent, 0);
  };

  const calculateEqualWeight = (stocks: Array<{ changePercent: number }>) => {
    if (stocks.length === 0) return 0;
    return stocks.reduce((s, x) => s + x.changePercent, 0) / stocks.length;
  };

  const calculateMarketCapWeight = (stocks: Array<{ marketCap: number; changePercent: number }>) => {
    const totalCap = stocks.reduce((s, x) => s + x.marketCap, 0);
    if (totalCap === 0) return 0;
    return stocks.reduce((s, x) => s + (x.marketCap / totalCap) * x.changePercent, 0);
  };

  it('should calculate equal weight index', () => {
    const stocks = [
      { weight: 1, changePercent: 2 },
      { weight: 1, changePercent: -1 },
    ];
    expect(calculateSectorIndex(stocks)).toBe(0.5);
  });

  it('should calculate weighted index', () => {
    const stocks = [
      { weight: 3, changePercent: 2 },
      { weight: 1, changePercent: -2 },
    ];
    // (3/4)*2 + (1/4)*(-2) = 1.5 - 0.5 = 1.0
    expect(calculateSectorIndex(stocks)).toBe(1);
  });

  it('should handle empty sector', () => {
    expect(calculateSectorIndex([])).toBe(0);
    expect(calculateEqualWeight([])).toBe(0);
  });

  it('should calculate market cap weighted', () => {
    const stocks = [
      { marketCap: 2e12, changePercent: 1 },
      { marketCap: 1e12, changePercent: -2 },
    ];
    // (2/3)*1 + (1/3)*(-2) = 0.667 - 0.667 ≈ 0
    expect(calculateMarketCapWeight(stocks)).toBeCloseTo(0, 1);
  });

  it('should prefer larger weight stocks', () => {
    const stocks = [
      { weight: 10, changePercent: 5 },
      { weight: 1, changePercent: -100 },
    ];
    const index = calculateSectorIndex(stocks);
    // (10/11)*5 + (1/11)*(-100) = 4.545 - 9.09 = -4.545
    expect(index).toBeGreaterThan(-10);
    expect(index).toBeLessThan(0);
  });
});

// Data Quality Score Tests
describe('Data Quality Score', () => {
  interface QualityCheck {
    name: string;
    passed: boolean;
    weight: number;
    severity: 'info' | 'warning' | 'error' | 'critical';
  }

  const calculateQualityScore = (checks: QualityCheck[]): {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    passed: number;
    failed: number;
    details: Record<string, number>;
  } => {
    const severityWeights = { info: 1, warning: 2, error: 5, critical: 10 };
    let maxScore = 0;
    let earnedScore = 0;

    for (const check of checks) {
      const points = check.weight * severityWeights[check.severity];
      maxScore += points;
      if (check.passed) earnedScore += points;
    }

    const score = maxScore > 0 ? (earnedScore / maxScore) * 100 : 100;
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

    const details: Record<string, number> = { info: 0, warning: 0, error: 0, critical: 0 };
    for (const check of checks) {
      if (!check.passed) details[check.severity]++;
    }

    return {
      score: Math.round(score * 10) / 10,
      grade,
      passed: checks.filter(c => c.passed).length,
      failed: checks.filter(c => !c.passed).length,
      details,
    };
  };

  it('should give A for all passed', () => {
    const checks: QualityCheck[] = [
      { name: 'Price range', passed: true, weight: 1, severity: 'error' },
      { name: 'Volume valid', passed: true, weight: 1, severity: 'warning' },
    ];
    const result = calculateQualityScore(checks);
    expect(result.grade).toBe('A');
    expect(result.score).toBe(100);
  });

  it('should penalize critical failures heavily', () => {
    const checks: QualityCheck[] = [
      { name: 'Structure', passed: true, weight: 1, severity: 'info' },
      { name: 'OHLC logic', passed: false, weight: 1, severity: 'critical' },
    ];
    const result = calculateQualityScore(checks);
    expect(result.grade).not.toBe('A');
    expect(result.failed).toBe(1);
  });

  it('should handle all failed', () => {
    const checks: QualityCheck[] = [
      { name: 'Check1', passed: false, weight: 1, severity: 'info' },
      { name: 'Check2', passed: false, weight: 1, severity: 'info' },
    ];
    const result = calculateQualityScore(checks);
    expect(result.score).toBe(0);
    expect(result.grade).toBe('F');
  });

  it('should count by severity', () => {
    const checks: QualityCheck[] = [
      { name: 'A', passed: false, weight: 1, severity: 'error' },
      { name: 'B', passed: false, weight: 1, severity: 'warning' },
      { name: 'C', passed: false, weight: 1, severity: 'error' },
    ];
    const result = calculateQualityScore(checks);
    expect(result.details.error).toBe(2);
    expect(result.details.warning).toBe(1);
  });
});

// Price Alert Condition Evaluation Tests
describe('Price Alert Condition Evaluation', () => {
  type Condition = {
    field: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'crosses_above' | 'crosses_below';
    value: number;
  };

  const evaluateCondition = (condition: Condition, currentValue: number, prevValue: number): boolean => {
    switch (condition.operator) {
      case 'gt': return currentValue > condition.value;
      case 'lt': return currentValue < condition.value;
      case 'gte': return currentValue >= condition.value;
      case 'lte': return currentValue <= condition.value;
      case 'eq': return currentValue === condition.value;
      case 'crosses_above': return prevValue <= condition.value && currentValue > condition.value;
      case 'crosses_below': return prevValue >= condition.value && currentValue < condition.value;
    }
  };

  it('should evaluate gt correctly', () => {
    const cond: Condition = { field: 'price', operator: 'gt', value: 100 };
    expect(evaluateCondition(cond, 101, 99)).toBe(true);
    expect(evaluateCondition(cond, 100, 99)).toBe(false);
  });

  it('should evaluate lt correctly', () => {
    const cond: Condition = { field: 'price', operator: 'lt', value: 100 };
    expect(evaluateCondition(cond, 99, 101)).toBe(true);
    expect(evaluateCondition(cond, 100, 101)).toBe(false);
  });

  it('should evaluate gte correctly', () => {
    const cond: Condition = { field: 'price', operator: 'gte', value: 100 };
    expect(evaluateCondition(cond, 100, 99)).toBe(true);
    expect(evaluateCondition(cond, 99, 100)).toBe(false);
  });

  it('should detect crosses_above', () => {
    const cond: Condition = { field: 'price', operator: 'crosses_above', value: 100 };
    expect(evaluateCondition(cond, 101, 99)).toBe(true);
    expect(evaluateCondition(cond, 101, 101)).toBe(false); // already above
    expect(evaluateCondition(cond, 99, 99)).toBe(false); // didn't cross
  });

  it('should detect crosses_below', () => {
    const cond: Condition = { field: 'price', operator: 'crosses_below', value: 100 };
    expect(evaluateCondition(cond, 99, 101)).toBe(true);
    expect(evaluateCondition(cond, 99, 99)).toBe(false);
    expect(evaluateCondition(cond, 101, 101)).toBe(false);
  });

  it('should handle crosses at boundary', () => {
    const cond: Condition = { field: 'price', operator: 'crosses_above', value: 100 };
    expect(evaluateCondition(cond, 100.01, 100)).toBe(true);
    expect(evaluateCondition(cond, 100, 99.99)).toBe(false); // exactly at boundary = not crossed
  });
});
