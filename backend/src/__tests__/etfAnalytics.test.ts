import { describe, it, expect } from 'vitest';

// ETF Analytics Engine Tests
describe('ETF Analytics Engine', () => {
  // ETF Data Model
  describe('ETF Data Model', () => {
    const mockETF = {
      symbol: '510300',
      name: '沪深300ETF',
      type: 'index',
      nav: 4.523,
      premiumRate: 0.12,
      aum: 52000000000,
      trackingError: 0.03,
      dividendYield: 2.1,
      managementFee: 0.5,
      topHoldings: [
        { symbol: '600519', name: '贵州茅台', weight: 4.8 },
        { symbol: '000858', name: '五粮液', weight: 2.3 },
      ],
    };

    it('should have required fields', () => {
      expect(mockETF).toHaveProperty('symbol');
      expect(mockETF).toHaveProperty('name');
      expect(mockETF).toHaveProperty('nav');
      expect(mockETF).toHaveProperty('type');
      expect(mockETF).toHaveProperty('aum');
    });

    it('should have positive NAV', () => {
      expect(mockETF.nav).toBeGreaterThan(0);
    });

    it('should have valid tracking error', () => {
      expect(mockETF.trackingError).toBeGreaterThanOrEqual(0);
      expect(mockETF.trackingError).toBeLessThan(5);
    });

    it('should have valid ETF types', () => {
      const validTypes = ['index', 'sector', 'qdii', 'commodity', 'bond', 'money_market'];
      expect(validTypes).toContain(mockETF.type);
    });

    it('should have top holdings with total weight <= 100', () => {
      const totalWeight = mockETF.topHoldings.reduce((sum, h) => sum + h.weight, 0);
      expect(totalWeight).toBeLessThanOrEqual(100);
    });
  });

  // Premium/Discount Analysis
  describe('Premium/Discount Analysis', () => {
    const calculatePremiumRate = (marketPrice: number, nav: number) => {
      if (nav === 0) return 0;
      return ((marketPrice - nav) / nav) * 100;
    };

    it('should calculate premium correctly', () => {
      expect(calculatePremiumRate(4.6, 4.5)).toBeCloseTo(2.222, 1);
    });

    it('should calculate discount correctly', () => {
      expect(calculatePremiumRate(4.4, 4.5)).toBeCloseTo(-2.222, 1);
    });

    it('should return 0 at par', () => {
      expect(calculatePremiumRate(4.5, 4.5)).toBe(0);
    });

    it('should handle zero NAV', () => {
      expect(calculatePremiumRate(4.5, 0)).toBe(0);
    });

    it('should classify premium zones', () => {
      const classifyPremium = (rate: number) => {
        if (rate > 2) return 'high_premium';
        if (rate > 0.5) return 'moderate_premium';
        if (rate > -0.5) return 'neutral';
        if (rate > -2) return 'moderate_discount';
        return 'high_discount';
      };
      expect(classifyPremium(3)).toBe('high_premium');
      expect(classifyPremium(1)).toBe('moderate_premium');
      expect(classifyPremium(0)).toBe('neutral');
      expect(classifyPremium(-1)).toBe('moderate_discount');
      expect(classifyPremium(-3)).toBe('high_discount');
    });
  });

  // ETF Performance Metrics
  describe('Performance Metrics', () => {
    const calculateTrackingError = (etfReturns: number[], indexReturns: number[]) => {
      if (etfReturns.length !== indexReturns.length || etfReturns.length < 2) return 0;
      const diffs = etfReturns.map((r, i) => r - indexReturns[i]);
      const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const variance = diffs.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / (diffs.length - 1);
      return Math.sqrt(variance);
    };

    it('should return 0 for identical returns', () => {
      const returns = [0.01, 0.02, -0.01, 0.03];
      expect(calculateTrackingError(returns, returns)).toBe(0);
    });

    it('should return positive for different returns', () => {
      const etf = [0.011, 0.019, -0.008, 0.032];
      const idx = [0.01, 0.02, -0.01, 0.03];
      expect(calculateTrackingError(etf, idx)).toBeGreaterThan(0);
    });

    it('should handle mismatched lengths', () => {
      expect(calculateTrackingError([0.01], [0.01, 0.02])).toBe(0);
    });

    it('should handle single element arrays', () => {
      expect(calculateTrackingError([0.01], [0.01])).toBe(0);
    });

    const calculateBeta = (etfReturns: number[], marketReturns: number[]) => {
      if (etfReturns.length < 2) return 1;
      const n = etfReturns.length;
      const meanEtf = etfReturns.reduce((a, b) => a + b, 0) / n;
      const meanMkt = marketReturns.reduce((a, b) => a + b, 0) / n;
      let cov = 0, varMkt = 0;
      for (let i = 0; i < n; i++) {
        cov += (etfReturns[i] - meanEtf) * (marketReturns[i] - meanMkt);
        varMkt += Math.pow(marketReturns[i] - meanMkt, 2);
      }
      return varMkt === 0 ? 1 : cov / varMkt;
    };

    it('should calculate beta = 1 for identical returns', () => {
      const r = [0.01, 0.02, -0.01, 0.03, -0.02];
      expect(calculateBeta(r, r)).toBeCloseTo(1, 5);
    });

    it('should calculate beta > 1 for leveraged ETF', () => {
      const mkt = [0.01, 0.02, -0.01, 0.03];
      const etf = mkt.map(r => r * 2);
      expect(calculateBeta(etf, mkt)).toBeCloseTo(2, 5);
    });
  });

  // NAV History Analysis
  describe('NAV History', () => {
    interface NAVRecord {
      date: string;
      nav: number;
      accumulatedNav: number;
      dividend: number;
    }

    const mockNAVHistory: NAVRecord[] = [
      { date: '2026-03-01', nav: 4.50, accumulatedNav: 4.50, dividend: 0 },
      { date: '2026-03-02', nav: 4.52, accumulatedNav: 4.52, dividend: 0 },
      { date: '2026-03-03', nav: 4.48, accumulatedNav: 4.48, dividend: 0 },
      { date: '2026-03-04', nav: 4.55, accumulatedNav: 4.65, dividend: 0.10 },
      { date: '2026-03-05', nav: 4.58, accumulatedNav: 4.68, dividend: 0 },
    ];

    it('should calculate total return with dividends', () => {
      const first = mockNAVHistory[0];
      const last = mockNAVHistory[mockNAVHistory.length - 1];
      const totalReturn = ((last.accumulatedNav - first.accumulatedNav) / first.nav) * 100;
      expect(totalReturn).toBeCloseTo(4.0, 1);
    });

    it('should detect dividend events', () => {
      const dividends = mockNAVHistory.filter(r => r.dividend > 0);
      expect(dividends).toHaveLength(1);
      expect(dividends[0].date).toBe('2026-03-04');
    });

    it('should maintain chronological order', () => {
      for (let i = 1; i < mockNAVHistory.length; i++) {
        expect(mockNAVHistory[i].date > mockNAVHistory[i - 1].date).toBe(true);
      }
    });

    it('should have NAV > 0', () => {
      mockNAVHistory.forEach(r => {
        expect(r.nav).toBeGreaterThan(0);
        expect(r.accumulatedNav).toBeGreaterThan(0);
      });
    });

    it('should calculate daily returns', () => {
      const dailyReturns = [];
      for (let i = 1; i < mockNAVHistory.length; i++) {
        const ret = (mockNAVHistory[i].nav - mockNAVHistory[i - 1].nav) / mockNAVHistory[i - 1].nav;
        dailyReturns.push(ret);
      }
      expect(dailyReturns).toHaveLength(4);
      expect(dailyReturns[0]).toBeCloseTo(0.00444, 3);
    });
  });

  // ETF Screening
  describe('ETF Screening', () => {
    const etfs = [
      { symbol: '510300', type: 'index', aum: 52e9, trackingError: 0.03, premiumRate: 0.1 },
      { symbol: '159915', type: 'index', aum: 30e9, trackingError: 0.05, premiumRate: -0.2 },
      { symbol: '512880', type: 'sector', aum: 15e9, trackingError: 0.08, premiumRate: 0.5 },
      { symbol: '513100', type: 'qdii', aum: 8e9, trackingError: 0.12, premiumRate: 2.5 },
      { symbol: '159928', type: 'sector', aum: 25e9, trackingError: 0.04, premiumRate: -0.1 },
    ];

    it('should filter by type', () => {
      const indexETFs = etfs.filter(e => e.type === 'index');
      expect(indexETFs).toHaveLength(2);
    });

    it('should sort by AUM descending', () => {
      const sorted = [...etfs].sort((a, b) => b.aum - a.aum);
      expect(sorted[0].symbol).toBe('510300');
      expect(sorted[4].symbol).toBe('513100');
    });

    it('should filter by low tracking error', () => {
      const precise = etfs.filter(e => e.trackingError < 0.06);
      expect(precise).toHaveLength(3);
    });

    it('should filter by premium rate range', () => {
      const reasonable = etfs.filter(e => Math.abs(e.premiumRate) < 1);
      expect(reasonable).toHaveLength(4);
    });

    it('should rank by comprehensive score', () => {
      const scored = etfs.map(e => ({
        ...e,
        score: (1 - e.trackingError) * 40 + (1 / (1 + Math.abs(e.premiumRate))) * 30 + Math.min(e.aum / 50e9, 1) * 30,
      }));
      const sorted = scored.sort((a, b) => b.score - a.score);
      expect(sorted[0].symbol).toBe('510300');
    });
  });

  // ETF Creation/Redemption
  describe('Creation/Redemption Mechanics', () => {
    const calculateCreationUnit = (nav: number, minUnits: number = 1000000) => {
      return nav * minUnits;
    };

    it('should calculate creation unit cost', () => {
      expect(calculateCreationUnit(4.5)).toBe(4500000);
    });

    it('should handle different minimum units', () => {
      expect(calculateCreationUnit(4.5, 500000)).toBe(2250000);
    });

    const calculateArbitrageProfit = (marketPrice: number, nav: number, units: number, cost: number) => {
      const grossProfit = (marketPrice - nav) * units;
      return grossProfit - cost;
    };

    it('should calculate arbitrage profit for premium', () => {
      const profit = calculateArbitrageProfit(4.6, 4.5, 1000000, 5000);
      expect(profit).toBeCloseTo(95000, 0);
    });

    it('should calculate loss for discount', () => {
      const profit = calculateArbitrageProfit(4.4, 4.5, 1000000, 5000);
      expect(profit).toBeCloseTo(-105000, 0);
    });
  });
});

