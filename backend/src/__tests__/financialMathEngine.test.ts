/**
 * 影子测试迁移（批次 34a，financialMathEngine）
 *
 * 旧文件只 import vitest，14 个金融数学 helper 全部内联自抄，断言对象是测试副本。
 * 本轮 12 个改为 import 产品仓真实实现；annualizedReturn / maxDrawdownDuration 生产无同契约导出，保留本地并注明。
 * 被 import 的 6 个模块均不依赖外部包（0 个 import），跨包 import 先例见
 * backend/src/__tests__/movingAverageSystem.test.ts:38。
 *
 * 已绑定生产实现：
 * - annualizedVolatility → frontend/src/utils/globalCorrelationEngine.ts:326 calculateVolatility(returns)（默认 annualize=true）
 * - informationRatio → frontend/src/utils/globalCorrelationEngine.ts:367 calculateInformationRatio
 * - sortinoRatio → frontend/src/utils/backtestPerformanceAnalyzer.ts:171 calculateSortinoRatio
 * - calmarRatio → frontend/src/utils/backtestPerformanceAnalyzer.ts:185 calculateCalmarRatio
 * - omegaRatio → frontend/src/utils/backtestPerformanceAnalyzer.ts:248 calculateOmegaRatio
 * - calculateVaR → frontend/src/utils/portfolioRiskBudgetEngine.ts:144
 *   calculateVaR(expectedReturn, risk, confidence = 0.95, holdingPeriod = 1)
 * - calculateCVaR → frontend/src/utils/portfolioRiskBudgetEngine.ts:154 calculateCVaR(同签名)
 * - kellyCriterion → backend/src/services/kellyCriterionEngine.ts:27
 *   KellyCriterionEngine.calculateKelly(...).fullKelly
 * - ema → frontend/src/utils/featureEngineeringEngine.ts:45 calculateEMA（prices[0] 播种、number[] 无 null）
 * - calculateRSI → backend/src/indicators/technical.ts:233（null 预热、Wilder、toFixed(4)）
 * - calculateATR → backend/src/indicators/technical.ts:461（返回 { atr, trueRange } 等长数组）
 * - bollingerBands → backend/src/indicators/technical.ts:356 calculateBollingerBands（等长数组、前 period−1 位 null）
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * - VaR 口径：旧副本吃日收益数组、取经验分位数 → 生产为参数法 -(μ·hp − z·σ·√hp)。
 *   重写为数值入参：calculateVaR(0.001, 0.02, 0.95) = 0.0319（旧只断言 >0，数值口径已变）。
 * - VaR confidence=1.0：生产只识别 0.95/0.99，其余回退 z=1.645
 *   （portfolioRiskBudgetEngine.ts:150）；calculateVaR(0.001, 0.05, 1.0) = 0.08125
 *   （旧内联对 5 个收益取 100% 分位 = 0.05）。
 * - VaR 符号：预期盈利覆盖风险时 VaR 为负。旧副本无此语义；新增
 *   calculateVaR(0.1, 0.02, 0.95) = -0.0671 < 0（portfolioRiskBudgetEngine.ts:151）。
 * - CVaR：旧副本取尾部收益均值取负 → 生产 cvarFactor = pdf/(1−c)（0.95 时 2.06222）：
 *   calculateCVaR(0.001, 0.02, 0.95) = 0.040244（旧只断言 >0，口径不同）。
 * - Calmar 零回撤：旧副本返回 0 → 生产 Infinity（backtestPerformanceAnalyzer.ts:189）。
 * - Kelly 负值：旧副本可回负（(0.4, 1, 1) = -0.2）→ 生产 max(0, …) 截断为 0
 *   （kellyCriterionEngine.ts:34）；新增截断用例。
 * - RSI 数据不足：旧 [] → 生产与输入等长全 null：[null, null, null]（technical.ts:234-236）。
 * - RSI 数值：生产 parseFloat(toFixed(4))，全涨仍为 100，数值断言不变。
 * - ATR 数据不足：旧 [] → 生产等长数组：[null] / trueRange [null]（technical.ts:468-471）。
 * - ATR 结构：旧紧凑数组（TR 从 i=1 起、首值 = period 个 TR 均值）→ 生产等长数组，
 *   trueRange[0]=null、atr 首个非空在 index=period（technical.ts:483-493）；断言改为按结构检查。
 * - 布林带结构：旧从 index=period-1 起的紧凑数组 → 生产等长数组、前 period-1 位 null
 *   （technical.ts:361-381）；断言改为只遍历有效位，常数价格比较 index=19。
 * - 信息比率长度不等：旧直接返回 0（要求等长）→ 生产按 min(n) 截断
 *   （globalCorrelationEngine.ts:371）；原「长度不匹配返回零」改为 n<2 返回 0，并新增截断用例。
 * - 其余数值断言与旧副本一致（Sortino / Omega / EMA / 布林带数值），未改；
 *   Sortino 生产默认 rf=0.03，本组显式传 rf=0 与 -0.01，避免默认值影响。
 *
 * 未迁移（生产无对应导出 / 契约不同，保留本地 helper）：
 * - annualizedReturn：全仓无独立导出，仅 backtestPerformanceAnalyzer.ts:420 在 getMetrics 内联，
 *   且 years<=0 时返回 totalReturn 而非 0，契约不同。
 * - maxDrawdownDuration：生产 backtestPerformanceAnalyzer.ts:138 calculateMaxDrawdownDuration(EquityPoint[])
 *   只返回天数；backend/src/services/drawdownProtectionEngine.ts:37 的 drawdownDuration 只统计期末未修复回撤，
 *   无 startIndex/endIndex，与 { duration, startIndex, endIndex } 契约不同。
 */

