import { describe, it, expect } from 'vitest';

// 除权除息引擎
interface DividendInfo {
  exDate: string;
  cashDividend: number;  // 每股派息
  stockDividend: number; // 每股送股
  stockSplit: number;    // 拆股比例
}

interface CorporateAction {
  type: 'dividend' | 'split' | 'rights' | 'buyback';
  date: string;
  details: Record<string, number>;
}

function adjustForExRights(price: number, dividend: DividendInfo): number {
  const adjCash = dividend.cashDividend;
  const adjStock = dividend.stockDividend;
  const splitRatio = dividend.stockSplit || 1;
  return (price - adjCash) / (1 + adjStock) * splitRatio;
}

function calcDividendYield(cashDividend: number, currentPrice: number): number {
  if (currentPrice <= 0) return 0;
  return (cashDividend / currentPrice) * 100;
}

function parseCorporateActions(raw: string): CorporateAction[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(a =>
      a && typeof a.type === 'string' && typeof a.date === 'string'
    );
  } catch {
    return [];
  }
}

function calcCumDividendPrice(exPrice: number, dividend: DividendInfo): number {
  return exPrice * (1 + dividend.stockDividend) + dividend.cashDividend;
}

function aggregateDividends(dividends: DividendInfo[]): { totalCash: number; totalStock: number; count: number } {
  return dividends.reduce((acc, d) => ({
    totalCash: acc.totalCash + d.cashDividend,
    totalStock: acc.totalStock + d.stockDividend,
    count: acc.count + 1,
  }), { totalCash: 0, totalStock: 0, count: 0 });
}

function filterActionsByDateRange(actions: CorporateAction[], start: string, end: string): CorporateAction[] {
  return actions.filter(a => a.date >= start && a.date <= end);
}

function calcRightsIssuePrice(subscriptionPrice: number, ratioNew: number, ratioOld: number, marketPrice: number): number {
  if (ratioNew + ratioOld === 0) return 0;
  return (marketPrice * ratioOld + subscriptionPrice * ratioNew) / (ratioNew + ratioOld);
}

function calcBuybackImpact( sharesRepurchased: number, totalShares: number, avgPrice: number): { newShares: number; epsImpact: number } {
  if (totalShares <= 0) return { newShares: 0, epsImpact: 0 };
  const newTotal = totalShares - sharesRepurchased;
  const epsImpact = totalShares / newTotal - 1;
  return { newShares: newTotal, epsImpact };
}

describe('除权除息与公司行为引擎', () => {
  describe('除权除息计算', () => {
    it('应正确计算除权除息价（仅派息）', () => {
      expect(adjustForExRights(10, { exDate: '2026-03-01', cashDividend: 0.5, stockDividend: 0, stockSplit: 1 })).toBe(9.5);
    });

    it('应正确计算除权除息价（仅送股）', () => {
      expect(adjustForExRights(10, { exDate: '2026-03-01', cashDividend: 0, stockDividend: 0.5, stockSplit: 1 })).toBeCloseTo(6.667, 2);
    });

    it('应正确计算除权除息价（派息+送股）', () => {
      const result = adjustForExRights(10, { exDate: '2026-03-01', cashDividend: 1, stockDividend: 0.2, stockSplit: 1 });
      expect(result).toBeCloseTo(7.5, 2);
    });

    it('应正确计算拆股后价格', () => {
      expect(adjustForExRights(200, { exDate: '2026-03-01', cashDividend: 0, stockDividend: 0, stockSplit: 2 })).toBe(400);
    });
  });

  describe('股息率', () => {
    it('应正确计算股息率', () => {
      expect(calcDividendYield(2, 50)).toBe(4);
    });

    it('价格为零应返回0', () => {
      expect(calcDividendYield(2, 0)).toBe(0);
    });

    it('负价格应返回0', () => {
      expect(calcDividendYield(2, -10)).toBe(0);
    });
  });

  describe('公司行为解析', () => {
    it('应解析有效JSON', () => {
      const raw = JSON.stringify([{ type: 'dividend', date: '2026-03-01', details: { amount: 0.5 } }]);
      const result = parseCorporateActions(raw);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('dividend');
    });

    it('无效JSON应返回空数组', () => {
      expect(parseCorporateActions('not json')).toEqual([]);
    });

    it('非数组JSON应返回空数组', () => {
      expect(parseCorporateActions('{"type":"dividend"}')).toEqual([]);
    });

    it('应过滤无效条目', () => {
      const raw = JSON.stringify([{ type: 'dividend', date: '2026-03-01', details: {} }, { invalid: true }]);
      expect(parseCorporateActions(raw).length).toBe(1);
    });
  });

  describe('复权价格计算', () => {
    it('应从除权价恢复除权前价格', () => {
      const exPrice = 9.5;
      const result = calcCumDividendPrice(exPrice, { exDate: '2026-03-01', cashDividend: 0.5, stockDividend: 0, stockSplit: 1 });
      expect(result).toBe(10);
    });
  });

  describe('分红汇总', () => {
    it('应汇总多次分红', () => {
      const divs = [
        { exDate: '2025-06-01', cashDividend: 0.5, stockDividend: 0, stockSplit: 1 },
        { exDate: '2025-12-01', cashDividend: 0.3, stockDividend: 0.1, stockSplit: 1 },
      ];
      const result = aggregateDividends(divs);
      expect(result.totalCash).toBe(0.8);
      expect(result.totalStock).toBe(0.1);
      expect(result.count).toBe(2);
    });

    it('空数组应返回零值', () => {
      expect(aggregateDividends([])).toEqual({ totalCash: 0, totalStock: 0, count: 0 });
    });
  });

  describe('公司行为日期过滤', () => {
    it('应按日期范围过滤', () => {
      const actions: CorporateAction[] = [
        { type: 'dividend', date: '2026-01-15', details: {} },
        { type: 'split', date: '2026-03-15', details: {} },
        { type: 'buyback', date: '2026-06-01', details: {} },
      ];
      expect(filterActionsByDateRange(actions, '2026-01-01', '2026-04-01').length).toBe(2);
    });
  });

  describe('配股价格计算', () => {
    it('应正确计算配股后理论价', () => {
      const result = calcRightsIssuePrice(8, 3, 10, 10);
      expect(result).toBeCloseTo(9.538, 2);
    });

    it('比例为零应返回0', () => {
      expect(calcRightsIssuePrice(8, 0, 0, 10)).toBe(0);
    });
  });

  describe('回购影响', () => {
    it('应计算回购对EPS的影响', () => {
      const result = calcBuybackImpact(1000, 10000, 50);
      expect(result.newShares).toBe(9000);
      expect(result.epsImpact).toBeCloseTo(0.111, 2);
    });

    it('总股本为零应返回零值', () => {
      expect(calcBuybackImpact(1000, 0, 50)).toEqual({ newShares: 0, epsImpact: 0 });
    });
  });
});