// Market Regime Detection Tests
describe('Market Regime Detection', () => {
  type Regime = 'bull' | 'bear' | 'sideways' | 'volatile';

  const detectRegime = (returns: number[], lookback: number = 20): Regime => {
    if (returns.length < lookback) return 'sideways';
    const recent = returns.slice(-lookback);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const std = Math.sqrt(recent.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / recent.length);
    const annualizedReturn = mean * 252;
    const annualizedVol = std * Math.sqrt(252);

    if (annualizedVol > 0.3) return 'volatile';
    if (annualizedReturn > 0.1) return 'bull';
    if (annualizedReturn < -0.1) return 'bear';
    return 'sideways';
  };

  it('should detect bull market', () => {
    const bullReturns = Array(30).fill(0.002);
    expect(detectRegime(bullReturns)).toBe('bull');
  });

  it('should detect bear market', () => {
    const bearReturns = Array(30).fill(-0.002);
    expect(detectRegime(bearReturns)).toBe('bear');
  });

  it('should detect sideways market', () => {
    const sideReturns = Array(30).fill(0.0001);
    expect(detectRegime(sideReturns)).toBe('sideways');
  });

  it('should detect volatile market', () => {
    const volatileReturns = Array(30).fill(0).map((_, i) => (i % 2 === 0 ? 0.03 : -0.03));
    expect(detectRegime(volatileReturns)).toBe('volatile');
  });

  it('should return sideways for insufficient data', () => {
    expect(detectRegime([0.01, 0.02])).toBe('sideways');
  });

  // Trend strength
  const calculateTrendStrength = (prices: number[]) => {
    if (prices.length < 2) return 0;
    let upDays = 0, downDays = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) upDays++;
      else if (prices[i] < prices[i - 1]) downDays++;
    }
    return (upDays - downDays) / (prices.length - 1);
  };

  it('should return 1 for all up days', () => {
    const prices = [1, 2, 3, 4, 5];
    expect(calculateTrendStrength(prices)).toBe(1);
  });

  it('should return -1 for all down days', () => {
    const prices = [5, 4, 3, 2, 1];
    expect(calculateTrendStrength(prices)).toBe(-1);
  });

  it('should return 0 for flat', () => {
    expect(calculateTrendStrength([1, 1, 1, 1])).toBe(0);
  });

  it('should handle single element', () => {
    expect(calculateTrendStrength([1])).toBe(0);
  });
});

