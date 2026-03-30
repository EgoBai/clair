import { describe, it, expect } from 'vitest';

describe('Index & Market Calculations', () => {
  // 指数计算
  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const calculateAmplitude = (high: number, low: number, prevClose: number): number => {
    if (prevClose === 0) return 0;
    return ((high - low) / prevClose) * 100;
  };

  const calculateTurnoverRate = (volume: number, totalShares: number): number => {
    if (totalShares === 0) return 0;
    return (volume / totalShares) * 100;
  };

  const calculatePE = (price: number, eps: number): number | null => {
    if (eps <= 0) return null;
    return price / eps;
  };

  const calculatePB = (price: number, bvps: number): number | null => {
    if (bvps <= 0) return null;
    return price / bvps;
  };

  const calculateDividendYield = (dividend: number, price: number): number => {
    if (price === 0) return 0;
    return (dividend / price) * 100;
  };

  const calculateROE = (netIncome: number, equity: number): number => {
    if (equity === 0) return 0;
    return (netIncome / equity) * 100;
  };

  const calculateDebtRatio = (totalDebt: number, totalAssets: number): number => {
    if (totalAssets === 0) return 0;
    return (totalDebt / totalAssets) * 100;
  };

  const calculateGrossMargin = (revenue: number, cogs: number): number => {
    if (revenue === 0) return 0;
    return ((revenue - cogs) / revenue) * 100;
  };

  const calculateNetMargin = (netIncome: number, revenue: number): number => {
    if (revenue === 0) return 0;
    return (netIncome / revenue) * 100;
  };

  const calculateCurrentRatio = (currentAssets: number, currentLiabilities: number): number => {
    if (currentLiabilities === 0) return Infinity;
    return currentAssets / currentLiabilities;
  };

  const calculateWACC = (equityWeight: number, costOfEquity: number, debtWeight: number, costOfDebt: number, taxRate: number): number => {
    return equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxRate);
  };

  describe('Price Change Calculation', () => {
    it('should calculate positive change', () => {
      expect(calculateChange(110, 100)).toBe(10);
    });

    it('should calculate negative change', () => {
      expect(calculateChange(90, 100)).toBe(-10);
    });

    it('should return 0 for no change', () => {
      expect(calculateChange(100, 100)).toBe(0);
    });

    it('should handle zero previous price', () => {
      expect(calculateChange(100, 0)).toBe(0);
    });

    it('should calculate fractional change', () => {
      expect(calculateChange(100.5, 100)).toBeCloseTo(0.5);
    });
  });

  describe('Amplitude Calculation', () => {
    it('should calculate daily amplitude', () => {
      expect(calculateAmplitude(110, 90, 100)).toBe(20);
    });

    it('should return 0 for flat price', () => {
      expect(calculateAmplitude(100, 100, 100)).toBe(0);
    });

    it('should handle zero previous close', () => {
      expect(calculateAmplitude(10, 5, 0)).toBe(0);
    });
  });

  describe('Turnover Rate', () => {
    it('should calculate turnover rate', () => {
      expect(calculateTurnoverRate(1000000, 100000000)).toBe(1);
    });

    it('should return 0 for zero shares', () => {
      expect(calculateTurnoverRate(1000, 0)).toBe(0);
    });

    it('should calculate high turnover', () => {
      expect(calculateTurnoverRate(50000000, 100000000)).toBe(50);
    });
  });

  describe('PE Ratio', () => {
    it('should calculate PE ratio', () => {
      expect(calculatePE(50, 5)).toBe(10);
    });

    it('should return null for negative EPS', () => {
      expect(calculatePE(50, -1)).toBeNull();
    });

    it('should return null for zero EPS', () => {
      expect(calculatePE(50, 0)).toBeNull();
    });
  });

  describe('PB Ratio', () => {
    it('should calculate PB ratio', () => {
      expect(calculatePB(30, 10)).toBe(3);
    });

    it('should return null for negative BVPS', () => {
      expect(calculatePB(30, -5)).toBeNull();
    });
  });

  describe('Dividend Yield', () => {
    it('should calculate dividend yield', () => {
      expect(calculateDividendYield(2, 50)).toBe(4);
    });

    it('should return 0 for zero price', () => {
      expect(calculateDividendYield(2, 0)).toBe(0);
    });
  });

  describe('ROE', () => {
    it('should calculate ROE', () => {
      expect(calculateROE(100, 1000)).toBe(10);
    });

    it('should return 0 for zero equity', () => {
      expect(calculateROE(100, 0)).toBe(0);
    });
  });

  describe('Debt Ratio', () => {
    it('should calculate debt ratio', () => {
      expect(calculateDebtRatio(400, 1000)).toBe(40);
    });

    it('should return 0 for zero assets', () => {
      expect(calculateDebtRatio(100, 0)).toBe(0);
    });
  });

  describe('Gross Margin', () => {
    it('should calculate gross margin', () => {
      expect(calculateGrossMargin(1000, 600)).toBe(40);
    });

    it('should return 0 for zero revenue', () => {
      expect(calculateGrossMargin(0, 0)).toBe(0);
    });

    it('should handle negative margin', () => {
      expect(calculateGrossMargin(100, 120)).toBe(-20);
    });
  });

  describe('Net Margin', () => {
    it('should calculate net margin', () => {
      expect(calculateNetMargin(100, 1000)).toBe(10);
    });

    it('should handle loss', () => {
      expect(calculateNetMargin(-50, 1000)).toBe(-5);
    });
  });

  describe('Current Ratio', () => {
    it('should calculate current ratio', () => {
      expect(calculateCurrentRatio(500, 250)).toBe(2);
    });

    it('should return Infinity for zero liabilities', () => {
      expect(calculateCurrentRatio(500, 0)).toBe(Infinity);
    });
  });

  describe('WACC', () => {
    it('should calculate weighted average cost of capital', () => {
      const wacc = calculateWACC(0.6, 0.1, 0.4, 0.05, 0.25);
      expect(wacc).toBeCloseTo(0.075);
    });

    it('should handle all equity financing', () => {
      const wacc = calculateWACC(1, 0.1, 0, 0.05, 0.25);
      expect(wacc).toBeCloseTo(0.1);
    });
  });

  describe('Market Cap Calculation', () => {
    const calculateMarketCap = (price: number, shares: number): number => {
      return price * shares;
    };

    const formatMarketCap = (cap: number): string => {
      if (cap >= 1e12) return (cap / 1e12).toFixed(2) + '万亿';
      if (cap >= 1e8) return (cap / 1e8).toFixed(2) + '亿';
      if (cap >= 1e4) return (cap / 1e4).toFixed(2) + '万';
      return cap.toFixed(2);
    };

    it('should calculate market cap', () => {
      expect(calculateMarketCap(100, 1e9)).toBe(1e11);
    });

    it('should format as 万亿', () => {
      expect(formatMarketCap(2e12)).toBe('2.00万亿');
    });

    it('should format as 亿', () => {
      expect(formatMarketCap(5e10)).toBe('500.00亿');
    });

    it('should format as 万', () => {
      expect(formatMarketCap(5e5)).toBe('50.00万');
    });
  });

  describe('Weighted Average Price', () => {
    const calculateVWAP = (prices: number[], volumes: number[]): number => {
      const totalVolume = volumes.reduce((a, b) => a + b, 0);
      if (totalVolume === 0) return 0;
      const sumPV = prices.reduce((sum, p, i) => sum + p * volumes[i], 0);
      return sumPV / totalVolume;
    };

    it('should calculate VWAP', () => {
      const vwap = calculateVWAP([10, 11, 12], [1000, 2000, 1000]);
      expect(vwap).toBeCloseTo(11);
    });

    it('should handle equal volumes', () => {
      expect(calculateVWAP([10, 20], [100, 100])).toBe(15);
    });

    it('should return 0 for zero volume', () => {
      expect(calculateVWAP([10, 20], [0, 0])).toBe(0);
    });
  });
});
