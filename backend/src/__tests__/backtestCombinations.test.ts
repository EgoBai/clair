import { describe, it, expect } from 'vitest';
import { calculateSMA, calculateRSI } from '../../../frontend/src/utils/chartDataProcessing';
import { calculateReturns } from '../../../frontend/src/utils/correlationMatrix';
import { calculateMaxDrawdown } from '../models/Backtest';

// ===== 回测策略组合测试 =====
// 影子测试迁移（批次 29a）：数值口径直接绑定生产实现
// - calculateSMA / calculateRSI → frontend/src/utils/chartDataProcessing.ts:73 / :111（无舍入，预热 null）
// - calculateReturns → frontend/src/utils/correlationMatrix.ts:46（prev===0 时返回 0 的零价守卫）
// - calculateMaxDrawdown → backend/src/models/Backtest.ts:164（(峰值-当前)/峰值 的最大值）
// 本地仅保留 maCrossStrategy：生产 backend/src/utils/backtestEngine.ts:212 的 generateSignalMA
// 未导出且是「均线交叉事件」语义（返回 Signal 对象、依赖 IndicatorCache），与本地「均线相对位置」不同，
// 故标注未迁移：生产无对应导出。
describe('Backtest Strategy Combinations', () => {
  // 夹具类型（仅用于本地 generateTrendData 的返回形状，不是生产实现副本）
  interface OHLCV {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }

  // 确定性伪随机发生器（固定种子 LCG），替代非确定随机数保证用例可复现
  const createRng = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  };

  const toIsoDate = (offset: number): string =>
    new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);

  const generateTrendData = (days: number, trend: 'up' | 'down' | 'sideways' | 'volatile'): OHLCV[] => {
    const seeds: Record<typeof trend, number> = {
      up: 20260101,
      down: 20260202,
      sideways: 20260303,
      volatile: 20260404,
    };
    const rng = createRng(seeds[trend]);
    const data: OHLCV[] = [];
    let price = 100;
    for (let i = 0; i < days; i++) {
      const drift = trend === 'up' ? 1.2 : trend === 'down' ? -1.2 : 0;
      const spread = trend === 'volatile' ? 8 : 2;
      const change = drift + (rng() - 0.5) * spread;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + rng() * 2;
      const low = Math.min(open, close) - rng() * 2;
      data.push({
        date: toIsoDate(i),
        open, high, low, close,
        volume: Math.floor(1_000_000 + rng() * 500_000),
      });
      price = close;
    }
    return data;
  };

  // MA交叉策略（未迁移：生产无对应导出，见文件头说明；MA 计算复用生产 calculateSMA）
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
      expect(validValues.length).toBeGreaterThan(0);
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

  // SMA计算（绑定生产 calculateSMA：frontend/src/utils/chartDataProcessing.ts:73）
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

  // 收益率计算（绑定生产 calculateReturns / calculateMaxDrawdown）
  describe('收益率分析', () => {
    it('上涨趋势收益率应为正', () => {
      const data = generateTrendData(50, 'up');
      const returns = calculateReturns(data.map(d => d.close));
      expect(returns.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    });

    it('最大回撤应≥0', () => {
      const data = generateTrendData(100, 'volatile');
      const dd = calculateMaxDrawdown(data.map(d => d.close));
      expect(dd).toBeGreaterThanOrEqual(0);
    });

    it('纯上涨回撤应为0', () => {
      const prices = [1, 2, 3, 4, 5];
      expect(calculateMaxDrawdown(prices)).toBeCloseTo(0);
    });

    it('收益率序列长度应等于数据长度减1', () => {
      const data = generateTrendData(20, 'sideways');
      const returns = calculateReturns(data.map(d => d.close));
      expect(returns.length).toBe(19);
    });

    it('相同价格收益率应为0', () => {
      const returns = calculateReturns([100, 100, 100]);
      expect(returns.every(r => r === 0)).toBe(true);
    });

    it('零价收益率应返回0（生产零价守卫）', () => {
      // 旧自抄 calcReturns([0, 100]) 为 (100-0)/0 = Infinity；生产 correlationMatrix.ts:48 用 prev===0 → 0
      expect(calculateReturns([0, 100])).toEqual([0]);
    });
  });
});
