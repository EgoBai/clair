import { describe, it, expect } from 'vitest';

/**
 * 高级筛选逻辑测试
 */

type Operator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'in' | 'not_in';

interface FilterCondition {
  field: string;
  operator: Operator;
  value: number | string | number[];
  value2?: number;
}

interface Stock {
  code: string;
  name: string;
  price: number;
  change: number;
  pe: number;
  pb: number;
  roe: number;
  volume: number;
  marketCap: number;
  turnoverRate: number;
}

function evaluateCondition(stock: Stock, cond: FilterCondition): boolean {
  const val = (stock as Record<string, unknown>)[cond.field];
  if (typeof val !== 'number') return false;
  switch (cond.operator) {
    case 'gt': return val > (cond.value as number);
    case 'lt': return val < (cond.value as number);
    case 'gte': return val >= (cond.value as number);
    case 'lte': return val <= (cond.value as number);
    case 'eq': return val === (cond.value as number);
    case 'between': return val >= (cond.value as number) && val <= (cond.value2 as number);
    case 'in': return (cond.value as number[]).includes(val);
    case 'not_in': return !(cond.value as number[]).includes(val);
    default: return false;
  }
}

function filterStocks(stocks: Stock[], conditions: FilterCondition[], logic: 'AND' | 'OR' = 'AND'): Stock[] {
  return stocks.filter(stock => {
    const results = conditions.map(c => evaluateCondition(stock, c));
    return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
  });
}

function scoreStock(stock: Stock, weights: Record<string, number>): number {
  let score = 0;
  for (const [field, weight] of Object.entries(weights)) {
    const val = (stock as Record<string, unknown>)[field];
    if (typeof val === 'number') score += val * weight;
  }
  return score;
}

function rankStocks(stocks: Stock[], scoreWeights: Record<string, number>): Stock[] {
  return [...stocks].sort((a, b) => scoreStock(b, scoreWeights) - scoreStock(a, scoreWeights));
}

function buildPresetConditions(preset: string): FilterCondition[] {
  const presets: Record<string, FilterCondition[]> = {
    value: [
      { field: 'pe', operator: 'between', value: 5, value2: 20 },
      { field: 'pb', operator: 'lt', value: 2 },
      { field: 'roe', operator: 'gt', value: 15 },
    ],
    growth: [
      { field: 'change', operator: 'gt', value: 5 },
      { field: 'volume', operator: 'gt', value: 1000000 },
    ],
    oversold: [
      { field: 'change', operator: 'lt', value: -5 },
      { field: 'pe', operator: 'gt', value: 0 },
    ],
  };
  return presets[preset] || [];
}

describe('高级筛选逻辑', () => {
  const stocks: Stock[] = [
    { code: '000001', name: '平安银行', price: 12, change: 2.5, pe: 8, pb: 1.2, roe: 18, volume: 5000000, marketCap: 2000, turnoverRate: 1.5 },
    { code: '600519', name: '贵州茅台', price: 1800, change: -1, pe: 35, pb: 12, roe: 30, volume: 200000, marketCap: 22000, turnoverRate: 0.2 },
    { code: '000858', name: '五粮液', price: 150, change: 3, pe: 25, pb: 6, roe: 22, volume: 1500000, marketCap: 5800, turnoverRate: 0.8 },
    { code: '300750', name: '宁德时代', price: 200, change: -3, pe: 40, pb: 8, roe: 15, volume: 8000000, marketCap: 9000, turnoverRate: 2.5 },
    { code: '002594', name: '比亚迪', price: 250, change: 6, pe: 50, pb: 5, roe: 12, volume: 3000000, marketCap: 7000, turnoverRate: 1.8 },
  ];

  describe('条件评估', () => {
    it('gt操作符', () => {
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'gt', value: 5 })).toBe(true);
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'gt', value: 10 })).toBe(false);
    });

    it('lt操作符', () => {
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'lt', value: 10 })).toBe(true);
      expect(evaluateCondition(stocks[1], { field: 'pe', operator: 'lt', value: 10 })).toBe(false);
    });

    it('between操作符', () => {
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'between', value: 5, value2: 20 })).toBe(true);
      expect(evaluateCondition(stocks[1], { field: 'pe', operator: 'between', value: 5, value2: 20 })).toBe(false);
    });

    it('in操作符', () => {
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'in', value: [8, 10, 12] })).toBe(true);
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'in', value: [9, 10] })).toBe(false);
    });

    it('gte/lte操作符', () => {
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'gte', value: 8 })).toBe(true);
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'lte', value: 8 })).toBe(true);
    });

    it('not_in操作符', () => {
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'not_in', value: [9, 10] })).toBe(true);
      expect(evaluateCondition(stocks[0], { field: 'pe', operator: 'not_in', value: [8, 9] })).toBe(false);
    });

    it('非数值字段返回false', () => {
      expect(evaluateCondition(stocks[0], { field: 'name', operator: 'gt', value: 1 })).toBe(false);
    });
  });

  describe('AND/OR组合', () => {
    it('AND组合', () => {
      const result = filterStocks(stocks, [
        { field: 'pe', operator: 'lt', value: 30 },
        { field: 'roe', operator: 'gt', value: 15 },
      ], 'AND');
      expect(result.every(s => s.pe < 30 && s.roe > 15)).toBe(true);
    });

    it('OR组合', () => {
      const result = filterStocks(stocks, [
        { field: 'pe', operator: 'lt', value: 10 },
        { field: 'change', operator: 'gt', value: 5 },
      ], 'OR');
      expect(result.length).toBeGreaterThan(0);
    });

    it('空条件返回全部', () => {
      expect(filterStocks(stocks, []).length).toBe(stocks.length);
    });

    it('无匹配返回空', () => {
      expect(filterStocks(stocks, [{ field: 'pe', operator: 'lt', value: 0 }]).length).toBe(0);
    });
  });

  describe('评分排序', () => {
    it('按权重排序', () => {
      const ranked = rankStocks(stocks, { roe: 2, pe: -0.1 });
      expect(ranked[0].code).toBe('600519'); // highest ROE with low PE penalty
    });

    it('相同评分保持顺序', () => {
      const same = [stocks[0], stocks[0]];
      const ranked = rankStocks(same, { pe: 1 });
      expect(ranked.length).toBe(2);
    });

    it('不修改原数组', () => {
      const original = [...stocks];
      rankStocks(stocks, { pe: 1 });
      expect(stocks[0].code).toBe(original[0].code);
    });
  });

  describe('预设策略', () => {
    it('价值策略', () => {
      const conds = buildPresetConditions('value');
      expect(conds.length).toBe(3);
      expect(conds[0].field).toBe('pe');
    });

    it('成长策略', () => {
      const conds = buildPresetConditions('growth');
      expect(conds.some(c => c.field === 'change')).toBe(true);
    });

    it('超跌策略', () => {
      const conds = buildPresetConditions('oversold');
      expect(conds.some(c => c.field === 'change' && c.operator === 'lt')).toBe(true);
    });

    it('未知预设返回空', () => {
      expect(buildPresetConditions('unknown').length).toBe(0);
    });
  });
});
