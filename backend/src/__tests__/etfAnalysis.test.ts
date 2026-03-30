import { describe, it, expect } from 'vitest';

// ETF分析引擎
interface ETFData {
  code: string;
  name: string;
  price: number;
  nav: number;        // 净值
  change: number;
  volume: number;
  amount: number;
  trackingIndex: string;
  trackingError: number; // 跟踪误差
  premiumRate: number;   // 溢价率
  totalShares: number;
  aum: number;           // 资产管理规模
  expenseRatio: number;  // 费率
  sector: string;
}

interface ETFScreenResult {
  etf: ETFData;
  score: number;
  reasons: string[];
}

function calculatePremiumDiscount(price: number, nav: number): { rate: number; type: 'premium' | 'discount' | 'par' } {
  const rate = ((price - nav) / nav) * 100;
  if (Math.abs(rate) < 0.01) return { rate: 0, type: 'par' };
  return { rate, type: rate > 0 ? 'premium' : 'discount' };
}

function screenETFs(etfs: ETFData[], criteria: {
  minAUM?: number;
  maxExpenseRatio?: number;
  maxTrackingError?: number;
  maxPremiumRate?: number;
  sectors?: string[];
}): ETFScreenResult[] {
  return etfs
    .filter(etf => {
      if (criteria.minAUM && etf.aum < criteria.minAUM) return false;
      if (criteria.maxExpenseRatio && etf.expenseRatio > criteria.maxExpenseRatio) return false;
      if (criteria.maxTrackingError && etf.trackingError > criteria.maxTrackingError) return false;
      if (criteria.maxPremiumRate && Math.abs(etf.premiumRate) > criteria.maxPremiumRate) return false;
      if (criteria.sectors && !criteria.sectors.includes(etf.sector)) return false;
      return true;
    })
    .map(etf => {
      let score = 50;
      const reasons: string[] = [];

      // AUM越大越好
      if (etf.aum > 100000000) { score += 15; reasons.push('规模大'); }
      else if (etf.aum > 10000000) { score += 8; reasons.push('规模适中'); }

      // 费率越低越好
      if (etf.expenseRatio < 0.2) { score += 15; reasons.push('费率低'); }
      else if (etf.expenseRatio < 0.5) { score += 8; reasons.push('费率适中'); }

      // 跟踪误差越小越好
      if (etf.trackingError < 0.1) { score += 10; reasons.push('跟踪精准'); }
      else if (etf.trackingError < 0.5) { score += 5; reasons.push('跟踪尚可'); }

      // 溢价率接近0最好
      if (Math.abs(etf.premiumRate) < 0.5) { score += 10; reasons.push('溢价合理'); }

      // 成交量越大流动性越好
      if (etf.amount > 100000000) { score += 10; reasons.push('流动性好'); }

      return { etf, score: Math.min(100, score), reasons };
    })
    .sort((a, b) => b.score - a.score);
}

function analyzeETFCorrelation(etfs1: ETFData[], etfs2: ETFData[]): { sector1: string; sector2: string; avgPremiumDiff: number }[] {
  const sectors1 = new Map<string, number[]>();
  const sectors2 = new Map<string, number[]>();

  for (const etf of etfs1) {
    const rates = sectors1.get(etf.sector) || [];
    rates.push(etf.premiumRate);
    sectors1.set(etf.sector, rates);
  }

  for (const etf of etfs2) {
    const rates = sectors2.get(etf.sector) || [];
    rates.push(etf.premiumRate);
    sectors2.set(etf.sector, rates);
  }

  const result: { sector1: string; sector2: string; avgPremiumDiff: number }[] = [];
  for (const [s1, rates1] of sectors1) {
    for (const [s2, rates2] of sectors2) {
      const avg1 = rates1.reduce((a, b) => a + b, 0) / rates1.length;
      const avg2 = rates2.reduce((a, b) => a + b, 0) / rates2.length;
      result.push({ sector1: s1, sector2: s2, avgPremiumDiff: avg1 - avg2 });
    }
  }

  return result.sort((a, b) => Math.abs(b.avgPremiumDiff) - Math.abs(a.avgPremiumDiff));
}

function calculateTrackingEfficiency(etf: ETFData): { score: number; grade: string } {
  const trackingScore = Math.max(0, 100 - etf.trackingError * 100);
  const expenseScore = Math.max(0, 100 - etf.expenseRatio * 100);
  const premiumScore = Math.max(0, 100 - Math.abs(etf.premiumRate) * 20);
  const liquidityScore = Math.min(100, etf.amount / 10000000);

  const score = (trackingScore * 0.3 + expenseScore * 0.25 + premiumScore * 0.25 + liquidityScore * 0.2);

  let grade: string;
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B+';
  else if (score >= 60) grade = 'B';
  else if (score >= 50) grade = 'C';
  else grade = 'D';

  return { score, grade };
}

