import { describe, it, expect } from 'vitest';

// 股东行为分析引擎
interface ShareholderChange {
  symbol: string;
  shareholderType: 'insider' | 'institution' | 'retail' | 'northbound';
  changePercent: number;
  currentHolding: number;
  previousHolding: number;
  date: string;
}

interface ShareholderBehavior {
  symbol: string;
  signal: 'accumulate' | 'distribute' | 'hold';
  strength: number;
  insiderSentiment: number;
  institutionalConfidence: number;
  northboundTrend: 'inflow' | 'outflow' | 'stable';
}

function analyzeShareholderBehavior(changes: ShareholderChange[]): ShareholderBehavior[] {
  const grouped = new Map<string, ShareholderChange[]>();
  changes.forEach(c => {
    if (!grouped.has(c.symbol)) grouped.set(c.symbol, []);
    grouped.get(c.symbol)!.push(c);
  });

  return Array.from(grouped.entries()).map(([symbol, chgs]) => {
    const insider = chgs.filter(c => c.shareholderType === 'insider');
    const institution = chgs.filter(c => c.shareholderType === 'institution');
    const northbound = chgs.filter(c => c.shareholderType === 'northbound');

    const insiderChange = insider.reduce((s, c) => s + c.changePercent, 0) / (insider.length || 1);
    const instChange = institution.reduce((s, c) => s + c.changePercent, 0) / (institution.length || 1);
    const nbChange = northbound.reduce((s, c) => s + c.changePercent, 0) / (northbound.length || 1);

    const totalChange = insiderChange * 0.3 + instChange * 0.5 + nbChange * 0.2;
    const signal = totalChange > 0.5 ? 'accumulate' : totalChange < -0.5 ? 'distribute' : 'hold';

    return {
      symbol,
      signal,
      strength: Math.min(1, Math.abs(totalChange) / 5),
      insiderSentiment: insiderChange,
      institutionalConfidence: instChange,
      northboundTrend: nbChange > 0.1 ? 'inflow' : nbChange < -0.1 ? 'outflow' : 'stable',
    };
  });
}

function detectUnusualActivity(changes: ShareholderChange[], threshold: number = 3): ShareholderChange[] {
  return changes.filter(c => Math.abs(c.changePercent) > threshold);
}

function calcConcentrationChange(changes: ShareholderChange[]): { symbol: string; moreConcentrated: boolean }[] {
  const grouped = new Map<string, ShareholderChange[]>();
  changes.forEach(c => {
    if (!grouped.has(c.symbol)) grouped.set(c.symbol, []);
    grouped.get(c.symbol)!.push(c);
  });

  return Array.from(grouped.entries()).map(([symbol, chgs]) => {
    const instTotal = chgs.filter(c => c.shareholderType === 'institution').reduce((s, c) => s + c.currentHolding, 0);
    const retailTotal = chgs.filter(c => c.shareholderType === 'retail').reduce((s, c) => s + c.currentHolding, 0);
    const prevInstTotal = chgs.filter(c => c.shareholderType === 'institution').reduce((s, c) => s + c.previousHolding, 0);
    const prevRetailTotal = chgs.filter(c => c.shareholderType === 'retail').reduce((s, c) => s + c.previousHolding, 0);
    const currentRatio = instTotal / (instTotal + retailTotal || 1);
    const prevRatio = prevInstTotal / (prevInstTotal + prevRetailTotal || 1);
    return { symbol, moreConcentrated: currentRatio > prevRatio };
  });
}

function rankByInstitutionalInterest(changes: ShareholderChange[]): string[] {
  const scores = new Map<string, number>();
  changes.filter(c => c.shareholderType === 'institution').forEach(c => {
    scores.set(c.symbol, (scores.get(c.symbol) || 0) + c.changePercent);
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
}

describe('股东行为分析引擎', () => {
  const changes: ShareholderChange[] = [
    { symbol: '600519', shareholderType: 'insider', changePercent: 1.5, currentHolding: 65, previousHolding: 63.5, date: '2024-03-01' },
    { symbol: '600519', shareholderType: 'institution', changePercent: 2.0, currentHolding: 25, previousHolding: 23, date: '2024-03-01' },
    { symbol: '600519', shareholderType: 'northbound', changePercent: 0.8, currentHolding: 8, previousHolding: 7.2, date: '2024-03-01' },
    { symbol: '000858', shareholderType: 'insider', changePercent: -2.0, currentHolding: 55, previousHolding: 57, date: '2024-03-01' },
    { symbol: '000858', shareholderType: 'institution', changePercent: -4.5, currentHolding: 20, previousHolding: 24.5, date: '2024-03-01' },
    { symbol: '300750', shareholderType: 'institution', changePercent: 5.0, currentHolding: 40, previousHolding: 35, date: '2024-03-01' },
    { symbol: '600519', shareholderType: 'retail', changePercent: -0.5, currentHolding: 2, previousHolding: 2.5, date: '2024-03-01' },
  ];

  it('应分析股东行为', () => {
    const behaviors = analyzeShareholderBehavior(changes);
    expect(behaviors.length).toBe(3);
    behaviors.forEach(b => {
      expect(['accumulate', 'distribute', 'hold']).toContain(b.signal);
      expect(b.strength).toBeGreaterThanOrEqual(0);
      expect(b.strength).toBeLessThanOrEqual(1);
    });
  });

  it('增持信号应对应增持行为', () => {
    const behaviors = analyzeShareholderBehavior(changes);
    const moutai = behaviors.find(b => b.symbol === '600519');
    expect(moutai?.signal).toBe('accumulate');
  });

  it('减持信号应对应减持行为', () => {
    const behaviors = analyzeShareholderBehavior(changes);
    const wuliangye = behaviors.find(b => b.symbol === '000858');
    expect(wuliangye?.signal).toBe('distribute');
  });

  it('应检测异常变动', () => {
    const unusual = detectUnusualActivity(changes, 3);
    unusual.forEach(c => {
      expect(Math.abs(c.changePercent)).toBeGreaterThan(3);
    });
  });

  it('应计算集中度变化', () => {
    const conc = calcConcentrationChange(changes);
    conc.forEach(c => {
      expect(typeof c.moreConcentrated).toBe('boolean');
    });
  });

  it('应按机构兴趣排名', () => {
    const ranked = rankByInstitutionalInterest(changes);
    expect(ranked.length).toBeGreaterThan(0);
    // 300750的机构增持最多
    expect(ranked[0]).toBe('300750');
  });

  it('北向资金趋势应正确', () => {
    const behaviors = analyzeShareholderBehavior(changes);
    const moutai = behaviors.find(b => b.symbol === '600519');
    expect(moutai?.northboundTrend).toBe('inflow');
  });

  it('空数据应返回空', () => {
    expect(analyzeShareholderBehavior([])).toEqual([]);
  });

  it('单股东类型应能分析', () => {
    const single: ShareholderChange[] = [
      { symbol: 'A', shareholderType: 'insider', changePercent: 2, currentHolding: 10, previousHolding: 8, date: '2024-01-01' },
    ];
    const behaviors = analyzeShareholderBehavior(single);
    expect(behaviors.length).toBe(1);
    expect(behaviors[0].insiderSentiment).toBe(2);
  });

  it('内部人增持应为正面信号', () => {
    const behaviors = analyzeShareholderBehavior(changes);
    const moutai = behaviors.find(b => b.symbol === '600519');
    expect(moutai!.insiderSentiment).toBeGreaterThan(0);
  });
});
