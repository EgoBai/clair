import { describe, it, expect } from 'vitest';

// 交易策略模拟引擎测试
describe('交易策略模拟引擎', () => {
  interface Bar {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }

  interface Trade {
    entryDate: string;
    exitDate: string;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    pnl: number;
    returnPct: number;
  }

  // 生成随机K线
  function generateBars(count: number, startPrice: number, trend: number = 0, vol: number = 0.02): Bar[] {
    const bars: Bar[] = [];
    let price = startPrice;
    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.5 + trend) * vol * price;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.abs(change) * Math.random() * 0.5;
      const low = Math.min(open, close) - Math.abs(change) * Math.random() * 0.5;
      bars.push({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
        volume: Math.floor(1000000 + Math.random() * 5000000),
      });
      price = close;
    }
    return bars;
  }

  // 简单均线
  function sma(values: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
    return result;
  }

  // 双均线策略
  function maCrossStrategy(bars: Bar[], fast: number = 5, slow: number = 20): Trade[] {
    const closes = bars.map(b => b.close);
    const fastMA = sma(closes, fast);
    const slowMA = sma(closes, slow);
    const trades: Trade[] = [];
    let position: { entryPrice: number; entryDate: string; qty: number } | null = null;

    for (let i = slow; i < bars.length; i++) {
      if (fastMA[i] === null || slowMA[i] === null || fastMA[i - 1] === null || slowMA[i - 1] === null) continue;
      const prevFast = fastMA[i - 1]!;
      const prevSlow = slowMA[i - 1]!;
      const currFast = fastMA[i]!;
      const currSlow = slowMA[i]!;

      if (!position && prevFast <= prevSlow && currFast > currSlow) {
        // 金叉买入
        position = { entryPrice: bars[i].close, entryDate: bars[i].date, qty: 100 };
      } else if (position && prevFast >= prevSlow && currFast < currSlow) {
        // 死叉卖出
        const exitPrice = bars[i].close;
        trades.push({
          entryDate: position.entryDate,
          exitDate: bars[i].date,
          entryPrice: position.entryPrice,
          exitPrice,
          quantity: position.qty,
          pnl: (exitPrice - position.entryPrice) * position.qty,
          returnPct: ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
        });
        position = null;
      }
    }
    return trades;
  }

  // 网格交易策略
  function gridStrategy(prices: number[], gridSpacing: number, initialCapital: number): { trades: Trade[]; finalCapital: number } {
    const trades: Trade[] = [];
    let capital = initialCapital;
    let position = 0;
    let lastBuyPrice = prices[0];

    for (let i = 1; i < prices.length; i++) {
      if (position === 0 && prices[i] <= lastBuyPrice - gridSpacing) {
        // 买入
        const qty = Math.floor(capital / prices[i] / 100) * 100;
        if (qty > 0) {
          position = qty;
          capital -= qty * prices[i];
          lastBuyPrice = prices[i];
        }
      } else if (position > 0 && prices[i] >= lastBuyPrice + gridSpacing) {
        // 卖出
        const pnl = (prices[i] - lastBuyPrice) * position;
        trades.push({
          entryDate: String(i - 1),
          exitDate: String(i),
          entryPrice: lastBuyPrice,
          exitPrice: prices[i],
          quantity: position,
          pnl,
          returnPct: ((prices[i] - lastBuyPrice) / lastBuyPrice) * 100,
        });
        capital += position * prices[i];
        position = 0;
        lastBuyPrice = prices[i];
      }
    }
    return { trades, finalCapital: capital + position * prices[prices.length - 1] };
  }

  // 固定比例止损
  function applyStopLoss(entryPrice: number, prices: number[], stopPct: number): number | null {
    const stopPrice = entryPrice * (1 - stopPct / 100);
    for (const p of prices) {
      if (p <= stopPrice) return p;
    }
    return null;
  }

  // 移动止损
  function trailingStop(prices: number[], trailPct: number): number {
    let highest = prices[0];
    let stopLevel = highest * (1 - trailPct / 100);
    for (const p of prices) {
      if (p > highest) {
        highest = p;
        stopLevel = highest * (1 - trailPct / 100);
      }
      if (p <= stopLevel) return p;
    }
    return prices[prices.length - 1];
  }

  // 胜率计算
  function winRate(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    return trades.filter(t => t.pnl > 0).length / trades.length * 100;
  }

  // 盈亏比
  function profitFactor(trades: Trade[]): number {
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
    return grossProfit / grossLoss;
  }

  // 最大连续亏损
  function maxConsecutiveLosses(trades: Trade[]): number {
    let max = 0, current = 0;
    for (const t of trades) {
      if (t.pnl < 0) { current++; max = Math.max(max, current); }
      else { current = 0; }
    }
    return max;
  }

  describe('K线数据生成', () => {
    it('生成正确数量', () => {
      const bars = generateBars(100, 10);
      expect(bars).toHaveLength(100);
    });

    it('每根K线有OHLCV', () => {
      const bars = generateBars(10, 100);
      bars.forEach(b => {
        expect(b).toHaveProperty('open');
        expect(b).toHaveProperty('high');
        expect(b).toHaveProperty('low');
        expect(b).toHaveProperty('close');
        expect(b).toHaveProperty('volume');
      });
    });

    it('high >= open,close且low <= open,close', () => {
      const bars = generateBars(50, 100);
      bars.forEach(b => {
        expect(b.high).toBeGreaterThanOrEqual(b.open);
        expect(b.high).toBeGreaterThanOrEqual(b.close);
        expect(b.low).toBeLessThanOrEqual(b.open);
        expect(b.low).toBeLessThanOrEqual(b.close);
      });
    });
  });

  describe('双均线策略', () => {
    it('返回交易数组', () => {
      const bars = generateBars(50, 100, 0.001);
      const trades = maCrossStrategy(bars, 3, 10);
      expect(Array.isArray(trades)).toBe(true);
    });

    it('每笔交易有完整字段', () => {
      const bars = generateBars(100, 100, 0.002, 0.03);
      const trades = maCrossStrategy(bars, 5, 20);
      trades.forEach(t => {
        expect(t).toHaveProperty('entryDate');
        expect(t).toHaveProperty('exitDate');
        expect(t).toHaveProperty('entryPrice');
        expect(t).toHaveProperty('exitPrice');
        expect(t).toHaveProperty('pnl');
        expect(t).toHaveProperty('returnPct');
      });
    });

    it('出场价和入场价不同', () => {
      const bars = generateBars(100, 100, 0.003, 0.04);
      const trades = maCrossStrategy(bars, 5, 20);
      trades.forEach(t => {
        expect(t.entryPrice).not.toBe(t.exitPrice);
      });
    });
  });

  describe('网格交易', () => {
    it('震荡行情盈利', () => {
      const prices = [100, 95, 100, 95, 100, 95, 100];
      const result = gridStrategy(prices, 3, 100000);
      expect(result.trades.length).toBeGreaterThan(0);
    });

    it('返回最终资金', () => {
      const prices = [100, 95, 100];
      const result = gridStrategy(prices, 3, 100000);
      expect(result.finalCapital).toBeGreaterThan(0);
    });

    it('单边下跌可能亏损', () => {
      const prices = [100, 90, 80, 70, 60];
      const result = gridStrategy(prices, 3, 100000);
      // 下跌趋势中网格策略可能持续买入
      expect(result.finalCapital).toBeGreaterThan(0);
    });
  });

  describe('止损机制', () => {
    it('触及止损返回止损价', () => {
      const prices = [100, 98, 95, 93, 90];
      const stopPrice = applyStopLoss(100, prices, 5);
      expect(stopPrice).not.toBeNull();
      expect(stopPrice).toBeLessThanOrEqual(95);
    });

    it('未触及返回null', () => {
      const prices = [100, 101, 102, 103, 104];
      expect(applyStopLoss(100, prices, 5)).toBeNull();
    });

    it('移动止损跟踪高点', () => {
      const prices = [100, 105, 110, 108, 106];
      const exitPrice = trailingStop(prices, 5);
      // 最高110，止损线104.5，106>104.5，不应触发
      expect(exitPrice).toBe(106);
    });

    it('移动止损触发', () => {
      const prices = [100, 110, 115, 108, 100];
      const exitPrice = trailingStop(prices, 5);
      // 最高115，止损线109.25，108<109.25应触发
      expect(exitPrice).toBe(108);
    });
  });

  describe('交易统计', () => {
    const trades: Trade[] = [
      { entryDate: '1', exitDate: '2', entryPrice: 100, exitPrice: 110, quantity: 100, pnl: 1000, returnPct: 10 },
      { entryDate: '3', exitDate: '4', entryPrice: 110, exitPrice: 105, quantity: 100, pnl: -500, returnPct: -4.5 },
      { entryDate: '5', exitDate: '6', entryPrice: 105, exitPrice: 115, quantity: 100, pnl: 1000, returnPct: 9.5 },
      { entryDate: '7', exitDate: '8', entryPrice: 115, exitPrice: 110, quantity: 100, pnl: -500, returnPct: -4.3 },
      { entryDate: '9', exitDate: '10', entryPrice: 110, exitPrice: 120, quantity: 100, pnl: 1000, returnPct: 9.1 },
    ];

    it('胜率计算正确', () => {
      expect(winRate(trades)).toBe(60); // 3/5
    });

    it('盈亏比为正', () => {
      const pf = profitFactor(trades);
      expect(pf).toBe(3); // 3000/1000
    });

    it('空交易胜率0', () => {
      expect(winRate([])).toBe(0);
    });

    it('空交易盈亏比0', () => {
      expect(profitFactor([])).toBe(0);
    });

    it('最大连续亏损', () => {
      const mixed: Trade[] = [
        { ...trades[0] },
        { ...trades[1] },
        { ...trades[1], entryDate: '10' },
        { ...trades[0], entryDate: '11' },
      ];
      expect(maxConsecutiveLosses(mixed)).toBe(2);
    });

    it('全赢时连续亏损为0', () => {
      const winners = trades.filter(t => t.pnl > 0);
      expect(maxConsecutiveLosses(winners)).toBe(0);
    });

    it('全亏时连续亏损等于总数', () => {
      const losers = trades.filter(t => t.pnl < 0);
      expect(maxConsecutiveLosses(losers)).toBe(losers.length);
    });
  });

  describe('均线计算', () => {
    it('SMA值正确', () => {
      const vals = [1, 2, 3, 4, 5];
      const ma = sma(vals, 3);
      expect(ma[0]).toBeNull();
      expect(ma[1]).toBeNull();
      expect(ma[2]).toBe(2); // (1+2+3)/3
      expect(ma[3]).toBe(3); // (2+3+4)/3
      expect(ma[4]).toBe(4); // (3+4+5)/3
    });

    it('period=1等于原值', () => {
      const vals = [10, 20, 30];
      const ma = sma(vals, 1);
      expect(ma).toEqual([10, 20, 30]);
    });

    it('空数组返回空', () => {
      expect(sma([], 5)).toEqual([]);
    });
  });
});