import { describe, it, expect } from 'vitest';
import {
  calculateVolatility,
  calculateInformationRatio,
} from '../../../frontend/src/utils/globalCorrelationEngine';
import {
  calculateSortinoRatio,
  calculateCalmarRatio,
  calculateOmegaRatio,
} from '../../../frontend/src/utils/backtestPerformanceAnalyzer';
import {
  calculateVaR,
  calculateCVaR,
} from '../../../frontend/src/utils/portfolioRiskBudgetEngine';
import { calculateEMA } from '../../../frontend/src/utils/featureEngineeringEngine';
import { KellyCriterionEngine } from '../services/kellyCriterionEngine';
import {
  calculateRSI,
  calculateATR,
  calculateBollingerBands,
} from '../indicators/technical';

// 未迁移：生产无独立导出（getMetrics 内联，years<=0 返回 totalReturn），保留旧副本。
const annualizedReturn = (totalReturn: number, years: number): number => {
  if (years <= 0) return 0;
  return Math.pow(1 + totalReturn, 1 / years) - 1;
};

// 未迁移：生产 calculateMaxDrawdownDuration 只返回天数，drawdownProtectionEngine 的
// drawdownDuration 只统计期末未修复回撤且无 start/endIndex，均非 {duration,startIndex,endIndex} 契约。
const maxDrawdownDuration = (equity: number[]): { duration: number; startIndex: number; endIndex: number } => {
  if (equity.length === 0) return { duration: 0, startIndex: 0, endIndex: 0 };
  let peakIdx = 0, maxDur = 0, startIdx = 0, endIdx = 0;
  let currentStart = 0;
  for (let i = 1; i < equity.length; i++) {
    if (equity[i] >= equity[peakIdx]) {
      peakIdx = i;
      currentStart = i;
    } else {
      const dur = i - currentStart;
      if (dur > maxDur) {
        maxDur = dur;
        startIdx = currentStart;
        endIdx = i;
      }
    }
  }
  return { duration: maxDur, startIndex: startIdx, endIndex: endIdx };
};

