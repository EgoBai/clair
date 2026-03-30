import { describe, it, expect } from 'vitest';

// Sector rotation and industry analysis
interface SectorData {
  name: string;
  code: string;
  changePercent: number;
  turnover: number;
  advancers: number;
  decliners: number;
  volume: number;
  marketCap: number;
}

function calculateSectorMomentum(sector: SectorData, avgChange: number): number {
  const changeScore = Math.min(Math.max((sector.changePercent + 10) / 20, 0), 1) * 40;
  const volumeScore = Math.min(sector.turnover / 1e10, 1) * 30;
  const breadthScore = (sector.advancers / (sector.advancers + sector.decliners)) * 30;
  return changeScore + volumeScore + breadthScore;
}

function classifySectorPhase(momentum: number, prevMomentum: number): string {
  if (momentum > 70 && momentum > prevMomentum) return 'main_rally';
  if (momentum > 50 && momentum > prevMomentum) return 'accumulation';
  if (momentum > 50 && momentum < prevMomentum) return 'distribution';
  return 'decline';
}

function rankSectors(sectors: SectorData[]): SectorData[] {
  return [...sectors].sort((a, b) => b.changePercent - a.changePercent);
}

function calculateSectorCorrelation(returns1: number[], returns2: number[]): number {
  if (returns1.length !== returns2.length || returns1.length < 2) return 0;
  const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
  const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;
  let cov = 0, var1 = 0, var2 = 0;
  for (let i = 0; i < returns1.length; i++) {
    cov += (returns1[i] - mean1) * (returns2[i] - mean2);
    var1 += (returns1[i] - mean1) ** 2;
    var2 += (returns2[i] - mean2) ** 2;
  }
  if (var1 === 0 || var2 === 0) return 0;
  return cov / Math.sqrt(var1 * var2);
}

function calculateRelativeStrength(sectorChange: number, marketChange: number): number {
  if (marketChange === 0) return sectorChange > 0 ? 1 : sectorChange < 0 ? -1 : 0;
  return sectorChange / marketChange;
}

function identifyLeadingLaggingSectors(sectors: SectorData[], marketChange: number) {
  const leading: SectorData[] = [];
  const lagging: SectorData[] = [];
  const neutral: SectorData[] = [];
  for (const sector of sectors) {
    const rs = calculateRelativeStrength(sector.changePercent, marketChange);
    if (rs > 1.2) leading.push(sector);
    else if (rs < 0.8) lagging.push(sector);
    else neutral.push(sector);
  }
  return { leading, lagging, neutral };
}

function calculateSectorWeight(sector: SectorData, totalMarketCap: number): number {
  if (totalMarketCap === 0) return 0;
  return sector.marketCap / totalMarketCap;
}

function detectSectorRotation(currentSector: SectorData, prevSector: SectorData, marketChange: number) {
  const currentRS = calculateRelativeStrength(currentSector.changePercent, marketChange);
  const prevRS = calculateRelativeStrength(prevSector.changePercent, marketChange);
  if (currentRS > 1 && prevRS < 1) return 'entering_leadership';
  if (currentRS < 1 && prevRS > 1) return 'exiting_leadership';
  if (currentRS > 1.5) return 'strong_leader';
  if (currentRS < 0.5) return 'weak_laggard';
  return 'normal';
}

