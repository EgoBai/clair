import { describe, it, expect } from 'vitest';
import { calculateTechnicalComposite, TechnicalInput } from '../utils/technicalCompositeEngine';

describe('技术面综合评分引擎', () => {
  const bullishInput: TechnicalInput = {
    close: 105, ma5: 104, ma10: 102, ma20: 100, ma60: 95, ma120: 90,
    rsi: 60, macd: 2, macdSignal: 1.5, macdHistogram: 0.5,
    adx: 28, bollingerUpper: 110, bollingerLower: 90, bollingerMid: 100,
    atr: 2, volume: 500000, avgVolume: 300000, support: 95, resistance: 115,
  };

  const bearishInput: TechnicalInput = {
    close: 90, ma5: 92, ma10: 94, ma20: 96, ma60: 100, ma120: 105,
    rsi: 35, macd: -2, macdSignal: -1, macdHistogram: -1,
    adx: 22, bollingerUpper: 100, bollingerLower: 80, bollingerMid: 90,
    atr: 3, volume: 200000, avgVolume: 300000, support: 85, resistance: 100,
  };

  it('应计算趋势评分', () => {
    const r = calculateTechnicalComposite(bullishInput);
    expect(r.trendScore).toBeGreaterThanOrEqual(0);
    expect(r.trendScore).toBeLessThanOrEqual(100);
  });

  it('应计算动量评分', () => {
    const r = calculateTechnicalComposite(bullishInput);
    expect(r.momentumScore).toBeGreaterThanOrEqual(0);
  });

  it('看涨信号应评分较高', () => {
    const r = calculateTechnicalComposite(bullishInput);
    expect(r.totalScore).toBeGreaterThan(50);
  });

  it('看跌信号应评分较低', () => {
    const r = calculateTechnicalComposite(bearishInput);
    expect(r.totalScore).toBeLessThan(60);
  });

  it('应输出交易信号', () => {
    const r = calculateTechnicalComposite(bullishInput);
    expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(r.signal);
  });

  it('应判断趋势方向', () => {
    const r = calculateTechnicalComposite(bullishInput);
    expect(['bullish', 'bearish', 'neutral']).toContain(r.trend);
  });

  it('应判断趋势强度', () => {
    const r = calculateTechnicalComposite(bullishInput);
    expect(['strong', 'moderate', 'weak']).toContain(r.strength);
  });

  it('应计算关键价位', () => {
    const r = calculateTechnicalComposite(bullishInput);
    expect(r.keyLevels.support).toBe(95);
    expect(r.keyLevels.resistance).toBe(115);
    expect(r.keyLevels.pivot).toBeGreaterThan(0);
  });

  it('应输出信号列表', () => {
    const r = calculateTechnicalComposite(bullishInput);
    expect(Array.isArray(r.signals)).toBe(true);
  });

  it('应检测成交量确认', () => {
    const r = calculateTechnicalComposite(bullishInput);
    expect(r.volumeConfirmation).toBe(true);
  });
});
