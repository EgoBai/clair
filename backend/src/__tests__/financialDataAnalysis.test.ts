import { describe, it, expect } from 'vitest';

// 财务数据分析引擎
interface FinancialData {
  revenue: number;
  netProfit: number;
  grossProfit: number;
  operatingProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  eps: number;
  bvps: number;
  shares: number;
  dividends: number;
}

class FinancialAnalyzer {
  static calcROE(data: FinancialData): number {
    if (data.totalEquity <= 0) return 0;
    return (data.netProfit / data.totalEquity) * 100;
  }

  static calcROA(data: FinancialData): number {
    if (data.totalAssets <= 0) return 0;
    return (data.netProfit / data.totalAssets) * 100;
  }

  static calcDebtRatio(data: FinancialData): number {
    if (data.totalAssets <= 0) return 0;
    return (data.totalLiabilities / data.totalAssets) * 100;
  }

  static calcGrossMargin(data: FinancialData): number {
    if (data.revenue <= 0) return 0;
    return (data.grossProfit / data.revenue) * 100;
  }

  static calcNetMargin(data: FinancialData): number {
    if (data.revenue <= 0) return 0;
    return (data.netProfit / data.revenue) * 100;
  }

  static calcOperatingMargin(data: FinancialData): number {
    if (data.revenue <= 0) return 0;
    return (data.operatingProfit / data.revenue) * 100;
  }

  static calcCurrentRatio(data: FinancialData): number {
    const currentAssets = data.totalAssets * 0.5;
    const currentLiabilities = data.totalLiabilities * 0.6;
    if (currentLiabilities <= 0) return Infinity;
    return currentAssets / currentLiabilities;
  }

  static calcAssetTurnover(data: FinancialData): number {
    if (data.totalAssets <= 0) return 0;
    return data.revenue / data.totalAssets;
  }

  static calcEquityMultiplier(data: FinancialData): number {
    if (data.totalEquity <= 0) return 0;
    return data.totalAssets / data.totalEquity;
  }

  static calcPE(currentPrice: number, data: FinancialData): number {
    if (data.eps <= 0) return Infinity;
    return currentPrice / data.eps;
  }

  static calcPB(currentPrice: number, data: FinancialData): number {
    if (data.bvps <= 0) return Infinity;
    return currentPrice / data.bvps;
  }

  static calcDividendYield(currentPrice: number, data: FinancialData): number {
    if (currentPrice <= 0 || data.shares <= 0) return 0;
    const dps = data.dividends / data.shares;
    return (dps / currentPrice) * 100;
  }

  static calcPEG(pe: number, growthRate: number): number {
    if (growthRate <= 0) return Infinity;
    return pe / growthRate;
  }

  static duPontAnalysis(data: FinancialData): {
    netMargin: number;
    assetTurnover: number;
    equityMultiplier: number;
    roe: number;
    breakdown: string;
  } {
    const netMargin = this.calcNetMargin(data);
    const assetTurnover = this.calcAssetTurnover(data);
    const equityMultiplier = this.calcEquityMultiplier(data);
    const roe = netMargin * assetTurnover * equityMultiplier;
    return {
      netMargin,
      assetTurnover,
      equityMultiplier,
      roe,
      breakdown: `${netMargin.toFixed(2)} × ${assetTurnover.toFixed(2)} × ${equityMultiplier.toFixed(2)} = ${roe.toFixed(2)}%`,
    };
  }

  static scoreFinancialHealth(data: FinancialData): {
    score: number;
    grade: string;
    details: Record<string, { value: number; pass: boolean }>;
  } {
    const roe = this.calcROE(data);
    const debtRatio = this.calcDebtRatio(data);
    const grossMargin = this.calcGrossMargin(data);
    const fcfYield = data.netProfit > 0 ? (data.freeCashFlow / data.netProfit) * 100 : 0;

    const checks = {
      roe: { value: roe, pass: roe > 15 },
      debtRatio: { value: debtRatio, pass: debtRatio < 60 },
      grossMargin: { value: grossMargin, pass: grossMargin > 30 },
      fcfYield: { value: fcfYield, pass: fcfYield > 50 },
    };

    const passCount = Object.values(checks).filter(c => c.pass).length;
    const score = (passCount / 4) * 100;
    const grade = score >= 100 ? 'A' : score >= 75 ? 'B' : score >= 50 ? 'C' : 'D';

    return { score, grade, details: checks };
  }

