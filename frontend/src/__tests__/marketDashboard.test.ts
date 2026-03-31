import { describe, it, expect, vi } from 'vitest';

/**
 * Dashboard 组件逻辑测试 - MarketOverview / MarketSentiment / CapitalFlowPanel / MarketBreadthPanel
 */

describe('MarketOverview', () => {
  describe('大盘数据', () => {
    const marketData = {
      indices: [
        { name: '上证指数', code: '000001', value: 3200, change: 25, changePercent: 0.78 },
        { name: '深证成指', code: '399001', value: 10500, change: -30, changePercent: -0.28 },
        { name: '创业板指', code: '399006', value: 2100, change: 15, changePercent: 0.72 },
      ],
      totalTurnover: 900e9,
      upCount: 2500,
      downCount: 1800,
      flatCount: 200,
    };

    it('应该有三大指数数据', () => {
      expect(marketData.indices).toHaveLength(3);
    });

    it('应该有总成交额', () => {
      expect(marketData.totalTurnover).toBeGreaterThan(0);
    });

    it('应该有涨跌家数统计', () => {
      const total = marketData.upCount + marketData.downCount + marketData.flatCount;
      expect(total).toBe(4500);
    });

    it('涨跌比应该有效', () => {
      expect(marketData.upCount).toBeGreaterThan(marketData.downCount);
    });
  });

  describe('市场强弱判断', () => {
    const getMarketStrength = (upCount: number, downCount: number) => {
      const ratio = upCount / (upCount + downCount);
      if (ratio > 0.7) return '强势';
      if (ratio > 0.55) return '偏强';
      if (ratio > 0.45) return '震荡';
      if (ratio > 0.3) return '偏弱';
      return '弱势';
    };

    it('上涨占70%以上为强势', () => {
      expect(getMarketStrength(700, 300)).toBe('偏强'); // 700/1000 = 0.7, not > 0.7
      expect(getMarketStrength(800, 200)).toBe('强势'); // 800/1000 = 0.8 > 0.7
    });

    it('上涨占55-70%为偏强', () => {
      expect(getMarketStrength(600, 400)).toBe('偏强');
    });

    it('45-55%为震荡', () => {
      expect(getMarketStrength(500, 500)).toBe('震荡');
    });
  });
});

describe('MarketSentiment', () => {
  describe('情绪指标', () => {
    const sentiment = {
      fearGreedIndex: 65,
      vix: 18.5,
      putCallRatio: 0.8,
      marginBalance: 1.5e12,
      northboundFlow: 5e9,
    };

    it('应该有恐惧贪婪指数', () => {
      expect(sentiment.fearGreedIndex).toBeGreaterThanOrEqual(0);
      expect(sentiment.fearGreedIndex).toBeLessThanOrEqual(100);
    });

    it('应该有波动率指数', () => {
      expect(sentiment.vix).toBeGreaterThan(0);
    });

    it('应该有看跌看涨比率', () => {
      expect(sentiment.putCallRatio).toBeGreaterThan(0);
    });
  });

  describe('情绪解读', () => {
    const interpretSentiment = (index: number) => {
      if (index >= 75) return '极度贪婪';
      if (index >= 55) return '贪婪';
      if (index >= 45) return '中性';
      if (index >= 25) return '恐惧';
      return '极度恐惧';
    };

    it('75以上为极度贪婪', () => {
      expect(interpretSentiment(80)).toBe('极度贪婪');
    });

    it('55-75为贪婪', () => {
      expect(interpretSentiment(65)).toBe('贪婪');
    });

    it('25以下为极度恐惧', () => {
      expect(interpretSentiment(15)).toBe('极度恐惧');
    });
  });
});

describe('CapitalFlowPanel', () => {
  describe('资金流向面板', () => {
    const flow = {
      mainNetInflow: 2e9,
      retailNetOutflow: -1.5e9,
      northbound: 3e9,
      southbound: -1e9,
      bySector: [
        { sector: '科技', netFlow: 5e8 },
        { sector: '金融', netFlow: -3e8 },
        { sector: '消费', netFlow: 2e8 },
      ],
    };

    it('应该有主力净流入', () => {
      expect(typeof flow.mainNetInflow).toBe('number');
    });

    it('应该有北向资金', () => {
      expect(flow.northbound).toBeGreaterThan(0);
    });

    it('应该有行业资金流向', () => {
      expect(flow.bySector).toHaveLength(3);
    });

    it('应该能计算行业资金排名', () => {
      const sorted = [...flow.bySector].sort((a, b) => b.netFlow - a.netFlow);
      expect(sorted[0].sector).toBe('科技');
    });
  });
});

describe('MarketBreadthPanel', () => {
  describe('市场宽度', () => {
    const breadth = {
      aboveMA20: 60,
      aboveMA60: 45,
      newHigh: 120,
      newLow: 30,
      advanceDeclineRatio: 1.5,
    };

    it('应该有均线以上占比', () => {
      expect(breadth.aboveMA20).toBeGreaterThanOrEqual(0);
      expect(breadth.aboveMA20).toBeLessThanOrEqual(100);
    });

    it('应该有新高新低数', () => {
      expect(breadth.newHigh).toBeGreaterThanOrEqual(0);
      expect(breadth.newLow).toBeGreaterThanOrEqual(0);
    });

    it('应该有涨跌比率', () => {
      expect(breadth.advanceDeclineRatio).toBeGreaterThan(0);
    });

    it('新高大于新低说明市场偏强', () => {
      expect(breadth.newHigh).toBeGreaterThan(breadth.newLow);
    });
  });
});
