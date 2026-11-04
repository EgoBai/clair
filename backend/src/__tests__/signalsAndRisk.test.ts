/**
 * 影子测试迁移（批次 34a，signalsAndRisk）
 *
 * 旧文件只 import vitest，信号与风险两组 helper 全部内联自抄。
 * 本轮把指标 RSI/SMA、VaR、最大回撤、夏普、止损价、仓位与 Position 类型改为 import 产品仓真实实现；
 * 组合信号 / 组合价值 / 暴露 / 集中度为生产缺口，保留本地 helper 并注明。
 * 被 import 的 4 个模块均不依赖外部包（0 个 import），跨包 import 先例见
 * backend/src/__tests__/movingAverageSystem.test.ts:38。
 *
 * 已绑定生产实现：
 * - calculateSMA → frontend/src/utils/chartDataProcessing.ts:73（(number|null)[]，period-1 个 null 预热）
 * - calculateRSI → frontend/src/utils/chartDataProcessing.ts:111（null 预热、Wilder）
 *   （两者供下方本地 generateCombinedSignal 组合调用，不重复算法。）
 * - calculateVaR → backend/src/services/stressTestEngine.ts:32 stressVaR(returns, confidence)
 * - calculateMaxDrawdown → backend/src/models/Backtest.ts:164（峰值回撤分数 0..1）
 * - calculateSharpeRatio → backend/src/models/Backtest.ts:152（样本方差 n−1、年化、默认 rf=0.03）
 * - checkStopLoss（布尔）→ frontend/src/utils/riskManagementEngine.ts:127 calculateStopLoss（返回止损价）
 * - calculatePositionSize → frontend/src/utils/riskManagementEngine.ts:153
 * - Position 类型 → frontend/src/utils/riskManagementEngine.ts:6（比旧本地接口多 sector 字段）
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * - VaR 符号：旧副本返回百分位收益 -0.05，生产 stressVaR 返回 -sorted[idx]（正数=损失，
 *   stressTestEngine.ts:36）。「应返回负值」→ 生产 0.05（>0，浮点 toBeCloseTo）；
 *   「全正收益VaR接近最小」旧 0.01 → 生产 -0.01。
 * - VaR 分位索引不变：idx = floor((1-confidence) × n)，空数组返回 0。
 * - 仓位数量级：旧副本 floor(riskAmount/riskPerShare/100)×100（100 股整手）→ 生产不取整，
 *   且按 maxPositionPct 封顶（riskManagementEngine.ts:195-196）。旧「应返回100股整数倍」在
 *   1000 股时数值恰好成立，改为断言 1000；新增 2000/0.7 → 2857（非整百）用例证明无整手取整。
 * - 止损：旧布尔 (entry-current)/entry >= pct → 生产返回止损价；等价断言改为
 *   「生产止损价 = entry×(1-value)」+「现价 <= 止损价」，触发器比较留在测试内。
 * - 夏普：旧默认 rf=0、非年化 → 生产默认 rf=0.03 且 ×√252 年化；本组只断言符号/零波动，仍成立。
 * - 其余断言（最大回撤、组合价值、暴露、集中度、信号结构）与旧副本一致，未改。
 *
 * 未迁移（生产无对应导出 / 契约不同，保留本地 helper）：
 * - generateCombinedSignal：生产 backend/src/services/multiSignalEngine.ts 只有异步 getMultiSignals(symbol)
 *   与 Signal{name,source,value,direction,confidence,timeframe,detail}（形状不同），
 *   无纯数组组合信号导出；本地 helper 改为调用生产 calculateSMA/calculateRSI。
 * - calculatePortfolioValue：生产 riskManagementEngine.ts:64 calculatePortfolioRisk().totalValue
 *   只算市值、不含现金（:70-72），且入参需要 marketReturns/portfolioReturns。
 * - calculateExposure：全仓无导出（市值/总值）。
 * - calculateConcentration：生产只有 HHI 合约（backend/src/services/portfolioStressEngine.ts:18
 *   concentrationRisk(weights)、riskManagementEngine.ts:329 未导出的 calculateConcentrationRisk），
 *   与「最大权重」契约不同。
 * - interface Signal：本地信号形状（type/strength/indicators/timestamp），生产 Signal 字段不同，保留本地类型。
 * - interface RiskMetrics：未被任何用例引用，且与生产 PortfolioRisk（riskManagementEngine.ts:14）
 *   字段不同，删除。
 */

import { describe, it, expect } from 'vitest';
import { calculateSMA, calculateRSI } from '../../../frontend/src/utils/chartDataProcessing';
import { stressVaR } from '../services/stressTestEngine';
import { calculateMaxDrawdown, calculateSharpeRatio } from '../models/Backtest';
import {
  calculateStopLoss,
  calculatePositionSize,
} from '../../../frontend/src/utils/riskManagementEngine';
import type { Position } from '../../../frontend/src/utils/riskManagementEngine';

