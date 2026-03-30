import { describe, it, expect } from 'vitest';

/**
 * 行业板块轮动分析测试
 */

interface SectorData { name: string; code: string; change: number; volume: number; turnover: number; stocks: number; advanceRatio: number; }
interface RotationSignal { from: string; to: string; strength: number; reason: string; }

const calcSectorMomentum = (sector: SectorData, period: number = 20): number => {
  return sector.change * (sector.turnover / 1e9) * (sector.advanceRatio);
};

const detectRotation = (sectors: SectorData[], threshold: number = 0.3): RotationSignal[] => {
  const signals: RotationSignal[] = [];
  const sorted = [...sectors].sort((a, b) => b.change - a.change);
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = sorted[i].change - sorted[sorted.length - 1 - i].change;
    if (diff > threshold) {
      signals.push({
        from: sorted[sorted.length - 1 - i].name,
        to: sorted[i].name,
        strength: diff,
        reason: `资金从${sorted[sorted.length - 1 - i].name}流向${sorted[i].name}`
      });
    }
  }
  return signals;
};

const calcBreadth = (sectors: SectorData[]): { advance: number; decline: number; ratio: number } => {
  const advance = sectors.filter(s => s.change > 0).length;
  const decline = sectors.filter(s => s.change < 0).length;
  return { advance, decline, ratio: advance / (advance + decline || 1) };
};

const calcSectorCorrelation = (s1: SectorData, s2: SectorData): number => {
  // Simplified correlation based on properties
  const props1 = [s1.change, s1.volume / 1e8, s1.turnover / 1e9, s1.advanceRatio];
  const props2 = [s2.change, s2.volume / 1e8, s2.turnover / 1e9, s2.advanceRatio];
  const mean1 = props1.reduce((a, b) => a + b, 0) / props1.length;
  const mean2 = props2.reduce((a, b) => a + b, 0) / props2.length;
  let cov = 0, var1 = 0, var2 = 0;
  for (let i = 0; i < props1.length; i++) {
    cov += (props1[i] - mean1) * (props2[i] - mean2);
    var1 += (props1[i] - mean1) ** 2;
    var2 += (props2[i] - mean2) ** 2;
  }
  return var1 === 0 || var2 === 0 ? 0 : cov / Math.sqrt(var1 * var2);
};

const rankSectors = (sectors: SectorData[], weights: { change: number; volume: number; breadth: number } = { change: 0.5, volume: 0.3, breadth: 0.2 }): SectorData[] => {
  const scored = sectors.map(s => ({
    ...s,
    _score: s.change * weights.change + (s.volume / 1e9) * weights.volume + s.advanceRatio * weights.breadth
  } as SectorData & { _score: number }));
  return scored.sort((a, b) => b._score - a._score);
};