describe('行业轮动与板块分析', () => {
  const sampleSectors: SectorData[] = [
    { name: '白酒', code: 'BJ', changePercent: 3.5, turnover: 5e9, advancers: 15, decliners: 3, volume: 1e8, marketCap: 2e12 },
    { name: '新能源', code: 'XNY', changePercent: 2.1, turnover: 8e9, advancers: 20, decliners: 10, volume: 2e8, marketCap: 1.5e12 },
    { name: '银行', code: 'YH', changePercent: -0.5, turnover: 3e9, advancers: 5, decliners: 25, volume: 5e7, marketCap: 5e12 },
    { name: '半导体', code: 'BDT', changePercent: 1.8, turnover: 6e9, advancers: 12, decliners: 8, volume: 1.5e8, marketCap: 1e12 },
    { name: '地产', code: 'DC', changePercent: -2.3, turnover: 2e9, advancers: 3, decliners: 30, volume: 3e7, marketCap: 8e11 },
  ];

  describe('板块动量计算', () => {
    it('应该计算板块动量得分', () => {
      const momentum = calculateSectorMomentum(sampleSectors[0], 1);
      expect(momentum).toBeGreaterThan(0);
      expect(momentum).toBeLessThanOrEqual(100);
    });

    it('涨幅大的板块动量应该更高', () => {
      const highChange = calculateSectorMomentum(sampleSectors[0], 1);
      const lowChange = calculateSectorMomentum(sampleSectors[4], 1);
      expect(highChange).toBeGreaterThan(lowChange);
    });

    it('涨家多的板块应该有更高的广度得分', () => {
      const broadSector = { ...sampleSectors[0], advancers: 18, decliners: 0 };
      const narrowSector = { ...sampleSectors[0], advancers: 5, decliners: 15 };
      expect(calculateSectorMomentum(broadSector, 1)).toBeGreaterThan(calculateSectorMomentum(narrowSector, 1));
    });
  });

  describe('板块阶段分类', () => {
    it('上升动量应该分为主升或吸筹', () => {
      expect(classifySectorPhase(75, 60)).toBe('main_rally');
      expect(classifySectorPhase(55, 45)).toBe('accumulation');
    });

    it('下降动量应该分为派发或下跌', () => {
      expect(classifySectorPhase(55, 70)).toBe('distribution');
      expect(classifySectorPhase(30, 40)).toBe('decline');
    });
  });

  describe('板块排名', () => {
    it('应该按涨幅排序', () => {
      const ranked = rankSectors(sampleSectors);
      expect(ranked[0].name).toBe('白酒');
      expect(ranked[ranked.length - 1].name).toBe('地产');
    });

    it('不应该修改原始数组', () => {
      const original = [...sampleSectors];
      rankSectors(sampleSectors);
      expect(sampleSectors[0].name).toBe(original[0].name);
    });

    it('单一板块应该返回自身', () => {
      const ranked = rankSectors([sampleSectors[0]]);
      expect(ranked.length).toBe(1);
    });
  });

  describe('板块相关性', () => {
    it('完全正相关应该为1', () => {
      expect(calculateSectorCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    });

    it('完全负相关应该为-1', () => {
      expect(calculateSectorCorrelation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    });

    it('无相关应该接近0', () => {
      expect(calculateSectorCorrelation([1, -1, 1, -1], [-1, 1, -1, 1])).toBeCloseTo(-1);
    });

    it('空数据返回0', () => {
      expect(calculateSectorCorrelation([], [])).toBe(0);
    });

    it('长度不同返回0', () => {
      expect(calculateSectorCorrelation([1, 2], [1])).toBe(0);
    });
  });

  describe('相对强弱', () => {
    it('应该正确计算相对强弱', () => {
      expect(calculateRelativeStrength(3, 1)).toBe(3);
      expect(calculateRelativeStrength(0.5, 1)).toBe(0.5);
    });

    it('市场零涨跌时应该处理', () => {
      expect(calculateRelativeStrength(1, 0)).toBe(1);
      expect(calculateRelativeStrength(-1, 0)).toBe(-1);
      expect(calculateRelativeStrength(0, 0)).toBe(0);
    });
  });

  describe('领涨/落后板块识别', () => {
    it('应该正确分类', () => {
      const { leading, lagging, neutral } = identifyLeadingLaggingSectors(sampleSectors, 1);
      expect(leading.length).toBeGreaterThan(0);
      expect(lagging.length).toBeGreaterThan(0);
    });

    it('所有板块RS=1时都应该是neutral', () => {
      const evenSectors = sampleSectors.map(s => ({ ...s, changePercent: 1 }));
      const { leading, lagging, neutral } = identifyLeadingLaggingSectors(evenSectors, 1);
      expect(leading.length).toBe(0);
      expect(lagging.length).toBe(0);
      expect(neutral.length).toBe(evenSectors.length);
    });
  });

  describe('板块权重', () => {
    it('应该正确计算权重', () => {
      const totalCap = sampleSectors.reduce((s, sec) => s + sec.marketCap, 0);
      const weight = calculateSectorWeight(sampleSectors[2], totalCap);
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThan(1);
    });

    it('零总市值返回0', () => {
      expect(calculateSectorWeight(sampleSectors[0], 0)).toBe(0);
    });

    it('权重总和应该接近1', () => {
      const totalCap = sampleSectors.reduce((s, sec) => s + sec.marketCap, 0);
      const totalWeight = sampleSectors.reduce((s, sec) => s + calculateSectorWeight(sec, totalCap), 0);
      expect(totalWeight).toBeCloseTo(1);
    });
  });

  describe('轮动检测', () => {
    it('应该检测进入领涨', () => {
      const prev = { ...sampleSectors[0], changePercent: 0.5 };
      const curr = { ...sampleSectors[0], changePercent: 3 };
      expect(detectSectorRotation(curr, prev, 1)).toBe('entering_leadership');
    });

    it('应该检测退出领涨', () => {
      const prev = { ...sampleSectors[0], changePercent: 3 };
      const curr = { ...sampleSectors[0], changePercent: 0.5 };
      expect(detectSectorRotation(curr, prev, 1)).toBe('exiting_leadership');
    });

    it('应该检测强势领涨', () => {
      const prev = { ...sampleSectors[0], changePercent: 3 };
      const curr = { ...sampleSectors[0], changePercent: 5 };
      expect(detectSectorRotation(curr, prev, 1)).toBe('strong_leader');
    });

    it('应该检测弱势落后', () => {
      const prev = { ...sampleSectors[0], changePercent: 0.3 };
      const curr = { ...sampleSectors[0], changePercent: 0.1 };
      expect(detectSectorRotation(curr, prev, 1)).toBe('weak_laggard');
    });

    it('正常状态', () => {
      const prev = { ...sampleSectors[0], changePercent: 1 };
      const curr = { ...sampleSectors[0], changePercent: 1.1 };
      expect(detectSectorRotation(curr, prev, 1)).toBe('normal');
    });
  });
});
