import { describe, it, expect } from 'vitest';

/**
 * ETF持仓变动跟踪引擎测试
 */

interface ETFHolding {
  stockCode: string;
  stockName: string;
  shares: number;
  marketValue: number;
  weight: number;
  changeFromPrev: number;
}

interface ETFHoldingSnapshot {
  etfCode: string;
  etfName: string;
  date: string;
  totalValue: number;
  holdings: ETFHolding[];
}

interface HoldingChange {
  stockCode: string;
  changeType: 'new' | 'removed' | 'increase' | 'decrease';
  prevWeight: number;
  currWeight: number;
  weightChange: number;
}

function detectHoldingChanges(prev: ETFHoldingSnapshot, curr: ETFHoldingSnapshot): HoldingChange[] {
  const prevMap = new Map(prev.holdings.map(h => [h.stockCode, h]));
  const currMap = new Map(curr.holdings.map(h => [h.stockCode, h]));
  const changes: HoldingChange[] = [];
  for (const [code, currHolding] of currMap) {
    const prevHolding = prevMap.get(code);
    if (!prevHolding) {
      changes.push({ stockCode: code, changeType: 'new', prevWeight: 0, currWeight: currHolding.weight, weightChange: currHolding.weight });
    } else {
      const wc = currHolding.weight - prevHolding.weight;
      if (Math.abs(wc) > 0.001) {
        changes.push({ stockCode: code, changeType: wc > 0 ? 'increase' : 'decrease', prevWeight: prevHolding.weight, currWeight: currHolding.weight, weightChange: wc });
      }
    }
  }
  for (const [code, prevHolding] of prevMap) {
    if (!currMap.has(code)) {
      changes.push({ stockCode: code, changeType: 'removed', prevWeight: prevHolding.weight, currWeight: 0, weightChange: -prevHolding.weight });
    }
  }
  return changes;
}

function calculateConcentration(holdings: ETFHolding[]): { top5Weight: number; top10Weight: number; hhi: number; effectiveN: number } {
  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  const top5Weight = sorted.slice(0, 5).reduce((s, h) => s + h.weight, 0);
  const top10Weight = sorted.slice(0, 10).reduce((s, h) => s + h.weight, 0);
  const hhi = holdings.reduce((s, h) => s + h.weight ** 2, 0);
  const effectiveN = hhi > 0 ? 1 / hhi : holdings.length;
  return { top5Weight: parseFloat(top5Weight.toFixed(4)), top10Weight: parseFloat(top10Weight.toFixed(4)), hhi: parseFloat(hhi.toFixed(6)), effectiveN: parseFloat(effectiveN.toFixed(2)) };
}

describe('ETF持仓变动跟踪引擎', () => {
  const makeSnapshot = (holdings: ETFHolding[], date = '2024-03-31'): ETFHoldingSnapshot => ({
    etfCode: '510300', etfName: '沪深300ETF', date,
    totalValue: holdings.reduce((s, h) => s + h.marketValue, 0),
    holdings,
  });

  describe('detectHoldingChanges', () => {
    it('should detect new holdings', () => {
      const prev = makeSnapshot([]);
      const curr = makeSnapshot([{ stockCode: '600519', stockName: '茅台', shares: 100, marketValue: 180000, weight: 0.05, changeFromPrev: 0 }]);
      const changes = detectHoldingChanges(prev, curr);
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe('new');
    });

    it('should detect removed holdings', () => {
      const prev = makeSnapshot([{ stockCode: '600519', stockName: '茅台', shares: 100, marketValue: 180000, weight: 0.05, changeFromPrev: 0 }]);
      const curr = makeSnapshot([]);
      const changes = detectHoldingChanges(prev, curr);
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe('removed');
    });

    it('should detect weight increases', () => {
      const prev = makeSnapshot([{ stockCode: '600519', stockName: '茅台', shares: 100, marketValue: 180000, weight: 0.05, changeFromPrev: 0 }]);
      const curr = makeSnapshot([{ stockCode: '600519', stockName: '茅台', shares: 200, marketValue: 360000, weight: 0.08, changeFromPrev: 0 }]);
      const changes = detectHoldingChanges(prev, curr);
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe('increase');
    });

    it('should return empty for identical holdings', () => {
      const h = [{ stockCode: '600519', stockName: '茅台', shares: 100, marketValue: 180000, weight: 0.05, changeFromPrev: 0 }];
      expect(detectHoldingChanges(makeSnapshot(h), makeSnapshot(h))).toHaveLength(0);
    });
  });

  describe('calculateConcentration', () => {
    it('should calculate top N weights', () => {
      const holdings: ETFHolding[] = Array.from({ length: 10 }, (_, i) => ({
        stockCode: `${i}`, stockName: `S${i}`, shares: 100, marketValue: 100000,
        weight: 0.1 - i * 0.005, changeFromPrev: 0,
      }));
      const conc = calculateConcentration(holdings);
      expect(conc.top5Weight).toBeGreaterThan(conc.top10Weight * 0.4);
      expect(conc.hhi).toBeGreaterThan(0);
      expect(conc.effectiveN).toBeGreaterThan(0);
    });

    it('equal weight should have max diversification', () => {
      const holdings: ETFHolding[] = Array.from({ length: 100 }, (_, i) => ({
        stockCode: `${i}`, stockName: `S${i}`, shares: 100, marketValue: 10000,
        weight: 0.01, changeFromPrev: 0,
      }));
      const conc = calculateConcentration(holdings);
      expect(conc.effectiveN).toBeCloseTo(100, 0);
    });

    it('single holding should have max concentration', () => {
      const holdings = [{ stockCode: '600519', stockName: '茅台', shares: 100, marketValue: 180000, weight: 1, changeFromPrev: 0 }];
      const conc = calculateConcentration(holdings);
      expect(conc.top5Weight).toBe(1);
      expect(conc.effectiveN).toBeCloseTo(1, 1);
    });
  });
});
