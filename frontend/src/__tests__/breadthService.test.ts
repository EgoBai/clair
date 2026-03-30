// @vitest-environment jsdom
/**
 * Breadth Service 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { breadthService } from '../services/breadthService';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('breadthService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('getCurrent', () => {
    it('应该获取当前市场宽度数据', async () => {
      const mockData = {
        timestamp: Date.now(),
        advancing: 1500,
        declining: 800,
        unchanged: 100,
        totalStocks: 2400,
        advanceDeclineRatio: 1.88,
        newHighs: 50,
        newLows: 20,
        upVolume: 3000000000,
        downVolume: 2000000000,
        volumeRatio: 1.5,
        marketSentiment: 'bullish',
        sentimentScore: 35,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockData }),
      });

      const result = await breadthService.getCurrent();
      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith('/api/breadth/current');
    });

    it('应该处理API错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(breadthService.getCurrent()).rejects.toThrow('API error: 500');
    });

    it('应该处理业务错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: '数据库错误' }),
      });

      await expect(breadthService.getCurrent()).rejects.toThrow('数据库错误');
    });
  });

  describe('getSectors', () => {
    it('应该获取板块宽度数据', async () => {
      const mockSectors = [
        { sector: '银行', advancing: 30, declining: 10, avgChangePercent: 1.5, strength: 75 },
        { sector: '医药', advancing: 25, declining: 15, avgChangePercent: 0.8, strength: 62 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockSectors }),
      });

      const result = await breadthService.getSectors();
      expect(result).toEqual(mockSectors);
      expect(mockFetch).toHaveBeenCalledWith('/api/breadth/sectors');
    });
  });

  describe('getHistory', () => {
    it('应该获取历史数据', async () => {
      const mockHistory = {
        data: [{ timestamp: Date.now(), advancing: 1500, declining: 800 }],
        period: '5d',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockHistory }),
      });

      const result = await breadthService.getHistory('5d');
      expect(result).toEqual(mockHistory);
      expect(mockFetch).toHaveBeenCalledWith('/api/breadth/history?period=5d');
    });

    it('应该使用默认周期', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { data: [], period: '5d' } }),
      });

      await breadthService.getHistory();
      expect(mockFetch).toHaveBeenCalledWith('/api/breadth/history?period=5d');
    });
  });

  describe('getMcClellan', () => {
    it('应该获取McClellan指标', async () => {
      const mockData = { value: 50, signal: 'neutral', trend: '上升趋势' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockData }),
      });

      const result = await breadthService.getMcClellan();
      expect(result).toEqual(mockData);
    });
  });

  describe('getCacheStats', () => {
    it('应该获取缓存统计', async () => {
      const mockStats = { breadth: 1, sectors: 1, history: 3 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockStats }),
      });

      const result = await breadthService.getCacheStats();
      expect(result).toEqual(mockStats);
    });
  });
});