function generateMockETFs(count: number): ETFData[] {
  const sectors = ['沪深300', '中证500', '创业板', '科创50', '红利', '消费', '医药', '科技', '新能源', '军工'];
  return Array.from({ length: count }, (_, i) => ({
    code: `${159000 + i}`,
    name: `ETF${i}`,
    price: 1 + Math.random() * 5,
    nav: 1 + Math.random() * 5,
    change: (Math.random() - 0.5) * 0.1,
    volume: Math.floor(Math.random() * 10000000),
    amount: Math.random() * 500000000,
    trackingIndex: `指数${i % 10}`,
    trackingError: Math.random() * 1,
    premiumRate: (Math.random() - 0.5) * 3,
    totalShares: Math.floor(Math.random() * 1000000000),
    aum: Math.random() * 5000000000,
    expenseRatio: Math.random() * 1,
    sector: sectors[i % sectors.length],
  }));
}

describe('ETF分析引擎', () => {
  describe('calculatePremiumDiscount', () => {
    it('价格高于净值应该返回溢价', () => {
      const result = calculatePremiumDiscount(105, 100);
      expect(result.type).toBe('premium');
      expect(result.rate).toBeCloseTo(5, 1);
    });

    it('价格低于净值应该返回折价', () => {
      const result = calculatePremiumDiscount(95, 100);
      expect(result.type).toBe('discount');
      expect(result.rate).toBeCloseTo(-5, 1);
    });

    it('价格等于净值应该返回平价', () => {
      const result = calculatePremiumDiscount(100, 100);
      expect(result.type).toBe('par');
      expect(result.rate).toBe(0);
    });

    it('微小差异应该视为平价', () => {
      const result = calculatePremiumDiscount(100.005, 100);
      expect(result.type).toBe('par');
    });
  });

  describe('screenETFs', () => {
    const etfs = generateMockETFs(50);

    it('应该按AUM筛选', () => {
      const result = screenETFs(etfs, { minAUM: 100000000 });
      result.forEach(r => {
        expect(r.etf.aum).toBeGreaterThanOrEqual(100000000);
      });
    });

    it('应该按费率筛选', () => {
      const result = screenETFs(etfs, { maxExpenseRatio: 0.3 });
      result.forEach(r => {
        expect(r.etf.expenseRatio).toBeLessThanOrEqual(0.3);
      });
    });

    it('应该按跟踪误差筛选', () => {
      const result = screenETFs(etfs, { maxTrackingError: 0.2 });
      result.forEach(r => {
        expect(r.etf.trackingError).toBeLessThanOrEqual(0.2);
      });
    });

    it('应该按板块筛选', () => {
      const result = screenETFs(etfs, { sectors: ['沪深300', '创业板'] });
      result.forEach(r => {
        expect(['沪深300', '创业板']).toContain(r.etf.sector);
      });
    });

    it('应该返回评分和原因', () => {
      const result = screenETFs(etfs, {});
      result.forEach(r => {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        expect(Array.isArray(r.reasons)).toBe(true);
      });
    });

    it('应该按评分降序排列', () => {
      const result = screenETFs(etfs, {});
      for (let i = 1; i < result.length; i++) {
        expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score);
      }
    });
  });

  describe('calculateTrackingEfficiency', () => {
    it('优秀的ETF应该获得A+', () => {
      const etf: ETFData = {
        code: '159001', name: '优秀ETF', price: 5, nav: 5,
        change: 0.01, volume: 5000000, amount: 800000000,
        trackingIndex: '沪深300', trackingError: 0.01,
        premiumRate: 0.1, totalShares: 1000000, aum: 5000000,
        expenseRatio: 0.1, sector: '沪深300',
      };
      const result = calculateTrackingEfficiency(etf);
      expect(result.grade).toBe('A+');
    });

    it('差的ETF应该获得D', () => {
      const etf: ETFData = {
        code: '159002', name: '差ETF', price: 1, nav: 1,
        change: -0.05, volume: 100, amount: 1000,
        trackingIndex: '沪深300', trackingError: 2,
        premiumRate: 5, totalShares: 10000, aum: 10000,
        expenseRatio: 2, sector: '沪深300',
      };
      const result = calculateTrackingEfficiency(etf);
      expect(result.grade).toBe('D');
    });

    it('分数应该在0-100之间', () => {
      const etfs = generateMockETFs(20);
      etfs.forEach(etf => {
        const result = calculateTrackingEfficiency(etf);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('边界条件', () => {
    it('空ETF列表应该返回空', () => {
      expect(screenETFs([], {})).toEqual([]);
    });

    it('极端溢价率应该正常处理', () => {
      const result = calculatePremiumDiscount(200, 100);
      expect(result.rate).toBe(100);
      expect(result.type).toBe('premium');
    });

    it('零净值不应该崩溃', () => {
      const result = calculatePremiumDiscount(0, 0);
      expect(result).toBeDefined();
    });
  });
});
