import { describe, it, expect } from 'vitest';

// ===== 板块轮动与动量分析测试 =====

interface SectorData {
  code: string;
  name: string;
  changePercent: number;
  volume: number;
  turnover: number;
  advanceCount: number;
  declineCount: number;
  limitUpCount: number;
  limitDownCount: number;
  netInflow: number;
}

function calculateMomentumScore(sector: SectorData): number {
  const priceScore = Math.min(100, Math.max(0, (sector.changePercent + 10) * 5));
  const breadthScore = sector.advanceCount + sector.declineCount > 0
    ? (sector.advanceCount / (sector.advanceCount + sector.declineCount)) * 100
    : 50;
  const limitScore = Math.min(100, sector.limitUpCount * 20 - sector.limitDownCount * 20 + 50);
  const flowScore = Math.min(100, Math.max(0, 50 + sector.netInflow / 1e8));
  return priceScore * 0.35 + breadthScore * 0.25 + limitScore * 0.2 + flowScore * 0.2;
}

function classifyRotationPhase(momentum: number, prevMomentum: number): string {
  if (momentum > 70 && momentum > prevMomentum) return '主升';
  if (momentum > 50 && momentum > prevMomentum) return '吸筹';
  if (momentum > 50 && momentum <= prevMomentum) return '派发';
  return '下跌';
}

