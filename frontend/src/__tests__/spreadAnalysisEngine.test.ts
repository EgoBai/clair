import { describe, it, expect } from 'vitest';
import { analyzeSpread, SpreadData } from '../utils/spreadAnalysisEngine';

describe('跨品种价差分析引擎', () => {
  const data: SpreadData[] = Array.from({ length: 100 }, (_, i) => {
    const base1 = 100 + Math.sin(i * 0.1) * 5;
    const base2 = 98 + Math.cos(i * 0.1) * 4;
    return {
      date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      leg1Price: base1 + Math.random() * 2,
      leg2Price: base2 + Math.random() * 2,
      spread: 0,
    };
  });
  data.forEach(d => d.spread = d.leg1Price - d.leg2Price);

  it('应该计算当前价差', () => {
    const result = analyzeSpread(data);
    expect(typeof result.currentSpread).toBe('number');
  });

  it('应该计算均值', () => {
    const result = analyzeSpread(data);
    expect(typeof result.meanSpread).toBe('number');
  });

  it('应该计算标准差', () => {
    const result = analyzeSpread(data);
    expect(result.stdSpread).toBeGreaterThan(0);
  });

  it('应该计算Z-Score', () => {
    const result = analyzeSpread(data);
    expect(typeof result.zScore).toBe('number');
  });

  it('应该计算百分位', () => {
    const result = analyzeSpread(data);
    expect(result.percentile).toBeGreaterThanOrEqual(0);
    expect(result.percentile).toBeLessThanOrEqual(1);
  });

  it('应该判断趋势', () => {
    const result = analyzeSpread(data);
    expect(['widening', 'narrowing', 'stable']).toContain(result.trend);
  });

  it('应该计算均值回归概率', () => {
    const result = analyzeSpread(data);
    expect(result.meanReversionProb).toBeGreaterThanOrEqual(0);
    expect(result.meanReversionProb).toBeLessThanOrEqual(1);
  });

  it('应该生成信号', () => {
    const result = analyzeSpread(data);
    expect(['buy_spread', 'sell_spread', 'neutral']).toContain(result.signal);
  });

  it('应该计算风险收益比', () => {
    const result = analyzeSpread(data);
    expect(result.riskReward).toBeGreaterThan(0);
  });

  it('应该设置入场/目标/止损', () => {
    const result = analyzeSpread(data);
    expect(result.entryLevel).toBeDefined();
    expect(result.targetLevel).toBeDefined();
    expect(result.stopLevel).toBeDefined();
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeSpread([])).toThrow();
  });

  it('应该生成警报', () => {
    const result = analyzeSpread(data);
    expect(Array.isArray(result.alerts)).toBe(true);
  });
});
