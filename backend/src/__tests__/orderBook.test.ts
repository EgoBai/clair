/**
 * 盘口数据测试
 */

import { describe, it, expect } from 'vitest';
import { generateOrderBook, generateTimeShare } from '../api/order-book';

describe('盘口数据', () => {
  describe('OrderBook 生成', () => {
    it('应生成正确的盘口结构', () => {
      const data = generateOrderBook('600519.SH', '贵州茅台');

      expect(data).toHaveProperty('symbol', '600519.SH');
      expect(data).toHaveProperty('name', '贵州茅台');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('lastPrice');
      expect(data).toHaveProperty('bids');
      expect(data).toHaveProperty('asks');
      expect(data).toHaveProperty('bidAskRatio');
    });

    it('应生成5档买盘和5档卖盘', () => {
      const data = generateOrderBook('000858.SZ', '五粮液');

      expect(data.bids).toHaveLength(5);
      expect(data.asks).toHaveLength(5);
    });

    it('买盘价格应低于最新价，卖盘价格应高于最新价', () => {
      const data = generateOrderBook('601318.SH', '中国平安');

      for (const bid of data.bids) {
        expect(bid.price).toBeLessThan(data.lastPrice);
      }
      for (const ask of data.asks) {
        expect(ask.price).toBeGreaterThan(data.lastPrice);
      }
    });

    it('每档应包含price/volume/amount', () => {
      const data = generateOrderBook('300750.SZ', '宁德时代');

      for (const bid of data.bids) {
        expect(bid.price).toBeGreaterThan(0);
        expect(bid.volume).toBeGreaterThan(0);
        expect(bid.amount).toBeGreaterThan(0);
      }
    });

    it('委比应在 -100 到 100 之间', () => {
      for (let i = 0; i < 20; i++) {
        const data = generateOrderBook('600519.SH', '茅台');
        expect(data.bidAskRatio).toBeGreaterThanOrEqual(-100);
        expect(data.bidAskRatio).toBeLessThanOrEqual(100);
      }
    });

    it('总买量和总卖量应正确计算', () => {
      const data = generateOrderBook('600036.SH', '招商银行');

      const bidTotal = data.bids.reduce((s, b) => s + b.volume, 0);
      const askTotal = data.asks.reduce((s, a) => s + a.volume, 0);

      expect(data.totalBidVolume).toBe(bidTotal);
      expect(data.totalAskVolume).toBe(askTotal);
    });

    it('振幅应大于0', () => {
      const data = generateOrderBook('002594.SZ', '比亚迪');
      expect(data.amplitude).toBeGreaterThan(0);
    });
  });

  describe('分时数据生成', () => {
    it('应生成分时数据数组', () => {
      const data = generateTimeShare('600519.SH');

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('每条分时应包含 time/price/volume/avgPrice/change', () => {
      const data = generateTimeShare('000858.SZ');

      for (const point of data) {
        expect(point).toHaveProperty('time');
        expect(point).toHaveProperty('price');
        expect(point).toHaveProperty('volume');
        expect(point).toHaveProperty('avgPrice');
        expect(point).toHaveProperty('change');
        expect(point.price).toBeGreaterThan(0);
        expect(point.volume).toBeGreaterThan(0);
      }
    });

    it('时间应为 HH:MM 格式', () => {
      const data = generateTimeShare('601318.SH');

      for (const point of data) {
        expect(point.time).toMatch(/^\d{2}:\d{2}$/);
      }
    });

    it('成交量应为100的整数倍(A股最小交易单位)', () => {
      const data = generateTimeShare('300750.SZ');

      for (const point of data) {
        expect(point.volume % 100).toBe(0);
      }
    });
  });
});