function rankSectors(sectors: SectorData[]): Array<{ sector: SectorData; score: number; rank: number }> {
  const scored = sectors.map(s => ({ sector: s, score: calculateMomentumScore(s) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

function findLeadingStocks(sectors: SectorData[], topN: number = 3): SectorData[] {
  return rankSectors(sectors).slice(0, topN).map(r => r.sector);
}

function calculateSectorCorrelation(s1Changes: number[], s2Changes: number[]): number {
  if (s1Changes.length !== s2Changes.length || s1Changes.length < 2) return 0;
  const n = s1Changes.length;
  const mean1 = s1Changes.reduce((a, b) => a + b, 0) / n;
  const mean2 = s2Changes.reduce((a, b) => a + b, 0) / n;
  let cov = 0, var1 = 0, var2 = 0;
  for (let i = 0; i < n; i++) {
    cov += (s1Changes[i] - mean1) * (s2Changes[i] - mean2);
    var1 += (s1Changes[i] - mean1) ** 2;
    var2 += (s2Changes[i] - mean2) ** 2;
  }
  const denom = Math.sqrt(var1 * var2);
  return denom > 0 ? cov / denom : 0;
}

function calculateRotationSignal(sectors: SectorData[], prevSectorScores: Record<string, number>): Array<{ code: string; signal: string; strength: number }> {
  return sectors.map(s => {
    const currentScore = calculateMomentumScore(s);
    const prevScore = prevSectorScores[s.code] || 50;
    const diff = currentScore - prevScore;
    let signal = '持有';
    if (diff > 15) signal = '流入';
    else if (diff < -15) signal = '流出';
    return { code: s.code, signal, strength: Math.abs(diff) };
  });
}

describe('板块轮动与动量分析', () => {
  const sampleSectors: SectorData[] = [
    { code: 'BK001', name: '白酒', changePercent: 3.5, volume: 5e9, turnover: 2e9, advanceCount: 18, declineCount: 2, limitUpCount: 3, limitDownCount: 0, netInflow: 5e8 },
    { code: 'BK002', name: '新能源', changePercent: -1.2, volume: 8e9, turnover: 3e9, advanceCount: 5, declineCount: 15, limitUpCount: 0, limitDownCount: 2, netInflow: -3e8 },
    { code: 'BK003', name: '半导体', changePercent: 2.0, volume: 6e9, turnover: 2.5e9, advanceCount: 12, declineCount: 8, limitUpCount: 1, limitDownCount: 0, netInflow: 2e8 },
    { code: 'BK004', name: '银行', changePercent: 0.5, volume: 3e9, turnover: 1e9, advanceCount: 10, declineCount: 10, limitUpCount: 0, limitDownCount: 0, netInflow: 1e7 },
    { code: 'BK005', name: '医药', changePercent: -0.8, volume: 4e9, turnover: 1.5e9, advanceCount: 7, declineCount: 13, limitUpCount: 0, limitDownCount: 1, netInflow: -1e8 },
  ];

  describe('动量评分', () => {
    it('高涨幅+高涨停数得高分', () => {
      const strong = sampleSectors[0]; // 白酒
      const weak = sampleSectors[1]; // 新能源
      expect(calculateMomentumScore(strong)).toBeGreaterThan(calculateMomentumScore(weak));
    });

    it('评分范围0-100', () => {
      sampleSectors.forEach(s => {
        const score = calculateMomentumScore(s);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });

    it('涨停板提升分数', () => {
      const withLimit: SectorData = { ...sampleSectors[3], limitUpCount: 5, limitDownCount: 0 };
      const withoutLimit: SectorData = { ...sampleSectors[3], limitUpCount: 0, limitDownCount: 0 };
      expect(calculateMomentumScore(withLimit)).toBeGreaterThan(calculateMomentumScore(withoutLimit));
    });

    it('跌停板降低分数', () => {
      const withDown: SectorData = { ...sampleSectors[3], limitUpCount: 0, limitDownCount: 5 };
      const neutral: SectorData = { ...sampleSectors[3], limitUpCount: 0, limitDownCount: 0 };
      expect(calculateMomentumScore(withDown)).toBeLessThan(calculateMomentumScore(neutral));
    });

    it('资金流入提升分数', () => {
      const inflow: SectorData = { ...sampleSectors[3], netInflow: 1e9 };
      const outflow: SectorData = { ...sampleSectors[3], netInflow: -1e9 };
      expect(calculateMomentumScore(inflow)).toBeGreaterThan(calculateMomentumScore(outflow));
    });
  });

  describe('轮动阶段分类', () => {
    it('上升+加速=主升', () => {
      expect(classifyRotationPhase(80, 70)).toBe('主升');
    });

    it('50-70且上升=吸筹', () => {
      expect(classifyRotationPhase(60, 55)).toBe('吸筹');
    });

    it('>50且下降=派发', () => {
      expect(classifyRotationPhase(55, 60)).toBe('派发');
    });

    it('≤50=下跌', () => {
      expect(classifyRotationPhase(40, 60)).toBe('下跌');
      expect(classifyRotationPhase(50, 50)).toBe('下跌');
    });

    it('边界值70', () => {
      // classifyRotationPhase uses strict > 70 for 主升
      expect(classifyRotationPhase(70, 69)).toBe('吸筹'); // 70 is not > 70
      expect(classifyRotationPhase(70, 71)).toBe('派发');
      expect(classifyRotationPhase(71, 70)).toBe('主升'); // 71 > 70 ✓
    });
  });

  describe('板块排名', () => {
    it('按动量降序排列', () => {
      const ranked = rankSectors(sampleSectors);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
    });

    it('排名连续从1开始', () => {
      const ranked = rankSectors(sampleSectors);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[ranked.length - 1].rank).toBe(ranked.length);
    });

    it('白酒排名靠前', () => {
      const ranked = rankSectors(sampleSectors);
      expect(ranked[0].sector.code).toBe('BK001');
    });

    it('保留所有板块', () => {
      expect(rankSectors(sampleSectors)).toHaveLength(sampleSectors.length);
    });
  });

  describe('龙头板块', () => {
    it('返回指定数量', () => {
      expect(findLeadingStocks(sampleSectors, 3)).toHaveLength(3);
    });

    it('默认返回前3', () => {
      expect(findLeadingStocks(sampleSectors)).toHaveLength(3);
    });

    it('请求数量超过总数', () => {
      expect(findLeadingStocks(sampleSectors, 100)).toHaveLength(sampleSectors.length);
    });

    it('返回得分最高的', () => {
      const leading = findLeadingStocks(sampleSectors, 1);
      const ranked = rankSectors(sampleSectors);
      expect(leading[0].code).toBe(ranked[0].sector.code);
    });
  });

  describe('板块相关性', () => {
    it('完全正相关=1', () => {
      const a = [1, 2, 3, 4, 5];
      expect(calculateSectorCorrelation(a, a)).toBeCloseTo(1, 5);
    });

    it('完全负相关=-1', () => {
      const a = [1, 2, 3, 4, 5];
      const b = [5, 4, 3, 2, 1];
      expect(calculateSectorCorrelation(a, b)).toBeCloseTo(-1, 5);
    });

    it('数据不足返回0', () => {
      expect(calculateSectorCorrelation([1], [2])).toBe(0);
    });

    it('长度不匹配返回0', () => {
      expect(calculateSectorCorrelation([1, 2], [1, 2, 3])).toBe(0);
    });

    it('常量序列相关为0', () => {
      expect(calculateSectorCorrelation([1, 1, 1, 1], [2, 3, 4, 5])).toBe(0);
    });
  });

  describe('轮动信号', () => {
    it('动量大幅上升=流入', () => {
      const prev = { 'BK001': 40 };
      const signals = calculateRotationSignal([sampleSectors[0]], prev);
      expect(signals[0].signal).toBe('流入');
    });

    it('动量大幅下降=流出', () => {
      const prev = { 'BK002': 80 };
      const signals = calculateRotationSignal([sampleSectors[1]], prev);
      expect(signals[0].signal).toBe('流出');
    });

    it('小幅变化=持有', () => {
      const prev = { 'BK004': 52 };
      const signals = calculateRotationSignal([sampleSectors[3]], prev);
      expect(signals[0].signal).toBe('持有');
    });

    it('强度为正数', () => {
      const prev = { 'BK001': 50, 'BK002': 50 };
      const signals = calculateRotationSignal(sampleSectors.slice(0, 2), prev);
      signals.forEach(s => expect(s.strength).toBeGreaterThanOrEqual(0));
    });

    it('无历史数据使用默认50', () => {
      const signals = calculateRotationSignal([sampleSectors[0]], {});
      expect(signals[0].code).toBe('BK001');
    });
  });
});
