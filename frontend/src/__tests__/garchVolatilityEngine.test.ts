import { describe, it, expect } from 'vitest';
import { garchForecast } from '../utils/garchVolatilityEngine';

describe('GARCH波动率预测引擎', () => {
  const generateReturns = (n: number): number[] =>
    Array.from({ length: n }, () => (Math.random() - 0.5) * 0.04);

  const returns = generateReturns(100);

  it('应输出GARCH参数', () => {
    const r = garchForecast({ returns });
    expect(r.alpha).toBeGreaterThan(0);
    expect(r.beta).toBeGreaterThan(0);
    expect(r.alpha + r.beta).toBeLessThan(1);
  });

  it('应计算当前波动率', () => {
    const r = garchForecast({ returns });
    expect(r.currentVol).toBeGreaterThan(0);
  });

  it('应计算无条件波动率', () => {
    const r = garchForecast({ returns });
    expect(r.unconditionalVol).toBeGreaterThan(0);
  });

  it('应生成预测波动率', () => {
    const r = garchForecast({ returns, forecastDays: 5 });
    expect(r.forecastVols.length).toBe(5);
    r.forecastVols.forEach(v => expect(v).toBeGreaterThan(0));
  });

  it('应判断波动率状态', () => {
    const r = garchForecast({ returns });
    expect(['low', 'normal', 'high', 'extreme']).toContain(r.volState);
  });

  it('应计算历史波动率', () => {
    const r = garchForecast({ returns });
    expect(r.historicalVol).toBeGreaterThan(0);
  });

  it('应计算VaR', () => {
    const r = garchForecast({ returns });
    expect(typeof r.var95).toBe('number');
  });

  it('持久性应小于1', () => {
    const r = garchForecast({ returns });
    expect(r.persistence).toBeLessThan(1);
    expect(r.persistence).toBeGreaterThan(0);
  });

  it('半衰期应为正数', () => {
    const r = garchForecast({ returns });
    expect(r.halfLife).toBeGreaterThan(0);
  });

  it('数据不足应抛出错误', () => {
    expect(() => garchForecast({ returns: [0.01, 0.02] })).toThrow();
  });
});
