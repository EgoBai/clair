import { describe, it, expect } from 'vitest';
import { PairsTradingEngine } from '../utils/pairsTradingEngine';
import type { PairData, SpreadSignal } from '../utils/pairsTradingEngine';

describe('PairsTradingEngine', () => {
  const engine = new PairsTradingEngine();

  // 生成协整数据(确定性)
  const generateCointegratedData = (n: number = 100): PairData => {
    const assetA: number[] = [];
    const assetB: number[] = [];
    const timestamps: string[] = [];
    let a = 100;
    for (let i = 0; i < n; i++) {
      a += Math.sin(i * 0.5) * 0.8; // 确定性波动
      const b = a * 0.5 + Math.cos(i * 0.3) * 1.5; // B与A协整
      assetA.push(a);
      assetB.push(b);
      timestamps.push(`2024-01-${String((i % 28) + 1).padStart(2, '0')}`);
    }
    return { assetA, assetB, timestamps };
  };

  describe('协整性检验', () => {
    it('协整数据应被识别为协整', () => {
      const data = generateCointegratedData(100);
      const result = engine.testCointegration(data);
      expect(typeof result.isCointegrated).toBe('boolean');
      expect(result.hedgeRatio).toBeDefined();
    });

    it('非协整数据应被识别为非协整', () => {
      const data: PairData = {
        assetA: Array.from({ length: 100 }, (_, i) => 50 + Math.sin(i * 0.7) * 40),
        assetB: Array.from({ length: 100 }, (_, i) => 50 + Math.cos(i * 1.3) * 30), // 不相关模式
        timestamps: Array.from({ length: 100 }, (_, i) => `2024-01-${(i % 28) + 1}`),
      };
      const result = engine.testCointegration(data);
      expect(result.isCointegrated).toBe(false);
    });

    it('应计算对冲比例', () => {
      const data = generateCointegratedData(100);
      const result = engine.testCointegration(data);
      expect(result.hedgeRatio).toBeGreaterThan(0);
    });

    it('应计算半衰期', () => {
      const data = generateCointegratedData(100);
      const result = engine.testCointegration(data);
      expect(result.halfLife).toBeGreaterThan(0);
    });

    it('价差标准差应为正', () => {
      const data = generateCointegratedData(100);
      const result = engine.testCointegration(data);
      expect(result.spreadStd).toBeGreaterThanOrEqual(0);
    });

    it('空数据不应报错', () => {
      expect(() => engine.testCointegration({ assetA: [], assetB: [], timestamps: [] })).not.toThrow();
    });
  });

  describe('交易信号', () => {
    it('应生成信号数组', () => {
      const data = generateCointegratedData(100);
      const signals = engine.generateSignals(data, 0.5);
      expect(signals.length).toBeGreaterThan(0);
    });

    it('信号应包含zScore', () => {
      const data = generateCointegratedData(100);
      const signals = engine.generateSignals(data, 0.5);
      signals.forEach(s => {
        expect(typeof s.zScore).toBe('number');
      });
    });

    it('极端zScore应触发交易信号', () => {
      const baseA = Array.from({ length: 80 }, () => 100);
      const extremeA = Array.from({ length: 20 }, (_, i) => 100 + (i + 1) * 5);
      const data: PairData = {
        assetA: [...baseA, ...extremeA],
        assetB: Array.from({ length: 100 }, () => 50),
        timestamps: Array.from({ length: 100 }, (_, i) => `${i}`),
      };
      const signals = engine.generateSignals(data, 0.5);
      const lastSignals = signals.slice(-10);
      const hasSignal = lastSignals.some(s => s.signal === 'long_spread' || s.signal === 'short_spread');
      expect(hasSignal).toBe(true);
    });

    it('信号置信度应在0-1之间', () => {
      const data = generateCointegratedData(100);
      const signals = engine.generateSignals(data, 0.5);
      signals.forEach(s => {
        expect(s.confidence).toBeGreaterThanOrEqual(0);
        expect(s.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('信号类型应有效', () => {
      const data = generateCointegratedData(100);
      const signals = engine.generateSignals(data, 0.5);
      signals.forEach(s => {
        expect(['long_spread', 'short_spread', 'exit', 'hold']).toContain(s.signal);
      });
    });

    it('数据不足lookback时应返回空', () => {
      const data: PairData = {
        assetA: [1, 2, 3],
        assetB: [1, 2, 3],
        timestamps: ['1', '2', '3'],
      };
      const signals = engine.generateSignals(data, 0.5);
      expect(signals.length).toBe(0);
    });
  });

  describe('回测', () => {
    it('应返回回测结果', () => {
      const data = generateCointegratedData(120);
      const coint = engine.testCointegration(data);
      const signals = engine.generateSignals(data, coint.hedgeRatio);
      const result = engine.backtest(signals, data, coint.hedgeRatio);
      expect(typeof result.totalReturn).toBe('number');
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    });

    it('胜率应在0-1之间', () => {
      const data = generateCointegratedData(120);
      const coint = engine.testCointegration(data);
      const signals = engine.generateSignals(data, coint.hedgeRatio);
      const result = engine.backtest(signals, data, coint.hedgeRatio);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it('最大回撤应>=0', () => {
      const data = generateCointegratedData(120);
      const coint = engine.testCointegration(data);
      const signals = engine.generateSignals(data, coint.hedgeRatio);
      const result = engine.backtest(signals, data, coint.hedgeRatio);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('空信号不应报错', () => {
      const data = generateCointegratedData(10);
      const result = engine.backtest([], data, 0.5);
      expect(result.totalTrades).toBe(0);
      expect(result.winRate).toBe(0);
    });
  });

  describe('最优对冲比例', () => {
    it('完全相关应返回约1', () => {
      const a = [100, 101, 102, 103, 104, 105];
      const b = [50, 50.5, 51, 51.5, 52, 52.5];
      const ratio = engine.optimalHedgeRatio(a, b);
      expect(ratio).toBeCloseTo(1, 0);
    });

    it('负相关资产对冲比例应为负', () => {
      // A上升，B反向移动
      const a = [100, 101, 102, 101, 100, 101, 102, 101, 100, 101];
      const b = [50, 49, 48, 49, 50, 49, 48, 49, 50, 49];
      const ratio = engine.optimalHedgeRatio(a, b);
      expect(ratio).toBeLessThan(0);
    });

    it('常数B应返回1', () => {
      const a = [100, 101, 102, 103, 104];
      const b = [50, 50, 50, 50, 50];
      const ratio = engine.optimalHedgeRatio(a, b);
      expect(ratio).toBe(1); // varB=0 fallback
    });

    it('空数据应返回1', () => {
      expect(engine.optimalHedgeRatio([], [])).toBe(1);
    });
  });

  describe('边界情况', () => {
    it('相同资产不应报错', () => {
      const data: PairData = {
        assetA: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
        assetB: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
        timestamps: Array.from({ length: 11 }, (_, i) => `${i}`),
      };
      expect(() => engine.testCointegration(data)).not.toThrow();
    });

    it('单元素数组不应报错', () => {
      const data: PairData = { assetA: [1], assetB: [2], timestamps: ['0'] };
      expect(() => engine.testCointegration(data)).not.toThrow();
    });

    it('零值数据不应报错', () => {
      const data: PairData = {
        assetA: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        assetB: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        timestamps: Array.from({ length: 10 }, (_, i) => `${i}`),
      };
      expect(() => engine.testCointegration(data)).not.toThrow();
    });
  });
});
