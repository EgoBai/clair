import { describe, it, expect } from 'vitest';

// ===== 指数计算引擎测试 =====

interface IndexComponent { symbol: string; weight: number; price: number; prevClose: number; freeFloatShares: number; }

function calculateIndexValue(components: IndexComponent[], baseValue: number = 1000): number {
  if (components.length === 0) return baseValue;
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return baseValue;
  let weightedReturn = 0;
  for (const c of components) {
    const ret = c.prevClose > 0 ? (c.price - c.prevClose) / c.prevClose : 0;
    weightedReturn += ret * (c.weight / totalWeight);
  }
  return baseValue * (1 + weightedReturn);
}

function calculateMarketBreadth(components: IndexComponent[]): { advance: number; decline: number; unchanged: number; breadth: number } {
  let advance = 0, decline = 0, unchanged = 0;
  for (const c of components) {
    if (c.price > c.prevClose) advance++;
    else if (c.price < c.prevClose) decline++;
    else unchanged++;
  }
  const total = components.length;
  const breadth = total > 0 ? (advance - decline) / total : 0;
  return { advance, decline, unchanged, breadth };
}

function calculateFreeFloatMarketCap(components: IndexComponent[]): number {
  return components.reduce((s, c) => s + c.price * c.freeFloatShares, 0);
}

function rebalanceWeights(components: IndexComponent[], method: 'equal' | 'cap' | 'fundamental'): IndexComponent[] {
  if (method === 'equal') {
    const w = 1 / components.length;
    return components.map(c => ({ ...c, weight: w }));
  }
  if (method === 'cap') {
    const totalCap = components.reduce((s, c) => s + c.price * c.freeFloatShares, 0);
    return components.map(c => ({ ...c, weight: totalCap > 0 ? (c.price * c.freeFloatShares) / totalCap : 0 }));
  }
  return components; // fundamental - keep existing
}

describe('指数计算', () => {
  const components: IndexComponent[] = [
    { symbol: '600519', weight: 0.4, price: 1900, prevClose: 1885, freeFloatShares: 1.26e9 },
    { symbol: '000858', weight: 0.3, price: 160, prevClose: 158, freeFloatShares: 3.88e9 },
    { symbol: '300750', weight: 0.3, price: 180, prevClose: 182, freeFloatShares: 2.34e9 },
  ];

  describe('指数点位计算', () => {
    it('涨跌均衡指数不变', () => {
      const neutral: IndexComponent[] = [
        { symbol: 'A', weight: 0.5, price: 100, prevClose: 100, freeFloatShares: 1e9 },
        { symbol: 'B', weight: 0.5, price: 100, prevClose: 100, freeFloatShares: 1e9 },
      ];
      expect(calculateIndexValue(neutral, 1000)).toBe(1000);
    });

    it('全部上涨指数上涨', () => {
      const allUp: IndexComponent[] = [
        { symbol: 'A', weight: 1, price: 110, prevClose: 100, freeFloatShares: 1e9 },
      ];
      expect(calculateIndexValue(allUp, 1000)).toBe(1100);
    });

    it('全部下跌指数下跌', () => {
      const allDown: IndexComponent[] = [
        { symbol: 'A', weight: 1, price: 90, prevClose: 100, freeFloatShares: 1e9 },
      ];
      expect(calculateIndexValue(allDown, 1000)).toBe(900);
    });

    it('空成分股返回基准值', () => {
      expect(calculateIndexValue([], 1000)).toBe(1000);
    });

    it('加权计算正确', () => {
      const v = calculateIndexValue(components, 1000);
      expect(v).toBeGreaterThan(1000); // 2涨1跌，涨权重大
    });

    it('零昨收不参与计算', () => {
      const comps = [{ symbol: 'A', weight: 1, price: 100, prevClose: 0, freeFloatShares: 1e9 }];
      expect(calculateIndexValue(comps, 1000)).toBe(1000);
    });
  });

  describe('市场宽度', () => {
    it('涨跌统计正确', () => {
      const b = calculateMarketBreadth(components);
      expect(b.advance).toBe(2);
      expect(b.decline).toBe(1);
      expect(b.breadth).toBeCloseTo(1/3, 5);
    });

    it('全涨宽度为1', () => {
      const allUp = components.map(c => ({ ...c, price: c.prevClose + 10 }));
      expect(calculateMarketBreadth(allUp).breadth).toBe(1);
    });

    it('全跌宽度为-1', () => {
      const allDown = components.map(c => ({ ...c, price: c.prevClose - 10 }));
      expect(calculateMarketBreadth(allDown).breadth).toBe(-1);
    });

    it('空数组宽度为0', () => {
      expect(calculateMarketBreadth([]).breadth).toBe(0);
    });
  });

  describe('自由流通市值', () => {
    it('正确计算总市值', () => {
      const cap = calculateFreeFloatMarketCap(components);
      expect(cap).toBeGreaterThan(0);
    });

    it('单成分股市值', () => {
      const cap = calculateFreeFloatMarketCap([components[0]]);
      expect(cap).toBe(1900 * 1.26e9);
    });

    it('空数组市值为0', () => {
      expect(calculateFreeFloatMarketCap([])).toBe(0);
    });
  });

  describe('权重再平衡', () => {
    it('等权重分配', () => {
      const rebalanced = rebalanceWeights(components, 'equal');
      rebalanced.forEach(c => expect(c.weight).toBeCloseTo(1/3, 5));
    });

    it('市值加权分配', () => {
      const rebalanced = rebalanceWeights(components, 'cap');
      const totalWeight = rebalanced.reduce((s, c) => s + c.weight, 0);
      expect(totalWeight).toBeCloseTo(1, 5);
    });

    it('市值加权高市值权重大', () => {
      const rebalanced = rebalanceWeights(components, 'cap');
      const sorted = [...rebalanced].sort((a, b) => b.weight - a.weight);
      expect(sorted[0].symbol).toBe('600519'); // 茅台市值最大
    });

    it('基本权重保留原值', () => {
      const rebalanced = rebalanceWeights(components, 'fundamental');
      expect(rebalanced[0].weight).toBe(0.4);
    });
  });
});
