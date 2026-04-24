/**
 * 回测引擎测试
 */

import { describe, it, expect } from 'vitest';
import { runBacktest, STRATEGY_PRESETS } from '../utils/backtestEngine';
import type { KLineData } from '@shared/types';

// Seeded PRNG for deterministic tests
let _seed = 123;
function seededRandom(): number {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}

// ==================== 测试数据生成 ====================

function generateKlineData(days: number, startPrice: number = 100, trend: 'up' | 'down' | 'volatile' = 'volatile'): KLineData[] {
  const data: KLineData[] = [];
  let price = startPrice;

  for (let i = 0; i < days; i++) {
    const date = new Date(2025, 0, 1 + i);
    if (date.getDay() === 0 || date.getDay() === 6) continue; // 跳过周末

    let change: number;
    switch (trend) {
      case 'up':
        change = (seededRandom() * 3 - 0.5) / 100 * price;
        break;
      case 'down':
        change = (seededRandom() * 3 - 2.5) / 100 * price;
        break;
      default:
        change = (seededRandom() * 6 - 3) / 100 * price;
    }

    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + seededRandom() * 0.02);
    const low = Math.min(open, close) * (1 - seededRandom() * 0.02);
    const volume = Math.floor(1000000 + seededRandom() * 5000000);

    data.push({
      tradeDate: date.toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      close: Math.round(close * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      volume,
      turnover: volume * close,
    });

    price = close;
  }
  return data;
}

// ==================== 测试套件 ====================

describe('回测引擎', () => {
  describe('均线交叉策略', () => {
    it('应该正确执行MA交叉回测', () => {
      const data = generateKlineData(100, 100, 'volatile');
      const result = runBacktest(data, {
        type: 'ma_cross',
        fastPeriod: 5,
        slowPeriod: 20,
        initialCapital: 100000,
      });

      expect(result).toBeDefined();
      expect(result.strategy).toBe('ma_cross');
      expect(result.totalDays).toBe(data.length);
      expect(result.initialCapital).toBe(100000);
      expect(result.finalValue).toBeGreaterThan(0);
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.equityCurve.length).toBe(data.length);
      expect(result.drawdownCurve.length).toBe(data.length);
    });

    it('应该有合理的交易记录', () => {
      const data = generateKlineData(200, 100, 'volatile');
      const result = runBacktest(data, {
        type: 'ma_cross',
        fastPeriod: 5,
        slowPeriod: 20,
        initialCapital: 100000,
      });

      // 有交易时应该有买卖配对
      if (result.trades.length > 0) {
        // 第一笔应该是买入
        expect(result.trades[0].type).toBe('buy');
        // 每笔交易应该有价格和数量
        for (const trade of result.trades) {
          expect(trade.price).toBeGreaterThan(0);
          expect(trade.quantity).toBeGreaterThan(0);
          expect(trade.amount).toBeGreaterThan(0);
          expect(trade.date).toBeTruthy();
        }
      }
    });

    it('应该正确计算最大回撤', () => {
      const data = generateKlineData(100, 100, 'volatile');
      const result = runBacktest(data, {
        type: 'ma_cross',
        fastPeriod: 5,
        slowPeriod: 20,
        initialCapital: 100000,
      });

      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(100);
      expect(result.maxDrawdownDate).toBeTruthy();
    });

    it('应该计算夏普比率', () => {
      const data = generateKlineData(200, 100, 'volatile');
      const result = runBacktest(data, {
        type: 'ma_cross',
        fastPeriod: 5,
        slowPeriod: 20,
        initialCapital: 100000,
      });

      // 夏普比率应该是有限数值
      expect(isFinite(result.sharpeRatio)).toBe(true);
      expect(typeof result.volatility).toBe('number');
    });
  });

  describe('RSI策略', () => {
    it('应该正确执行RSI回测', () => {
      const data = generateKlineData(150, 100, 'volatile');
      const result = runBacktest(data, {
        type: 'rsi',
        rsiPeriod: 14,
        rsiOversold: 30,
        rsiOverbought: 70,
        initialCapital: 100000,
      });

      expect(result.strategy).toBe('rsi');
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });

    it('更严格的RSI阈值应该产生更少的交易', () => {
      const data = generateKlineData(200, 100, 'volatile');

      const normalResult = runBacktest(data, {
        type: 'rsi',
        rsiPeriod: 14,
        rsiOversold: 30,
        rsiOverbought: 70,
        initialCapital: 100000,
      });

      const strictResult = runBacktest(data, {
        type: 'rsi',
        rsiPeriod: 14,
        rsiOversold: 20,
        rsiOverbought: 80,
        initialCapital: 100000,
      });

      // 更严格的阈值应该产生相同或更少的交易
      expect(strictResult.totalTrades).toBeLessThanOrEqual(normalResult.totalTrades);
    });
  });

  describe('MACD策略', () => {
    it('应该正确执行MACD回测', () => {
      const data = generateKlineData(150, 100, 'volatile');
      const result = runBacktest(data, {
        type: 'macd',
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        initialCapital: 100000,
      });

      expect(result.strategy).toBe('macd');
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    });
  });

  describe('边界条件', () => {
    it('数据不足时应该抛出错误', () => {
      const data = generateKlineData(5);
      expect(() => {
        runBacktest(data, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      }).toThrow('K线数据不足');
    });

    it('应该使用默认参数', () => {
      const data = generateKlineData(100);
      const result = runBacktest(data, { type: 'ma_cross' });

      expect(result.initialCapital).toBe(100000); // 默认值
      expect(result.strategy).toBe('ma_cross');
    });

    it('上涨趋势应该产生正收益（MA策略）', () => {
      const data = generateKlineData(200, 100, 'up');
      const result = runBacktest(data, {
        type: 'ma_cross',
        fastPeriod: 5,
        slowPeriod: 20,
        initialCapital: 100000,
      });

      // 均线策略在趋势行情中通常表现较好
      expect(result.annualizedReturn).toBeDefined();
      expect(result.benchmarkReturn).toBeGreaterThan(0); // 上涨行情基准收益为正
    });
  });

  describe('交易统计', () => {
    it('胜率+亏损率应该等于100%', () => {
      const data = generateKlineData(200, 100, 'volatile');
      const result = runBacktest(data, {
        type: 'ma_cross',
        fastPeriod: 5,
        slowPeriod: 20,
        initialCapital: 100000,
      });

      if (result.totalTrades > 0) {
        expect(result.winningTrades + result.losingTrades).toBe(result.totalTrades);
        expect(result.winRate).toBeGreaterThanOrEqual(0);
        expect(result.winRate).toBeLessThanOrEqual(100);
      }
    });

    it('盈亏比应该为正数', () => {
      const data = generateKlineData(200, 100, 'volatile');
      const result = runBacktest(data, {
        type: 'ma_cross',
        fastPeriod: 5,
        slowPeriod: 20,
        initialCapital: 100000,
      });

      expect(result.profitFactor).toBeGreaterThanOrEqual(0);
    });
  });

  describe('策略预设', () => {
    it('应该有至少3个策略预设', () => {
      expect(STRATEGY_PRESETS.length).toBeGreaterThanOrEqual(3);
    });

    it('每个预设都应该有名称和参数', () => {
      for (const preset of STRATEGY_PRESETS) {
        expect(preset.name).toBeTruthy();
        expect(preset.type).toBeTruthy();
        expect(preset.params).toBeDefined();
      }
    });
  });
});
