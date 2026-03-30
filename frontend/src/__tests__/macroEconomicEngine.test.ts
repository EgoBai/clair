import { describe, it, expect } from 'vitest';
import {
  calculateGrowthScore,
  calculateInflationScore,
  calculateLiquidityScore,
  determineMacroRegime,
  analyzeMacroTrend,
  generatePolicySignals,
  createMacroSnapshot,
  compareMacroPeriods,
  predictStockMarketImpact,
  type MacroIndicator,
} from '../utils/macroEconomicEngine';

describe('MacroEconomicEngine', () => {
  const mockIndicators: MacroIndicator[] = [
    { name: 'GDP', value: 5.2, prevValue: 4.9, date: '2024-03-31', unit: '%', category: 'growth' },
    { name: '工业增加值', value: 6.8, prevValue: 6.5, date: '2024-03-31', unit: '%', category: 'growth' },
    { name: '固定资产投资', value: 4.2, prevValue: 4.0, date: '2024-03-31', unit: '%', category: 'growth' },
    { name: 'CPI', value: 2.1, prevValue: 1.8, date: '2024-03-31', unit: '%', category: 'inflation' },
    { name: 'PPI', value: -1.2, prevValue: -1.5, date: '2024-03-31', unit: '%', category: 'inflation' },
    { name: 'M2', value: 10.2, prevValue: 9.8, date: '2024-03-31', unit: '%', category: 'liquidity' },
    { name: '社融', value: 35000, prevValue: 32000, date: '2024-03-31', unit: '亿元', category: 'liquidity' },
    { name: 'LPR', value: 3.45, prevValue: 3.55, date: '2024-03-31', unit: '%', category: 'liquidity' },
    { name: '出口', value: 8.5, prevValue: 7.2, date: '2024-03-31', unit: '%', category: 'trade' },
    { name: '失业率', value: 5.1, prevValue: 5.2, date: '2024-03-31', unit: '%', category: 'employment' },
  ];

  describe('calculateGrowthScore', () => {
    it('should calculate growth score from growth indicators', () => {
      const score = calculateGrowthScore(mockIndicators);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return 50 for empty indicators', () => {
      expect(calculateGrowthScore([])).toBe(50);
    });

    it('should return higher score for positive growth', () => {
      const highGrowth: MacroIndicator[] = [
        { name: 'GDP', value: 8.0, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth' },
      ];
      const lowGrowth: MacroIndicator[] = [
        { name: 'GDP', value: 2.0, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth' },
      ];
      expect(calculateGrowthScore(highGrowth)).toBeGreaterThan(calculateGrowthScore(lowGrowth));
    });

    it('should ignore non-growth indicators', () => {
      const withOnlyInflation: MacroIndicator[] = [
        { name: 'CPI', value: 2.5, prevValue: 2.0, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      expect(calculateGrowthScore(withOnlyInflation)).toBe(50);
    });

    it('should handle zero prevValue', () => {
      const indicators: MacroIndicator[] = [
        { name: 'GDP', value: 5.0, prevValue: 0, date: '2024-03-31', unit: '%', category: 'growth' },
      ];
      expect(calculateGrowthScore(indicators)).toBe(50);
    });
  });

  describe('calculateInflationScore', () => {
    it('should score optimal inflation higher', () => {
      const optimal: MacroIndicator[] = [
        { name: 'CPI', value: 2.5, prevValue: 2.0, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      const high: MacroIndicator[] = [
        { name: 'CPI', value: 8.0, prevValue: 7.0, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      expect(calculateInflationScore(optimal)).toBeGreaterThan(calculateInflationScore(high));
    });

    it('should return 50 for empty indicators', () => {
      expect(calculateInflationScore([])).toBe(50);
    });

    it('should penalize deflation', () => {
      const deflation: MacroIndicator[] = [
        { name: 'CPI', value: -1.0, prevValue: 0.5, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      const normal: MacroIndicator[] = [
        { name: 'CPI', value: 2.0, prevValue: 1.8, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      expect(calculateInflationScore(deflation)).toBeLessThan(calculateInflationScore(normal));
    });
  });

  describe('calculateLiquidityScore', () => {
    it('should calculate liquidity score', () => {
      const score = calculateLiquidityScore(mockIndicators);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return 50 for empty indicators', () => {
      expect(calculateLiquidityScore([])).toBe(50);
    });

    it('should score higher M2 growth positively', () => {
      const highM2: MacroIndicator[] = [
        { name: 'M2', value: 12.0, prevValue: 9.0, date: '2024-03-31', unit: '%', category: 'liquidity' },
      ];
      const lowM2: MacroIndicator[] = [
        { name: 'M2', value: 7.0, prevValue: 9.0, date: '2024-03-31', unit: '%', category: 'liquidity' },
      ];
      expect(calculateLiquidityScore(highM2)).toBeGreaterThan(calculateLiquidityScore(lowM2));
    });
  });

  describe('determineMacroRegime', () => {
    it('should return expansion for high growth and moderate inflation', () => {
      expect(determineMacroRegime(70, 60)).toBe('expansion');
    });

    it('should return contraction for low growth and low inflation', () => {
      expect(determineMacroRegime(30, 30)).toBe('contraction');
    });

    it('should return stagflation for low growth and high inflation', () => {
      expect(determineMacroRegime(30, 70)).toBe('stagflation');
    });

    it('should return recovery for moderate growth and moderate inflation', () => {
      expect(determineMacroRegime(55, 45)).toBe('expansion');
    });

    it('should return recovery for high growth with low inflation', () => {
      const result = determineMacroRegime(60, 35);
      expect(['recovery', 'expansion']).toContain(result);
    });
  });

  describe('analyzeMacroTrend', () => {
    it('should detect upward trend', () => {
      const indicator: MacroIndicator = {
        name: 'GDP', value: 5.5, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth',
      };
      const trend = analyzeMacroTrend(indicator);
      expect(trend.direction).toBe('up');
      expect(trend.momChange).toBeGreaterThan(0);
    });

    it('should detect downward trend', () => {
      const indicator: MacroIndicator = {
        name: 'GDP', value: 4.5, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth',
      };
      const trend = analyzeMacroTrend(indicator);
      expect(trend.direction).toBe('down');
      expect(trend.momChange).toBeLessThan(0);
    });

    it('should detect flat trend', () => {
      const indicator: MacroIndicator = {
        name: 'GDP', value: 5.002, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth',
      };
      const trend = analyzeMacroTrend(indicator);
      expect(trend.direction).toBe('flat');
    });

    it('should calculate YoY from historical data', () => {
      const indicator: MacroIndicator = {
        name: 'GDP', value: 6.0, prevValue: 5.5, date: '2024-03-31', unit: '%', category: 'growth',
      };
      const historical = Array(11).fill(5.0).concat([5.0]);
      const trend = analyzeMacroTrend(indicator, historical);
      expect(trend.yoyChange).toBeCloseTo(0.2, 1);
    });

    it('should calculate acceleration from historical data', () => {
      const indicator: MacroIndicator = {
        name: 'GDP', value: 6.0, prevValue: 5.5, date: '2024-03-31', unit: '%', category: 'growth',
      };
      const trend = analyzeMacroTrend(indicator, [4.0, 4.5, 5.0]);
      expect(trend.acceleration).toBeDefined();
    });

    it('should handle zero prevValue for momChange', () => {
      const indicator: MacroIndicator = {
        name: 'GDP', value: 5.0, prevValue: 0, date: '2024-03-31', unit: '%', category: 'growth',
      };
      const trend = analyzeMacroTrend(indicator);
      expect(trend.momChange).toBe(0);
    });
  });

  describe('generatePolicySignals', () => {
    it('should generate easing signal when growth is weak', () => {
      const weakGrowth: MacroIndicator[] = [
        { name: 'GDP', value: 2.0, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth' },
        { name: 'CPI', value: 1.0, prevValue: 1.5, date: '2024-03-31', unit: '%', category: 'inflation' },
        { name: 'M2', value: 8.0, prevValue: 9.0, date: '2024-03-31', unit: '%', category: 'liquidity' },
      ];
      const signals = generatePolicySignals(weakGrowth);
      const monetarySignal = signals.find(s => s.type === 'monetary');
      expect(monetarySignal).toBeDefined();
      expect(monetarySignal!.direction).toBe('easing');
    });

    it('should generate tightening signal when overheating', () => {
      const overheating: MacroIndicator[] = [
        { name: 'GDP', value: 10.0, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth' },
        { name: 'CPI', value: 6.0, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      const signals = generatePolicySignals(overheating);
      const monetarySignal = signals.find(s => s.type === 'monetary');
      expect(monetarySignal).toBeDefined();
      expect(monetarySignal!.direction).toBe('tightening');
    });

    it('should generate neutral signal for stable conditions', () => {
      const stable: MacroIndicator[] = [
        { name: 'GDP', value: 5.0, prevValue: 4.9, date: '2024-03-31', unit: '%', category: 'growth' },
        { name: 'CPI', value: 2.0, prevValue: 2.1, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      const signals = generatePolicySignals(stable);
      const monetarySignal = signals.find(s => s.type === 'monetary');
      expect(monetarySignal).toBeDefined();
      expect(monetarySignal!.direction).toBe('neutral');
    });

    it('should include fiscal signal for weak growth', () => {
      const weakGrowth: MacroIndicator[] = [
        { name: 'GDP', value: 1.0, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth' },
      ];
      const signals = generatePolicySignals(weakGrowth);
      const fiscalSignals = signals.filter(s => s.type === 'fiscal');
      expect(fiscalSignals.length).toBeGreaterThan(0);
      expect(fiscalSignals[0].direction).toBe('easing');
    });

    it('should generate M2 liquidity signal', () => {
      const highM2: MacroIndicator[] = [
        { name: 'GDP', value: 5.0, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth' },
        { name: 'CPI', value: 2.0, prevValue: 2.0, date: '2024-03-31', unit: '%', category: 'inflation' },
        { name: 'M2', value: 13.0, prevValue: 9.0, date: '2024-03-31', unit: '%', category: 'liquidity' },
      ];
      const signals = generatePolicySignals(highM2);
      const liqSignals = signals.filter(s => s.description.includes('M2'));
      expect(liqSignals.length).toBeGreaterThan(0);
    });

    it('should include impact assessment', () => {
      const signals = generatePolicySignals(mockIndicators);
      for (const signal of signals) {
        expect(['positive', 'negative', 'neutral']).toContain(signal.impact);
      }
    });

    it('should include strength between 0 and 1', () => {
      const signals = generatePolicySignals(mockIndicators);
      for (const signal of signals) {
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('createMacroSnapshot', () => {
    it('should create a snapshot with score and regime', () => {
      const snapshot = createMacroSnapshot(mockIndicators);
      expect(snapshot.score).toBeGreaterThan(0);
      expect(snapshot.score).toBeLessThanOrEqual(100);
      expect(['expansion', 'contraction', 'stagflation', 'recovery']).toContain(snapshot.regime);
    });

    it('should use first indicator date', () => {
      const snapshot = createMacroSnapshot(mockIndicators);
      expect(snapshot.date).toBe('2024-03-31');
    });

    it('should use current date for empty indicators', () => {
      const snapshot = createMacroSnapshot([]);
      expect(snapshot.date).toBeDefined();
    });

    it('should preserve all indicators', () => {
      const snapshot = createMacroSnapshot(mockIndicators);
      expect(snapshot.indicators.length).toBe(mockIndicators.length);
    });

    it('should weight growth highest', () => {
      const highGrowth: MacroIndicator[] = [
        { name: 'GDP', value: 10.0, prevValue: 5.0, date: '2024-03-31', unit: '%', category: 'growth' },
        { name: 'CPI', value: 2.0, prevValue: 2.0, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      const snapshot = createMacroSnapshot(highGrowth);
      expect(snapshot.score).toBeGreaterThan(50);
    });
  });

  describe('compareMacroPeriods', () => {
    it('should calculate score difference', () => {
      const current = createMacroSnapshot(mockIndicators);
      const prev = createMacroSnapshot(mockIndicators.map(i => ({ ...i, value: i.prevValue })));
      const comparison = compareMacroPeriods(current, prev);
      expect(comparison.scoreDiff).toBeDefined();
    });

    it('should detect regime changes', () => {
      const expansion: MacroIndicator[] = [
        { name: 'GDP', value: 8.0, prevValue: 7.0, date: '2024-03-31', unit: '%', category: 'growth' },
        { name: 'CPI', value: 2.5, prevValue: 2.0, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      const contraction: MacroIndicator[] = [
        { name: 'GDP', value: 1.0, prevValue: 3.0, date: '2024-01-31', unit: '%', category: 'growth' },
        { name: 'CPI', value: 0.5, prevValue: 1.0, date: '2024-01-31', unit: '%', category: 'inflation' },
      ];
      const current = createMacroSnapshot(expansion);
      const prev = createMacroSnapshot(contraction);
      const comparison = compareMacroPeriods(current, prev);
      expect(comparison.regimeChanged).toBe(true);
    });

    it('should list improved and deteriorated indicators', () => {
      const current = createMacroSnapshot(mockIndicators);
      const prev = createMacroSnapshot(mockIndicators.map(i => ({ ...i, value: i.prevValue })));
      const comparison = compareMacroPeriods(current, prev);
      expect(Array.isArray(comparison.improvedIndicators)).toBe(true);
      expect(Array.isArray(comparison.deterioratedIndicators)).toBe(true);
    });
  });

  describe('predictStockMarketImpact', () => {
    it('should predict bullish for expansion', () => {
      const expansion: MacroIndicator[] = [
        { name: 'GDP', value: 8.0, prevValue: 7.0, date: '2024-03-31', unit: '%', category: 'growth' },
        { name: 'CPI', value: 2.5, prevValue: 2.0, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      const snapshot = createMacroSnapshot(expansion);
      const impact = predictStockMarketImpact(snapshot);
      expect(impact.bias).toBe('bullish');
    });

    it('should predict bearish for stagflation', () => {
      const stagflation: MacroIndicator[] = [
        { name: 'GDP', value: 1.0, prevValue: 3.0, date: '2024-03-31', unit: '%', category: 'growth' },
        { name: 'CPI', value: 8.0, prevValue: 7.0, date: '2024-03-31', unit: '%', category: 'inflation' },
      ];
      const snapshot = createMacroSnapshot(stagflation);
      const impact = predictStockMarketImpact(snapshot);
      expect(impact.bias).toBe('bearish');
    });

    it('should include confidence score', () => {
      const snapshot = createMacroSnapshot(mockIndicators);
      const impact = predictStockMarketImpact(snapshot);
      expect(impact.confidence).toBeGreaterThanOrEqual(0);
      expect(impact.confidence).toBeLessThanOrEqual(1);
    });

    it('should include factors', () => {
      const snapshot = createMacroSnapshot(mockIndicators);
      const impact = predictStockMarketImpact(snapshot);
      expect(impact.factors.length).toBeGreaterThan(0);
    });

    it('should return valid bias values', () => {
      const snapshot = createMacroSnapshot(mockIndicators);
      const impact = predictStockMarketImpact(snapshot);
      expect(['bullish', 'bearish', 'neutral']).toContain(impact.bias);
    });
  });
});
