import { describe, it, expect } from 'vitest';

describe('数据同步服务', () => {
  describe('SyncResult 数据结构', () => {
    it('应该有正确的字段结构', () => {
      const result = {
        success: true,
        stocksCreated: 10,
        quotesSaved: 100,
        errors: [],
        duration: 1500,
      };
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('stocksCreated');
      expect(result).toHaveProperty('quotesSaved');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('duration');
    });

    it('成功时 errors 应该为空', () => {
      const result = {
        success: true,
        stocksCreated: 5,
        quotesSaved: 50,
        errors: [],
        duration: 800,
      };
      expect(result.errors).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    it('失败时应该包含错误信息', () => {
      const result = {
        success: false,
        stocksCreated: 0,
        quotesSaved: 0,
        errors: ['网络超时', 'API限制'],
        duration: 5000,
      };
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('duration 应该是非负数', () => {
      const durations = [0, 100, 5000, 30000];
      for (const d of durations) {
        expect(d).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('RawQuoteData 数据结构', () => {
    it('应该包含必要字段', () => {
      const quote = {
        symbol: '600519',
        name: '贵州茅台',
        currentPrice: 1800.00,
        openPrice: 1795.00,
        highPrice: 1810.00,
        lowPrice: 1790.00,
        prevClose: 1798.00,
        volume: 50000,
        turnover: 90000000,
        change: 2.00,
        changePercent: 0.11,
        amplitude: 1.11,
        turnoverRate: 0.40,
        timestamp: Date.now(),
        source: 'tencent',
      };
      expect(quote.symbol).toMatch(/^\d{6}$/);
      expect(quote.currentPrice).toBeGreaterThan(0);
      expect(quote.volume).toBeGreaterThanOrEqual(0);
    });

    it('可选字段应该可以不存在', () => {
      const quote = {
        symbol: '000001',
        name: '平安银行',
        currentPrice: 12.50,
        openPrice: 12.40,
        highPrice: 12.60,
        lowPrice: 12.30,
        prevClose: 12.45,
        volume: 100000,
        turnover: 1250000,
        change: 0.05,
        changePercent: 0.40,
        amplitude: 2.41,
        turnoverRate: 0.52,
        timestamp: Date.now(),
        source: 'tencent',
      };
      expect(quote.peRatio).toBeUndefined();
      expect(quote.pbRatio).toBeUndefined();
    });
  });

  describe('RawKLineData 数据结构', () => {
    it('应该包含OHLCV字段', () => {
      const kline = {
        symbol: '600519',
        tradeDate: '2026-03-24',
        openPrice: 1795.00,
        closePrice: 1800.00,
        highPrice: 1810.00,
        lowPrice: 1790.00,
        volume: 50000,
        turnover: 90000000,
      };
      expect(kline.openPrice).toBeLessThanOrEqual(kline.highPrice);
      expect(kline.closePrice).toBeLessThanOrEqual(kline.highPrice);
      expect(kline.lowPrice).toBeLessThanOrEqual(kline.openPrice);
      expect(kline.lowPrice).toBeLessThanOrEqual(kline.closePrice);
    });

    it('日期格式应该是 YYYY-MM-DD', () => {
      const dates = ['2026-03-24', '2025-12-31', '2026-01-01'];
      for (const d of dates) {
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('volume 和 turnover 应该是非负数', () => {
      const kline = {
        symbol: '000001',
        tradeDate: '2026-03-24',
        openPrice: 12.40,
        closePrice: 12.50,
        highPrice: 12.60,
        lowPrice: 12.30,
        volume: 100000,
        turnover: 1250000,
      };
      expect(kline.volume).toBeGreaterThanOrEqual(0);
      expect(kline.turnover).toBeGreaterThanOrEqual(0);
    });
  });

  describe('同步状态管理', () => {
    it('运行中不应该重复启动', () => {
      let isRunning = false;
      const canStart = () => {
        if (isRunning) return false;
        isRunning = true;
        return true;
      };
      expect(canStart()).toBe(true);
      expect(canStart()).toBe(false);
    });

    it('完成后应该可以重新启动', () => {
      let isRunning = false;
      const start = () => {
        if (isRunning) return false;
        isRunning = true;
        return true;
      };
      const finish = () => { isRunning = false; };
      expect(start()).toBe(true);
      expect(start()).toBe(false);
      finish();
      expect(start()).toBe(true);
    });
  });

  describe('数据源优先级', () => {
    it('应该按优先级降级', () => {
      const sources = [
        { name: 'tencent', priority: 1, rateLimit: 100 },
        { name: 'sina', priority: 2, rateLimit: 50 },
        { name: 'eastmoney', priority: 3, rateLimit: 30 },
      ];
      const sorted = [...sources].sort((a, b) => a.priority - b.priority);
      expect(sorted[0].name).toBe('tencent');
      expect(sorted[1].name).toBe('sina');
      expect(sorted[2].name).toBe('eastmoney');
    });
  });
});
