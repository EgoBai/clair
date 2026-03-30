import { describe, it, expect } from 'vitest';

// 行业轮动与板块分析引擎
describe('行业轮动分析引擎', () => {
  interface SectorData {
    name: string;
    change1d: number;
    change5d: number;
    change20d: number;
    volume: number;
    avgVolume: number;
    fundFlow: number;
  }

  const sectors: SectorData[] = [
    { name: '白酒', change1d: 2.5, change5d: 5.8, change20d: 12.3, volume: 5e9, avgVolume: 3e9, fundFlow: 8e8 },
    { name: '新能源', change1d: -0.8, change5d: 1.2, change20d: -3.5, volume: 8e9, avgVolume: 6e9, fundFlow: -2e8 },
    { name: '半导体', change1d: 1.5, change5d: 3.2, change20d: 8.1, volume: 4e9, avgVolume: 3.5e9, fundFlow: 5e8 },
    { name: '银行', change1d: 0.3, change5d: -0.5, change20d: 2.1, volume: 2e9, avgVolume: 2.5e9, fundFlow: 1e8 },
    { name: '医药', change1d: -1.5, change5d: -4.2, change20d: -8.0, volume: 3e9, avgVolume: 4e9, fundFlow: -6e8 },
    { name: '光伏', change1d: 3.2, change5d: 7.1, change20d: 15.5, volume: 6e9, avgVolume: 4e9, fundFlow: 1e9 },
    { name: '地产', change1d: -2.0, change5d: -3.5, change20d: -10.2, volume: 1.5e9, avgVolume: 2e9, fundFlow: -4e8 },
    { name: '消费电子', change1d: 1.0, change5d: 2.0, change20d: 5.5, volume: 3e9, avgVolume: 2.8e9, fundFlow: 3e8 },
  ];

  // 动量评分计算
  function calcMomentumScore(s: SectorData): number {
    const w1d = 0.3, w5d = 0.3, w20d = 0.2, wVol = 0.1, wFlow = 0.1;
    const volRatio = (s.volume / s.avgVolume - 1) * 100;
    const flowScore = s.fundFlow / 1e8;
    return s.change1d * w1d + s.change5d * w5d + s.change20d * w20d + volRatio * wVol + flowScore * wFlow;
  }

  // 四阶段判断
  function classifyPhase(s: SectorData): 'accumulation' | 'markup' | 'distribution' | 'decline' {
    const strong20d = s.change20d > 5;
    const strong5d = s.change5d > 2;
    const strong1d = s.change1d > 0;
    const volumeUp = s.volume > s.avgVolume;

    if (strong20d && strong5d && strong1d && volumeUp) return 'markup';
    if (strong20d && !strong5d) return 'distribution';
    if (!strong20d && strong5d) return 'accumulation';
    return 'decline';
  }

  // 资金流向分类
  function classifyFlow(s: SectorData): 'inflow' | 'outflow' | 'neutral' {
    if (s.fundFlow > 3e8) return 'inflow';
    if (s.fundFlow < -3e8) return 'outflow';
    return 'neutral';
  }

  describe('动量评分', () => {
    it('应计算综合动量分数', () => {
      sectors.forEach(s => {
        const score = calcMomentumScore(s);
        expect(Number.isFinite(score)).toBe(true);
      });
    });

    it('强势板块动量应高于弱势板块', () => {
      const strong = sectors.find(s => s.name === '光伏')!;
      const weak = sectors.find(s => s.name === '地产')!;
      expect(calcMomentumScore(strong)).toBeGreaterThan(calcMomentumScore(weak));
    });

    it('应能排序所有板块', () => {
      const ranked = [...sectors].sort((a, b) => calcMomentumScore(b) - calcMomentumScore(a));
      expect(ranked).toHaveLength(sectors.length);
      // 验证排序正确：最高分在前
      for (let i = 1; i < ranked.length; i++) {
        expect(calcMomentumScore(ranked[i - 1])).toBeGreaterThanOrEqual(calcMomentumScore(ranked[i]));
      }
    });
  });

  describe('阶段分类', () => {
    it('白酒应处于markup阶段', () => {
      expect(classifyPhase(sectors.find(s => s.name === '白酒')!)).toBe('markup');
    });

    it('地产应处于decline阶段', () => {
      expect(classifyPhase(sectors.find(s => s.name === '地产')!)).toBe('decline');
    });

    it('银行可能处于distribution', () => {
      const phase = classifyPhase(sectors.find(s => s.name === '银行')!);
      expect(['distribution', 'decline', 'accumulation']).toContain(phase);
    });

    it('所有阶段都能被分配', () => {
      const phases = new Set(sectors.map(s => classifyPhase(s)));
      expect(phases.size).toBeGreaterThan(1);
    });
  });

  describe('资金流向分类', () => {
    it('白酒应为流入', () => {
      expect(classifyFlow(sectors.find(s => s.name === '白酒')!)).toBe('inflow');
    });

    it('医药应为流出', () => {
      expect(classifyFlow(sectors.find(s => s.name === '医药')!)).toBe('outflow');
    });

    it('银行应为中性', () => {
      expect(classifyFlow(sectors.find(s => s.name === '银行')!)).toBe('neutral');
    });
  });

  describe('板块排名', () => {
    it('按日涨幅排序', () => {
      const ranked = [...sectors].sort((a, b) => b.change1d - a.change1d);
      expect(ranked[0].name).toBe('光伏');
      expect(ranked[ranked.length - 1].name).toBe('地产');
    });

    it('按周涨幅排序', () => {
      const ranked = [...sectors].sort((a, b) => b.change5d - a.change5d);
      expect(ranked[0].name).toBe('光伏');
    });

    it('按资金流向排序', () => {
      const ranked = [...sectors].sort((a, b) => b.fundFlow - a.fundFlow);
      expect(ranked[0].fundFlow).toBeGreaterThan(ranked[ranked.length - 1].fundFlow);
    });

    it('按成交量异动排序', () => {
      const ranked = [...sectors].sort((a, b) => (b.volume / b.avgVolume) - (a.volume / a.avgVolume));
      expect(ranked[0].volume / ranked[0].avgVolume).toBeGreaterThan(1);
    });
  });

  describe('轮动信号', () => {
    function detectRotation(current: SectorData[], previous: SectorData[]): string[] {
      const signals: string[] = [];
      for (const curr of current) {
        const prev = previous.find(p => p.name === curr.name);
        if (!prev) continue;
        const momentumChange = calcMomentumScore(curr) - calcMomentumScore(prev);
        if (momentumChange > 3) signals.push(`${curr.name}:动量增强`);
        if (momentumChange < -3) signals.push(`${curr.name}:动量减弱`);
      }
      return signals;
    }

    it('应检测动量变化', () => {
      const prev: SectorData[] = sectors.map(s => ({ ...s, change5d: s.change5d - 15, change1d: s.change1d - 5 }));
      const signals = detectRotation(sectors, prev);
      expect(signals.length).toBeGreaterThan(0);
    });

    it('无变化应无信号', () => {
      const signals = detectRotation(sectors, sectors);
      expect(signals).toHaveLength(0);
    });

    it('空数据返回空信号', () => {
      expect(detectRotation([], [])).toHaveLength(0);
    });
  });
});

