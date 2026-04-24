import { describe, it, expect } from 'vitest';
import { MacroIndicatorEngine, type MacroIndicator, type MacroSignal } from '../utils/macroLeadingEngine';

describe('宏观经济先行指标引擎', () => {
  const engine = new MacroIndicatorEngine();

  const createIndicator = (overrides: Partial<MacroIndicator> = {}): MacroIndicator => ({
    name: 'PMI制造业',
    category: 'leading',
    value: 51,
    previousValue: 50,
    date: '2024-01',
    unit: 'index',
    weight: 0.3,
    ...overrides
  });

  describe('calculateSignal', () => {
    it('空数据返回默认信号', () => {
      const result = engine.calculateSignal([]);
      expect(result.signal).toBe('recovery');
      expect(result.confidence).toBe(0);
    });

    it('领先指标高→扩张信号', () => {
      const indicators = [
        createIndicator({ name: 'PMI', category: 'leading', value: 58, weight: 0.5 }),
        createIndicator({ name: '社融', category: 'leading', value: 56, weight: 0.3 }),
        createIndicator({ name: '工业产值', category: 'coincident', value: 54, weight: 0.2 }),
      ];
      const result = engine.calculateSignal(indicators);
      expect(result.signal).toBe('expansion');
    });

    it('领先低同步低→滞胀', () => {
      const indicators = [
        createIndicator({ name: 'PMI制造业', category: 'leading', value: 35, weight: 0.5 }),
        createIndicator({ name: 'PMI服务业', category: 'coincident', value: 32, weight: 0.5 }),
      ];
      const result = engine.calculateSignal(indicators);
      expect(['stagflation', 'contraction']).toContain(result.signal);
    });

    it('综合评分在合理范围', () => {
      const indicators = [
        createIndicator({ value: 55, weight: 0.5 }),
        createIndicator({ name: 'M2', category: 'coincident', value: 52, weight: 0.3 }),
        createIndicator({ name: 'CPI', category: 'lagging', value: 48, weight: 0.2 }),
      ];
      const result = engine.calculateSignal(indicators);
      expect(result.compositeScore).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('分类指数正确计算', () => {
      const indicators = [
        createIndicator({ category: 'leading', value: 55 }),
        createIndicator({ name: '同步', category: 'coincident', value: 52 }),
        createIndicator({ name: '滞后', category: 'lagging', value: 48 }),
      ];
      const result = engine.calculateSignal(indicators);
      expect(result.leadingIndex).toBeGreaterThan(0);
      expect(result.coincidentIndex).toBeGreaterThan(0);
      expect(result.laggingIndex).toBeGreaterThan(0);
    });

    it('变化率计算', () => {
      const indicators = [
        createIndicator({ value: 55, previousValue: 50 }),
      ];
      const result = engine.calculateSignal(indicators);
      expect(result.rateOfChange).toBeCloseTo(10);
    });
  });

  describe('identifyRegime', () => {
    it('连续扩张→牛市', () => {
      const signals = Array.from({ length: 12 }, () => ({
        date: '2024-01',
        compositeScore: 30,
        signal: 'expansion' as const,
        leadingIndex: 58,
        coincidentIndex: 55,
        laggingIndex: 52,
        rateOfChange: 2,
        confidence: 80
      }));
      const result = engine.identifyRegime(signals);
      expect(result.regime).toBe('bull');
      expect(result.probability).toBeGreaterThan(0.5);
    });

    it('连续收缩→熊市', () => {
      const signals = Array.from({ length: 12 }, () => ({
        date: '2024-01',
        compositeScore: -30,
        signal: 'contraction' as const,
        leadingIndex: 42,
        coincidentIndex: 45,
        laggingIndex: 48,
        rateOfChange: -3,
        confidence: 80
      }));
      const result = engine.identifyRegime(signals);
      expect(result.regime).toBe('bear');
    });

    it('空数据返回过渡期', () => {
      const result = engine.identifyRegime([]);
      expect(result.regime).toBe('transition');
      expect(result.duration).toBe(0);
    });

    it('包含历史模式', () => {
      const signals: MacroSignal[] = Array.from({ length: 8 }, () => ({
        date: '2024-01',
        compositeScore: 20,
        signal: 'expansion',
        leadingIndex: 58,
        coincidentIndex: 55,
        laggingIndex: 52,
        rateOfChange: 1,
        confidence: 75
      }));
      const result = engine.identifyRegime(signals);
      expect(result.historicalPattern).toBeDefined();
    });

    it('持续月数计算', () => {
      const signals: MacroSignal[] = [
        { date: '2024-01', compositeScore: -10, signal: 'contraction', leadingIndex: 45, coincidentIndex: 48, laggingIndex: 50, rateOfChange: -1, confidence: 70 },
        { date: '2024-02', compositeScore: -15, signal: 'contraction', leadingIndex: 44, coincidentIndex: 47, laggingIndex: 49, rateOfChange: -2, confidence: 70 },
        { date: '2024-03', compositeScore: -20, signal: 'contraction', leadingIndex: 43, coincidentIndex: 46, laggingIndex: 48, rateOfChange: -3, confidence: 70 },
      ];
      const result = engine.identifyRegime(signals);
      expect(result.duration).toBe(3);
    });
  });

  describe('calculateCorrelations', () => {
    it('返回相关性分析', () => {
      const indicators = [
        createIndicator({ name: 'PMI', value: 55, previousValue: 50 }),
      ];
      const returns = [{ date: '2024-01', return: 2 }];
      const result = engine.calculateCorrelations(indicators, returns);
      expect(result.length).toBe(1);
      expect(result[0].marketCorrelation).toBeGreaterThanOrEqual(-1);
      expect(result[0].marketCorrelation).toBeLessThanOrEqual(1);
    });

    it('先行指标领先', () => {
      const indicators = [createIndicator({ category: 'leading' })];
      const result = engine.calculateCorrelations(indicators, [{ date: '2024-01', return: 1 }]);
      expect(result[0].leadLagMonths).toBeLessThan(0);
    });

    it('滞后指标滞后', () => {
      const indicators = [createIndicator({ category: 'lagging' })];
      const result = engine.calculateCorrelations(indicators, [{ date: '2024-01', return: 1 }]);
      expect(result[0].leadLagMonths).toBeGreaterThan(0);
    });

    it('无匹配数据时返回零值', () => {
      const indicators = [createIndicator({ date: '2024-02' })];
      const result = engine.calculateCorrelations(indicators, [{ date: '2024-01', return: 1 }]);
      expect(result[0].marketCorrelation).toBe(0);
    });
  });

  describe('analyzePMIDiffusion', () => {
    it('综合PMI计算', () => {
      const pmi = [
        { name: '新订单', value: 55, weight: 0.3 },
        { name: '生产', value: 52, weight: 0.25 },
        { name: '库存', value: 48, weight: 0.2 },
        { name: '就业', value: 50, weight: 0.25 },
      ];
      const result = engine.analyzePMIDiffusion(pmi);
      expect(result.compositePMI).toBeGreaterThan(48);
      expect(result.compositePMI).toBeLessThan(56);
    });

    it('新订单减库存', () => {
      const pmi = [
        { name: '新订单', value: 55, weight: 0.5 },
        { name: '库存', value: 45, weight: 0.5 },
      ];
      const result = engine.analyzePMIDiffusion(pmi);
      expect(result.newOrdersMinusInventories).toBe(10);
    });

    it('扩张广度', () => {
      const pmi = [
        { name: 'A', value: 55, weight: 1 },
        { name: 'B', value: 48, weight: 1 },
        { name: 'C', value: 52, weight: 1 },
      ];
      const result = engine.analyzePMIDiffusion(pmi);
      expect(result.breadth).toBeCloseTo(2 / 3);
    });

    it('信号判断', () => {
      const expansion = engine.analyzePMIDiffusion([
        { name: 'A', value: 58, weight: 0.5 },
        { name: 'B', value: 56, weight: 0.5 },
      ]);
      expect(expansion.signal).toBe('expansion');

      const contraction = engine.analyzePMIDiffusion([
        { name: 'A', value: 42, weight: 0.5 },
        { name: 'B', value: 44, weight: 0.5 },
      ]);
      expect(contraction.signal).toBe('contraction');
    });

    it('动量计算', () => {
      const pmi = [
        { name: 'A', value: 55, weight: 1 },
        { name: 'B', value: 45, weight: 1 },
      ];
      const result = engine.analyzePMIDiffusion(pmi);
      expect(result.momentum).toBeCloseTo(0);
    });

    it('空数据不报错', () => {
      const result = engine.analyzePMIDiffusion([]);
      expect(result.compositePMI).toBe(0);
    });
  });
});
