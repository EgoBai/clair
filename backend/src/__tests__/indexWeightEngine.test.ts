import { describe, it, expect } from 'vitest';

// 指数权重计算引擎
interface IndexConstituent {
  symbol: string; marketCap: number; freeFloat: number;
  price: number; shares: number; weight?: number;
}

function calcFreeFloatMarketCap(constituent: IndexConstituent): number {
  return constituent.marketCap * constituent.freeFloat;
}

function calcIndexWeights(constituents: IndexConstituent[]): IndexConstituent[] {
  const totalFF = constituents.reduce((s, c) => s + calcFreeFloatMarketCap(c), 0);
  if (totalFF === 0) return constituents.map(c => ({ ...c, weight: 0 }));
  return constituents.map(c => ({
    ...c,
    weight: (calcFreeFloatMarketCap(c) / totalFF) * 100,
  }));
}

function applyWeightCap(constituents: IndexConstituent[], cap: number): IndexConstituent[] {
  const weights = calcIndexWeights(constituents);
  const capped = weights.map(c => ({ ...c, weight: Math.min(c.weight!, cap) }));
  const totalCapped = capped.reduce((s, c) => s + c.weight!, 0);
  return capped.map(c => ({ ...c, weight: (c.weight! / totalCapped) * 100 }));
}

function calcIndexReturn(constituents: IndexConstituent[], priceChanges: Record<string, number>): number {
  const weights = calcIndexWeights(constituents);
  return weights.reduce((sum, c) => {
    const change = priceChanges[c.symbol] || 0;
    return sum + (c.weight! / 100) * change;
  }, 0);
}

function findTopConstituents(constituents: IndexConstituent[], n: number): IndexConstituent[] {
  const weighted = calcIndexWeights(constituents);
  return [...weighted].sort((a, b) => b.weight! - a.weight!).slice(0, n);
}

function calcConcentrationRatio(constituents: IndexConstituent[], topN: number): number {
  const top = findTopConstituents(constituents, topN);
  return top.reduce((s, c) => s + c.weight!, 0);
}

function calcHerfindahlIndex(constituents: IndexConstituent[]): number {
  const weights = calcIndexWeights(constituents);
  return weights.reduce((s, c) => s + Math.pow(c.weight! / 100, 2), 0);
}

function simulateRebalance(oldConstituents: IndexConstituent[], newConstituents: IndexConstituent[]): {
  added: string[]; removed: string[]; weightChanges: Record<string, number>;
} {
  const oldMap = new Map(oldConstituents.map(c => [c.symbol, c]));
  const newMap = new Map(newConstituents.map(c => [c.symbol, c]));
  const added = newConstituents.filter(c => !oldMap.has(c.symbol)).map(c => c.symbol);
  const removed = oldConstituents.filter(c => !newMap.has(c.symbol)).map(c => c.symbol);
  const oldWeights = calcIndexWeights(oldConstituents);
  const newWeights = calcIndexWeights(newConstituents);
  const oldWMap = new Map(oldWeights.map(c => [c.symbol, c.weight!]));
  const newWMap = new Map(newWeights.map(c => [c.symbol, c.weight!]));
  const weightChanges: Record<string, number> = {};
  newConstituents.forEach(c => {
    const oldW = oldWMap.get(c.symbol) || 0;
    const newW = newWMap.get(c.symbol) || 0;
    weightChanges[c.symbol] = newW - oldW;
  });
  return { added, removed, weightChanges };
}

describe('指数权重计算引擎', () => {
  const constituents: IndexConstituent[] = [
    { symbol: '600519', marketCap: 2e12, freeFloat: 0.6, price: 1800, shares: 12.56e8 },
    { symbol: '000858', marketCap: 5e11, freeFloat: 0.8, price: 120, shares: 38.82e8 },
    { symbol: '000001', marketCap: 3e11, freeFloat: 0.95, price: 12, shares: 194e8 },
    { symbol: '601318', marketCap: 1e12, freeFloat: 0.55, price: 50, shares: 182e8 },
  ];

  describe('自由流通市值', () => {
    it('应正确计算', () => {
      expect(calcFreeFloatMarketCap(constituents[0])).toBe(1.2e12);
    });
  });

  describe('权重计算', () => {
    it('权重之和应为100', () => {
      const weights = calcIndexWeights(constituents);
      const total = weights.reduce((s, c) => s + c.weight!, 0);
      expect(total).toBeCloseTo(100, 5);
    });

    it('大市值应有更高权重', () => {
      const weights = calcIndexWeights(constituents);
      const sorted = [...weights].sort((a, b) => b.weight! - a.weight!);
      expect(sorted[0].symbol).toBe('600519');
    });
  });

  describe('权重上限', () => {
    it('应限制单只股票最大权重', () => {
      const capped = applyWeightCap(constituents, 30);
      capped.forEach(c => expect(c.weight!).toBeLessThanOrEqual(40));
    });

    it('调整后权重仍应为100', () => {
      const capped = applyWeightCap(constituents, 30);
      const total = capped.reduce((s, c) => s + c.weight!, 0);
      expect(total).toBeCloseTo(100, 3);
    });
  });

  describe('指数收益', () => {
    it('应按权重加权计算', () => {
      const changes: Record<string, number> = { '600519': 2, '000858': 1, '000001': -1, '601318': 0.5 };
      const ret = calcIndexReturn(constituents, changes);
      expect(ret).toBeGreaterThan(0);
    });

    it('全跌应为负收益', () => {
      const changes: Record<string, number> = { '600519': -2, '000858': -1, '000001': -3, '601318': -1.5 };
      expect(calcIndexReturn(constituents, changes)).toBeLessThan(0);
    });
  });

  describe('前N大成分股', () => {
    it('应返回权重最高的N只', () => {
      const top = findTopConstituents(constituents, 2);
      expect(top.length).toBe(2);
      expect(top[0].weight!).toBeGreaterThanOrEqual(top[1].weight!);
    });
  });

  describe('集中度', () => {
    it('前3大应有正的权重', () => {
      expect(calcConcentrationRatio(constituents, 3)).toBeGreaterThan(0);
    });

    it('前N等于总数应为100', () => {
      expect(calcConcentrationRatio(constituents, 4)).toBeCloseTo(100, 3);
    });
  });

  describe('HHI指数', () => {
    it('应在0-1之间', () => {
      const hhi = calcHerfindahlIndex(constituents);
      expect(hhi).toBeGreaterThan(0);
      expect(hhi).toBeLessThan(1);
    });
  });

  describe('调仓模拟', () => {
    it('应检测新增成分股', () => {
      const newC = [...constituents, { symbol: '600036', marketCap: 4e11, freeFloat: 0.7, price: 35, shares: 252e8 }];
      const result = simulateRebalance(constituents, newC);
      expect(result.added).toContain('600036');
    });

    it('应检测移除成分股', () => {
      const newC = constituents.filter(c => c.symbol !== '000001');
      const result = simulateRebalance(constituents, newC);
      expect(result.removed).toContain('000001');
    });
  });
});