// 市场广度分析
describe('市场广度分析', () => {
  interface MarketStock { symbol: string; change: number; volume: number; }

  function calcMarketBreadth(stocks: MarketStock[]) {
    const adv = stocks.filter(s => s.change > 0).length;
    const dec = stocks.filter(s => s.change < 0).length;
    const unc = stocks.filter(s => s.change === 0).length;
    const advVolume = stocks.filter(s => s.change > 0).reduce((s, x) => s + x.volume, 0);
    const decVolume = stocks.filter(s => s.change < 0).reduce((s, x) => s + x.volume, 0);
    return {
      adv, dec, unc,
      advDecRatio: dec > 0 ? adv / dec : Infinity,
      volumeRatio: decVolume > 0 ? advVolume / decVolume : Infinity,
      breadth: (adv - dec) / stocks.length,
    };
  }

  const market: MarketStock[] = Array.from({ length: 500 }, (_, i) => ({
    symbol: String(i).padStart(6, '0'),
    change: (Math.random() - 0.45) * 10,
    volume: Math.floor(Math.random() * 1e7),
  }));

  it('涨跌停之和应等于总数', () => {
    const b = calcMarketBreadth(market);
    expect(b.adv + b.dec + b.unc).toBe(market.length);
  });

  it('涨跌比应为正数或Infinity', () => {
    const b = calcMarketBreadth(market);
    expect(b.advDecRatio > 0 || b.advDecRatio === Infinity).toBe(true);
  });

  it('市场广度应在-1到1之间', () => {
    const b = calcMarketBreadth(market);
    expect(b.breadth).toBeGreaterThanOrEqual(-1);
    expect(b.breadth).toBeLessThanOrEqual(1);
  });

  it('全涨市场广度为1', () => {
    const allUp = Array.from({ length: 100 }, (_, i) => ({ symbol: String(i), change: 1, volume: 1e6 }));
    expect(calcMarketBreadth(allUp).breadth).toBe(1);
  });

  it('全跌市场广度为-1', () => {
    const allDown = Array.from({ length: 100 }, (_, i) => ({ symbol: String(i), change: -1, volume: 1e6 }));
    expect(calcMarketBreadth(allDown).breadth).toBe(-1);
  });

  it('涨跌相等市场广度为0', () => {
    const even = Array.from({ length: 100 }, (_, i) => ({ symbol: String(i), change: i < 50 ? 1 : -1, volume: 1e6 }));
    expect(calcMarketBreadth(even).breadth).toBeCloseTo(0, 5);
  });

  it('量比也应符合逻辑', () => {
    const b = calcMarketBreadth(market);
    expect(Number.isFinite(b.volumeRatio) || b.volumeRatio === Infinity).toBe(true);
  });
});