  static compareFinancials(data1: FinancialData, data2: FinancialData): {
    metric: string;
    company1: number;
    company2: number;
    winner: 1 | 2 | 'tie';
  }[] {
    return [
      { metric: 'ROE', company1: this.calcROE(data1), company2: this.calcROE(data2), winner: this.calcROE(data1) > this.calcROE(data2) ? 1 : this.calcROE(data1) < this.calcROE(data2) ? 2 : 'tie' },
      { metric: '净利率', company1: this.calcNetMargin(data1), company2: this.calcNetMargin(data2), winner: this.calcNetMargin(data1) > this.calcNetMargin(data2) ? 1 : this.calcNetMargin(data1) < this.calcNetMargin(data2) ? 2 : 'tie' },
      { metric: '负债率', company1: this.calcDebtRatio(data1), company2: this.calcDebtRatio(data2), winner: this.calcDebtRatio(data1) < this.calcDebtRatio(data2) ? 1 : this.calcDebtRatio(data1) > this.calcDebtRatio(data2) ? 2 : 'tie' },
      { metric: '毛利率', company1: this.calcGrossMargin(data1), company2: this.calcGrossMargin(data2), winner: this.calcGrossMargin(data1) > this.calcGrossMargin(data2) ? 1 : this.calcGrossMargin(data1) < this.calcGrossMargin(data2) ? 2 : 'tie' },
    ];
  }

  static trendAnalysis(values: number[]): {
    direction: 'up' | 'down' | 'flat';
    growth: number;
    cagr: number;
    volatility: number;
  } {
    if (values.length < 2) return { direction: 'flat', growth: 0, cagr: 0, volatility: 0 };
    const first = values[0];
    const last = values[values.length - 1];
    const growth = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    const periods = values.length - 1;
    const cagr = first > 0 && last > 0 ? (Math.pow(last / first, 1 / periods) - 1) * 100 : 0;

    const returns = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] !== 0) returns.push((values[i] - values[i - 1]) / values[i - 1]);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const volatility = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length) * 100;

    return {
      direction: growth > 5 ? 'up' : growth < -5 ? 'down' : 'flat',
      growth,
      cagr,
      volatility,
    };
  }
}

