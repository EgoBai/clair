import { describe, it, expect } from 'vitest';
import { detectIntradayPatterns, IntradayCandle } from '../utils/intradayPatternEngine';

describe('日内交易模式识别引擎', () => {
  const makeCandles = (n: number): IntradayCandle[] =>
    Array.from({ length: n }, (_, i) => {
      const hour = 9 + Math.floor(i / 15);
      const min = (i % 15) * 4 + 30;
      const base = 100 + Math.sin(i * 0.3) * 2;
      return {
        time: `${String(hour).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
        open: base,
        high: base + Math.random() * 0.5,
        low: base - Math.random() * 0.5,
        close: base + (Math.random() - 0.5) * 0.3,
        volume: Math.floor(5000 + Math.random() * 3000),
      };
    });

  const candles = makeCandles(40);

  it('应识别开盘模式', () => {
    const r = detectIntradayPatterns(candles);
    expect(['gap_up', 'gap_down', 'flat', 'trending_up', 'trending_down']).toContain(r.openingPattern);
  });

  it('应识别日内形态', () => {
    const r = detectIntradayPatterns(candles);
    expect(['U_shape', 'V_shape', 'L_shape', 'inverted_U', 'sideways', 'trending']).toContain(r.intradayPattern);
  });

  it('应识别收盘模式', () => {
    const r = detectIntradayPatterns(candles);
    expect(['accumulation', 'distribution', 'consolidation', 'reversal_up', 'reversal_down']).toContain(r.closingPattern);
  });

  it('应分析成交量模式', () => {
    const r = detectIntradayPatterns(candles);
    expect(['increasing', 'decreasing', 'stable', 'spike']).toContain(r.volumePattern);
  });

  it('应计算价格振幅', () => {
    const r = detectIntradayPatterns(candles);
    expect(r.priceRange).toBeGreaterThanOrEqual(0);
  });

  it('应计算盘中波动率', () => {
    const r = detectIntradayPatterns(candles);
    expect(r.intradayVolatility).toBeGreaterThanOrEqual(0);
  });

  it('应计算最大回撤', () => {
    const r = detectIntradayPatterns(candles);
    expect(r.maxDrawdown).toBeLessThanOrEqual(0);
  });

  it('应计算最大涨幅', () => {
    const r = detectIntradayPatterns(candles);
    expect(r.maxGain).toBeGreaterThanOrEqual(0);
  });

  it('应判断收盘偏向', () => {
    const r = detectIntradayPatterns(candles);
    expect(['bullish', 'bearish', 'neutral']).toContain(r.closingBias);
  });

  it('应生成总结', () => {
    const r = detectIntradayPatterns(candles);
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it('数据不足应抛出错误', () => {
    expect(() => detectIntradayPatterns(candles.slice(0, 5))).toThrow();
  });
});