// ETF Sector Rotation
describe('ETF Sector Rotation', () => {
  const sectorETFs = [
    { symbol: '512880', sector: '证券', momentum: 0.8, volume: 1.5 },
    { symbol: '515030', sector: '新能源', momentum: 0.3, volume: 1.2 },
    { symbol: '512010', sector: '医药', momentum: -0.2, volume: 0.8 },
    { symbol: '512480', sector: '半导体', momentum: 0.6, volume: 2.0 },
    { symbol: '512660', sector: '军工', momentum: -0.5, volume: 0.6 },
  ];

  it('should rank sectors by momentum', () => {
    const ranked = [...sectorETFs].sort((a, b) => b.momentum - a.momentum);
    expect(ranked[0].sector).toBe('证券');
    expect(ranked[4].sector).toBe('军工');
  });

  it('should identify hot sectors', () => {
    const hot = sectorETFs.filter(s => s.momentum > 0.5 && s.volume > 1);
    expect(hot).toHaveLength(2);
  });

  it('should calculate composite score', () => {
    const scored = sectorETFs.map(s => ({
      ...s,
      composite: s.momentum * 0.6 + (s.volume / 2) * 0.4,
    }));
    const best = scored.reduce((a, b) => (a.composite > b.composite ? a : b));
    expect(best.sector).toBe('证券');
  });

  it('should detect rotation signals', () => {
    const entering = sectorETFs.filter(s => s.momentum > 0.3 && s.volume > 1.3);
    const exiting = sectorETFs.filter(s => s.momentum < -0.3);
    expect(entering.length).toBeGreaterThan(0);
    expect(exiting.length).toBeGreaterThan(0);
  });
});

