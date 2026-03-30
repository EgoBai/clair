import { describe, it, expect } from 'vitest';

describe('交易算法与执行引擎', () => {

  // TWAP 执行算法
  const twapSplit = (totalQty: number, periods: number) => {
    if (periods <= 0 || totalQty <= 0) return [];
    const base = Math.floor(totalQty / periods);
    const remainder = totalQty % periods;
    return Array.from({ length: periods }, (_, i) => base + (i < remainder ? 1 : 0));
  };

  describe('TWAP执行', () => {
    it('均匀分配', () => {
      expect(twapSplit(1000, 10)).toEqual(Array(10).fill(100));
    });
    it('不能整除有余数', () => {
      const result = twapSplit(1003, 10);
      expect(result.reduce((a, b) => a + b, 0)).toBe(1003);
      expect(result[0]).toBe(101);
    });
    it('单周期', () => {
      expect(twapSplit(500, 1)).toEqual([500]);
    });
    it('零数量', () => {
      expect(twapSplit(0, 10)).toEqual([]);
    });
    it('零周期', () => {
      expect(twapSplit(100, 0)).toEqual([]);
    });
    it('总量等于请求量', () => {
      const result = twapSplit(12345, 7);
      expect(result.reduce((a, b) => a + b, 0)).toBe(12345);
    });
  });

  // VWAP 执行算法
  const vwapSplit = (totalQty: number, volumeProfile: number[]) => {
    const totalVol = volumeProfile.reduce((a, b) => a + b, 0);
    if (totalVol === 0) return volumeProfile.map(() => 0);
    return volumeProfile.map(v => Math.round(totalQty * (v / totalVol)));
  };

  describe('VWAP执行', () => {
    it('按成交量比例分配', () => {
      const result = vwapSplit(1000, [100, 200, 300, 400]);
      expect(result.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1001);
    });
    it('均匀成交量等同TWAP', () => {
      const result = vwapSplit(1000, [100, 100, 100, 100]);
      expect(result).toEqual([250, 250, 250, 250]);
    });
    it('零成交量', () => {
      expect(vwapSplit(1000, [0, 0, 0])).toEqual([0, 0, 0]);
    });
    it('单时段', () => {
      expect(vwapSplit(500, [100])).toEqual([500]);
    });
  });

  // 冰山订单
  const icebergOrder = (totalQty: number, displayQty: number) => {
    if (displayQty <= 0 || totalQty <= 0) return { slices: 0, lastSlice: 0, slices_: [] };
    const slices: number[] = [];
    let remaining = totalQty;
    while (remaining > 0) {
      const qty = Math.min(remaining, displayQty);
      slices.push(qty);
      remaining -= qty;
    }
    return { slices: slices.length, lastSlice: slices[slices.length - 1], slices_: slices };
  };

  describe('冰山订单', () => {
    it('均匀切片', () => {
      const result = icebergOrder(1000, 100);
      expect(result.slices).toBe(10);
      expect(result.lastSlice).toBe(100);
    });
    it('有余数', () => {
      const result = icebergOrder(1050, 100);
      expect(result.slices).toBe(11);
      expect(result.lastSlice).toBe(50);
    });
    it('总量等于展示量', () => {
      const result = icebergOrder(100, 100);
      expect(result.slices).toBe(1);
    });
    it('零数量', () => {
      const result = icebergOrder(0, 100);
      expect(result.slices).toBe(0);
    });
    it('总量校验', () => {
      const result = icebergOrder(1234, 200);
      expect(result.slices_.reduce((a, b) => a + b, 0)).toBe(1234);
    });
  });

  // 止损单触发
  const checkStopLoss = (currentPrice: number, stopPrice: number, direction: 'long' | 'short') => {
    if (direction === 'long') return currentPrice <= stopPrice;
    return currentPrice >= stopPrice;
  };

  const checkTakeProfit = (currentPrice: number, tpPrice: number, direction: 'long' | 'short') => {
    if (direction === 'long') return currentPrice >= tpPrice;
    return currentPrice <= tpPrice;
  };

  describe('止损止盈触发', () => {
    it('多头止损触发', () => {
      expect(checkStopLoss(95, 98, 'long')).toBe(true);
    });
    it('多头止损未触发', () => {
      expect(checkStopLoss(100, 98, 'long')).toBe(false);
    });
    it('空头止损触发', () => {
      expect(checkStopLoss(105, 102, 'short')).toBe(true);
    });
    it('空头止损未触发', () => {
      expect(checkStopLoss(100, 102, 'short')).toBe(false);
    });
    it('多头止盈触发', () => {
      expect(checkTakeProfit(110, 108, 'long')).toBe(true);
    });
    it('空头止盈触发', () => {
      expect(checkTakeProfit(90, 92, 'short')).toBe(true);
    });
    it('精确价格触发', () => {
      expect(checkStopLoss(98, 98, 'long')).toBe(true);
      expect(checkTakeProfit(108, 108, 'long')).toBe(true);
    });
  });

  // 订单簿撮合
  const matchOrder = (orderBook: { bids: [number, number][]; asks: [number, number][] }, side: 'buy' | 'sell', price: number, qty: number) => {
    let filled = 0;
    let avgPrice = 0;
    let totalCost = 0;
    const book = side === 'buy' ? orderBook.asks : orderBook.bids;
    const sorted = side === 'buy' ? [...book].sort((a, b) => a[0] - b[0]) : [...book].sort((a, b) => b[0] - a[0]);
    let remaining = qty;
    for (const [levelPrice, levelQty] of sorted) {
      if (remaining <= 0) break;
      if (side === 'buy' && levelPrice > price) break;
      if (side === 'sell' && levelPrice < price) break;
      const fillQty = Math.min(remaining, levelQty);
      filled += fillQty;
      totalCost += fillQty * levelPrice;
      remaining -= fillQty;
    }
    avgPrice = filled > 0 ? totalCost / filled : 0;
    return { filled, avgPrice, remaining };
  };

  describe('订单簿撮合', () => {
    const book = {
      bids: [[100, 100], [99, 200], [98, 300]] as [number, number][],
      asks: [[101, 100], [102, 200], [103, 300]] as [number, number][],
    };

    it('市价买入全部成交', () => {
      const result = matchOrder(book, 'buy', 102, 250);
      expect(result.filled).toBe(250);
      expect(result.remaining).toBe(0);
    });
    it('买入价格保护', () => {
      const result = matchOrder(book, 'buy', 101, 500);
      expect(result.filled).toBe(100); // only first level at 101
    });
    it('卖出全部成交', () => {
      const result = matchOrder(book, 'sell', 99, 200);
      expect(result.filled).toBe(200);
    });
    it('卖出价格保护', () => {
      const result = matchOrder(book, 'sell', 100, 1000);
      expect(result.filled).toBe(100); // only bid at 100 matches (price protection)
    });
    it('平均价格计算', () => {
      const result = matchOrder(book, 'buy', 103, 300);
      expect(result.avgPrice).toBeGreaterThan(101);
      expect(result.avgPrice).toBeLessThan(103);
    });
  });

  // 滑点模拟
  const simulateSlippage = (orderQty: number, avgDailyVolume: number, volatility: number) => {
    const participationRate = orderQty / avgDailyVolume;
    const baseSlippage = participationRate * 0.1; // 10bps per 1% participation
    const volatilityImpact = volatility * 0.5;
    const totalSlippage = baseSlippage + volatilityImpact;
    return {
      participationRate,
      baseSlippage,
      volatilityImpact,
      totalSlippage,
      costBps: totalSlippage * 10000,
    };
  };

  describe('滑点模拟', () => {
    it('小额订单低滑点', () => {
      const result = simulateSlippage(1000, 1000000, 0.01);
      expect(result.totalSlippage).toBeLessThan(0.01);
    });
    it('大额订单高滑点', () => {
      const result = simulateSlippage(500000, 1000000, 0.02);
      expect(result.totalSlippage).toBeGreaterThan(0.01);
    });
    it('高波动增加滑点', () => {
      const low = simulateSlippage(10000, 1000000, 0.01);
      const high = simulateSlippage(10000, 1000000, 0.05);
      expect(high.totalSlippage).toBeGreaterThan(low.totalSlippage);
    });
    it('参与率计算', () => {
      const result = simulateSlippage(50000, 500000, 0.01);
      expect(result.participationRate).toBeCloseTo(0.1);
    });
  });

  // 交易费用计算 (A股)
  const calcAStockFees = (amount: number, type: 'buy' | 'sell') => {
    const commissionRate = 0.0003;
    const stampTaxRate = 0.001;
    const transferFeeRate = 0.00001;
    const commission = Math.max(amount * commissionRate, 5);
    const stampTax = type === 'sell' ? amount * stampTaxRate : 0;
    const transferFee = amount * transferFeeRate;
    return {
      commission: Math.round(commission * 100) / 100,
      stampTax: Math.round(stampTax * 100) / 100,
      transferFee: Math.round(transferFee * 100) / 100,
      total: Math.round((commission + stampTax + transferFee) * 100) / 100,
    };
  };

  describe('A股交易费用', () => {
    it('买入只有佣金和过户费', () => {
      const fees = calcAStockFees(100000, 'buy');
      expect(fees.commission).toBe(30);
      expect(fees.stampTax).toBe(0);
      expect(fees.transferFee).toBe(1);
    });
    it('卖出有印花税', () => {
      const fees = calcAStockFees(100000, 'sell');
      expect(fees.stampTax).toBe(100);
      expect(fees.total).toBe(131);
    });
    it('小额佣金最低5元', () => {
      const fees = calcAStockFees(1000, 'buy');
      expect(fees.commission).toBe(5);
    });
    it('费用为正', () => {
      const fees = calcAStockFees(50000, 'sell');
      expect(fees.total).toBeGreaterThan(0);
    });
  });
});
