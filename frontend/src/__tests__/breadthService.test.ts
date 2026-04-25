// @vitest-environment jsdom
/**
 * Breadth Service 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { breadthService } from '../services/breadthService';
import * as apiModule from '../services/api';

// Mock apiService.get
vi.mock('../services/api', () => ({
  apiService: {
    get: vi.fn(),
  },
}));

describe('breadthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      (apiModule.apiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockData,
      });

      const result = await breadthService.getCurrent();
      expect(result).toEqual(mockData);
      expect(apiModule.apiService.get).toHaveBeenCalledWith('/breadth/current');
    });

    it('应该处理API错误', async () => {
      (apiModule.apiService.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('API error: 500')
      );

      await expect(breadthService.getCurrent()).rejects.toThrow('API error: 500');
    });

    it('应该处理业务错误', async () => {
      (apiModule.apiService.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('数据库错误')
      );

      await expect(breadthService.getCurrent()).rejects.toThrow('数据库错误');
    });
  });

  describe('getSectors', () => {
    it('应该获取板块宽度数据', async () => {
      const mockSectors = [
        { sector: '银行', advancing: 30, declining: 10, avgChangePercent: 1.5, strength: 75 },
        { sector: '医药', advancing: 25, declining: 15, avgChangePercent: 0.8, strength: 62 },
      ];

      (apiModule.apiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockSectors,
      });

      const result = await breadthService.getSectors();
      expect(result).toEqual(mockSectors);
      expect(apiModule.apiService.get).toHaveBeenCalledWith('/breadth/sectors');
    });
  });

  describe('getHistory', () => {
    it('应该获取历史数据', async () => {
      const mockHistory = {
        data: [{ timestamp: Date.now(), advancing: 1500, declining: 800 }],
        period: '5d',
      };

      (apiModule.apiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockHistory,
      });

      const result = await breadthService.getHistory('5d');
      expect(result).toEqual(mockHistory);
      expect(apiModule.apiService.get).toHaveBeenCalledWith('/breadth/history?period=5d');
    });

    it('应该使用默认周期', async () => {
      (apiModule.apiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { data: [], period: '5d' },
      });

      await breadthService.getHistory();
      expect(apiModule.apiService.get).toHaveBeenCalledWith('/breadth/history?period=5d');
    });
  });

  describe('getMcClellan', () => {
    it('应该获取McClellan指标', async () => {
      const mockData = { value: 50, signal: 'neutral', trend: '上升趋势' };

      (apiModule.apiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockData,
      });

      const result = await breadthService.getMcClellan();
      expect(result).toEqual(mockData);
      expect(apiModule.apiService.get).toHaveBeenCalledWith('/breadth/mcclellan');
    });
  });

  describe('getCacheStats', () => {
    it('应该获取缓存统计', async () => {
      const mockStats = { breadth: 1, sectors: 1, history: 3 };

      (apiModule.apiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockStats,
      });

      const result = await breadthService.getCacheStats();
      expect(result).toEqual(mockStats);
      expect(apiModule.apiService.get).toHaveBeenCalledWith('/breadth/cache-stats');
    });
  });
});