// ETF Diversification Analysis
describe('ETF Diversification', () => {
  const calculateConcentration = (holdings: { weight: number }[]) => {
    const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
    if (totalWeight === 0) return 0;
    const hhi = holdings.reduce((s, h) => s + Math.pow(h.weight / totalWeight, 2), 0);
    return hhi;
  };

  it('should return 1 for single holding', () => {
    expect(calculateConcentration([{ weight: 100 }])).toBeCloseTo(1, 5);
  });

  it('should return low for diversified holdings', () => {
    const holdings = Array(100).fill(null).map(() => ({ weight: 1 }));
    const hhi = calculateConcentration(holdings);
    expect(hhi).toBeCloseTo(0.01, 2);
  });

  it('should handle empty holdings', () => {
    expect(calculateConcentration([])).toBe(0);
  });

  const calculateEffectHoldings = (holdings: { weight: number }[]) => {
    const hhi = calculateConcentration(holdings);
    return hhi === 0 ? 0 : 1 / hhi;
  };

  it('should return 1 for concentrated', () => {
    expect(calculateEffectHoldings([{ weight: 100 }])).toBeCloseTo(1, 5);
  });

  it('should return n for equally weighted', () => {
    const holdings = Array(50).fill(null).map(() => ({ weight: 2 }));
    expect(calculateEffectHoldings(holdings)).toBeCloseTo(50, 0);
  });
});
