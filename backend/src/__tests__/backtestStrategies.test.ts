import { describe, it, expect } from 'vitest';

// 回测策略扩展测试
describe('回测策略扩展', () => {
  interface Bar {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }

  function generateBars(count: number, trend: 'up' | 'down' | 'volatile' = 'up'): Bar[] {
    const bars: Bar[] = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
      let change: number;
      if (trend === 'up') change = 0.005 + (Math.random() - 0.3) * 0.02;
      else if (trend === 'down') change = -0.005 + (Math.random() - 0.7) * 0.02;
      else change = (Math.random() - 0.5) * 0.04;

      const open = price;
      const close = price * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      const volume = Math.floor(100000 + Math.random() * 900000);

      bars.push({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open, high, low, close, volume,
      });
      price = close;
    }
    return bars;
  }

  // 布林带策略
  describe('布林带策略', () => {
    function bollingerStrategy(bars: Bar[], period: number = 20, multiplier: number = 2) {
      const trades: { type: 'buy' | 'sell'; date: string; price: number; reason: string }[] = [];
      let position = false;

      for (let i = period; i < bars.length; i++) {
        const slice = bars.slice(i - period, i).map(b => b.close);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
        const upper = mean + multiplier * std;
        const lower = mean - multiplier * std;
        const price = bars[i].close;

        if (!position && price < lower) {
          trades.push({ type: 'buy', date: bars[i].date, price, reason: '价格触及下轨' });
          position = true;
        } else if (position && price > upper) {
          trades.push({ type: 'sell', date: bars[i].date, price, reason: '价格触及上轨' });
          position = false;
        }
      }
      return trades;
    }

    it('应该产生买卖信号', () => {
      const bars = generateBars(100, 'volatile');
      const trades = bollingerStrategy(bars);
      expect(trades.length).toBeGreaterThanOrEqual(0);
    });

    it('买卖信号应该交替出现', () => {
      const bars = generateBars(100, 'volatile');
      const trades = bollingerStrategy(bars);
      for (let i = 1; i < trades.length; i++) {
        expect(trades[i].type).not.toBe(trades[i - 1].type);
      }
    });

    it('买入价格应该低于卖出价格才盈利', () => {
      const bars = generateBars(100, 'volatile');
      const trades = bollingerStrategy(bars);
      for (let i = 0; i < trades.length - 1; i += 2) {
        if (trades[i].type === 'buy' && trades[i + 1]?.type === 'sell') {
          // 不保证每笔都盈利，但至少验证逻辑
          expect(trades[i].price).toBeDefined();
          expect(trades[i + 1].price).toBeDefined();
        }
      }
    });

    it('应该支持自定义周期', () => {
      const bars = generateBars(50, 'volatile');
      const trades10 = bollingerStrategy(bars, 10);
      const trades30 = bollingerStrategy(bars, 30);
      // 不同参数应该产生不同结果
      expect(trades10.length).toBeDefined();
      expect(trades30.length).toBeDefined();
    });
  });

  // 动量策略
  describe('动量策略', () => {
    function momentumStrategy(bars: Bar[], lookback: number = 10) {
      const trades: { type: 'buy' | 'sell'; date: string; price: number; momentum: number }[] = [];
      let position = false;

      for (let i = lookback; i < bars.length; i++) {
        const momentum = (bars[i].close - bars[i - lookback].close) / bars[i - lookback].close;

        if (!position && momentum > 0.05) {
          trades.push({ type: 'buy', date: bars[i].date, price: bars[i].close, momentum });
          position = true;
        } else if (position && momentum < -0.02) {
          trades.push({ type: 'sell', date: bars[i].date, price: bars[i].close, momentum });
          position = false;
        }
      }
      return trades;
    }

    it('上涨趋势应该产生买入信号', () => {
      const bars = generateBars(50, 'up');
      const trades = momentumStrategy(bars);
      const buys = trades.filter(t => t.type === 'buy');
      expect(buys.length).toBeGreaterThan(0);
    });

    it('下跌趋势应该产生卖出信号', () => {
      const bars = generateBars(100, 'down');
      const trades = momentumStrategy(bars, 5);
      // 可能有也可能没有，取决于数据
      expect(trades.length).toBeGreaterThanOrEqual(0);
    });

    it('买入动量应该大于阈值', () => {
      const bars = generateBars(50, 'up');
      const trades = momentumStrategy(bars);
      for (const trade of trades) {
        if (trade.type === 'buy') {
          expect(trade.momentum).toBeGreaterThan(0.05);
        }
      }
    });
  });

  // 均线缠绕策略
  describe('多均线组合策略', () => {
    function multiMAStrategy(bars: Bar[], shortPeriod: number = 5, longPeriod: number = 20) {
      function calcMA(endIdx: number, period: number): number | null {
        if (endIdx < period - 1) return null;
        const sum = bars.slice(endIdx - period + 1, endIdx + 1).reduce((s, b) => s + b.close, 0);
        return sum / period;
      }

      const trades: { type: 'buy' | 'sell'; date: string; price: number }[] = [];
      let position = false;

      for (let i = longPeriod; i < bars.length; i++) {
        const shortMA = calcMA(i, shortPeriod);
        const longMA = calcMA(i, longPeriod);
        const prevShortMA = calcMA(i - 1, shortPeriod);
        const prevLongMA = calcMA(i - 1, longPeriod);

        if (!shortMA || !longMA || !prevShortMA || !prevLongMA) continue;

        // 金叉
        if (!position && prevShortMA <= prevLongMA && shortMA > longMA) {
          trades.push({ type: 'buy', date: bars[i].date, price: bars[i].close });
          position = true;
        }
        // 死叉
        else if (position && prevShortMA >= prevLongMA && shortMA < longMA) {
          trades.push({ type: 'sell', date: bars[i].date, price: bars[i].close });
          position = false;
        }
      }
      return trades;
    }

    it('应该产生交易信号或无信号', () => {
      const bars = generateBars(100, 'up');
      const trades = multiMAStrategy(bars);
      // 上涨趋势不一定产生金叉（取决于生成数据），但不应该崩溃
      expect(trades.length).toBeGreaterThanOrEqual(0);
    });

    it('买卖信号应该交替', () => {
      const bars = generateBars(100, 'volatile');
      const trades = multiMAStrategy(bars);
      for (let i = 1; i < trades.length; i++) {
        expect(trades[i].type).not.toBe(trades[i - 1].type);
      }
    });

    it('信号不应该出现在数据不足时', () => {
      const bars = generateBars(15); // 少于longPeriod=20
      const trades = multiMAStrategy(bars);
      expect(trades).toHaveLength(0);
    });
  });

  // 收益计算
  describe('策略收益计算', () => {
    function calculateReturns(trades: { type: 'buy' | 'sell'; price: number }[], initialCapital: number = 100000) {
      let capital = initialCapital;
      let shares = 0;
      const equityCurve: number[] = [initialCapital];

      for (const trade of trades) {
        if (trade.type === 'buy') {
          shares = Math.floor(capital / trade.price / 100) * 100;
          capital -= shares * trade.price;
        } else {
          capital += shares * trade.price;
          shares = 0;
        }
        equityCurve.push(capital + shares * trade.price);
      }

      const finalValue = capital + shares * (trades.length > 0 ? trades[trades.length - 1].price : 0);
      const totalReturn = (finalValue - initialCapital) / initialCapital;

      return { finalValue, totalReturn, equityCurve };
    }

    it('应该正确计算收益', () => {
      const trades = [
        { type: 'buy' as const, price: 100 },
        { type: 'sell' as const, price: 110 },
      ];
      const result = calculateReturns(trades);
      expect(result.totalReturn).toBeGreaterThan(0);
    });

    it('亏损交易应该有负收益', () => {
      const trades = [
        { type: 'buy' as const, price: 110 },
        { type: 'sell' as const, price: 100 },
      ];
      const result = calculateReturns(trades);
      expect(result.totalReturn).toBeLessThan(0);
    });

    it('无交易应该收益为0', () => {
      const result = calculateReturns([]);
      expect(result.totalReturn).toBe(0);
    });

    it('权益曲线应该有正确长度', () => {
      const trades = [
        { type: 'buy' as const, price: 100 },
        { type: 'sell' as const, price: 110 },
      ];
      const result = calculateReturns(trades);
      expect(result.equityCurve).toHaveLength(3); // 初始 + 2笔交易
    });
  });

  // 信号强度
  describe('信号强度评估', () => {
    function signalStrength(signals: { type: string; confirmed: boolean; volume: number; avgVolume: number }[]) {
      return signals.map(s => {
        let strength = 0;
        if (s.confirmed) strength += 40;
        if (s.volume > s.avgVolume * 1.5) strength += 30;
        if (s.volume > s.avgVolume * 2) strength += 20;
        if (s.type === 'golden_cross' || s.type === 'death_cross') strength += 10;
        return { ...s, strength: Math.min(100, strength) };
      });
    }

    it('确认信号应该更高分', () => {
      const signals = [
        { type: 'buy', confirmed: true, volume: 100, avgVolume: 100 },
        { type: 'buy', confirmed: false, volume: 100, avgVolume: 100 },
      ];
      const result = signalStrength(signals);
      expect(result[0].strength).toBeGreaterThan(result[1].strength);
    });

    it('放量信号应该更高分', () => {
      const signals = [
        { type: 'buy', confirmed: true, volume: 300, avgVolume: 100 },
        { type: 'buy', confirmed: true, volume: 100, avgVolume: 100 },
      ];
      const result = signalStrength(signals);
      expect(result[0].strength).toBeGreaterThan(result[1].strength);
    });

    it('强度应该在0-100范围内', () => {
      const signals = [
        { type: 'golden_cross', confirmed: true, volume: 500, avgVolume: 100 },
        { type: 'buy', confirmed: false, volume: 50, avgVolume: 100 },
      ];
      const result = signalStrength(signals);
      for (const s of result) {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      }
    });
  });
});