describe('财务数据分析引擎', () => {
  const sampleData: FinancialData = {
    revenue: 100000,
    netProfit: 15000,
    grossProfit: 40000,
    operatingProfit: 20000,
    totalAssets: 200000,
    totalLiabilities: 80000,
    totalEquity: 120000,
    operatingCashFlow: 18000,
    freeCashFlow: 12000,
    eps: 2.5,
    bvps: 20,
    shares: 6000,
    dividends: 6000,
  };

  describe('基本财务比率', () => {
    it('应该计算ROE', () => {
      expect(FinancialAnalyzer.calcROE(sampleData)).toBeCloseTo(12.5, 1);
    });

    it('应该处理零权益的ROE', () => {
      expect(FinancialAnalyzer.calcROE({ ...sampleData, totalEquity: 0 })).toBe(0);
    });

    it('应该计算ROA', () => {
      expect(FinancialAnalyzer.calcROA(sampleData)).toBeCloseTo(7.5, 1);
    });

    it('应该计算负债率', () => {
      expect(FinancialAnalyzer.calcDebtRatio(sampleData)).toBeCloseTo(40, 1);
    });

    it('应该计算毛利率', () => {
      expect(FinancialAnalyzer.calcGrossMargin(sampleData)).toBe(40);
    });

    it('应该计算净利率', () => {
      expect(FinancialAnalyzer.calcNetMargin(sampleData)).toBe(15);
    });

    it('应该计算营业利润率', () => {
      expect(FinancialAnalyzer.calcOperatingMargin(sampleData)).toBe(20);
    });

    it('应该处理零收入的利润率', () => {
      const zeroRevenue = { ...sampleData, revenue: 0 };
      expect(FinancialAnalyzer.calcGrossMargin(zeroRevenue)).toBe(0);
      expect(FinancialAnalyzer.calcNetMargin(zeroRevenue)).toBe(0);
    });

    it('应该计算资产周转率', () => {
      expect(FinancialAnalyzer.calcAssetTurnover(sampleData)).toBeCloseTo(0.5, 2);
    });

    it('应该计算权益乘数', () => {
      expect(FinancialAnalyzer.calcEquityMultiplier(sampleData)).toBeCloseTo(1.667, 2);
    });
  });

  describe('估值指标', () => {
    it('应该计算PE', () => {
      expect(FinancialAnalyzer.calcPE(50, sampleData)).toBe(20);
    });

    it('应该处理负EPS的PE', () => {
      expect(FinancialAnalyzer.calcPE(50, { ...sampleData, eps: -1 })).toBe(Infinity);
    });

    it('应该计算PB', () => {
      expect(FinancialAnalyzer.calcPB(50, sampleData)).toBe(2.5);
    });

    it('应该计算股息率', () => {
      expect(FinancialAnalyzer.calcDividendYield(50, sampleData)).toBeCloseTo(2, 1);
    });

    it('应该计算PEG', () => {
      expect(FinancialAnalyzer.calcPEG(20, 15)).toBeCloseTo(1.33, 2);
    });

    it('应该处理零增长率的PEG', () => {
      expect(FinancialAnalyzer.calcPEG(20, 0)).toBe(Infinity);
    });
  });

  describe('杜邦分析', () => {
    it('应该执行杜邦分析', () => {
      const result = FinancialAnalyzer.duPontAnalysis(sampleData);
      expect(result.netMargin).toBe(15);
      expect(result.assetTurnover).toBeCloseTo(0.5, 2);
      expect(result.equityMultiplier).toBeCloseTo(1.667, 2);
      expect(result.roe).toBeGreaterThan(0);
      expect(result.breakdown).toContain('×');
    });

    it('杜邦分析应该与直接ROE计算一致', () => {
      const dupont = FinancialAnalyzer.duPontAnalysis(sampleData);
      const directROE = FinancialAnalyzer.calcROE(sampleData);
      expect(dupont.roe).toBeCloseTo(directROE, 1);
    });
  });

  describe('财务健康评分', () => {
    it('应该给优秀公司打A级', () => {
      const excellent: FinancialData = {
        revenue: 100000, netProfit: 20000, grossProfit: 50000,
        operatingProfit: 25000, totalAssets: 100000, totalLiabilities: 30000,
        totalEquity: 70000, operatingCashFlow: 22000, freeCashFlow: 15000,
        eps: 5, bvps: 30, shares: 4000, dividends: 12000,
      };
      const result = FinancialAnalyzer.scoreFinancialHealth(excellent);
      expect(result.grade).toBe('A');
      expect(result.score).toBe(100);
    });

    it('应该给差公司打D级', () => {
      const poor: FinancialData = {
        revenue: 100000, netProfit: 2000, grossProfit: 10000,
        operatingProfit: 3000, totalAssets: 100000, totalLiabilities: 85000,
        totalEquity: 15000, operatingCashFlow: 1000, freeCashFlow: -2000,
        eps: 0.5, bvps: 5, shares: 4000, dividends: 0,
      };
      const result = FinancialAnalyzer.scoreFinancialHealth(poor);
      expect(result.grade).toBe('D');
    });

    it('应该正确标记各项指标是否达标', () => {
      const result = FinancialAnalyzer.scoreFinancialHealth(sampleData);
      expect(result.details.roe.pass).toBe(false); // 12.5 < 15
      expect(result.details.debtRatio.pass).toBe(true); // 40 < 60
      expect(result.details.grossMargin.pass).toBe(true); // 40 > 30
    });
  });

  describe('公司对比', () => {
    it('应该比较两家公司的财务数据', () => {
      const data2: FinancialData = {
        ...sampleData,
        netProfit: 10000,
        totalEquity: 80000,
      };
      const result = FinancialAnalyzer.compareFinancials(sampleData, data2);
      expect(result).toHaveLength(4);
      expect(result[0].metric).toBe('ROE');
      // sampleData ROE=12.5%, data2 ROE=12.5%, so tie
      expect(result[0].winner).toBe('tie');
    });

    it('应该处理相同的财务数据', () => {
      const result = FinancialAnalyzer.compareFinancials(sampleData, sampleData);
      result.forEach(r => expect(r.winner).toBe('tie'));
    });
  });

  describe('趋势分析', () => {
    it('应该识别上升趋势', () => {
      const result = FinancialAnalyzer.trendAnalysis([100, 110, 125, 140]);
      expect(result.direction).toBe('up');
      expect(result.growth).toBeGreaterThan(0);
    });

    it('应该识别下降趋势', () => {
      const result = FinancialAnalyzer.trendAnalysis([140, 120, 100, 80]);
      expect(result.direction).toBe('down');
      expect(result.growth).toBeLessThan(0);
    });

    it('应该识别平稳趋势', () => {
      const result = FinancialAnalyzer.trendAnalysis([100, 102, 98, 101]);
      expect(result.direction).toBe('flat');
    });

    it('应该计算CAGR', () => {
      const result = FinancialAnalyzer.trendAnalysis([100, 121, 146.41]);
      expect(result.cagr).toBeCloseTo(21, 0);
    });

    it('应该计算波动率', () => {
      const result = FinancialAnalyzer.trendAnalysis([100, 110, 105, 115, 108]);
      expect(result.volatility).toBeGreaterThan(0);
    });

    it('应该处理单个值的数组', () => {
      const result = FinancialAnalyzer.trendAnalysis([100]);
      expect(result.direction).toBe('flat');
      expect(result.growth).toBe(0);
    });

    it('应该处理空数组', () => {
      const result = FinancialAnalyzer.trendAnalysis([]);
      expect(result.direction).toBe('flat');
    });
  });

  describe('边界条件', () => {
    it('应该处理负利润', () => {
      const lossData = { ...sampleData, netProfit: -5000 };
      expect(FinancialAnalyzer.calcROE(lossData)).toBeLessThan(0);
      expect(FinancialAnalyzer.calcNetMargin(lossData)).toBeLessThan(0);
    });

    it('应该处理极大数据', () => {
      const hugeData = { ...sampleData, revenue: 1e12, netProfit: 1e11 };
      expect(FinancialAnalyzer.calcNetMargin(hugeData)).toBeCloseTo(10, 1);
    });

    it('应该处理零资产', () => {
      const zeroAssets = { ...sampleData, totalAssets: 0, totalLiabilities: 0 };
      expect(FinancialAnalyzer.calcROA(zeroAssets)).toBe(0);
      expect(FinancialAnalyzer.calcDebtRatio(zeroAssets)).toBe(0);
    });
  });
});
