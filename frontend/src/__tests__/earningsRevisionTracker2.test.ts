import { describe, it, expect } from 'vitest';

// 盈利预期修正引擎
interface EarningsEstimate {
  symbol: string;
  analyst: string;
  epsEstimate: number;
  revenueEstimate: number;
  rating: 'buy' | 'hold' | 'sell';
  targetPrice: number;
  date: string;
}

interface EstimateRevision {
  symbol: string;
  epsRevision: number; // 新预估/旧预估 - 1
  revenueRevision: number;
  upCount: number;
  downCount: number;
  consensusChange: number;
  revisionMomentum: 'positive' | 'negative' | 'stable';
  surpriseEstimate: number;
}

function calcEstimateRevision(current: EarningsEstimate[], previous: EarningsEstimate[]): EstimateRevision[] {
  const grouped = new Map<string, { cur: EarningsEstimate[]; prev: EarningsEstimate[] }>();
  current.forEach(e => {
    if (!grouped.has(e.symbol)) grouped.set(e.symbol, { cur: [], prev: [] });
    grouped.get(e.symbol)!.cur.push(e);
  });
  previous.forEach(e => {
    if (!grouped.has(e.symbol)) grouped.set(e.symbol, { cur: [], prev: [] });
    grouped.get(e.symbol)!.prev.push(e);
  });

  return Array.from(grouped.entries()).map(([symbol, { cur, prev }]) => {
    const avgCurEPS = cur.reduce((s, e) => s + e.epsEstimate, 0) / (cur.length || 1);
    const avgPrevEPS = prev.reduce((s, e) => s + e.epsEstimate, 0) / (prev.length || 1);
    const avgCurRev = cur.reduce((s, e) => s + e.revenueEstimate, 0) / (cur.length || 1);
    const avgPrevRev = prev.reduce((s, e) => s + e.revenueEstimate, 0) / (prev.length || 1);

    const epsRevision = avgPrevEPS > 0 ? (avgCurEPS - avgPrevEPS) / avgPrevEPS : 0;
    const revenueRevision = avgPrevRev > 0 ? (avgCurRev - avgPrevRev) / avgPrevRev : 0;

    const upCount = cur.filter(c => {
      const p = prev.find(p => p.analyst === c.analyst);
      return p && c.epsEstimate > p.epsEstimate;
    }).length;
    const downCount = cur.filter(c => {
      const p = prev.find(p => p.analyst === c.analyst);
      return p && c.epsEstimate < p.epsEstimate;
    }).length;

    const momentum = upCount > downCount ? 'positive' : downCount > upCount ? 'negative' : 'stable';

    return {
      symbol,
      epsRevision,
      revenueRevision,
      upCount,
      downCount,
      consensusChange: epsRevision,
      revisionMomentum: momentum,
      surpriseEstimate: epsRevision > 0.05 ? 0.03 : epsRevision < -0.05 ? -0.03 : 0,
    };
  });
}

function rankByRevision(revisions: EstimateRevision[]): EstimateRevision[] {
  return [...revisions].sort((a, b) => b.consensusChange - a.consensusChange);
}

function findUpgradeCandidates(revisions: EstimateRevision[]): EstimateRevision[] {
  return revisions.filter(r =>
    r.revisionMomentum === 'positive' &&
    r.epsRevision > 0.05 &&
    r.upCount > r.downCount
  );
}

describe('盈利预期修正引擎', () => {
  const prevEstimates: EarningsEstimate[] = [
    { symbol: '600519', analyst: '中信', epsEstimate: 50, revenueEstimate: 1200, rating: 'buy', targetPrice: 2000, date: '2024-01-01' },
    { symbol: '600519', analyst: '海通', epsEstimate: 48, revenueEstimate: 1180, rating: 'hold', targetPrice: 1900, date: '2024-01-01' },
    { symbol: '000858', analyst: '中信', epsEstimate: 6, revenueEstimate: 800, rating: 'hold', targetPrice: 180, date: '2024-01-01' },
  ];

  const curEstimates: EarningsEstimate[] = [
    { symbol: '600519', analyst: '中信', epsEstimate: 55, revenueEstimate: 1300, rating: 'buy', targetPrice: 2200, date: '2024-03-01' },
    { symbol: '600519', analyst: '海通', epsEstimate: 52, revenueEstimate: 1250, rating: 'buy', targetPrice: 2100, date: '2024-03-01' },
    { symbol: '000858', analyst: '中信', epsEstimate: 5.5, revenueEstimate: 780, rating: 'sell', targetPrice: 150, date: '2024-03-01' },
  ];

  it('应计算预期修正', () => {
    const revisions = calcEstimateRevision(curEstimates, prevEstimates);
    expect(revisions.length).toBe(2);
    revisions.forEach(r => {
      expect(typeof r.epsRevision).toBe('number');
      expect(['positive', 'negative', 'stable']).toContain(r.revisionMomentum);
    });
  });

  it('上调应为正修正', () => {
    const revisions = calcEstimateRevision(curEstimates, prevEstimates);
    const moutai = revisions.find(r => r.symbol === '600519');
    expect(moutai?.epsRevision).toBeGreaterThan(0);
    expect(moutai?.revisionMomentum).toBe('positive');
  });

  it('下调应为负修正', () => {
    const revisions = calcEstimateRevision(curEstimates, prevEstimates);
    const wuliangye = revisions.find(r => r.symbol === '000858');
    expect(wuliangye?.epsRevision).toBeLessThan(0);
    expect(wuliangye?.revisionMomentum).toBe('negative');
  });

  it('应排名修正', () => {
    const revisions = calcEstimateRevision(curEstimates, prevEstimates);
    const ranked = rankByRevision(revisions);
    expect(ranked[0].consensusChange).toBeGreaterThanOrEqual(ranked[ranked.length - 1].consensusChange);
  });

  it('应找出升级候选', () => {
    const revisions = calcEstimateRevision(curEstimates, prevEstimates);
    const candidates = findUpgradeCandidates(revisions);
    candidates.forEach(c => {
      expect(c.revisionMomentum).toBe('positive');
      expect(c.epsRevision).toBeGreaterThan(0.05);
    });
  });

  it('上调数量应正确', () => {
    const revisions = calcEstimateRevision(curEstimates, prevEstimates);
    const moutai = revisions.find(r => r.symbol === '600519');
    expect(moutai?.upCount).toBe(2);
  });

  it('空数据应返回空', () => {
    expect(calcEstimateRevision([], [])).toEqual([]);
  });

  it('仅当前数据应能计算', () => {
    const revisions = calcEstimateRevision(curEstimates, []);
    expect(revisions.length).toBe(2);
  });

  it('收入修正应计算', () => {
    const revisions = calcEstimateRevision(curEstimates, prevEstimates);
    const moutai = revisions.find(r => r.symbol === '600519');
    expect(moutai?.revenueRevision).toBeGreaterThan(0);
  });

  it('修正应一致', () => {
    const r1 = calcEstimateRevision(curEstimates, prevEstimates);
    const r2 = calcEstimateRevision(curEstimates, prevEstimates);
    expect(r1[0].epsRevision).toBe(r2[0].epsRevision);
  });
});