// ===== 指标组合信号引擎 =====
describe('Indicator Combination Signal Engine', () => {
  interface Signal {
    type: 'buy' | 'sell' | 'hold';
    strength: number; // 0-100
    indicators: string[];
    timestamp: number;
  }

  // 未迁移：生产只有异步 getMultiSignals(symbol) 与不同形状的 Signal，无纯数组组合信号导出；
  // 本地 helper 仅组合生产 calculateRSI/calculateSMA 与打分规则，不重复指标算法。
  const generateCombinedSignal = (
    closes: number[],
    volume: number[],
    maShort: number = 5,
    maLong: number = 20,
    rsiPeriod: number = 14,
    rsiOversold: number = 30,
    rsiOverbought: number = 70,
  ): Signal[] => {
    const rsi = calculateRSI(closes, rsiPeriod);
    const shortMA = calculateSMA(closes, maShort);
    const longMA = calculateSMA(closes, maLong);
    const avgVol = volume.reduce((a, b) => a + b, 0) / volume.length;

    const signals: Signal[] = [];
    for (let i = 0; i < closes.length; i++) {
      const indicators: string[] = [];
      let score = 0;

      // MA crossover
      if (shortMA[i] !== null && longMA[i] !== null && i > 0 && shortMA[i - 1] !== null && longMA[i - 1] !== null) {
        if (shortMA[i]! > longMA[i]! && shortMA[i - 1]! <= longMA[i - 1]!) {
          indicators.push('MA金叉');
          score += 30;
        } else if (shortMA[i]! < longMA[i]! && shortMA[i - 1]! >= longMA[i - 1]!) {
          indicators.push('MA死叉');
          score -= 30;
        }
      }

      // RSI
      if (rsi[i] !== null) {
        if (rsi[i]! < rsiOversold) { indicators.push('RSI超卖'); score += 25; }
        else if (rsi[i]! > rsiOverbought) { indicators.push('RSI超买'); score -= 25; }
      }

      // Volume
      if (volume[i] > avgVol * 1.5) { indicators.push('放量'); score += 15; }

      // Price trend
      if (i > 0 && closes[i] > closes[i - 1]) score += 5;
      else if (i > 0 && closes[i] < closes[i - 1]) score -= 5;

      const type: 'buy' | 'sell' | 'hold' = score > 20 ? 'buy' : score < -20 ? 'sell' : 'hold';
      signals.push({ type, strength: Math.min(100, Math.abs(score)), indicators, timestamp: i });
    }
    return signals;
  };

  // Start flat then spike: creates MA crossover
  const bullishData = Array.from({ length: 30 }, (_, i) => i < 15 ? 10 + i * 0.1 : 10 + 1.5 + (i - 15) * 1.5);
  const bearishData = Array.from({ length: 30 }, (_, i) => i < 15 ? 25 - i * 0.1 : 25 - 1.5 - (i - 15) * 1.5);
  const volatileData = Array.from({ length: 50 }, (_, i) => 15 + Math.sin(i * 0.5) * 5);

  describe('上涨行情信号', () => {
    it('应产生信号', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      // Bullish trend should produce buy or hold signals
      const buyOrHold = signals.filter(s => s.type === 'buy' || s.type === 'hold');
      expect(buyOrHold.length).toBeGreaterThan(0);
    });

    it('信号强度应非负', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      signals.forEach(s => expect(s.strength).toBeGreaterThanOrEqual(0));
    });
  });

  describe('下跌行情信号', () => {
    it('应产生信号', () => {
      const signals = generateCombinedSignal(bearishData, Array(30).fill(1000));
      // Bearish trend should produce sell or hold signals
      const sellOrHold = signals.filter(s => s.type === 'sell' || s.type === 'hold');
      expect(sellOrHold.length).toBeGreaterThan(0);
    });
  });

  describe('震荡行情信号', () => {
    it('应以持有为主', () => {
      const signals = generateCombinedSignal(volatileData, Array(50).fill(1000));
      const holdSignals = signals.filter(s => s.type === 'hold');
      expect(holdSignals.length).toBeGreaterThan(signals.length * 0.3);
    });
  });

  describe('信号结构', () => {
    it('信号数应等于数据长度', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      expect(signals.length).toBe(30);
    });

    it('每个信号有必需字段', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      signals.forEach(s => {
        expect(['buy', 'sell', 'hold']).toContain(s.type);
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
        expect(Array.isArray(s.indicators)).toBe(true);
      });
    });

    it('指标数组不为空时信号更可靠', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      const withIndicators = signals.filter(s => s.indicators.length > 0);
      withIndicators.forEach(s => expect(s.strength).toBeGreaterThan(0));
    });
  });

  describe('自定义参数', () => {
    it('不同RSI阈值应产生不同信号', () => {
      const s1 = generateCombinedSignal(volatileData, Array(50).fill(1000), 5, 20, 14, 20, 80);
      const s2 = generateCombinedSignal(volatileData, Array(50).fill(1000), 5, 20, 14, 40, 60);
      const buy1 = s1.filter(s => s.type === 'buy').length;
      const buy2 = s2.filter(s => s.type === 'buy').length;
      expect(buy1 !== buy2 || s1.some((s, i) => s.type !== s2[i].type)).toBe(true);
    });

    it('不同MA周期应产生不同信号', () => {
      const s1 = generateCombinedSignal(bullishData, Array(30).fill(1000), 3, 10);
      const s2 = generateCombinedSignal(bullishData, Array(30).fill(1000), 5, 20);
      // Signals may differ due to different MA periods
      expect(s1.length).toBe(s2.length);
    });
  });
});

