/**
 * 市场宽度分析服务测试（诚实数据版）
 *
 * 约定：marketBreadth 不再生成任何随机/模拟数据。
 * - 真实源（东方财富 push2）可用时返回真实涨跌分布；
 * - 真实源缺失时抛出 BreadthUnavailableError（由路由层降级为诚实空）；
 * - 板块宽度/历史时序尚未接入真实源，返回空（前端按“未接入”处理）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/realMarketData', () => ({
  getRealMarketData: vi.fn(),
}));

import { getRealMarketData } from '../services/realMarketData';
import { marketBreadthService, BreadthUnavailableError } from '../services/marketBreadth';

const IDX = { name: '测试', price: 0, changePct: 0 };
const realBreadth = {
  up: 3000,
  down: 1500,
  flat: 200,
  limitUp: 50,
  limitDown: 10,
  turnoverYi: 8000,
  upVolume: 5e11,
  downVolume: 3e11,
  volumeRatio: 1.667,
};

describe('MarketBreadthService (honest-data)', () => {
  beforeEach(() => {
    marketBreadthService.clearCache();
    vi.clearAllMocks();
  });

  describe('calculateBreadth', () => {
    it('真实源可用时返回真实涨跌分布', async () => {
      (getRealMarketData as any).mockResolvedValue({
        shanghai: IDX,
        shenzhen: IDX,
        chinext: IDX,
        breadth: realBreadth,
      });

      const data = await marketBreadthService.calculateBreadth();

      expect(data.advancing).toBe(3000);
      expect(data.declining).toBe(1500);
      expect(data.unchanged).toBe(200);
      expect(data.totalStocks).toBe(4700);
      expect(data.advanceDeclineRatio).toBeCloseTo(2, 1);
      expect(data.upVolume).toBe(5e11);
      expect(data.downVolume).toBe(3e11);
      expect(['bullish', 'bearish', 'neutral']).toContain(data.marketSentiment);
      expect(data.sentimentScore).toBeGreaterThanOrEqual(-100);
      expect(data.sentimentScore).toBeLessThanOrEqual(100);
    });

    it('真实源缺失时抛出 BreadthUnavailableError（诚实空，不回填模拟）', async () => {
      (getRealMarketData as any).mockResolvedValue({
        shanghai: IDX,
        shenzhen: IDX,
        chinext: IDX,
        breadth: null,
      });

      await expect(marketBreadthService.calculateBreadth()).rejects.toBeInstanceOf(
        BreadthUnavailableError
      );
    });

    it('应该缓存真实结果（两次调用时间戳一致）', async () => {
      (getRealMarketData as any).mockResolvedValue({
        shanghai: IDX,
        shenzhen: IDX,
        chinext: IDX,
        breadth: realBreadth,
      });

      const a = await marketBreadthService.calculateBreadth();
      const b = await marketBreadthService.calculateBreadth();
      expect(a.timestamp).toBe(b.timestamp);
      // 第二次应命中缓存，不应再次调用真实源
      expect(getRealMarketData).toHaveBeenCalledTimes(1);
    });

    it('应该发出更新事件', async () => {
      (getRealMarketData as any).mockResolvedValue({
        shanghai: IDX,
        shenzhen: IDX,
        chinext: IDX,
        breadth: realBreadth,
      });

      const listener = vi.fn();
      marketBreadthService.on('breadth:update', listener);

      await marketBreadthService.calculateBreadth();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ advancing: 3000, declining: 1500 })
      );
    });
  });

  describe('getSectorBreadth', () => {
    it('未接入真实源时返回空数组（诚实空，不实随机板块）', async () => {
      const sectors = await marketBreadthService.getSectorBreadth();
      expect(Array.isArray(sectors)).toBe(true);
      expect(sectors.length).toBe(0);
    });
  });

  describe('getBreadthHistory', () => {
    it('未接入时序源时返回空序列', async () => {
      const history = await marketBreadthService.getBreadthHistory('5d');
      expect(history).toHaveProperty('period', '5d');
      expect(history.data.length).toBe(0);
    });

    it('支持不同时间周期键', async () => {
      const periods: Array<'1d' | '5d' | '1m' | '3m'> = ['1d', '5d', '1m', '3m'];
      for (const p of periods) {
        const history = await marketBreadthService.getBreadthHistory(p);
        expect(history.period).toBe(p);
        expect(history.data.length).toBe(0);
      }
    });
  });

  describe('getMcClellanOscillator', () => {
    it('无历史时返回中性指标（诚实，不生成随机曲线）', async () => {
      const result = await marketBreadthService.getMcClellanOscillator();
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('trend');
      expect(['overbought', 'oversold', 'neutral']).toContain(result.signal);
    });
  });

  describe('clearCache', () => {
    it('应该清除所有缓存', async () => {
      await marketBreadthService.getSectorBreadth();
      await marketBreadthService.getBreadthHistory('5d');

      const statsBefore = marketBreadthService.getCacheStats();
      expect(statsBefore.sectors + statsBefore.history).toBeGreaterThan(0);

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
