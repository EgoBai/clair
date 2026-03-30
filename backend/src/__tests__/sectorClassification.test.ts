import { describe, it, expect } from 'vitest';

// 行业分类与板块分析测试
describe('Industry Classification & Sector Analysis', () => {
  // 申万一级行业分类
  const SW_INDUSTRIES = [
    '农林牧渔', '采掘', '化工', '钢铁', '有色金属', '电子', '汽车',
    '家用电器', '食品饮料', '纺织服饰', '轻工制造', '医药生物',
    '公用事业', '交通运输', '房地产', '商贸零售', '社会服务',
    '银行', '非银金融', '综合', '建筑材料', '建筑装饰',
    '电力设备', '国防军工', '计算机', '传媒', '通信', '煤炭',
    '石油石化', '环保', '美容护理',
  ];

  // 板块分类
  type Board = '主板' | '创业板' | '科创板' | '北交所';
  const getBoard = (code: string): Board => {
    if (code.startsWith('688')) return '科创板';
    if (code.startsWith('300') || code.startsWith('301')) return '创业板';
    if (code.startsWith('8') || code.startsWith('4')) return '北交所';
    return '主板';
  };

  // 板块涨跌停限制
  const getLimitPct = (board: Board): number => {
    switch (board) {
      case '科创板': case '创业板': return 0.2;
      case '北交所': return 0.3;
      default: return 0.1;
    }
  };

  // 市场分类
  type Market = 'SH' | 'SZ' | 'BJ';
  const getMarket = (code: string): Market => {
    if (code.startsWith('6') || code.startsWith('9')) return 'SH';
    if (code.startsWith('0') || code.startsWith('3')) return 'SZ';
    return 'BJ';
  };

  // 行业动量计算
  const calcSectorMomentum = (returns: number[], period: number = 20): number => {
    if (returns.length < period) return 0;
    const recent = returns.slice(-period);
    return recent.reduce((p, r) => p * (1 + r), 1) - 1;
  };

  // 行业相对强度
  const calcRelativeStrength = (sectorReturns: number[], marketReturns: number[]): number => {
    if (sectorReturns.length !== marketReturns.length || sectorReturns.length === 0) return 1;
    const sectorCum = sectorReturns.reduce((p, r) => p * (1 + r), 1);
    const marketCum = marketReturns.reduce((p, r) => p * (1 + r), 1);
    return marketCum > 0 ? sectorCum / marketCum : 1;
  };

  // 行业估值分位数
  const calcValuationPercentile = (currentPE: number, historicalPE: number[]): number => {
    if (historicalPE.length === 0) return 0;
    const below = historicalPE.filter(pe => pe <= currentPE).length;
    return (below / historicalPE.length) * 100;
  };

  describe('Industry Classification', () => {
    it('should have standard SW industries', () => {
      expect(SW_INDUSTRIES.length).toBeGreaterThanOrEqual(30);
    });

    it('should include key sectors', () => {
      expect(SW_INDUSTRIES).toContain('银行');
      expect(SW_INDUSTRIES).toContain('医药生物');
      expect(SW_INDUSTRIES).toContain('电子');
      expect(SW_INDUSTRIES).toContain('食品饮料');
    });

    it('should have no duplicates', () => {
      const unique = new Set(SW_INDUSTRIES);
      expect(unique.size).toBe(SW_INDUSTRIES.length);
    });
  });

  describe('Board Classification', () => {
    it('should classify STAR Market', () => {
      expect(getBoard('688001')).toBe('科创板');
    });

    it('should classify ChiNext', () => {
      expect(getBoard('300001')).toBe('创业板');
      expect(getBoard('301001')).toBe('创业板');
    });

    it('should classify Main Board (SH)', () => {
      expect(getBoard('600519')).toBe('主板');
    });

    it('should classify Main Board (SZ)', () => {
      expect(getBoard('000001')).toBe('主板');
    });

    it('should classify BSE', () => {
      expect(getBoard('830001')).toBe('北交所');
      expect(getBoard('430001')).toBe('北交所');
    });
  });

  describe('Limit Percentage by Board', () => {
    it('should be 10% for main board', () => {
      expect(getLimitPct('主板')).toBe(0.1);
    });

    it('should be 20% for ChiNext/STAR', () => {
      expect(getLimitPct('创业板')).toBe(0.2);
      expect(getLimitPct('科创板')).toBe(0.2);
    });

    it('should be 30% for BSE', () => {
      expect(getLimitPct('北交所')).toBe(0.3);
    });
  });

  describe('Market Classification', () => {
    it('should identify Shanghai', () => {
      expect(getMarket('600519')).toBe('SH');
      expect(getMarket('900901')).toBe('SH');
    });

    it('should identify Shenzhen', () => {
      expect(getMarket('000001')).toBe('SZ');
      expect(getMarket('300750')).toBe('SZ');
    });

    it('should identify Beijing', () => {
      expect(getMarket('830001')).toBe('BJ');
    });
  });

  describe('Sector Momentum', () => {
    it('should calculate positive momentum', () => {
      const returns = Array.from({ length: 20 }, () => 0.01);
      const momentum = calcSectorMomentum(returns);
      expect(momentum).toBeGreaterThan(0);
    });

    it('should calculate negative momentum', () => {
      const returns = Array.from({ length: 20 }, () => -0.01);
      const momentum = calcSectorMomentum(returns);
      expect(momentum).toBeLessThan(0);
    });

    it('should be ~0 for flat market', () => {
      const returns = Array.from({ length: 20 }, () => 0);
      expect(calcSectorMomentum(returns)).toBeCloseTo(0, 5);
    });

    it('should return 0 for insufficient data', () => {
      expect(calcSectorMomentum([0.01, 0.02], 20)).toBe(0);
    });

    it('should handle empty returns', () => {
      expect(calcSectorMomentum([])).toBe(0);
    });
  });

  describe('Relative Strength', () => {
    it('should be > 1 for outperforming sector', () => {
      const sector = [0.02, 0.03, 0.01, 0.02];
      const market = [0.01, 0.01, 0.01, 0.01];
      expect(calcRelativeStrength(sector, market)).toBeGreaterThan(1);
    });

    it('should be < 1 for underperforming sector', () => {
      const sector = [0.005, 0.005, 0.005, 0.005];
      const market = [0.02, 0.02, 0.02, 0.02];
      expect(calcRelativeStrength(sector, market)).toBeLessThan(1);
    });

    it('should be 1 for matching returns', () => {
      const returns = [0.01, 0.02, -0.01, 0.03];
      expect(calcRelativeStrength(returns, returns)).toBeCloseTo(1, 5);
    });

    it('should handle mismatched lengths', () => {
      expect(calcRelativeStrength([0.01], [0.01, 0.02])).toBe(1);
    });
  });

  describe('Valuation Percentile', () => {
    it('should calculate percentile', () => {
      const history = Array.from({ length: 100 }, (_, i) => 10 + i * 0.5);
      const percentile = calcValuationPercentile(30, history);
      expect(percentile).toBeGreaterThan(0);
      expect(percentile).toBeLessThan(100);
    });

    it('should be 100 for highest value', () => {
      const history = [10, 15, 20, 25, 30];
      expect(calcValuationPercentile(30, history)).toBe(100);
    });

    it('should be ~20 for lowest value', () => {
      const history = [10, 15, 20, 25, 30];
      expect(calcValuationPercentile(10, history)).toBeCloseTo(20, 0);
    });

    it('should return 0 for empty history', () => {
      expect(calcValuationPercentile(15, [])).toBe(0);
    });
  });
});
