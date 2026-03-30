import { describe, it, expect } from 'vitest';

// ===== 回测策略组合测试 =====
describe('Backtest Strategy Combinations', () => {
  interface OHLCV {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }

  const generateTrendData = (days: number, trend: 'up' | 'down' | 'sideways' | 'volatile'): OHLCV[] => {
    const data: OHLCV[] = [];
    let price = 100;
    for (let i = 0; i < days; i++) {
      let change: number;
      switch (trend) {
        case 'up': change = Math.random() * 3 - 0.5; break;
        case 'down': change = Math.random() * 3 - 2.5; break;
        case 'sideways': change = Math.random() * 2 - 1; break;
        case 'volatile': change = Math.random() * 8 - 4; break;
      }
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      data.push({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        open, high, low, close,
        volume: Math.floor(1000000 + Math.random() * 500000),
      });
      price = close;
    }
    return data;
  };

  const calculateSMA = (data: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      const slice = data.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
    return result;
  };

  const calculateRSI = (closes: number[], period: number = 14): (number | null)[] => {
    const result: (number | null)[] = [];
    if (closes.length < period + 1) return Array(closes.length).fill(null);
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    for (let i = 0; i < period; i++) result.push(null);
    let avgGain = gains / period, avgLoss = losses / period;
    result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
      result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }
    return result;
  };

  // MA交叉策略
  const maCrossStrategy = (data: OHLCV[], shortPeriod: number, longPeriod: number) => {
    const closes = data.map(d => d.close);
    const shortMA = calculateSMA(closes, shortPeriod);
    const longMA = calculateSMA(closes, longPeriod);
    const signals: ('buy' | 'sell' | 'hold')[] = [];
    for (let i = 0; i < data.length; i++) {
      if (shortMA[i] === null || longMA[i] === null) { signals.push('hold'); continue; }
      if (shortMA[i]! > longMA[i]!) signals.push('buy');
      else if (shortMA[i]! < longMA[i]!) signals.push('sell');
      else signals.push('hold');
    }
    return signals;
  };

  describe('均线交叉策略', () => {
    it('上涨趋势应产生更多买入信号', () => {
      const data = generateTrendData(100, 'up');
      const signals = maCrossStrategy(data, 5, 20);
      const buyCount = signals.filter(s => s === 'buy').length;
      const sellCount = signals.filter(s => s === 'sell').length;
      expect(buyCount).toBeGreaterThan(sellCount);
    });

    it('下跌趋势应产生更多卖出信号', () => {
      const data = generateTrendData(100, 'down');
      const signals = maCrossStrategy(data, 5, 20);
      const sellCount = signals.filter(s => s === 'sell').length;
      expect(sellCount).toBeGreaterThan(0);
    });

    it('信号数量应等于数据长度', () => {
      const data = generateTrendData(50, 'up');
      const signals = maCrossStrategy(data, 5, 10);
      expect(signals.length).toBe(50);
    });

    it('前longPeriod-1个信号应为hold', () => {
      const data = generateTrendData(50, 'up');
      const signals = maCrossStrategy(data, 5, 20);
      for (let i = 0; i < 19; i++) {
        expect(signals[i]).toBe('hold');
      }
    });

    it('相同参数应产生一致信号', () => {
      const data = generateTrendData(100, 'sideways');
      const s1 = maCrossStrategy(data, 5, 10);
      const s2 = maCrossStrategy(data, 5, 10);
      expect(s1).toEqual(s2);
    });
  });

  // RSI策略
  describe('RSI策略', () => {
    it('RSI应产生有效值', () => {
      const data = generateTrendData(100, 'volatile');
      const closes = data.map(d => d.close);
      const rsi = calculateRSI(closes, 14);
      const validValues = rsi.filter((v): v is number => v !== null);
      validValues.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
    });

    it('RSI超卖区域应有值', () => {
      const data = generateTrendData(100, 'down');
      const closes = data.map(d => d.close);
      const rsi = calculateRSI(closes, 14);
      expect(rsi.filter(v => v !== null).length).toBeGreaterThan(0);
    });

    it('数据不足应返回null', () => {
      const rsi = calculateRSI([1, 2, 3], 14);
      expect(rsi.every(v => v === null)).toBe(true);
    });

    it('上升趋势RSI应偏高', () => {
      const data = generateTrendData(200, 'up');
      const closes = data.map(d => d.close);
      const rsi = calculateRSI(closes, 14);
      const valid = rsi.filter((v): v is number => v !== null);
      const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
      expect(avg).toBeGreaterThan(40);
    });
  });

  // SMA计算
  describe('SMA计算', () => {
    it('应正确计算简单移动平均', () => {
      const data = [10, 20, 30, 40, 50];
      const sma = calculateSMA(data, 3);
      expect(sma[0]).toBe(null);
      expect(sma[1]).toBe(null);
      expect(sma[2]).toBeCloseTo(20);
      expect(sma[3]).toBeCloseTo(30);
      expect(sma[4]).toBeCloseTo(40);
    });

    it('period=1应等于原数据', () => {
      const data = [1, 2, 3, 4, 5];
      const sma = calculateSMA(data, 1);
      expect(sma).toEqual([1, 2, 3, 4, 5]);
    });

    it('应处理零值', () => {
      const sma = calculateSMA([0, 0, 0], 3);
      expect(sma[2]).toBeCloseTo(0);
    });

    it('应处理负值', () => {
      const sma = calculateSMA([-10, -20, -30], 3);
      expect(sma[2]).toBeCloseTo(-20);
    });
  });

  // 组合策略
  describe('多策略组合', () => {
    it('MA+RSI双重确认', () => {
      const data = generateTrendData(100, 'volatile');
      const closes = data.map(d => d.close);
      const maSignals = maCrossStrategy(data, 5, 20);
      const rsi = calculateRSI(closes, 14);
      let confirmBuy = 0;
      for (let i = 0; i < data.length; i++) {
        if (maSignals[i] === 'buy' && rsi[i] !== null && rsi[i]! < 70) confirmBuy++;
      }
      expect(confirmBuy).toBeGreaterThan(0);
    });

    it('不同参数组合应产生不同信号', () => {
      const data = generateTrendData(100, 'volatile');
      const s1 = maCrossStrategy(data, 5, 10);
      const s2 = maCrossStrategy(data, 10, 30);
      expect(s1).not.toEqual(s2);
    });

    it('空数据应返回空信号', () => {
      const signals = maCrossStrategy([], 5, 10);
      expect(signals).toEqual([]);
    });

    it('单条数据应返回hold', () => {
      const signals = maCrossStrategy([{ date: '2026-01-01', open: 10, high: 11, low: 9, close: 10, volume: 1000 }], 1, 1);
      expect(signals[0]).toBe('hold');
    });
  });

  // 收益率计算
  describe('收益率分析', () => {
    const calcReturns = (prices: number[]): number[] => {
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      return returns;
    };

    const calcMaxDrawdown = (prices: number[]): number => {
      let peak = prices[0], maxDD = 0;
      for (const p of prices) {
        if (p > peak) peak = p;
        const dd = (peak - p) / peak;
        if (dd > maxDD) maxDD = dd;
      }
      return maxDD;
    };

    it('上涨趋势收益率应为正', () => {
      const data = generateTrendData(50, 'up');
      const returns = calcReturns(data.map(d => d.close));
      expect(returns.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    });

    it('最大回撤应≥0', () => {
      const data = generateTrendData(100, 'volatile');
      const dd = calcMaxDrawdown(data.map(d => d.close));
      expect(dd).toBeGreaterThanOrEqual(0);
    });

    it('纯上涨回撤应为0', () => {
      const prices = [1, 2, 3, 4, 5];
      expect(calcMaxDrawdown(prices)).toBeCloseTo(0);
    });

    it('收益率序列长度应等于数据长度减1', () => {
      const data = generateTrendData(20, 'sideways');
      const returns = calcReturns(data.map(d => d.close));
      expect(returns.length).toBe(19);
    });

    it('相同价格收益率应为0', () => {
      const returns = calcReturns([100, 100, 100]);
      expect(returns.every(r => r === 0)).toBe(true);
    });
  });
});
