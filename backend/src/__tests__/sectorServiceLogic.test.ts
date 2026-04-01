import { describe, it, expect } from 'vitest';

/**
 * 板块服务逻辑测试
 * 行业分类/板块轮动/行业评分
 */

interface SectorStock {
  code: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  marketCap: number;
}

interface SectorSummary {
  sector: string;
  stockCount: number;
  avgChange: number;
  topGainer: { code: string; change: number };
  topLoser: { code: string; change: number };
  totalTurnover: number;
  advanceCount: number;
  declineCount: number;
  advanceRatio: number;
  momentum: number;
}

function summarizeSector(name: string, stocks: SectorStock[]): SectorSummary {
  const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
  const avgChange = stocks.reduce((s, st) => s + st.changePercent, 0) / Math.max(1, stocks.length);
  const advance = stocks.filter(s => s.changePercent > 0).length;
  const decline = stocks.filter(s => s.changePercent < 0).length;
  const totalTurnover = stocks.reduce((s, st) => s + st.turnover, 0);
  const momentum = avgChange * (advance / Math.max(1, stocks.length)) * 100;
  return {
    sector: name,
    stockCount: stocks.length,
    avgChange: parseFloat(avgChange.toFixed(4)),
    topGainer: sorted.length > 0 ? { code: sorted[0].code, change: sorted[0].changePercent } : { code: '', change: 0 },
    topLoser: sorted.length > 0 ? { code: sorted[sorted.length - 1].code, change: sorted[sorted.length - 1].changePercent } : { code: '', change: 0 },
    totalTurnover,
    advanceCount: advance,
    declineCount: decline,
    advanceRatio: parseFloat((advance / Math.max(1, stocks.length)).toFixed(4)),
    momentum: parseFloat(momentum.toFixed(4)),
  };
}

function rankSectors(sectors: SectorSummary[]): SectorSummary[] {
  return [...sectors].sort((a, b) => b.momentum - a.momentum);
}

function calculateSectorRotation(current: SectorSummary[], previous: SectorSummary[]): Array<{ sector: string; rankChange: number; momentumChange: number }> {
  const prevMap = new Map(previous.map((s, i) => [s.sector, { rank: i, momentum: s.momentum }]));
  return current.map((s, i) => {
    const prev = prevMap.get(s.sector);
    return {
      sector: s.sector,
      rankChange: prev ? prev.rank - i : 0,
      momentumChange: prev ? s.momentum - prev.momentum : s.momentum,
    };
  });
}

describe('板块服务逻辑', () => {
  const makeStock = (code: string, changePercent: number, sector = '科技'): SectorStock => ({
    code, name: `Stock${code}`, sector, price: 10, change: changePercent * 0.1,
    changePercent, volume: 1000000, turnover: 10000000, marketCap: 100000000,
  });

  describe('summarizeSector', () => {
    it('should calculate sector metrics', () => {
      const stocks = [makeStock('001', 5), makeStock('002', -2), makeStock('003', 3)];
      const summary = summarizeSector('科技', stocks);
      expect(summary.stockCount).toBe(3);
      expect(summary.advanceCount).toBe(2);
      expect(summary.declineCount).toBe(1);
      expect(summary.topGainer.code).toBe('001');
      expect(summary.topLoser.code).toBe('002');
    });

    it('should handle empty sector', () => {
      const summary = summarizeSector('Empty', []);
      expect(summary.stockCount).toBe(0);
      expect(summary.avgChange).toBe(0);
    });

    it('advanceRatio should be 0-1', () => {
      const stocks = [makeStock('001', 5), makeStock('002', 3)];
      const summary = summarizeSector('Bull', stocks);
      expect(summary.advanceRatio).toBe(1);
    });
  });

  describe('rankSectors', () => {
    it('should sort by momentum descending', () => {
      const sectors = [
        summarizeSector('A', [makeStock('1', 2)]),
        summarizeSector('B', [makeStock('2', 5)]),
        summarizeSector('C', [makeStock('3', -1)]),
      ];
      const ranked = rankSectors(sectors);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].momentum).toBeLessThanOrEqual(ranked[i-1].momentum);
      }
    });
  });

  describe('calculateSectorRotation', () => {
    it('should detect rank changes', () => {
      const prev = [
        summarizeSector('A', [makeStock('1', 5)]),
        summarizeSector('B', [makeStock('2', 2)]),
      ];
      const curr = [
        summarizeSector('B', [makeStock('2', 8)]),
        summarizeSector('A', [makeStock('1', 1)]),
      ];
      const rotation = calculateSectorRotation(rankSectors(curr), rankSectors(prev));
      expect(rotation.some(r => r.rankChange !== 0)).toBe(true);
    });
  });
});
