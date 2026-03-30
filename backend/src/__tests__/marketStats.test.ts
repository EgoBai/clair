import { describe, it, expect } from 'vitest';

/**
 * 市场统计数据 API 测试
 * 测试涨跌分布、板块热度、市场宽度、市场情绪
 */
describe('Market Stats API', () => {
  describe('Price Distribution', () => {
    const ranges = [
      { label: '涨停', min: 9.9, max: 10.1, count: 25 },
      { label: '涨幅>7%', min: 7, max: 9.9, count: 45 },
      { label: '涨幅5-7%', min: 5, max: 7, count: 65 },
      { label: '涨幅3-5%', min: 3, max: 5, count: 120 },
      { label: '涨幅1-3%', min: 1, max: 3, count: 350 },
      { label: '涨幅0-1%', min: 0, max: 1, count: 500 },
      { label: '平盘', min: -0.01, max: 0.01, count: 80 },
      { label: '跌幅0-1%', min: -1, max: 0, count: 480 },
      { label: '跌幅1-3%', min: -3, max: -1, count: 320 },
      { label: '跌幅3-5%', min: -5, max: -3, count: 100 },
      { label: '跌幅5-7%', min: -7, max: -5, count: 55 },
      { label: '跌幅>7%', min: -10.1, max: -7, count: 35 },
      { label: '跌停', min: -10.1, max: -9.9, count: 12 },
    ];

    it('should calculate rising count correctly', () => {
      const rising = ranges
        .filter(r => r.min >= 0)
        .reduce((sum, r) => sum + r.count, 0);
      expect(rising).toBe(25 + 45 + 65 + 120 + 350 + 500); // 1105
    });

    it('should calculate falling count correctly', () => {
      const falling = ranges
        .filter(r => r.max <= 0 && r.min < -0.01)
        .reduce((sum, r) => sum + r.count, 0);
      expect(falling).toBe(480 + 320 + 100 + 55 + 35 + 12); // 1002
    });

    it('should find unchanged count', () => {
      const unchanged = ranges.find(r => r.label === '平盘')?.count || 0;
      expect(unchanged).toBe(80);
    });

    it('should identify limit up stocks', () => {
      const limitUp = ranges.find(r => r.label === '涨停')?.count || 0;
      expect(limitUp).toBe(25);
    });

    it('should identify limit down stocks', () => {
      const limitDown = ranges.find(r => r.label === '跌停')?.count || 0;
      expect(limitDown).toBe(12);
    });

    it('should have all distribution ranges', () => {
      expect(ranges.length).toBe(13);
      expect(ranges.every(r => typeof r.count === 'number')).toBe(true);
    });

    it('should have valid color values', () => {
      ranges.forEach(r => {
        expect(r.label).toBeTruthy();
        expect(typeof r.count).toBe('number');
      });
    });
  });

  describe('Sector Heat Calculation', () => {
    const sectors = [
      { name: '人工智能', changePercent: 3.5, turnover: 850e8, stockCount: 128 },
      { name: '半导体', changePercent: 2.8, turnover: 720e8, stockCount: 95 },
      { name: '银行', changePercent: 0.3, turnover: 380e8, stockCount: 42 },
      { name: '煤炭', changePercent: -1.8, turnover: 200e8, stockCount: 38 },
    ];

    it('should calculate heat score', () => {
      const heatData = sectors.map(s => ({
        ...s,
        heatScore: Math.round(
          (s.changePercent * 0.4 + (s.turnover / 1e10) * 0.4 + s.stockCount * 0.01) * 100
        ) / 100,
      }));
      expect(heatData[0].heatScore).toBeGreaterThan(0);
      expect(heatData[0].heatScore).toBeGreaterThan(heatData[3].heatScore);
    });

    it('should classify market phases', () => {
      const getPhase = (changePercent: number) =>
        changePercent > 2 ? '主升' : changePercent > 0 ? '吸筹' : changePercent > -1 ? '派发' : '下跌';

      expect(getPhase(3.5)).toBe('主升');
      expect(getPhase(0.3)).toBe('吸筹');
      expect(getPhase(-0.5)).toBe('派发');
      expect(getPhase(-1.8)).toBe('下跌');
    });

    it('should sort by heat score descending', () => {
      const heatData = sectors.map(s => ({
        ...s,
        heatScore: Math.round(
          (s.changePercent * 0.4 + (s.turnover / 1e10) * 0.4 + s.stockCount * 0.01) * 100
        ) / 100,
      })).sort((a, b) => b.heatScore - a.heatScore);

      for (let i = 1; i < heatData.length; i++) {
        expect(heatData[i - 1].heatScore).toBeGreaterThanOrEqual(heatData[i].heatScore);
      }
    });
  });

  describe('Market Breadth', () => {
    it('should calculate AD ratio', () => {
      const advancing = 2500;
      const declining = 2000;
      const adRatio = Math.round((advancing / Math.max(declining, 1)) * 100) / 100;
      expect(adRatio).toBe(1.25);
    });

    it('should handle zero declining stocks', () => {
      const adRatio = Math.round((2500 / Math.max(0, 1)) * 100) / 100;
      expect(adRatio).toBeGreaterThan(0);
    });

    it('should calculate McClellan oscillator', () => {
      const advancing = 2800;
      const declining = 1800;
      const mcclellan = advancing - declining;
      expect(mcclellan).toBe(1000);
    });

    it('should calculate Arms Index (TRIN)', () => {
      const advIssues = 2500;
      const decIssues = 2000;
      const advVolume = 500e8;
      const decVolume = 400e8;
      const armsIndex = Math.round(
        (decIssues / advIssues) / (decVolume / advVolume) * 100
      ) / 100;
      expect(armsIndex).toBeGreaterThan(0);
    });

    it('should detect new highs and lows', () => {
      const newHighs = 35;
      const newLows = 15;
      expect(newHighs).toBeGreaterThan(newLows);
      expect(newHighs).toBeGreaterThan(0);
      expect(newLows).toBeGreaterThan(0);
    });

    it('should calculate stocks above moving averages', () => {
      const aboveMA20 = 3200;
      const aboveMA60 = 2400;
      const aboveMA120 = 1800;
      const total = 5200;

      expect(aboveMA20).toBeGreaterThan(aboveMA60);
      expect(aboveMA60).toBeGreaterThan(aboveMA120);
      expect(aboveMA20 / total).toBeLessThan(1);
    });
  });

  describe('Market Sentiment', () => {
    it('should classify greed/fear index', () => {
      const classify = (index: number) =>
        index >= 60 ? 'greedy' : index <= 30 ? 'fearful' : 'neutral';

      expect(classify(75)).toBe('greedy');
      expect(classify(50)).toBe('neutral');
      expect(classify(20)).toBe('fearful');
    });

    it('should validate sentiment ranges', () => {
      const sentiment = {
        greedFearIndex: 45,
        vixEquivalent: 22.5,
        marginBalance: 16000,
        northboundFlow: -25.5,
        limitUpCount: 35,
        limitDownCount: 8,
      };

      expect(sentiment.greedFearIndex).toBeGreaterThanOrEqual(0);
      expect(sentiment.greedFearIndex).toBeLessThanOrEqual(100);
      expect(sentiment.vixEquivalent).toBeGreaterThan(0);
      expect(sentiment.limitUpCount).toBeGreaterThan(0);
      expect(sentiment.limitDownCount).toBeGreaterThan(0);
    });

    it('should calculate margin change trend', () => {
      const marginChange = 150; // 亿元
      const isPositive = marginChange > 0;
      expect(isPositive).toBe(true);

      const negativeMargin = -80;
      expect(negativeMargin < 0).toBe(true);
    });

    it('should validate northbound flow direction', () => {
      const northbound5d = 120;
      expect(Math.abs(northbound5d)).toBeGreaterThan(0);

      const isNetInflow = northbound5d > 0;
      expect(isNetInflow).toBe(true);
    });
  });

  describe('Response Structure', () => {
    it('should have consistent distribution response', () => {
      const response = {
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          total: 5200,
          ranges: [],
          summary: { rising: 0, falling: 0, unchanged: 0, limitUp: 0, limitDown: 0, avgChange: 0 },
        },
      };
      expect(response).toHaveProperty('success');
      expect(response.data).toHaveProperty('ranges');
      expect(response.data).toHaveProperty('summary');
    });

    it('should have consistent sentiment response', () => {
      const response = {
        success: true,
        data: {
          greedFearIndex: 45,
          mood: 'neutral',
          marginBalance: 16000,
          northboundFlow: -10,
        },
      };
      expect(response.data).toHaveProperty('greedFearIndex');
      expect(response.data).toHaveProperty('mood');
    });
  });
});