// ===== 金融数学与风险引擎 =====
describe('Financial Math & Risk Engine', () => {
  describe('年化收益率', () => {
    it('一年', () => {
      expect(annualizedReturn(0.1, 1)).toBeCloseTo(0.1);
    });

    it('两年复合', () => {
      expect(annualizedReturn(0.21, 2)).toBeCloseTo(0.1);
    });

    it('零收益', () => {
      expect(annualizedReturn(0, 1)).toBe(0);
    });

    it('负收益', () => {
      expect(annualizedReturn(-0.1, 1)).toBeCloseTo(-0.1);
    });

    it('零年返回零', () => {
      expect(annualizedReturn(0.1, 0)).toBe(0);
    });
  });

  describe('波动率', () => {
    it('零波动率', () => {
      const returns = Array(100).fill(0.001);
      expect(calculateVolatility(returns)).toBeCloseTo(0);
    });

    it('常数波动率', () => {
      const returns = Array.from({ length: 100 }, (_, i) => i % 2 === 0 ? 0.01 : -0.01);
      expect(calculateVolatility(returns)).toBeGreaterThan(0);
    });

    it('数据不足返回零', () => {
      expect(calculateVolatility([0.01])).toBe(0);
    });

    it('空数组返回零', () => {
      expect(calculateVolatility([])).toBe(0);
    });
  });

  describe('索提诺比率', () => {
    it('正收益', () => {
      const returns = Array(50).fill(0.01).concat(Array(10).fill(-0.005));
      expect(calculateSortinoRatio(returns, 0)).toBeGreaterThan(0);
    });

    it('全部超额收益返回Infinity', () => {
      // 生产下行收益定义为 r < 0（backtestPerformanceAnalyzer.ts:178），无负收益即 Infinity。
      expect(calculateSortinoRatio([0.01, 0.02, 0.03], -0.01)).toBe(Infinity);
    });
  });

  describe('信息比率', () => {
    it('正信息比率', () => {
      const portfolio = [0.02, 0.01, 0.03, -0.01, 0.02];
      const benchmark = [0.01, 0.01, 0.02, -0.01, 0.01];
      expect(calculateInformationRatio(portfolio, benchmark)).toBeGreaterThan(0);
    });

    it('仅1个点返回零', () => {
      // n = min(1, 2) = 1 < 2（globalCorrelationEngine.ts:372）。
      expect(calculateInformationRatio([1], [1, 2])).toBe(0);
    });

    it('长度不等按较短截断', () => {
      const portfolio = [0.02, 0.01, 0.03];
      const benchmark = [0.01, 0.01];
      expect(calculateInformationRatio(portfolio, benchmark)).toBeCloseTo(0.7071, 3);
      expect(calculateInformationRatio(portfolio, benchmark))
        .toBeCloseTo(calculateInformationRatio(portfolio.slice(0, 2), benchmark), 10);
    });
  });

  describe('最大回撤持续时间', () => {
    it('无回撤', () => {
      const result = maxDrawdownDuration([100, 110, 120, 130]);
      expect(result.duration).toBe(0);
    });

    it('有回撤', () => {
      const result = maxDrawdownDuration([100, 90, 80, 95, 110]);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('空数组', () => {
      expect(maxDrawdownDuration([])).toEqual({ duration: 0, startIndex: 0, endIndex: 0 });
    });
  });

  describe('Calmar比率', () => {
    it('正比率', () => {
      expect(calculateCalmarRatio(0.15, 0.1)).toBeCloseTo(1.5);
    });

    it('零回撤返回Infinity', () => {
      // 生产：maxDrawdown === 0 → Infinity（backtestPerformanceAnalyzer.ts:189），旧副本返回 0。
      expect(calculateCalmarRatio(0.15, 0)).toBe(Infinity);
    });
  });

  describe('VaR', () => {
    it('95%置信度', () => {
      // 参数法：-(0.001 - 1.645 × 0.02) = 0.0319。
      expect(calculateVaR(0.001, 0.02, 0.95)).toBeCloseTo(0.0319, 5);
    });

    it('100%置信度回退1.645', () => {
      // 生产只识别 0.95/0.99，1.0 回退 z=1.645：-(0.001 - 1.645 × 0.05) = 0.08125。
      expect(calculateVaR(0.001, 0.05, 1.0)).toBeCloseTo(0.08125, 5);
    });

    it('预期盈利覆盖风险时VaR为负', () => {
      // μ=0.1 > z·σ=0.0329，参数法 VaR = -(0.1 - 0.0329) = -0.0671。
      const var95 = calculateVaR(0.1, 0.02, 0.95);
      expect(var95).toBeLessThan(0);
      expect(var95).toBeCloseTo(-0.0671, 5);
    });
  });

  describe('CVaR', () => {
    it('95% CVaR', () => {
      // cvarFactor = pdf(1.645)/(1-0.95) ≈ 2.06222：-(0.001 - 2.06222 × 0.02) = 0.040244。
      const cvar = calculateCVaR(0.001, 0.02, 0.95);
      expect(cvar).toBeCloseTo(0.040244, 5);
      expect(cvar).toBeGreaterThan(calculateVaR(0.001, 0.02, 0.95));
    });
  });

  describe('Omega比率', () => {
    it('正Omega', () => {
      expect(calculateOmegaRatio([0.02, 0.01, -0.01, 0.03])).toBeGreaterThan(1);
    });

    it('全部正收益', () => {
      expect(calculateOmegaRatio([0.01, 0.02, 0.03], 0)).toBe(Infinity);
    });

    it('零阈值', () => {
      expect(calculateOmegaRatio([-0.01, 0.01], 0)).toBeCloseTo(1);
    });
  });

  describe('Kelly准则', () => {
    const engine = new KellyCriterionEngine();

    it('正Kelly', () => {
      expect(engine.calculateKelly(0.6, 2, 1).fullKelly).toBeGreaterThan(0);
    });

    it('50%胜率等盈亏', () => {
      expect(engine.calculateKelly(0.5, 1, 1).fullKelly).toBeCloseTo(0);
    });

    it('高胜率高盈亏', () => {
      expect(engine.calculateKelly(0.7, 3, 1).fullKelly).toBeGreaterThan(0.3);
    });

    it('零平均损失', () => {
      expect(engine.calculateKelly(0.5, 1, 0).fullKelly).toBe(0);
    });

    it('负Kelly截断为0', () => {
      // (0.4 × 1 - 0.6) / 1 = -0.2 → max(0, …) = 0（kellyCriterionEngine.ts:34）。
      expect(engine.calculateKelly(0.4, 1, 1).fullKelly).toBe(0);
    });
  });

  describe('EMA', () => {
    it('常数数据', () => {
      const result = calculateEMA([10, 10, 10, 10], 3);
      expect(result[result.length - 1]).toBeCloseTo(10);
    });

    it('空数组', () => {
      expect(calculateEMA([], 3)).toEqual([]);
    });

    it('单元素', () => {
      expect(calculateEMA([5], 3)).toEqual([5]);
    });

    it('递增数据', () => {
      const result = calculateEMA([1, 2, 3, 4, 5], 3);
      expect(result[result.length - 1]).toBeGreaterThan(result[0]);
    });
  });

  describe('RSI', () => {
    it('全部上涨RSI=100', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
      const rsi = calculateRSI(prices, 14);
      expect(rsi.length).toBe(prices.length);
      expect(rsi[rsi.length - 1]).toBe(100);
    });

    it('数据不足返回空', () => {
      // 生产返回与输入等长全 null，不再返回 []（technical.ts:234-236）。
      expect(calculateRSI([1, 2, 3], 14)).toEqual([null, null, null]);
    });

    it('RSI在0-100之间', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
      const values = calculateRSI(prices, 14).filter((v): v is number => v !== null);
      expect(values.length).toBeGreaterThan(0);
      values.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('ATR', () => {
    it('计算正确', () => {
      const highs = [10, 12, 11, 13, 14];
      const lows = [8, 10, 9, 11, 12];
      const closes = [9, 11, 10, 12, 13];
      const result = calculateATR(highs, lows, closes, 2);
      expect(result.atr.length).toBe(highs.length);
      // trueRange 从第 2 根 K 线起，atr 首个非空在 index=period（technical.ts:468/489）。
      expect(result.trueRange[0]).toBeNull();
      expect(result.atr.slice(0, 2)).toEqual([null, null]);
      expect(result.atr[2]).not.toBeNull();
      expect(result.atr[2] as number).toBeCloseTo(2.5, 5);
      result.atr
        .filter((v): v is number => v !== null)
        .forEach(v => expect(v).toBeGreaterThan(0));
    });

    it('数据不足返回空', () => {
      // 生产返回等长数组而非 []（technical.ts:468-471）。
      expect(calculateATR([10], [8], [9], 14)).toEqual({ atr: [null], trueRange: [null] });
    });
  });

  describe('布林带', () => {
    it('上轨大于中轨大于下轨', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.5) * 5);
      const bb = calculateBollingerBands(prices, 10);
      expect(bb.upper.length).toBe(prices.length);
      expect(bb.upper[0]).toBeNull();
      for (let i = 9; i < prices.length; i++) {
        const upper = bb.upper[i] as number;
        const middle = bb.middle[i] as number;
        const lower = bb.lower[i] as number;
        expect(upper).toBeGreaterThan(middle);
        expect(middle).toBeGreaterThan(lower);
      }
    });

    it('常数价格带宽为零', () => {
      const prices = Array(20).fill(100);
      const bb = calculateBollingerBands(prices, 20);
      expect(bb.upper[19]).not.toBeNull();
      expect(bb.lower[19]).not.toBeNull();
      expect(bb.upper[19] as number).toBeCloseTo(bb.lower[19] as number);
    });
  });
});