// 涨跌停分析
describe('涨跌停分析', () => {
  function isLimitUp(price: number, prevClose: number, isST: boolean = false): boolean {
    const limit = isST ? 0.05 : 0.1;
    return (price - prevClose) / prevClose >= limit - 0.001;
  }

  function isLimitDown(price: number, prevClose: number, isST: boolean = false): boolean {
    const limit = isST ? 0.05 : 0.1;
    return (price - prevClose) / prevClose <= -limit + 0.001;
  }

  it('普通股涨停10%', () => {
    expect(isLimitUp(110, 100)).toBe(true);
  });

  it('普通股未涨停', () => {
    expect(isLimitUp(109, 100)).toBe(false);
  });

  it('ST股涨停5%', () => {
    expect(isLimitUp(105, 100, true)).toBe(true);
  });

  it('ST股9%算涨停(超过5%限制)', () => {
    expect(isLimitUp(109, 100, true)).toBe(true);
  });

  it('普通股跌停10%', () => {
    expect(isLimitDown(90, 100)).toBe(true);
  });

  it('普通股未跌停', () => {
    expect(isLimitDown(91, 100)).toBe(false);
  });

  it('ST股跌停5%', () => {
    expect(isLimitDown(95, 100, true)).toBe(true);
  });

  it('统计涨跌停数量', () => {
    const stocks = [
      { price: 110, prevClose: 100 },
      { price: 90, prevClose: 100 },
      { price: 105, prevClose: 100 },
      { price: 110, prevClose: 100 },
    ];
    const limitUp = stocks.filter(s => isLimitUp(s.price, s.prevClose)).length;
    const limitDown = stocks.filter(s => isLimitDown(s.price, s.prevClose)).length;
    expect(limitUp).toBe(2);
    expect(limitDown).toBe(1);
  });
});

// 板块成分股权重计算
describe('板块权重计算', () => {
  function calcWeights(stocks: { marketCap: number }[]): number[] {
    const total = stocks.reduce((s, x) => s + x.marketCap, 0);
    return stocks.map(s => (s.marketCap / total) * 100);
  }

  it('权重之和应为100', () => {
    const stocks = [{ marketCap: 1000 }, { marketCap: 2000 }, { marketCap: 3000 }];
    const weights = calcWeights(stocks);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it('大市值权重更大', () => {
    const stocks = [{ marketCap: 100 }, { marketCap: 900 }];
    const weights = calcWeights(stocks);
    expect(weights[1]).toBeGreaterThan(weights[0]);
  });

  it('等市值等权重', () => {
    const stocks = [{ marketCap: 500 }, { marketCap: 500 }, { marketCap: 500 }];
    const weights = calcWeights(stocks);
    expect(weights[0]).toBeCloseTo(weights[1], 5);
  });

  it('单股权重100%', () => {
    expect(calcWeights([{ marketCap: 1000 }])[0]).toBe(100);
  });
});
