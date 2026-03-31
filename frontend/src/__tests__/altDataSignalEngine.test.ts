import { describe, it, expect } from 'vitest';
import { generateAltDataSignals, AlternativeData } from '../utils/altDataSignalEngine';

describe('另类数据信号引擎', () => {
  const data: AlternativeData[] = [
    { source: 'satellite', stockCode: '600001', date: '2024-03-14', metric: 'parking', value: 850, percentile: 0.9, yoyChange: 0.25, momChange: 0.15 },
    { source: 'social', stockCode: '600001', date: '2024-03-14', metric: 'mentions', value: 12000, percentile: 0.7, yoyChange: 0.5, momChange: 0.2 },
    { source: 'job', stockCode: '600001', date: '2024-03-10', metric: 'openings', value: 350, percentile: 0.85, yoyChange: 0.3, momChange: 0.1 },
    { source: 'app', stockCode: '600001', date: '2024-03-13', metric: 'downloads', value: 50000, percentile: 0.6, yoyChange: 0.15, momChange: 0.05 },
    { source: 'supply_chain', stockCode: '600001', date: '2024-03-12', metric: 'orders', value: 1500, percentile: 0.75, yoyChange: 0.2, momChange: 0.08 },
    { source: 'satellite', stockCode: '600002', date: '2024-03-14', metric: 'parking', value: 200, percentile: 0.15, yoyChange: -0.3, momChange: -0.15 },
    { source: 'social', stockCode: '600002', date: '2024-03-14', metric: 'mentions', value: 3000, percentile: 0.3, yoyChange: -0.1, momChange: -0.05 },
  ];

  it('应该生成信号', () => {
    const signals = generateAltDataSignals(data);
    expect(signals.length).toBe(2);
  });

  it('应该计算综合信号', () => {
    const signals = generateAltDataSignals(data);
    for (const s of signals) {
      expect(s.compositeSignal).toBeGreaterThanOrEqual(-1);
      expect(s.compositeSignal).toBeLessThanOrEqual(1);
    }
  });

  it('应该按信号强度排序', () => {
    const signals = generateAltDataSignals(data);
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i - 1].signalStrength).toBeGreaterThanOrEqual(signals[i].signalStrength);
    }
  });

  it('应该检测冲突信号', () => {
    const conflictData: AlternativeData[] = [
      { source: 'satellite', stockCode: '600003', date: '2024-03-14', metric: 'a', value: 100, percentile: 0.95, yoyChange: 0.5, momChange: 0.3 },
      { source: 'social', stockCode: '600003', date: '2024-03-14', metric: 'b', value: 10, percentile: 0.05, yoyChange: -0.5, momChange: -0.3 },
    ];
    const signals = generateAltDataSignals(conflictData);
    expect(signals[0].conflictingSignals).toBe(true);
  });

  it('应该包含数据源详情', () => {
    const signals = generateAltDataSignals(data);
    const s0 = signals.find(s => s.stockCode === '600001');
    expect(s0!.dataSources.length).toBe(5);
    for (const ds of s0!.dataSources) {
      expect(ds.freshness).toBeGreaterThanOrEqual(0);
      expect(ds.freshness).toBeLessThanOrEqual(1);
      expect(ds.reliability).toBeGreaterThan(0);
    }
  });

  it('应该判断方向', () => {
    const signals = generateAltDataSignals(data);
    for (const s of signals) {
      expect(['bullish', 'bearish', 'neutral']).toContain(s.direction);
    }
  });

  it('应该计算信号强度', () => {
    const signals = generateAltDataSignals(data);
    for (const s of signals) {
      expect(s.signalStrength).toBeGreaterThanOrEqual(0);
      expect(s.signalStrength).toBeLessThanOrEqual(1);
    }
  });

  it('空数据应返回空数组', () => {
    const signals = generateAltDataSignals([]);
    expect(signals.length).toBe(0);
  });

  it('应该支持自定义权重', () => {
    const signals = generateAltDataSignals(data, { satellite: 0.5, social: 0.3, job: 0.1, app: 0.05, supply_chain: 0.05 });
    expect(signals.length).toBe(2);
  });
});
