import { describe, it, expect } from 'vitest';
import {
  calculateReturns,
  calculateVolatility,
  calculateMaxDrawdown,
  calculateSharpeRatio,
  calculateBeta,
} from '../../../frontend/src/utils/globalCorrelationEngine';
import {
  calculateSortinoRatio,
  calculateCalmarRatio,
} from '../../../frontend/src/utils/backtestPerformanceAnalyzer';
import { calculateATR, calculateBollingerBands } from '../indicators/technical';

// 波动率与风险指标测试（影子测试治理批次 8）
// 生产真源（唯一）：
//   frontend/src/utils/globalCorrelationEngine.ts
//     → calculateReturns / calculateVolatility / calculateMaxDrawdown / calculateSharpeRatio / calculateBeta
//   frontend/src/utils/backtestPerformanceAnalyzer.ts
//     → calculateSortinoRatio / calculateCalmarRatio
//   backend/src/indicators/technical.ts
//     → calculateATR / calculateBollingerBands
// 已删除自抄的 calculateHistoricalVolatility / calculateATR / calculateBollingerBands / calculateSMA /
// calculateMaxDrawdown / calculateSharpeRatio / calculateSortinoRatio / calculateCalmarRatio / calculateBeta。
// 按生产口径修正的断言：
//   - ATR：生产返回 { atr, trueRange }，TR 从 index 1 起（index 0 为 null），首个 ATR 落在 index=period，
//     等于 mean(TR[1..period]) 后按 Wilder 平滑；旧自抄把 TR 从 index 0 起、首个 ATR 落在 index=period-1
//     （旧 L209-215 断言 atr[2]=mean(tr0,tr1,tr2)）。
//   - 布林带：生产字段名为 middle（旧自抄为 sma），前 period-1 位为 null（旧自抄为 NaN）。
//   - 最大回撤：生产返回 peak/trough「索引」而非价格（globalCorrelationEngine.ts L334-353），故断言 prices[idx]。
//     另注意该实现的 peak 取「最新全局峰值」索引，与 trough 未必属于同一回撤区间（批次 3 实测）；
//     本文件只在峰谷确属同一区间的序列上断言配对，不为其补不成立的语义，本批也不修生产。
//   - Calmar：生产在 maxDrawdown===0 时一律返回 Infinity（backtestPerformanceAnalyzer.ts L185-190，
//     不区分收益符号），旧自抄 (0,0)→0；按生产口径改为 Infinity。
//   - Beta：生产签名 calculateBeta(marketReturns, stockReturns)（旧自抄 stock 在前）；本文件按生产顺序传参，
//     并用 stock=2×market 的数据断言 beta≈2，防止参数颠倒后仍「>0 蒙混过关」。
// 未迁移（生产无对应实现，保留本地 helper）：
//   1) calculateRollingVolatility：生产只有全样本年化波动率，无滚动窗口变体；
//   2) calculateAlpha：生产无 CAPM alpha 函数，保留本地算术。
describe('波动率与风险指标', () => {
  const prices = [100, 102, 98, 103, 107, 105, 110, 108, 112, 115, 113, 118, 120, 117, 122];
  const returns = calculateReturns(prices);

  // 未迁移：生产无滚动窗口波动率；returns 已改用生产 calculateReturns
  function calculateRollingVolatility(priceSeries: number[], period: number): number[] {
    const dailyReturns = calculateReturns(priceSeries);
    const result: number[] = [];
    for (let i = 0; i < dailyReturns.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
      } else {
        const slice = dailyReturns.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
        const variance = slice.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (slice.length - 1);
        result.push(Math.sqrt(variance) * Math.sqrt(252));
      }
    }
    return result;
  }

  // 未迁移：生产无 CAPM alpha
  function calculateAlpha(stockReturn: number, marketReturn: number, beta: number, riskFreeRate: number = 0.03): number {
    return stockReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
  }

  describe('波动率计算', () => {
    it('应该正确计算年化波动率', () => {
      // 日收益样本标准差 × √252：0.03167 × 15.8745 ≈ 0.5026
      const vol = calculateVolatility(returns);
      expect(vol).toBeCloseTo(0.5026, 3);
      expect(vol).toBeGreaterThan(0);
    });

    it('空数据应该返回0', () => {
      expect(calculateVolatility([])).toBe(0);
    });

    it('单一数据应该返回0', () => {
      expect(calculateVolatility([0.01])).toBe(0);
    });

    it('所有收益相同时波动率为0', () => {
      expect(calculateVolatility([0.01, 0.01, 0.01])).toBe(0);
    });

    it('应该正确计算滚动波动率', () => {
      const vol = calculateRollingVolatility(prices, 5);
      expect(vol.length).toBe(prices.length - 1);
      expect(isNaN(vol[0])).toBe(true);
      expect(isNaN(vol[3])).toBe(true);
      expect(isNaN(vol[4])).toBe(false);
    });

    it('波动率应该为非负值', () => {
      const vol = calculateRollingVolatility(prices, 5);
      for (const v of vol) {
        if (!isNaN(v)) expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('ATR计算', () => {
    const highs = [105, 108, 103, 110, 115];
    const lows = [98, 100, 95, 102, 107];
    const closes = [102, 105, 98, 108, 112];

    it('应该正确计算ATR', () => {
      const { atr } = calculateATR(highs, lows, closes, 3);
      expect(atr.length).toBe(5);
      expect(atr[0]).toBeNull();
      expect(atr[1]).toBeNull();
      expect(atr[2]).toBeNull();
      expect(atr[3]).not.toBeNull();
    });

    it('ATR应该为非负值', () => {
      const { atr } = calculateATR(highs, lows, closes, 3);
      for (const a of atr) {
        if (a !== null) expect(a).toBeGreaterThanOrEqual(0);
      }
    });

    it('ATR应该以首个周期TR均值起始并按Wilder平滑', () => {
      const { atr, trueRange } = calculateATR(highs, lows, closes, 3);
      expect(trueRange[0]).toBeNull();
      expect(trueRange[1]).toBe(8);
      expect(atr[3]).toBeCloseTo((trueRange[1]! + trueRange[2]! + trueRange[3]!) / 3, 3);
      expect(atr[3]).toBeCloseTo(10, 4);
      expect(atr[4]).toBeCloseTo((atr[3]! * 2 + trueRange[4]!) / 3, 3);
    });
  });

  describe('布林带计算', () => {
    it('应该返回三条线', () => {
      const { middle, upper, lower } = calculateBollingerBands(prices, 5, 2);
      expect(middle.length).toBe(prices.length);
      expect(upper.length).toBe(prices.length);
      expect(lower.length).toBe(prices.length);
      expect(middle[3]).toBeNull();
      expect(middle[4]).not.toBeNull();
    });

    it('上轨应该大于中轨', () => {
      const { middle, upper } = calculateBollingerBands(prices, 5, 2);
      for (let i = 4; i < prices.length; i++) {
        expect(upper[i]!).toBeGreaterThan(middle[i]!);
      }
    });

    it('下轨应该小于中轨', () => {
      const { middle, lower } = calculateBollingerBands(prices, 5, 2);
      for (let i = 4; i < prices.length; i++) {
        expect(lower[i]!).toBeLessThan(middle[i]!);
      }
    });

    it('上下轨应该对称', () => {
      const { middle, upper, lower } = calculateBollingerBands(prices, 5, 2);
      for (let i = 4; i < prices.length; i++) {
        expect(upper[i]! - middle[i]!).toBeCloseTo(middle[i]! - lower[i]!);
      }
    });
  });

  describe('最大回撤', () => {
    it('应该正确计算最大回撤', () => {
      const testPrices = [100, 110, 105, 120, 90, 95, 115];
      const result = calculateMaxDrawdown(testPrices);
      expect(result.maxDrawdown).toBeCloseTo((120 - 90) / 120);
      // 生产返回峰/谷索引；本序列最新全局峰值 120 恰为回撤起点
      expect(testPrices[result.peak]).toBe(120);
      expect(testPrices[result.trough]).toBe(90);
    });

    it('单调上涨时回撤为0', () => {
      const upPrices = [1, 2, 3, 4, 5];
      const result = calculateMaxDrawdown(upPrices);
      expect(result.maxDrawdown).toBe(0);
    });

    it('单调下跌时回撤应该很大', () => {
      const downPrices = [100, 90, 80, 70, 60];
      const result = calculateMaxDrawdown(downPrices);
      expect(result.maxDrawdown).toBeCloseTo(0.4);
      expect(downPrices[result.peak]).toBe(100);
      expect(downPrices[result.trough]).toBe(60);
    });

    it('单一价格回撤为0', () => {
      const result = calculateMaxDrawdown([100]);
      expect(result.maxDrawdown).toBe(0);
    });
  });

  describe('夏普比率', () => {
    it('应该正确计算（默认无风险利率 3%）', () => {
      const sharpe = calculateSharpeRatio([0.01, 0.02, -0.01, 0.015, 0.005]);
      expect(sharpe).toBeCloseTo(10.8685, 3);
      expect(isFinite(sharpe)).toBe(true);
    });

    it('零波动时返回0', () => {
      expect(calculateSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
    });

    it('空数据返回0', () => {
      expect(calculateSharpeRatio([])).toBe(0);
    });

    it('正收益应该有正夏普', () => {
      const sharpe = calculateSharpeRatio([0.01, 0.02, 0.01, 0.015, 0.02]);
      expect(sharpe).toBeGreaterThan(0);
    });
  });

  describe('索提诺比率', () => {
    it('应该只考虑下行波动', () => {
      const sortino = calculateSortinoRatio([0.01, -0.02, 0.01, -0.01, 0.02]);
      expect(sortino).toBeCloseTo(1.8885, 3);
    });

    it('无亏损时返回Infinity', () => {
      const sortino = calculateSortinoRatio([0.01, 0.02, 0.01]);
      expect(sortino).toBe(Infinity);
    });

    it('空数据返回0', () => {
      expect(calculateSortinoRatio([])).toBe(0);
    });
  });

  describe('Calmar比率', () => {
    it('应该正确计算', () => {
      const calmar = calculateCalmarRatio(0.15, 0.1);
      expect(calmar).toBeCloseTo(1.5);
    });

    it('零回撤时返回Infinity（正收益）', () => {
      expect(calculateCalmarRatio(0.15, 0)).toBe(Infinity);
    });

    it('零回撤时返回Infinity（生产口径不区分收益符号）', () => {
      // 旧自抄 (0,0)→0；生产在 maxDrawdown===0 时一律 Infinity，按生产口径改断言
      expect(calculateCalmarRatio(0, 0)).toBe(Infinity);
    });
  });

  describe('Beta和Alpha', () => {
    it('Beta应该正确计算', () => {
      const marketRet = [0.01, 0.005, -0.005, 0.015, 0.005];
      const stockRet = [0.02, 0.01, -0.01, 0.03, 0.01];
      // 生产签名 (marketReturns, stockReturns)；stock 恰为 market 的 2 倍，beta 应为 2
      const beta = calculateBeta(marketRet, stockRet);
      expect(beta).toBeCloseTo(2, 5);
    });

    it('Beta=0时Alpha等于股票收益减无风险利率', () => {
      const alpha = calculateAlpha(0.15, 0.10, 0, 0.03);
      expect(alpha).toBeCloseTo(0.12);
    });

    it('Beta=1时Alpha等于超额收益差', () => {
      const alpha = calculateAlpha(0.15, 0.10, 1, 0.03);
      expect(alpha).toBeCloseTo(0.05);
    });
  });
});
