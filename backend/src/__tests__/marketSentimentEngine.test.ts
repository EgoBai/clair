import { describe, it, expect } from 'vitest';

describe('Market Sentiment Engine', () => {
  // 恐贪指数
  const fearGreedIndex = (data: { volatility: number; momentum: number; volume: number; putCallRatio: number }): number => {
    let score = 50;
    if (data.volatility < 20) score += 15; else if (data.volatility > 40) score -= 15;
    if (data.momentum > 0) score += 10; else score -= 10;
    if (data.volume > 1.5) score += 10; else if (data.volume < 0.5) score -= 10;
    if (data.putCallRatio < 0.7) score += 15; else if (data.putCallRatio > 1.3) score -= 15;
    return Math.max(0, Math.min(100, score));
  };

  const sentimentLabel = (score: number): string => {
    if (score <= 20) return '极度恐惧';
    if (score <= 40) return '恐惧';
    if (score <= 60) return '中性';
    if (score <= 80) return '贪婪';
    return '极度贪婪';
  };

  describe('恐贪指数', () => {
    it('范围0-100', () => {
      const score = fearGreedIndex({ volatility: 25, momentum: 0, volume: 1, putCallRatio: 1 });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
    it('极度恐惧', () => {
      const score = fearGreedIndex({ volatility: 60, momentum: -5, volume: 0.2, putCallRatio: 2 });
      expect(score).toBeLessThanOrEqual(20);
    });
    it('极度贪婪', () => {
      const score = fearGreedIndex({ volatility: 10, momentum: 5, volume: 2, putCallRatio: 0.3 });
      expect(score).toBeGreaterThanOrEqual(80);
    });
    it('中性市场', () => {
      const score = fearGreedIndex({ volatility: 30, momentum: 0, volume: 1, putCallRatio: 1 });
      expect(score).toBe(40); // momentum=0 hits else branch: -10
    });
  });

  describe('情绪标签', () => {
    it('极度恐惧', () => expect(sentimentLabel(10)).toBe('极度恐惧'));
    it('恐惧', () => expect(sentimentLabel(30)).toBe('恐惧'));
    it('中性', () => expect(sentimentLabel(50)).toBe('中性'));
    it('贪婪', () => expect(sentimentLabel(70)).toBe('贪婪'));
    it('极度贪婪', () => expect(sentimentLabel(90)).toBe('极度贪婪'));
    it('边界20', () => expect(sentimentLabel(20)).toBe('极度恐惧'));
    it('边界40', () => expect(sentimentLabel(40)).toBe('恐惧'));
    it('边界60', () => expect(sentimentLabel(60)).toBe('中性'));
    it('边界80', () => expect(sentimentLabel(80)).toBe('贪婪'));
  });

  // 涨跌比
  const advanceDeclineRatio = (advances: number, declines: number): number =>
    declines === 0 ? advances : advances / declines;

  const adLine = (data: { advances: number; declines: number }[]): number[] => {
    let cum = 0;
    return data.map(d => { cum += d.advances - d.declines; return cum; });
  };

  describe('涨跌比', () => {
    it('涨多跌少', () => expect(advanceDeclineRatio(100, 50)).toBe(2));
    it('跌多涨少', () => expect(advanceDeclineRatio(50, 100)).toBe(0.5));
    it('涨跌相等', () => expect(advanceDeclineRatio(50, 50)).toBe(1));
    it('零跌', () => expect(advanceDeclineRatio(10, 0)).toBe(10));
    it('全零', () => expect(advanceDeclineRatio(0, 0)).toBe(0));
    it('AD线累加', () => {
      const r = adLine([{ advances: 100, declines: 50 }, { advances: 80, declines: 70 }]);
      expect(r).toEqual([50, 60]);
    });
    it('AD线单日', () => {
      expect(adLine([{ advances: 30, declines: 20 }])).toEqual([10]);
    });
    it('AD线下跌', () => {
      const r = adLine([{ advances: 10, declines: 100 }]);
      expect(r[0]).toBeLessThan(0);
    });
  });

  // 板块轮动
  const sectorRotation = (sectors: Record<string, number[]>): string[] => {
    return Object.entries(sectors)
      .map(([name, returns]) => ({ name, avg: returns.reduce((a, b) => a + b, 0) / returns.length }))
      .sort((a, b) => b.avg - a.avg)
      .map(s => s.name);
  };

  const hotSectors = (sectors: Record<string, number>, threshold: number): string[] =>
    Object.entries(sectors).filter(([_, v]) => v > threshold).map(([k]) => k);

  describe('板块轮动', () => {
    it('排序正确', () => {
      const r = sectorRotation({ 科技: [0.1, 0.2], 金融: [0.05, 0.01], 消费: [0.08, 0.06] });
      expect(r[0]).toBe('科技');
    });
    it('单板块', () => {
      expect(sectorRotation({ 医药: [0.1] })).toEqual(['医药']);
    });
    it('等值排序', () => {
      const r = sectorRotation({ A: [0.1], B: [0.1] });
      expect(r.length).toBe(2);
    });
    it('热门板块', () => {
      const r = hotSectors({ 科技: 0.1, 金融: 0.02, 消费: 0.08 }, 0.05);
      expect(r).toContain('科技');
      expect(r).toContain('消费');
      expect(r).not.toContain('金融');
    });
    it('无热门', () => {
      expect(hotSectors({ A: 0.01, B: 0.02 }, 0.1).length).toBe(0);
    });
  });

  // 资金流向
  const capitalFlow = (inflow: number[], outflow: number[]): { net: number[]; trend: string[] } => {
    const net = inflow.map((v, i) => v - outflow[i]);
    const trend = net.map(n => n > 0 ? '流入' : n < 0 ? '流出' : '平衡');
    return { net, trend };
  };

  const flowSummary = (flows: number[]): { totalIn: number; totalOut: number; netFlow: number } => {
    const totalIn = flows.filter(f => f > 0).reduce((a, b) => a + b, 0);
    const totalOut = Math.abs(flows.filter(f => f < 0).reduce((a, b) => a + b, 0));
    return { totalIn, totalOut, netFlow: totalIn - totalOut };
  };

  describe('资金流向', () => {
    it('净流入', () => {
      const { net } = capitalFlow([100, 200], [50, 100]);
      expect(net).toEqual([50, 100]);
    });
    it('净流出', () => {
      const { trend } = capitalFlow([50], [100]);
      expect(trend[0]).toBe('流出');
    });
    it('平衡', () => {
      const { trend } = capitalFlow([100], [100]);
      expect(trend[0]).toBe('平衡');
    });
    it('汇总计算', () => {
      const { totalIn, totalOut, netFlow } = flowSummary([100, -50, 200, -30]);
      expect(totalIn).toBe(300);
      expect(totalOut).toBe(80);
      expect(netFlow).toBe(220);
    });
    it('全流入', () => {
      const { totalOut } = flowSummary([100, 200]);
      expect(totalOut).toBe(0);
    });
    it('全流出', () => {
      const { totalIn } = flowSummary([-100, -200]);
      expect(totalIn).toBe(0);
    });
  });

  // 量价分析
  const volumePriceTrend = (prices: number[], volumes: number[]): number[] => {
    const vpt: number[] = [0];
    for (let i = 1; i < prices.length; i++) {
      vpt.push(vpt[i - 1] + volumes[i] * ((prices[i] - prices[i - 1]) / prices[i - 1]));
    }
    return vpt;
  };

  const obv = (prices: number[], volumes: number[]): number[] => {
    const result: number[] = [volumes[0]];
    for (let i = 1; i < prices.length; i++) {
      result.push(result[i - 1] + (prices[i] >= prices[i - 1] ? volumes[i] : -volumes[i]));
    }
    return result;
  };

  describe('量价分析', () => {
    it('VPT上涨趋势', () => {
      const vpt = volumePriceTrend([10, 11, 12, 13], [100, 100, 100, 100]);
      expect(vpt[3]).toBeGreaterThan(vpt[0]);
    });
    it('VPT下跌趋势', () => {
      const vpt = volumePriceTrend([13, 12, 11, 10], [100, 100, 100, 100]);
      expect(vpt[3]).toBeLessThan(vpt[0]);
    });
    it('OBV上涨增', () => {
      const r = obv([10, 11, 12], [100, 200, 300]);
      expect(r[2]).toBe(600);
    });
    it('OBV下跌减', () => {
      const r = obv([12, 11, 10], [100, 200, 300]);
      expect(r[2]).toBe(-400);
    });
    it('OBV平价', () => {
      const r = obv([10, 10, 10], [100, 200, 300]);
      expect(r[2]).toBe(600);
    });
    it('长度匹配', () => {
      expect(volumePriceTrend([1, 2, 3], [10, 20, 30]).length).toBe(3);
    });
  });

  // 市场宽度
  const marketBreadth = (above: number, total: number): number => above / total * 100;
  const mcclellanOscillator = (advances: number[], declines: number[], fast = 19, slow = 39): number[] => {
    const diff = advances.map((a, i) => a - declines[i]);
    const ema = (d: number[], p: number): number[] => {
      const k = 2 / (p + 1);
      const r = [d[0]];
      for (let i = 1; i < d.length; i++) r.push(d[i] * k + r[i - 1] * (1 - k));
      return r;
    };
    const fastEma = ema(diff, fast);
    const slowEma = ema(diff, slow);
    return fastEma.map((f, i) => f - slowEma[i]);
  };

  describe('市场宽度', () => {
    it('50%宽度', () => expect(marketBreadth(500, 1000)).toBe(50));
    it('100%宽度', () => expect(marketBreadth(100, 100)).toBe(100));
    it('0%宽度', () => expect(marketBreadth(0, 100)).toBe(0));
    it('McClellan振荡器', () => {
      const adv = Array(50).fill(100);
      const dec = Array(50).fill(80);
      const osc = mcclellanOscillator(adv, dec);
      expect(osc.length).toBe(50);
      // With constant diff, both EMAs converge to same value
      expect(osc[osc.length - 1]).toBeGreaterThanOrEqual(0);
    });
    it('长度匹配', () => {
      const osc = mcclellanOscillator([10, 20, 30], [5, 10, 15]);
      expect(osc.length).toBe(3);
    });
  });

  // 换手率分析
  const turnoverRate = (volume: number, floatShares: number): number => volume / floatShares * 100;
  const avgTurnover = (rates: number[]): number => rates.reduce((a, b) => a + b, 0) / rates.length;

  describe('换手率', () => {
    it('计算正确', () => expect(turnoverRate(1000, 10000)).toBe(10));
    it('100%换手', () => expect(turnoverRate(5000, 5000)).toBe(100));
    it('零换手', () => expect(turnoverRate(0, 1000)).toBe(0));
    it('平均换手率', () => expect(avgTurnover([5, 10, 15])).toBe(10));
    it('单日换手', () => expect(avgTurnover([7.5])).toBe(7.5));
  });
});