// ===== 风险管理引擎 =====
describe('Risk Management Engine', () => {
  // 未迁移：生产 calculatePortfolioRisk().totalValue 只算市值、不含现金，且需收益序列入参。
  const calculatePortfolioValue = (positions: Position[], cash: number): number => {
    return cash + positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
  };

  // 未迁移：全仓无「市值/总值」导出。
  const calculateExposure = (positions: Position[], totalValue: number): number => {
    if (totalValue === 0) return 0;
    const invested = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
    return invested / totalValue;
  };

  // 未迁移：生产 concentrationRisk 为 HHI 平方和，非「最大权重」。
  const calculateConcentration = (positions: Position[]): number => {
    if (positions.length === 0) return 0;
    const totalValue = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
    if (totalValue === 0) return 0;
    const weights = positions.map(p => (p.quantity * p.currentPrice) / totalValue);
    return Math.max(...weights);
  };

  const samplePositions: Position[] = [
    { symbol: '600519', quantity: 100, avgCost: 1800, currentPrice: 1850, sector: '白酒' },
    { symbol: '000858', quantity: 500, avgCost: 150, currentPrice: 145, sector: '白酒' },
    { symbol: '601318', quantity: 200, avgCost: 50, currentPrice: 52, sector: '保险' },
  ];

  describe('组合价值', () => {
    it('应正确计算', () => {
      const val = calculatePortfolioValue(samplePositions, 100000);
      expect(val).toBe(100000 + 185000 + 72500 + 10400);
    });

    it('空持仓应等于现金', () => {
      expect(calculatePortfolioValue([], 50000)).toBe(50000);
    });

    it('亏损持仓应减少价值', () => {
      const pos: Position[] = [{ symbol: 'x', quantity: 100, avgCost: 100, currentPrice: 80, sector: '测试' }];
      const val = calculatePortfolioValue(pos, 0);
      expect(val).toBe(8000);
    });
  });

  describe('仓位暴露度', () => {
    it('应为0-1之间', () => {
      const totalVal = calculatePortfolioValue(samplePositions, 100000);
      const exposure = calculateExposure(samplePositions, totalVal);
      expect(exposure).toBeGreaterThan(0);
      expect(exposure).toBeLessThan(1);
    });

    it('全仓应为1', () => {
      const pos: Position[] = [{ symbol: 'x', quantity: 100, avgCost: 100, currentPrice: 100, sector: '测试' }];
      expect(calculateExposure(pos, 10000)).toBeCloseTo(1, 5);
    });

    it('空仓应为0', () => {
      expect(calculateExposure([], 10000)).toBe(0);
    });
  });

  describe('集中度风险', () => {
    it('应返回最大权重', () => {
      const conc = calculateConcentration(samplePositions);
      expect(conc).toBeGreaterThan(1 / 3);
      expect(conc).toBeLessThanOrEqual(1);
    });

    it('等权分配应等于1/n', () => {
      const pos: Position[] = [
        { symbol: 'a', quantity: 100, avgCost: 100, currentPrice: 100, sector: '测试' },
        { symbol: 'b', quantity: 100, avgCost: 100, currentPrice: 100, sector: '测试' },
      ];
      expect(calculateConcentration(pos)).toBeCloseTo(0.5, 5);
    });

    it('单一持仓集中度为1', () => {
      const pos: Position[] = [{ symbol: 'x', quantity: 100, avgCost: 100, currentPrice: 100, sector: '测试' }];
      expect(calculateConcentration(pos)).toBe(1);
    });

    it('空持仓集中度为0', () => {
      expect(calculateConcentration([])).toBe(0);
    });
  });

  describe('VaR', () => {
    it('应返回正损失值（生产符号约定）', () => {
      const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.05, -0.02, 0.01, -0.04];
      // stressVaR 返回 -sorted[idx]：idx=0 → -(-0.05) = 0.05（stressTestEngine.ts:36）。
      const var95 = stressVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
      expect(var95).toBeCloseTo(0.05, 5);
    });

    it('空数据返回0', () => {
      expect(stressVaR([], 0.95)).toBe(0);
    });

    it('全正收益VaR为负（生产符号约定）', () => {
      const returns = [0.01, 0.02, 0.03, 0.04, 0.05];
      // idx=floor(0.05×5)=0 → -0.01；旧内联返回 0.01。
      expect(stressVaR(returns, 0.95)).toBeCloseTo(-0.01, 5);
    });
  });

  describe('最大回撤', () => {
    it('上涨无回撤', () => {
      expect(calculateMaxDrawdown([100, 110, 120, 130])).toBe(0);
    });

    it('下跌有回撤', () => {
      expect(calculateMaxDrawdown([100, 120, 90, 110])).toBeCloseTo(0.25, 2);
    });

    it('空数据返回0', () => {
      expect(calculateMaxDrawdown([])).toBe(0);
    });

    it('单值无回撤', () => {
      expect(calculateMaxDrawdown([100])).toBe(0);
    });

    it('全程下跌回撤0.8', () => {
      expect(calculateMaxDrawdown([100, 80, 60, 40, 20])).toBeCloseTo(0.8, 1);
    });
  });

  describe('夏普比率', () => {
    it('正收益应为正', () => {
      expect(calculateSharpeRatio([0.01, 0.02, 0.03, 0.01, 0.02])).toBeGreaterThan(0);
    });

    it('负收益应为负', () => {
      expect(calculateSharpeRatio([-0.01, -0.02, -0.03, -0.01, -0.02])).toBeLessThan(0);
    });

    it('零波动返回0', () => {
      expect(calculateSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
    });

    it('不足2个点返回0', () => {
      expect(calculateSharpeRatio([0.01])).toBe(0);
    });
  });

  describe('止损检查', () => {
    it('触发止损', () => {
      // fixed 分支只读 entryPrice 与 value（riskManagementEngine.ts:135-136），其余入参传场景值。
      const stop = calculateStopLoss(100, 95, 100, 0, { type: 'fixed', value: 0.05 });
      expect(stop).toBeCloseTo(95);
      expect(95).toBeLessThanOrEqual(stop);
    });

    it('未触发止损', () => {
      const stop = calculateStopLoss(100, 96, 100, 0, { type: 'fixed', value: 0.05 });
      expect(96).toBeGreaterThan(stop);
    });

    it('精确止损点', () => {
      const stop = calculateStopLoss(100, 95, 100, 0, { type: 'fixed', value: 0.05 });
      expect(95).toBeCloseTo(stop);
      expect(95 <= stop).toBe(true);
    });

    it('上涨不应止损', () => {
      const stop = calculateStopLoss(100, 105, 100, 0, { type: 'fixed', value: 0.05 });
      expect(105).toBeGreaterThan(stop);
    });

    it('移动止损按最高价回撤', () => {
      // trailing: max(highSinceEntry×(1-value), entry×0.5) = max(110×0.9, 50) = 99。
      const stop = calculateStopLoss(100, 110, 110, 0, { type: 'trailing', value: 0.1 });
      expect(stop).toBeCloseTo(99);
    });
  });

  describe('仓位计算', () => {
    // maxPositionPct=1（100% 上限）用于隔离 risk_parity 本体；生产同时按该值封顶（:195-196）。
    const config = {
      method: 'risk_parity' as const,
      maxPositionPct: 1,
      riskPerTrade: 0.02,
      maxCorrelatedExposure: 0.3,
    };

    it('按风险定额计算股数（不取整手）', () => {
      // floor(100000×0.02 / |50-48|) = 1000；上限 floor(100000/50) = 2000 不触发。
      expect(calculatePositionSize(100000, 50, 48, config)).toBe(1000);
    });

    it('止损价等于入场价返回0', () => {
      expect(calculatePositionSize(100000, 50, 50, config)).toBe(0);
    });

    it('大资金应买更多', () => {
      const small = calculatePositionSize(50000, 50, 48, config);
      const large = calculatePositionSize(200000, 50, 48, config);
      expect(large).toBeGreaterThan(small);
    });

    it('严格止损应买更多', () => {
      const loose = calculatePositionSize(100000, 50, 45, config);
      const tight = calculatePositionSize(100000, 50, 49, config);
      expect(tight).toBeGreaterThan(loose);
    });

    it('不按100股整手取整', () => {
      // floor(100000×0.02 / |10-9.3|) = 2857，非 100 的整数倍；旧副本会向下取整到 2800。
      const size = calculatePositionSize(100000, 10, 9.3, config);
      expect(size).toBe(2857);
      expect(size % 100).not.toBe(0);
    });
  });
});
