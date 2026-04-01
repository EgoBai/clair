import { describe, it, expect } from 'vitest';

// 板块轮动信号引擎
interface SectorRotation {
  sector: string;
  momentum1M: number;
  momentum3M: number;
  momentum6M: number;
  relativeStrength: number;
  fundFlow: number;
  valuation: number;
  earningsRevision: number;
}

interface RotationSignal {
  sector: string;
  signal: 'overweight' | 'underweight' | 'neutral';
  compositeScore: number;
  phase: 'early' | 'mid' | 'late' | 'declining';
  entryTiming: number; // 0-1
}

function calcCompositeScore(s: SectorRotation): number {
  return (
    s.momentum1M * 0.15 +
    s.momentum3M * 0.25 +
    s.momentum6M * 0.15 +
    s.relativeStrength * 0.15 +
    s.fundFlow * 0.1 +
    (1 - s.valuation) * 0.1 +
    s.earningsRevision * 0.1
  );
}

function determinePhase(s: SectorRotation): RotationSignal['phase'] {
  if (s.momentum3M > 0.1 && s.momentum1M > s.momentum3M) return 'early';
  if (s.momentum3M > 0.05 && s.momentum6M > 0) return 'mid';
  if (s.momentum6M > 0 && s.momentum1M < s.momentum3M) return 'late';
  return 'declining';
}

function generateRotationSignals(sectors: SectorRotation[]): RotationSignal[] {
  const scored = sectors.map(s => ({
    sector: s.sector,
    compositeScore: calcCompositeScore(s),
    phase: determinePhase(s),
    entryTiming: s.momentum1M > 0 ? Math.min(1, s.momentum1M * 5) : 0,
  }));

  const avg = scored.reduce((sum, s) => sum + s.compositeScore, 0) / scored.length;

  return scored.map(s => ({
    ...s,
    signal: s.compositeScore > avg * 1.2 ? 'overweight' :
      s.compositeScore < avg * 0.8 ? 'underweight' : 'neutral',
  })).sort((a, b) => b.compositeScore - a.compositeScore);
}

function findRotationPairs(signals: RotationSignal[]): { long: string; short: string }[] {
  const overweight = signals.filter(s => s.signal === 'overweight');
  const underweight = signals.filter(s => s.signal === 'underweight');
  const pairs: { long: string; short: string }[] = [];
  overweight.slice(0, 3).forEach(long => {
    underweight.slice(0, 3).forEach(short => {
      pairs.push({ long: long.sector, short: short.sector });
    });
  });
  return pairs.slice(0, 5);
}

describe('板块轮动信号引擎', () => {
  const sectors: SectorRotation[] = [
    { sector: '新能源', momentum1M: 0.08, momentum3M: 0.15, momentum6M: 0.2, relativeStrength: 0.8, fundFlow: 0.7, valuation: 0.8, earningsRevision: 0.6 },
    { sector: '消费', momentum1M: 0.02, momentum3M: 0.05, momentum6M: 0.08, relativeStrength: 0.5, fundFlow: 0.4, valuation: 0.5, earningsRevision: 0.3 },
    { sector: '地产', momentum1M: -0.05, momentum3M: -0.1, momentum6M: -0.15, relativeStrength: -0.3, fundFlow: -0.5, valuation: 0.3, earningsRevision: -0.4 },
    { sector: '金融', momentum1M: 0.01, momentum3M: 0.03, momentum6M: 0.05, relativeStrength: 0.2, fundFlow: 0.1, valuation: 0.2, earningsRevision: 0.1 },
    { sector: '医药', momentum1M: 0.04, momentum3M: 0.08, momentum6M: 0.12, relativeStrength: 0.6, fundFlow: 0.5, valuation: 0.6, earningsRevision: 0.4 },
  ];

  it('应计算综合得分', () => {
    const score = calcCompositeScore(sectors[0]);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);
  });

  it('应判断板块阶段', () => {
    const earlySector: SectorRotation = { ...sectors[0], momentum1M: 0.2, momentum3M: 0.12 };
    expect(determinePhase(earlySector)).toBe('early');
    expect(determinePhase(sectors[0])).toBe('mid');
    expect(determinePhase(sectors[2])).toBe('declining');
  });

  it('应生成轮动信号', () => {
    const signals = generateRotationSignals(sectors);
    expect(signals.length).toBe(sectors.length);
    signals.forEach(s => {
      expect(['overweight', 'underweight', 'neutral']).toContain(s.signal);
      expect(['early', 'mid', 'late', 'declining']).toContain(s.phase);
    });
  });

  it('新能源应排前列', () => {
    const signals = generateRotationSignals(sectors);
    expect(signals[0].sector).toBe('新能源');
  });

  it('地产应排末位', () => {
    const signals = generateRotationSignals(sectors);
    expect(signals[signals.length - 1].sector).toBe('地产');
  });

  it('应找出轮动对', () => {
    const signals = generateRotationSignals(sectors);
    const pairs = findRotationPairs(signals);
    pairs.forEach(p => {
      expect(p.long).toBeTruthy();
      expect(p.short).toBeTruthy();
      expect(p.long).not.toBe(p.short);
    });
  });

  it('空数据应返回空', () => {
    expect(generateRotationSignals([])).toEqual([]);
  });

  it('信号应按得分排序', () => {
    const signals = generateRotationSignals(sectors);
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i - 1].compositeScore).toBeGreaterThanOrEqual(signals[i].compositeScore);
    }
  });

  it('入场时机应在0-1之间', () => {
    const signals = generateRotationSignals(sectors);
    signals.forEach(s => {
      expect(s.entryTiming).toBeGreaterThanOrEqual(0);
      expect(s.entryTiming).toBeLessThanOrEqual(1);
    });
  });

  it('单板块应能分析', () => {
    const signals = generateRotationSignals([sectors[0]]);
    expect(signals.length).toBe(1);
    expect(signals[0].signal).toBe('neutral'); // 单个=平均
  });
});