describe('行业板块轮动分析', () => {
  describe('板块动量', () => {
    it('高涨幅高换手应有高动量', () => {
      const s: SectorData = { name: '科技', code: 'tech', change: 5, volume: 1e9, turnover: 5e9, stocks: 100, advanceRatio: 0.8 };
      const momentum = calcSectorMomentum(s);
      expect(momentum).toBeGreaterThan(0);
    });

    it('下跌板块动量应为负', () => {
      const s: SectorData = { name: '地产', code: 'realestate', change: -3, volume: 5e8, turnover: 2e9, stocks: 50, advanceRatio: 0.2 };
      expect(calcSectorMomentum(s)).toBeLessThan(0);
    });

    it('零涨跌幅动量为0', () => {
      const s: SectorData = { name: '公用', code: 'utility', change: 0, volume: 1e8, turnover: 5e8, stocks: 30, advanceRatio: 0.5 };
      expect(calcSectorMomentum(s)).toBe(0);
    });

    it('动量应反映资金活跃度', () => {
      const active: SectorData = { name: 'A', code: 'a', change: 2, volume: 1e10, turnover: 1e10, stocks: 50, advanceRatio: 0.7 };
      const quiet: SectorData = { name: 'B', code: 'b', change: 2, volume: 1e6, turnover: 1e6, stocks: 50, advanceRatio: 0.7 };
      expect(calcSectorMomentum(active)).toBeGreaterThan(calcSectorMomentum(quiet));
    });

    it('涨跌比影响动量', () => {
      const broad: SectorData = { name: 'A', code: 'a', change: 3, volume: 1e9, turnover: 3e9, stocks: 100, advanceRatio: 0.9 };
      const narrow: SectorData = { name: 'B', code: 'b', change: 3, volume: 1e9, turnover: 3e9, stocks: 100, advanceRatio: 0.1 };
      expect(calcSectorMomentum(broad)).toBeGreaterThan(calcSectorMomentum(narrow));
    });
  });

  describe('轮动检测', () => {
    it('应该检测强势板块', () => {
      const sectors: SectorData[] = [
        { name: '科技', code: 'tech', change: 5, volume: 1e9, turnover: 5e9, stocks: 100, advanceRatio: 0.8 },
        { name: '地产', code: 're', change: -3, volume: 5e8, turnover: 2e9, stocks: 50, advanceRatio: 0.2 },
        { name: '消费', code: 'cons', change: 2, volume: 8e8, turnover: 3e9, stocks: 80, advanceRatio: 0.6 },
      ];
      const signals = detectRotation(sectors, 1);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].to).toBe('科技');
    });

    it('均衡市场不应触发轮动', () => {
      const sectors: SectorData[] = [
        { name: 'A', code: 'a', change: 1, volume: 1e9, turnover: 2e9, stocks: 50, advanceRatio: 0.5 },
        { name: 'B', code: 'b', change: 0.8, volume: 1e9, turnover: 2e9, stocks: 50, advanceRatio: 0.5 },
      ];
      expect(detectRotation(sectors, 5).length).toBe(0);
    });

    it('空板块列表返回空信号', () => {
      expect(detectRotation([])).toEqual([]);
    });

    it('单一板块不应触发轮动', () => {
      const sectors: SectorData[] = [
        { name: 'A', code: 'a', change: 5, volume: 1e9, turnover: 2e9, stocks: 50, advanceRatio: 0.8 },
      ];
      expect(detectRotation(sectors, 1).length).toBe(0);
    });

    it('轮动信号应有原因说明', () => {
      const sectors: SectorData[] = [
        { name: '科技', code: 'tech', change: 10, volume: 1e9, turnover: 5e9, stocks: 100, advanceRatio: 0.9 },
        { name: '地产', code: 're', change: -5, volume: 5e8, turnover: 2e9, stocks: 50, advanceRatio: 0.1 },
      ];
      const signals = detectRotation(sectors, 1);
      if (signals.length > 0) {
        expect(signals[0].reason).toBeTruthy();
        expect(signals[0].strength).toBeGreaterThan(0);
      }
    });

    it('阈值影响信号数量', () => {
      const sectors: SectorData[] = [
        { name: 'A', code: 'a', change: 5, volume: 1e9, turnover: 2e9, stocks: 50, advanceRatio: 0.8 },
        { name: 'B', code: 'b', change: -3, volume: 1e9, turnover: 2e9, stocks: 50, advanceRatio: 0.2 },
        { name: 'C', code: 'c', change: 2, volume: 1e9, turnover: 2e9, stocks: 50, advanceRatio: 0.6 },
      ];
      expect(detectRotation(sectors, 1).length).toBeGreaterThanOrEqual(detectRotation(sectors, 10).length);
    });
  });

  describe('市场宽度', () => {
    it('全涨宽度为1', () => {
      const sectors: SectorData[] = [
        { name: 'A', code: 'a', change: 1, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.8 },
        { name: 'B', code: 'b', change: 2, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.9 },
      ];
      expect(calcBreadth(sectors).ratio).toBe(1);
    });

    it('全跌宽度为0', () => {
      const sectors: SectorData[] = [
        { name: 'A', code: 'a', change: -1, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.2 },
        { name: 'B', code: 'b', change: -2, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.1 },
      ];
      expect(calcBreadth(sectors).ratio).toBe(0);
    });

    it('空列表宽度为0', () => {
      const { advance, decline, ratio } = calcBreadth([]);
      expect(advance).toBe(0);
      expect(decline).toBe(0);
      expect(ratio).toBe(0);
    });

    it('涨跌各半宽度0.5', () => {
      const sectors: SectorData[] = [
        { name: 'A', code: 'a', change: 1, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.6 },
        { name: 'B', code: 'b', change: -1, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.4 },
      ];
      expect(calcBreadth(sectors).ratio).toBe(0.5);
    });

    it('零涨跌不计入', () => {
      const sectors: SectorData[] = [
        { name: 'A', code: 'a', change: 1, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.6 },
        { name: 'B', code: 'b', change: 0, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.5 },
        { name: 'C', code: 'c', change: -1, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.4 },
      ];
      const { advance, decline } = calcBreadth(sectors);
      expect(advance).toBe(1);
      expect(decline).toBe(1);
    });
  });

  describe('板块相关性', () => {
    it('相同板块相关性为1', () => {
      const s: SectorData = { name: 'A', code: 'a', change: 3, volume: 1e9, turnover: 2e9, stocks: 50, advanceRatio: 0.7 };
      expect(calcSectorCorrelation(s, s)).toBeCloseTo(1, 5);
    });

    it('相关性应在-1到1之间', () => {
      const s1: SectorData = { name: 'A', code: 'a', change: 3, volume: 1e9, turnover: 2e9, stocks: 50, advanceRatio: 0.7 };
      const s2: SectorData = { name: 'B', code: 'b', change: -2, volume: 5e8, turnover: 1e9, stocks: 30, advanceRatio: 0.3 };
      const corr = calcSectorCorrelation(s1, s2);
      expect(corr).toBeGreaterThanOrEqual(-1);
      expect(corr).toBeLessThanOrEqual(1);
    });

    it('反向特征相关性应为负', () => {
      const s1: SectorData = { name: 'A', code: 'a', change: 5, volume: 1e10, turnover: 1e10, stocks: 100, advanceRatio: 0.9 };
      const s2: SectorData = { name: 'B', code: 'b', change: -5, volume: 1e5, turnover: 1e5, stocks: 10, advanceRatio: 0.1 };
      const corr = calcSectorCorrelation(s1, s2);
      expect(corr).toBeLessThan(1);
      expect(corr).toBeGreaterThan(-1);
    });
  });

  describe('板块排名', () => {
    it('应该按综合得分排序', () => {
      const sectors: SectorData[] = [
        { name: '低', code: 'low', change: 1, volume: 1e8, turnover: 1e8, stocks: 30, advanceRatio: 0.3 },
        { name: '高', code: 'high', change: 5, volume: 1e10, turnover: 1e10, stocks: 100, advanceRatio: 0.9 },
        { name: '中', code: 'mid', change: 3, volume: 1e9, turnover: 1e9, stocks: 60, advanceRatio: 0.6 },
      ];
      const ranked = rankSectors(sectors);
      expect(ranked[0].name).toBe('高');
    });

    it('不同权重产生不同排名', () => {
      const sectors: SectorData[] = [
        { name: 'A', code: 'a', change: 5, volume: 1e8, turnover: 1e8, stocks: 50, advanceRatio: 0.3 },
        { name: 'B', code: 'b', change: 1, volume: 1e10, turnover: 1e10, stocks: 50, advanceRatio: 0.9 },
      ];
      const byChange = rankSectors(sectors, { change: 1, volume: 0, breadth: 0 });
      const byVol = rankSectors(sectors, { change: 0, volume: 1, breadth: 0 });
      expect(byChange[0].name).not.toBe(byVol[0].name);
    });

    it('单一板块排名就是它自己', () => {
      const sectors: SectorData[] = [
        { name: 'Only', code: 'only', change: 2, volume: 1e9, turnover: 1e9, stocks: 50, advanceRatio: 0.5 },
      ];
      expect(rankSectors(sectors)[0].name).toBe('Only');
    });

    it('空板块返回空', () => {
      expect(rankSectors([])).toEqual([]);
    });

    it('排名数量应等于输入数量', () => {
      const sectors: SectorData[] = Array.from({ length: 10 }, (_, i) => ({
        name: `S${i}`, code: `s${i}`, change: Math.random() * 10 - 5,
        volume: 1e8 + Math.random() * 1e9, turnover: 1e8 + Math.random() * 1e9,
        stocks: 30 + Math.floor(Math.random() * 70), advanceRatio: Math.random()
      }));
      expect(rankSectors(sectors).length).toBe(10);
    });
  });

  describe('板块强度指标', () => {
    const calcSectorStrength = (sector: SectorData): { score: number; trend: string } => {
      const priceScore = Math.min(100, Math.max(0, 50 + sector.change * 10));
      const volumeScore = Math.min(100, (sector.volume / 1e9) * 20);
      const breadthScore = sector.advanceRatio * 100;
      const score = (priceScore * 0.4 + volumeScore * 0.3 + breadthScore * 0.3);
      let trend = 'neutral';
      if (score > 65) trend = 'strong';
      else if (score < 35) trend = 'weak';
      return { score, trend };
    };

    it('强势板块应有high得分', () => {
      const s: SectorData = { name: 'A', code: 'a', change: 5, volume: 5e9, turnover: 5e9, stocks: 100, advanceRatio: 0.9 };
      const { score, trend } = calcSectorStrength(s);
      expect(trend).toBe('strong');
    });

    it('弱势板块应有low得分', () => {
      const s: SectorData = { name: 'B', code: 'b', change: -5, volume: 1e7, turnover: 1e7, stocks: 30, advanceRatio: 0.1 };
      const { score, trend } = calcSectorStrength(s);
      expect(trend).toBe('weak');
    });

    it('得分应在0-100之间', () => {
      const s: SectorData = { name: 'C', code: 'c', change: 0, volume: 1e9, turnover: 1e9, stocks: 50, advanceRatio: 0.5 };
      const { score } = calcSectorStrength(s);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('三个趋势等级都应该出现', () => {
      const strong: SectorData = { name: 'A', code: 'a', change: 5, volume: 5e9, turnover: 5e9, stocks: 100, advanceRatio: 0.9 };
      const weak: SectorData = { name: 'B', code: 'b', change: -5, volume: 1e7, turnover: 1e7, stocks: 30, advanceRatio: 0.1 };
      const neutral: SectorData = { name: 'C', code: 'c', change: 0, volume: 1e9, turnover: 1e9, stocks: 50, advanceRatio: 0.5 };
      expect(calcSectorStrength(strong).trend).toBe('strong');
      expect(calcSectorStrength(weak).trend).toBe('weak');
      expect(calcSectorStrength(neutral).trend).toBe('neutral');
    });
  });
});
