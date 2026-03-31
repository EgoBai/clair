import { describe, it, expect } from 'vitest';
import { nowcastMacro, MacroIndicator } from '../utils/macroNowcastEngine';

describe('宏观经济Nowcasting引擎', () => {
  const indicators: MacroIndicator[] = [
    { name: 'PMI', category: 'production', value: 51.5, priorValue: 50.8, consensus: 51.0, weight: 0.2, frequency: 'monthly', date: '2024-03-01' },
    { name: '工业增加值', category: 'production', value: 6.5, priorValue: 5.8, weight: 0.15, frequency: 'monthly', date: '2024-03-10' },
    { name: '社零', category: 'consumption', value: 4.2, priorValue: 3.8, consensus: 4.0, weight: 0.15, frequency: 'monthly', date: '2024-03-12' },
    { name: '固定资产投资', category: 'investment', value: 5.0, priorValue: 4.5, weight: 0.1, frequency: 'monthly', date: '2024-03-15' },
    { name: '出口', category: 'trade', value: 7.8, priorValue: 6.5, weight: 0.1, frequency: 'monthly', date: '2024-03-08' },
    { name: 'M2', category: 'monetary', value: 8.7, priorValue: 8.5, weight: 0.15, frequency: 'monthly', date: '2024-03-10' },
    { name: '新增贷款', category: 'monetary', value: 15000, priorValue: 14000, weight: 0.15, frequency: 'monthly', date: '2024-03-11' },
  ];

  it('应该计算GDP Nowcasting', () => {
    const result = nowcastMacro(indicators);
    expect(typeof result.gdpNowcast).toBe('number');
    expect(result.gdpNowcast).toBeGreaterThan(0);
  });

  it('应该计算GDP置信度', () => {
    const result = nowcastMacro(indicators);
    expect(result.gdpConfidence).toBeGreaterThan(0);
    expect(result.gdpConfidence).toBeLessThanOrEqual(0.95);
  });

  it('应该预测通胀', () => {
    const result = nowcastMacro(indicators);
    expect(typeof result.inflationNowcast).toBe('number');
    expect(['rising', 'falling', 'stable']).toContain(result.cpiTrend);
  });

  it('应该预测货币政策', () => {
    const result = nowcastMacro(indicators);
    expect(result.monetaryPolicyProb.ease).toBeGreaterThanOrEqual(0);
    expect(result.monetaryPolicyProb.hold).toBeGreaterThanOrEqual(0);
    expect(result.monetaryPolicyProb.tighten).toBeGreaterThanOrEqual(0);
    const total = result.monetaryPolicyProb.ease + result.monetaryPolicyProb.hold + result.monetaryPolicyProb.tighten;
    expect(total).toBeCloseTo(1, 1);
  });

  it('应该判断经济周期', () => {
    const result = nowcastMacro(indicators);
    expect(['expansion', 'peak', 'contraction', 'trough']).toContain(result.economicCycle);
    expect(result.cyclePosition).toBeGreaterThanOrEqual(0);
    expect(result.cyclePosition).toBeLessThanOrEqual(1);
  });

  it('应该分析先行指标', () => {
    const result = nowcastMacro(indicators);
    expect(result.leadingIndicators.length).toBeGreaterThan(0);
    for (const li of result.leadingIndicators) {
      expect(['positive', 'negative', 'neutral']).toContain(li.signal);
    }
  });

  it('应该计算综合分数', () => {
    const result = nowcastMacro(indicators);
    expect(result.compositeScore).toBeGreaterThanOrEqual(-100);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });

  it('空数据应抛出错误', () => {
    expect(() => nowcastMacro([])).toThrow();
  });

  it('应该生成警报', () => {
    const result = nowcastMacro(indicators);
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('应该处理缺失共识值', () => {
    const noConsensus = indicators.map(i => ({ ...i, consensus: undefined }));
    const result = nowcastMacro(noConsensus);
    expect(typeof result.gdpNowcast).toBe('number');
  });
});
