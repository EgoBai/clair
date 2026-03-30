import { describe, it, expect } from 'vitest';

// 指数计算引擎
interface IndexComponent {
  symbol: string;
  weight: number;
  price: number;
  prevClose: number;
  shares: number; // 自由流通股本
}

function calcIndexValue(components: IndexComponent[], baseValue: number = 1000): number {
  if (components.length === 0) return baseValue;
  // 等权加权
  const totalReturn = components.reduce((sum, c) => {
    const ret = c.prevClose > 0 ? (c.price - c.prevClose) / c.prevClose : 0;
    return sum + ret * c.weight;
  }, 0);
  return +(baseValue * (1 + totalReturn)).toFixed(4);
}

function calcFreeFloatMarketCap(components: IndexComponent[]): number {
  return components.reduce((sum, c) => sum + c.price * c.shares, 0);
}

function rebalanceWeights(components: IndexComponent[]): IndexComponent[] {
  const totalCap = calcFreeFloatMarketCap(components);
  if (totalCap === 0) return components.map(c => ({ ...c, weight: 1 / components.length }));
  return components.map(c => ({
    ...c,
    weight: +(c.price * c.shares / totalCap).toFixed(6),
  }));
}

function calcIndexTurnover(oldWeights: IndexComponent[], newWeights: IndexComponent[]): number {
  let turnover = 0;
  const oldMap = new Map(oldWeights.map(c => [c.symbol, c.weight]));
  for (const comp of newWeights) {
    const oldW = oldMap.get(comp.symbol) || 0;
    turnover += Math.abs(comp.weight - oldW);
  }
  return +(turnover / 2).toFixed(6); // 单边换手率
}

function detectIndexConcentration(components: IndexComponent[], threshold: number = 0.3): { concentrated: boolean; topN: number; topWeight: number } {
  const sorted = [...components].sort((a, b) => b.weight - a.weight);
  let cumWeight = 0;
  let topN = 0;
  for (const c of sorted) {
    cumWeight += c.weight;
    topN++;
    if (cumWeight >= threshold) break;
  }
  return { concentrated: topN <= 3, topN, topWeight: +cumWeight.toFixed(4) };
}

function calcDivisorAdjustment(oldComponents: IndexComponent[], newComponents: IndexComponent[], oldIndexValue: number): number {
  const oldCap = calcFreeFloatMarketCap(oldComponents);
  const newCap = calcFreeFloatMarketCap(newComponents);
  if (newCap === 0) return 1;
  return +(oldIndexValue * newCap / (oldCap || 1)).toFixed(4);
}

