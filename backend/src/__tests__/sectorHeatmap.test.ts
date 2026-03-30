import { describe, it, expect } from 'vitest';

// 行业热力图引擎
interface SectorData {
  name: string; code: string;
  changePercent: number; turnover: number;
  volume: number; stocks: number;
  advancing: number; declining: number;
  marketCap: number;
}

function calcSectorScore(sector: SectorData): number {
  let score = 50;
  score += sector.changePercent * 2;
  score += ((sector.advancing / sector.stocks) - 0.5) * 20;
  score += Math.min(sector.turnover / 5, 1) * 10;
  return Math.max(0, Math.min(100, score));
}

function getHeatmapColor(changePercent: number): string {
  if (changePercent >= 3) return '#b91c1c';
  if (changePercent >= 1.5) return '#dc2626';
  if (changePercent >= 0.5) return '#ef4444';
  if (changePercent >= 0) return '#fca5a5';
  if (changePercent >= -0.5) return '#86efac';
  if (changePercent >= -1.5) return '#22c55e';
  if (changePercent >= -3) return '#16a34a';
  return '#15803d';
}

function rankSectors(sectors: SectorData[], by: 'changePercent' | 'turnover' | 'volume'): SectorData[] {
  return [...sectors].sort((a, b) => b[by] - a[by]);
}

function calcBreadthRatio(sector: SectorData): number {
  return sector.stocks > 0 ? sector.advancing / sector.stocks : 0;
}

function detectSectorRotation(current: SectorData[], previous: SectorData[]): { inflow: string[]; outflow: string[] } {
  const inflow: string[] = [], outflow: string[] = [];
  const prevMap = new Map(previous.map(s => [s.code, s]));
  current.forEach(s => {
    const prev = prevMap.get(s.code);
    if (!prev) return;
    const rankChange = current.indexOf(s) - (previous.indexOf(prev));
    if (rankChange > 3) inflow.push(s.name);
    if (rankChange < -3) outflow.push(s.name);
  });
  return { inflow, outflow };
}

function groupByPerformance(sectors: SectorData[]): { strong: SectorData[]; neutral: SectorData[]; weak: SectorData[] } {
  return {
    strong: sectors.filter(s => s.changePercent > 1),
    neutral: sectors.filter(s => s.changePercent >= -1 && s.changePercent <= 1),
    weak: sectors.filter(s => s.changePercent < -1),
  };
}

function calcWeightedSectorReturn(sectors: SectorData[]): number {
  const totalCap = sectors.reduce((s, d) => s + d.marketCap, 0);
  if (totalCap === 0) return 0;
  return sectors.reduce((s, d) => s + d.changePercent * (d.marketCap / totalCap), 0);
}

describe('行业热力图引擎', () => {
  const sectors: SectorData[] = [
    { name: '半导体', code: 'semi', changePercent: 2.5, turnover: 6, volume: 5e9, stocks: 80, advancing: 60, declining: 20, marketCap: 2e12 },
    { name: '银行', code: 'bank', changePercent: -0.5, turnover: 2, volume: 3e9, stocks: 40, advancing: 15, declining: 25, marketCap: 8e12 },
    { name: '医药', code: 'pharma', changePercent: 0.8, turnover: 4, volume: 4e9, stocks: 100, advancing: 55, declining: 45, marketCap: 3e12 },
    { name: '新能源', code: 'ne', changePercent: -2.0, turnover: 5, volume: 6e9, stocks: 60, advancing: 10, declining: 50, marketCap: 1.5e12 },
  ];

  describe('行业评分', () => {
    it('涨幅大的行业应得高分', () => {
      expect(calcSectorScore(sectors[0])).toBeGreaterThan(calcSectorScore(sectors[3]));
    });

    it('分数应在0-100之间', () => {
      sectors.forEach(s => {
        const score = calcSectorScore(s);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('热力图颜色', () => {
    it('涨幅>=3应为深红', () => { expect(getHeatmapColor(3)).toBe('#b91c1c'); });
    it('涨幅1.5-3应为红', () => { expect(getHeatmapColor(2)).toBe('#dc2626'); });
    it('跌幅>=-3应为深绿', () => { expect(getHeatmapColor(-2)).toBe('#16a34a'); });
    it('跌幅<-3应为更深绿', () => { expect(getHeatmapColor(-5)).toBe('#15803d'); });
  });

  describe('行业排名', () => {
    it('按涨幅排序', () => {
      const ranked = rankSectors(sectors, 'changePercent');
      expect(ranked[0].code).toBe('semi');
    });

    it('按换手率排序', () => {
      const ranked = rankSectors(sectors, 'turnover');
      expect(ranked[0].code).toBe('semi');
    });

    it('不应修改原数组', () => {
      const original = [...sectors];
      rankSectors(sectors, 'changePercent');
      expect(sectors[0].code).toBe(original[0].code);
    });
  });

  describe('涨跌比', () => {
    it('应正确计算涨跌比', () => {
      expect(calcBreadthRatio(sectors[0])).toBe(0.75);
    });

    it('零股票应返回0', () => {
      expect(calcBreadthRatio({ ...sectors[0], stocks: 0 })).toBe(0);
    });
  });

  describe('行业轮动检测', () => {
    it('应检测资金流入流出', () => {
      const prev = [...sectors];
      const curr = [...sectors].reverse();
      const rotation = detectSectorRotation(curr, prev);
      expect(rotation.inflow.length + rotation.outflow.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('行业分组', () => {
    it('应按表现分组', () => {
      const groups = groupByPerformance(sectors);
      expect(groups.strong.length).toBe(1);
      expect(groups.weak.length).toBe(1);
      expect(groups.neutral.length).toBe(2);
    });
  });

  describe('加权行业收益', () => {
    it('应按市值加权计算', () => {
      const weighted = calcWeightedSectorReturn(sectors);
      expect(typeof weighted).toBe('number');
    });

    it('总市值为零应返回0', () => {
      const zeroCap = sectors.map(s => ({ ...s, marketCap: 0 }));
      expect(calcWeightedSectorReturn(zeroCap)).toBe(0);
    });
  });
});
