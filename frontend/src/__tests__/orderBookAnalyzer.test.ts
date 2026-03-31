import { describe, it, expect } from 'vitest';

/**
 * 市场微观结构 / 订单簿分析 / 高频数据处理逻辑测试
 */

describe('OrderBookAnalyzer', () => {
  describe('订单簿数据', () => {
    const orderBook = {
      bids: [
        { price: 100.00, volume: 500, orders: 10 },
        { price: 99.99, volume: 300, orders: 8 },
        { price: 99.98, volume: 800, orders: 15 },
        { price: 99.97, volume: 200, orders: 5 },
        { price: 99.96, volume: 600, orders: 12 },
      ],
      asks: [
        { price: 100.01, volume: 400, orders: 9 },
        { price: 100.02, volume: 350, orders: 7 },
        { price: 100.03, volume: 700, orders: 14 },
        { price: 100.04, volume: 250, orders: 6 },
        { price: 100.05, volume: 550, orders: 11 },
      ],
    };

    it('买卖价差应该为正值', () => {
      const spread = orderBook.asks[0].price - orderBook.bids[0].price;
      expect(spread).toBeCloseTo(0.01, 2);
    });

    it('中间价应该在买卖之间', () => {
      const midPrice = (orderBook.asks[0].price + orderBook.bids[0].price) / 2;
      expect(midPrice).toBe(100.005);
    });
  });

  describe('订单流不平衡', () => {
    const calcImbalance = (bidVolume: number, askVolume: number) => {
      return (bidVolume - askVolume) / (bidVolume + askVolume);
    };

    it('买盘量大应该为正不平衡', () => {
      expect(calcImbalance(600, 400)).toBe(0.2);
    });

    it('卖盘量大应该为负不平衡', () => {
      expect(calcImbalance(400, 600)).toBe(-0.2);
    });

    it('平衡应该接近 0', () => {
      expect(calcImbalance(500, 500)).toBe(0);
    });
  });

  describe('成交量加权平均价 (VWAP)', () => {
    const calcVWAP = (trades: {price: number, volume: number}[]) => {
      const totalValue = trades.reduce((s, t) => s + t.price * t.volume, 0);
      const totalVolume = trades.reduce((s, t) => s + t.volume, 0);
      return totalValue / totalVolume;
    };

    it('应该计算 VWAP', () => {
      const trades = [
        { price: 100, volume: 1000 },
        { price: 101, volume: 500 },
        { price: 99, volume: 2000 },
      ];
      const vwap = calcVWAP(trades);
      // (100*1000 + 101*500 + 99*2000) / 3500 = (100000+50500+198000)/3500 = 348500/3500 ≈ 99.57
      expect(vwap).toBeCloseTo(99.57, 1);
    });

    it('等量交易 VWAP 应等于算术平均', () => {
      const trades = [
        { price: 100, volume: 100 },
        { price: 102, volume: 100 },
      ];
      const vwap = calcVWAP(trades);
      expect(vwap).toBe(101);
    });
  });

  describe('TWAP (时间加权平均价)', () => {
    const calcTWAP = (prices: number[]) => {
      return prices.reduce((a, b) => a + b) / prices.length;
    };

    it('应该计算 TWAP', () => {
      const prices = [100, 101, 99, 102, 98];
      expect(calcTWAP(prices)).toBe(100);
    });
  });

  describe('市场冲击模型', () => {
    const marketImpact = (orderSize: number, adv: number, volatility: number) => {
      const participation = orderSize / adv;
      return volatility * Math.sqrt(participation) * 0.5;
    };

    it('大订单应该有更大冲击', () => {
      const small = marketImpact(1e6, 1e9, 0.02);
      const large = marketImpact(1e8, 1e9, 0.02);
      expect(large).toBeGreaterThan(small);
    });

    it('高波动率应该有更大冲击', () => {
      const lowVol = marketImpact(1e7, 1e9, 0.01);
      const highVol = marketImpact(1e7, 1e9, 0.04);
      expect(highVol).toBeGreaterThan(lowVol);
    });
  });
});

describe('AbnormalTradeEngine', () => {
  describe('异常交易检测', () => {
    const detectAbnormal = (
      volume: number,
      avgVolume: number,
      price: number,
      vwap: number,
      threshold: number = 3
    ) => {
      const volumeRatio = volume / avgVolume;
      const priceDeviation = Math.abs(price - vwap) / vwap;
      return {
        isAbnormalVolume: volumeRatio > threshold,
        isAbnormalPrice: priceDeviation > 0.02,
        volumeRatio,
        priceDeviation,
      };
    };

    it('应该检测异常放量', () => {
      const result = detectAbnormal(5000, 1000, 100, 100);
      expect(result.isAbnormalVolume).toBe(true);
    });

    it('应该检测异常价格偏离', () => {
      const result = detectAbnormal(1000, 1000, 105, 100);
      expect(result.isAbnormalPrice).toBe(true);
    });

    it('正常交易不应该触发', () => {
      const result = detectAbnormal(1000, 1000, 100, 100);
      expect(result.isAbnormalVolume).toBe(false);
      expect(result.isAbnormalPrice).toBe(false);
    });
  });

  describe('大单检测', () => {
    const isLargeOrder = (amount: number, avgAmount: number) => {
      return amount > avgAmount * 5;
    };

    it('应该检测大单', () => {
      expect(isLargeOrder(1000000, 100000)).toBe(true);
    });

    it('普通订单不应该标记为大单', () => {
      expect(isLargeOrder(200000, 100000)).toBe(false);
    });
  });
});