describe('指数计算引擎', () => {
  const sampleComponents: IndexComponent[] = [
    { symbol: 'A', weight: 0.4, price: 11, prevClose: 10, shares: 1000000 },
    { symbol: 'B', weight: 0.35, price: 20, prevClose: 20, shares: 500000 },
    { symbol: 'C', weight: 0.25, price: 8, prevClose: 10, shares: 800000 },
  ];

  describe('指数点位计算', () => {
    it('全涨指数上涨', () => {
      const comps = sampleComponents.map(c => ({ ...c, price: c.prevClose * 1.1 }));
      const val = calcIndexValue(comps);
      expect(val).toBeGreaterThan(1000);
    });

    it('全跌指数下跌', () => {
      const comps = sampleComponents.map(c => ({ ...c, price: c.prevClose * 0.9 }));
      const val = calcIndexValue(comps);
      expect(val).toBeLessThan(1000);
    });

    it('不涨不跌指数不变', () => {
      const comps = sampleComponents.map(c => ({ ...c, price: c.prevClose }));
      expect(calcIndexValue(comps)).toBe(1000);
    });

    it('空成分返回基准值', () => {
      expect(calcIndexValue([], 500)).toBe(500);
    });

    it('权重大的影响大', () => {
      const comp1 = [{ symbol: 'A', weight: 1, price: 11, prevClose: 10, shares: 100 }];
      const comp2 = [{ symbol: 'A', weight: 0.01, price: 11, prevClose: 10, shares: 100 }];
      expect(calcIndexValue(comp1)).toBeGreaterThan(calcIndexValue(comp2));
    });

    it('零昨收不影响其他', () => {
      const comps = [
        { symbol: 'A', weight: 0.5, price: 11, prevClose: 0, shares: 100 },
        { symbol: 'B', weight: 0.5, price: 20, prevClose: 20, shares: 100 },
      ];
      const val = calcIndexValue(comps);
      expect(val).toBe(1000); // A贡献0, B贡献0
    });
  });

  describe('自由流通市值', () => {
    it('正确计算总市值', () => {
      const cap = calcFreeFloatMarketCap(sampleComponents);
      expect(cap).toBe(11 * 1000000 + 20 * 500000 + 8 * 800000);
    });

    it('空成分返回0', () => {
      expect(calcFreeFloatMarketCap([])).toBe(0);
    });

    it('零股本贡献为0', () => {
      const comps = [{ symbol: 'A', weight: 1, price: 100, prevClose: 100, shares: 0 }];
      expect(calcFreeFloatMarketCap(comps)).toBe(0);
    });
  });

  describe('权重再平衡', () => {
    it('权重总和为1', () => {
      const rebalanced = rebalanceWeights(sampleComponents);
      const sum = rebalanced.reduce((s, c) => s + c.weight, 0);
      expect(sum).toBeCloseTo(1, 4);
    });

    it('市值大的权重高', () => {
      const rebalanced = rebalanceWeights(sampleComponents);
      const sorted = [...rebalanced].sort((a, b) => b.weight - a.weight);
      expect(sorted[0].symbol).toBe('A'); // 11M最大
    });

    it('等市值等权重', () => {
      const comps = [
        { symbol: 'A', weight: 0.5, price: 10, prevClose: 10, shares: 100 },
        { symbol: 'B', weight: 0.5, price: 10, prevClose: 10, shares: 100 },
      ];
      const rebalanced = rebalanceWeights(comps);
      expect(rebalanced[0].weight).toBeCloseTo(0.5, 4);
    });

    it('空市值平均分配', () => {
      const comps = [
        { symbol: 'A', weight: 0.5, price: 0, prevClose: 0, shares: 100 },
        { symbol: 'B', weight: 0.5, price: 0, prevClose: 0, shares: 100 },
      ];
      const rebalanced = rebalanceWeights(comps);
      expect(rebalanced[0].weight).toBe(0.5);
    });
  });

  describe('换手率', () => {
    it('不变权重换手为0', () => {
      expect(calcIndexTurnover(sampleComponents, sampleComponents)).toBe(0);
    });

    it('权重变化产生换手', () => {
      const newComps = sampleComponents.map(c => ({ ...c, weight: 1 / 3 }));
      const t = calcIndexTurnover(sampleComponents, newComps);
      expect(t).toBeGreaterThan(0);
    });

    it('换手率不超过1', () => {
      const oldC = [{ symbol: 'A', weight: 1, price: 10, prevClose: 10, shares: 100 }];
      const newC = [{ symbol: 'B', weight: 1, price: 10, prevClose: 10, shares: 100 }];
      const t = calcIndexTurnover(oldC, newC);
      expect(t).toBeLessThanOrEqual(1);
    });
  });

  describe('集中度检测', () => {
    it('高集中度被检测', () => {
      const comps = [
        { symbol: 'A', weight: 0.8, price: 10, prevClose: 10, shares: 100 },
        { symbol: 'B', weight: 0.1, price: 10, prevClose: 10, shares: 100 },
        { symbol: 'C', weight: 0.1, price: 10, prevClose: 10, shares: 100 },
      ];
      const r = detectIndexConcentration(comps, 0.3);
      expect(r.concentrated).toBe(true);
      expect(r.topN).toBe(1);
    });

    it('分散权重不集中(高阈值)', () => {
      const comps = Array.from({ length: 10 }, (_, i) => ({
        symbol: `${i}`, weight: 0.1, price: 10, prevClose: 10, shares: 100,
      }));
      const r = detectIndexConcentration(comps, 0.95);
      expect(r.concentrated).toBe(false); // need 10 components for 95%
      expect(r.topN).toBe(10);
    });

    it('自定义阈值', () => {
      const comps = [
        { symbol: 'A', weight: 0.6, price: 10, prevClose: 10, shares: 100 },
        { symbol: 'B', weight: 0.4, price: 10, prevClose: 10, shares: 100 },
      ];
      const r = detectIndexConcentration(comps, 0.7);
      expect(r.concentrated).toBe(true); // top2 reach 100% >= 0.7, topN=2<=3
      expect(r.topN).toBe(2);
    });
  });

  describe('除数调整', () => {
    it('不变成分除数不变', () => {
      const adj = calcDivisorAdjustment(sampleComponents, sampleComponents, 1000);
      expect(adj).toBe(1000);
    });

    it('调整后值有意义', () => {
      const newComps = sampleComponents.map(c => ({ ...c, shares: c.shares * 2 }));
      const adj = calcDivisorAdjustment(sampleComponents, newComps, 1000);
      expect(adj).toBeGreaterThan(0);
    });
  });
});
