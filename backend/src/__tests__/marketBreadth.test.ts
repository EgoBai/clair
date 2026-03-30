/**
 * 市场宽度分析服务测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { marketBreadthService } from '../services/marketBreadth';

describe('MarketBreadthService', () => {
  beforeEach(() => {
    marketBreadthService.clearCache();
  });

  describe('calculateBreadth', () => {
    it('应该返回市场宽度数据', async () => {
      const data = await marketBreadthService.calculateBreadth();

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('advancing');
      expect(data).toHaveProperty('declining');
      expect(data).toHaveProperty('unchanged');
      expect(data).toHaveProperty('totalStocks');
      expect(data).toHaveProperty('advanceDeclineRatio');
      expect(data).toHaveProperty('newHighs');
      expect(data).toHaveProperty('newLows');
      expect(data).toHaveProperty('upVolume');
      expect(data).toHaveProperty('downVolume');
      expect(data).toHaveProperty('volumeRatio');
      expect(data).toHaveProperty('marketSentiment');
      expect(data).toHaveProperty('sentimentScore');
    });

    it('应该返回合理的涨跌家数', async () => {
      const data = await marketBreadthService.calculateBreadth();

      expect(data.advancing).toBeGreaterThan(0);
      expect(data.declining).toBeGreaterThan(0);
      expect(data.unchanged).toBeGreaterThan(0);
      expect(data.totalStocks).toBe(data.advancing + data.declining + data.unchanged);
    });

    it('涨跌比应该大于0', async () => {
      const data = await marketBreadthService.calculateBreadth();

      expect(data.advanceDeclineRatio).toBeGreaterThan(0);
    });

    it('情绪分数应该在-100到100之间', async () => {
      const data = await marketBreadthService.calculateBreadth();

      expect(data.sentimentScore).toBeGreaterThanOrEqual(-100);
      expect(data.sentimentScore).toBeLessThanOrEqual(100);
    });

    it('市场情绪应该与分数一致', async () => {
      const data = await marketBreadthService.calculateBreadth();

      if (data.sentimentScore > 20) {
        expect(data.marketSentiment).toBe('bullish');
      } else if (data.sentimentScore < -20) {
        expect(data.marketSentiment).toBe('bearish');
      } else {
        expect(data.marketSentiment).toBe('neutral');
      }
    });

    it('应该缓存结果', async () => {
      const data1 = await marketBreadthService.calculateBreadth();
      const data2 = await marketBreadthService.calculateBreadth();

      // 缓存期间返回相同的数据
      expect(data1.timestamp).toBe(data2.timestamp);
    });

    it('应该发出更新事件', async () => {
      const listener = vi.fn();
      marketBreadthService.on('breadth:update', listener);

      await marketBreadthService.calculateBreadth();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        advancing: expect.any(Number),
        declining: expect.any(Number),
      }));
    });
  });

  describe('getSectorBreadth', () => {
    it('应该返回板块宽度数据', async () => {
      const sectors = await marketBreadthService.getSectorBreadth();

      expect(sectors.length).toBeGreaterThan(0);
      expect(sectors[0]).toHaveProperty('sector');
      expect(sectors[0]).toHaveProperty('advancing');
      expect(sectors[0]).toHaveProperty('declining');
      expect(sectors[0]).toHaveProperty('avgChangePercent');
      expect(sectors[0]).toHaveProperty('strength');
    });

    it('应该按强度降序排列', async () => {
      const sectors = await marketBreadthService.getSectorBreadth();

      for (let i = 1; i < sectors.length; i++) {
        expect(sectors[i - 1].strength).toBeGreaterThanOrEqual(sectors[i].strength);
      }
    });

    it('强度应该在0-100之间', async () => {
      const sectors = await marketBreadthService.getSectorBreadth();

      sectors.forEach(s => {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      });
    });

    it('应该包含常见板块', async () => {
      const sectors = await marketBreadthService.getSectorBreadth();
      const names = sectors.map(s => s.sector);

      expect(names).toContain('银行');
      expect(names).toContain('医药');
      expect(names).toContain('电子');
    });
  });

  describe('getBreadthHistory', () => {
    it('应该返回历史数据', async () => {
      const history = await marketBreadthService.getBreadthHistory('5d');

      expect(history).toHaveProperty('data');
      expect(history).toHaveProperty('period');
      expect(history.period).toBe('5d');
      expect(history.data.length).toBe(5);
    });

    it('应该支持不同时间周期', async () => {
      const periods: Array<'1d' | '5d' | '1m' | '3m'> = ['1d', '5d', '1m', '3m'];
      const expectedCounts = [24, 5, 22, 66];

      for (let i = 0; i < periods.length; i++) {
        const history = await marketBreadthService.getBreadthHistory(periods[i]);
        expect(history.data.length).toBe(expectedCounts[i]);
      }
    });

    it('历史数据时间戳应该递增', async () => {
      const history = await marketBreadthService.getBreadthHistory('5d');

      for (let i = 1; i < history.data.length; i++) {
        expect(history.data[i].timestamp).toBeGreaterThan(history.data[i - 1].timestamp);
      }
    });
  });

  describe('getMcClellanOscillator', () => {
    it('应该返回McClellan指标', async () => {
      const result = await marketBreadthService.getMcClellanOscillator();

      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('trend');
      expect(['overbought', 'oversold', 'neutral']).toContain(result.signal);
    });
  });

  describe('clearCache', () => {
    it('应该清除所有缓存', async () => {
      await marketBreadthService.calculateBreadth();
      await marketBreadthService.getSectorBreadth();

      const statsBefore = marketBreadthService.getCacheStats();
      expect(statsBefore.breadth + statsBefore.sectors + statsBefore.history).toBeGreaterThan(0);

      marketBreadthService.clearCache();

      const statsAfter = marketBreadthService.getCacheStats();
      expect(statsAfter.breadth).toBe(0);
      expect(statsAfter.sectors).toBe(0);
      expect(statsAfter.history).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('应该返回缓存统计', () => {
      const stats = marketBreadthService.getCacheStats();

      expect(stats).toHaveProperty('breadth');
      expect(stats).toHaveProperty('sectors');
      expect(stats).toHaveProperty('history');
      expect(typeof stats.breadth).toBe('number');
      expect(typeof stats.sectors).toBe('number');
      expect(typeof stats.history).toBe('number');
    });
  });
});
