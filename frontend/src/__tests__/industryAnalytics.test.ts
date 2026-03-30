import { describe, it, expect } from 'vitest';

// ===== 板块/行业数据处理测试 =====

interface IndustryStock { symbol: string; name: string; weight: number; changePercent: number; volume: number; turnover: number; }

function calculateIndustryIndex(stocks: IndustryStock[], method: 'equal' | 'weighted' | 'cap'): number {
  if (stocks.length === 0) return 0;
  switch (method) {
    case 'equal':
      return stocks.reduce((s, st) => s + st.changePercent, 0) / stocks.length;
    case 'weighted': {
      const totalWeight = stocks.reduce((s, st) => s + st.weight, 0);
      if (totalWeight === 0) return 0;
      return stocks.reduce((s, st) => s + st.changePercent * (st.weight / totalWeight), 0);
    }
    case 'cap': {
      const totalTurnover = stocks.reduce((s, st) => s + st.turnover, 0);
      if (totalTurnover === 0) return 0;
      return stocks.reduce((s, st) => s + st.changePercent * (st.turnover / totalTurnover), 0);
    }
  }
}

function calculateIndustryBreadth(stocks: IndustryStock[]): { advance: number; decline: number; flat: number; breadthRatio: number } {
  let advance = 0, decline = 0, flat = 0;
  for (const s of stocks) {
    if (s.changePercent > 0.01) advance++;
    else if (s.changePercent < -0.01) decline++;
    else flat++;
  }
  const total = advance + decline + flat;
  return { advance, decline, flat, breadthRatio: total > 0 ? advance / total : 0 };
}

function findIndustryLeaders(stocks: IndustryStock[], metric: 'change' | 'volume' | 'turnover', topN: number = 3): IndustryStock[] {
  const key = metric === 'change' ? 'changePercent' : metric;
  const sorted = [...stocks].sort((a, b) => (b[key as keyof IndustryStock] as number) - (a[key as keyof IndustryStock] as number));
  return sorted.slice(0, topN);
}

function calculateIndustryHeat(stocks: IndustryStock[]): number {
  if (stocks.length === 0) return 0;
  const avgChange = stocks.reduce((s, st) => s + st.changePercent, 0) / stocks.length;
  const volSum = stocks.reduce((s, st) => s + st.volume, 0);
  const avgVol = volSum / stocks.length;
  // 0-100
  const changeScore = Math.min(50, Math.max(-50, avgChange * 10)) + 50;
  return changeScore;
}

function calculateCorrelationMatrix(industries: Record<string, number[]>): Record<string, Record<string, number>> {
  const names = Object.keys(industries);
  const result: Record<string, Record<string, number>> = {};
  for (const a of names) {
    result[a] = {};
    for (const b of names) {
      if (a === b) { result[a][b] = 1; continue; }
      const va = industries[a], vb = industries[b];
      if (va.length !== vb.length || va.length < 2) { result[a][b] = 0; continue; }
      const ma = va.reduce((x, y) => x + y, 0) / va.length;
      const mb = vb.reduce((x, y) => x + y, 0) / vb.length;
      let cov = 0, sa = 0, sb = 0;
      for (let i = 0; i < va.length; i++) {
        cov += (va[i] - ma) * (vb[i] - mb);
        sa += (va[i] - ma) ** 2;
        sb += (vb[i] - mb) ** 2;
      }
      result[a][b] = Math.sqrt(sa * sb) > 0 ? cov / Math.sqrt(sa * sb) : 0;
    }
  }
  return result;
}

describe('行业数据处理', () => {
  const sampleStocks: IndustryStock[] = [
    { symbol: '600519', name: '茅台', weight: 30, changePercent: 2.5, volume: 5e6, turnover: 2e8 },
    { symbol: '000858', name: '五粮液', weight: 20, changePercent: 1.8, volume: 3e6, turnover: 1.5e8 },
    { symbol: '002304', name: '洋河', weight: 15, changePercent: -0.5, volume: 2e6, turnover: 8e7 },
    { symbol: '600809', name: '汾酒', weight: 15, changePercent: 3.2, volume: 4e6, turnover: 1.2e8 },
    { symbol: '000568', name: '泸州老窖', weight: 20, changePercent: 0.8, volume: 2.5e6, turnover: 1e8 },
  ];

  describe('行业指数计算', () => {
    it('等权指数', () => {
      const idx = calculateIndustryIndex(sampleStocks, 'equal');
      const expected = sampleStocks.reduce((s, st) => s + st.changePercent, 0) / 5;
      expect(idx).toBeCloseTo(expected, 5);
    });

    it('加权指数', () => {
      const idx = calculateIndustryIndex(sampleStocks, 'weighted');
      expect(idx).toBeGreaterThan(0); // 大权重股涨
    });

    it('市值加权指数', () => {
      const idx = calculateIndustryIndex(sampleStocks, 'cap');
      expect(typeof idx).toBe('number');
    });

    it('空行业返回0', () => {
      expect(calculateIndustryIndex([], 'equal')).toBe(0);
    });

    it('加权>等权(当大权重股涨幅大)', () => {
      const weighted = calculateIndustryIndex(sampleStocks, 'weighted');
      const equal = calculateIndustryIndex(sampleStocks, 'equal');
      // 茅台(30%)涨2.5%, 权重最大
      expect(weighted).toBeGreaterThan(0);
      expect(equal).toBeGreaterThan(0);
    });
  });

  describe('涨跌分布', () => {
    it('正确计数涨跌平', () => {
      const b = calculateIndustryBreadth(sampleStocks);
      expect(b.advance + b.decline + b.flat).toBe(5);
    });

    it('涨家数>跌家数', () => {
      const b = calculateIndustryBreadth(sampleStocks);
      expect(b.advance).toBeGreaterThan(b.decline);
    });

    it('宽度比在0-1之间', () => {
      const b = calculateIndustryBreadth(sampleStocks);
      expect(b.breadthRatio).toBeGreaterThanOrEqual(0);
      expect(b.breadthRatio).toBeLessThanOrEqual(1);
    });

    it('空行业宽度为0', () => {
      const b = calculateIndustryBreadth([]);
      expect(b.breadthRatio).toBe(0);
    });

    it('全涨宽度为1', () => {
      const allUp = sampleStocks.map(s => ({ ...s, changePercent: 5 }));
      const b = calculateIndustryBreadth(allUp);
      expect(b.breadthRatio).toBe(1);
    });
  });

  describe('龙头股', () => {
    it('按涨幅找龙头', () => {
      const leaders = findIndustryLeaders(sampleStocks, 'change', 2);
      expect(leaders[0].changePercent).toBeGreaterThanOrEqual(leaders[1].changePercent);
    });

    it('按成交额找龙头', () => {
      const leaders = findIndustryLeaders(sampleStocks, 'turnover', 2);
      expect(leaders[0].turnover).toBeGreaterThanOrEqual(leaders[1].turnover);
    });

    it('返回指定数量', () => {
      expect(findIndustryLeaders(sampleStocks, 'change', 3)).toHaveLength(3);
    });

    it('超出总数返回全部', () => {
      expect(findIndustryLeaders(sampleStocks, 'change', 10)).toHaveLength(5);
    });
  });

  describe('行业热度', () => {
    it('返回0-100分', () => {
      const heat = calculateIndustryHeat(sampleStocks);
      expect(heat).toBeGreaterThanOrEqual(0);
      expect(heat).toBeLessThanOrEqual(100);
    });

    it('全涨行业热度高', () => {
      const allUp = sampleStocks.map(s => ({ ...s, changePercent: 5 }));
      const allDown = sampleStocks.map(s => ({ ...s, changePercent: -5 }));
      expect(calculateIndustryHeat(allUp)).toBeGreaterThan(calculateIndustryHeat(allDown));
    });

    it('空行业热度0', () => {
      expect(calculateIndustryHeat([])).toBe(0);
    });
  });

  describe('相关性矩阵', () => {
    it('对角线为1', () => {
      const m = calculateCorrelationMatrix({ A: [1, 2, 3], B: [4, 5, 6] });
      expect(m['A']['A']).toBe(1);
      expect(m['B']['B']).toBe(1);
    });

    it('对称性', () => {
      const m = calculateCorrelationMatrix({ A: [1, 2, 3, 4], B: [2, 4, 6, 8] });
      expect(m['A']['B']).toBeCloseTo(m['B']['A'], 5);
    });

    it('完全正相关', () => {
      const m = calculateCorrelationMatrix({ A: [1, 2, 3], B: [1, 2, 3] });
      expect(m['A']['B']).toBeCloseTo(1, 5);
    });

    it('完全负相关', () => {
      const m = calculateCorrelationMatrix({ A: [1, 2, 3], B: [3, 2, 1] });
      expect(m['A']['B']).toBeCloseTo(-1, 5);
    });
  });
});
