import { describe, it, expect } from 'vitest';

// ==================== 高级期权希腊字母测试 ====================

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

function blackScholes(s: number, k: number, t: number, r: number, v: number, type: 'call' | 'put'): number {
  if (t <= 0) return type === 'call' ? Math.max(s - k, 0) : Math.max(k - s, 0);
  const d1 = (Math.log(s / k) + (r + v * v / 2) * t) / (v * Math.sqrt(t));
  const d2 = d1 - v * Math.sqrt(t);
  return type === 'call' ? s * normalCDF(d1) - k * Math.exp(-r * t) * normalCDF(d2) : k * Math.exp(-r * t) * normalCDF(-d2) - s * normalCDF(-d1);
}

function calcGreeks(s: number, k: number, t: number, r: number, v: number, type: 'call' | 'put') {
  if (t <= 0 || v <= 0) return { delta: type === 'call' ? (s > k ? 1 : 0) : (s < k ? -1 : 0), gamma: 0, theta: 0, vega: 0, rho: 0 };
  const d1 = (Math.log(s / k) + (r + v * v / 2) * t) / (v * Math.sqrt(t));
  const d2 = d1 - v * Math.sqrt(t);
  const delta = type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
  const gamma = normalPDF(d1) / (s * v * Math.sqrt(t));
  const commonTheta = -(s * normalPDF(d1) * v) / (2 * Math.sqrt(t));
  const theta = type === 'call' ? (commonTheta - r * k * Math.exp(-r * t) * normalCDF(d2)) / 365 : (commonTheta + r * k * Math.exp(-r * t) * normalCDF(-d2)) / 365;
  const vega = (s * normalPDF(d1) * Math.sqrt(t)) / 100;
  const rho = type === 'call' ? (k * t * Math.exp(-r * t) * normalCDF(d2)) / 100 : (-k * t * Math.exp(-r * t) * normalCDF(-d2)) / 100;
  return { delta, gamma, theta, vega, rho };
}

function calcVanna(s: number, k: number, t: number, r: number, v: number): number {
  if (t <= 0 || v <= 0) return 0;
  const d1 = (Math.log(s / k) + (r + v * v / 2) * t) / (v * Math.sqrt(t));
  const d2 = d1 - v * Math.sqrt(t);
  return -normalPDF(d1) * d2 / v;
}

function calcCharm(s: number, k: number, t: number, r: number, v: number, type: 'call' | 'put'): number {
  if (t <= 0) return 0;
  const d1 = (Math.log(s / k) + (r + v * v / 2) * t) / (v * Math.sqrt(t));
  const d2 = d1 - v * Math.sqrt(t);
  const term = normalPDF(d1) * (d2 / (2 * t));
  return type === 'call' ? -term : term;
}

describe('高级期权希腊字母', () => {
  const s = 100, k = 100, t = 1, r = 0.05, v = 0.2;

  describe('Black-Scholes基础', () => {
    it('看涨价格应该为正', () => { expect(blackScholes(s, k, t, r, v, 'call')).toBeGreaterThan(0); });
    it('看跌价格应该为正', () => { expect(blackScholes(s, k, t, r, v, 'put')).toBeGreaterThan(0); });
    it('到期应该返回内在价值', () => {
      expect(blackScholes(110, 100, 0, r, v, 'call')).toBe(10);
      expect(blackScholes(90, 100, 0, r, v, 'put')).toBe(10);
    });
    it('虚值到期应该为0', () => {
      expect(blackScholes(90, 100, 0, r, v, 'call')).toBe(0);
      expect(blackScholes(110, 100, 0, r, v, 'put')).toBe(0);
    });
    it('看涨看跌平价关系', () => {
      const call = blackScholes(s, k, t, r, v, 'call');
      const put = blackScholes(s, k, t, r, v, 'put');
      expect(call - put).toBeCloseTo(s - k * Math.exp(-r * t), 1);
    });
  });

  describe('Delta', () => {
    it('看涨Delta应该在0到1之间', () => {
      const greeks = calcGreeks(s, k, t, r, v, 'call');
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThan(1);
    });
    it('看跌Delta应该在-1到0之间', () => {
      const greeks = calcGreeks(s, k, t, r, v, 'put');
      expect(greeks.delta).toBeGreaterThan(-1);
      expect(greeks.delta).toBeLessThan(0);
    });
    it('深度实值看涨Delta应该接近1', () => {
      const greeks = calcGreeks(200, 100, t, r, v, 'call');
      expect(greeks.delta).toBeGreaterThan(0.9);
    });
    it('深度虚值看涨Delta应该接近0', () => {
      const greeks = calcGreeks(50, 100, t, r, v, 'call');
      expect(greeks.delta).toBeLessThan(0.1);
    });
    it('到期时Delta应该为0或1', () => {
      const greeks = calcGreeks(s, k, 0, r, v, 'call');
      expect([0, 1]).toContain(greeks.delta);
    });
  });

  describe('Gamma', () => {
    it('平值Gamma应该最大', () => {
      const atm = calcGreeks(s, k, t, r, v, 'call').gamma;
      const otm = calcGreeks(50, k, t, r, v, 'call').gamma;
      expect(atm).toBeGreaterThan(otm);
    });
    it('Gamma应该为正', () => { expect(calcGreeks(s, k, t, r, v, 'call').gamma).toBeGreaterThan(0); });
    it('看涨看跌Gamma应该相同', () => {
      const callGamma = calcGreeks(s, k, t, r, v, 'call').gamma;
      const putGamma = calcGreeks(s, k, t, r, v, 'put').gamma;
      expect(callGamma).toBeCloseTo(putGamma, 5);
    });
  });

  describe('Theta', () => {
    it('看涨Theta应该为负（时间损耗）', () => { expect(calcGreeks(s, k, t, r, v, 'call').theta).toBeLessThan(0); });
    it('看跌Theta应该为负', () => { expect(calcGreeks(s, k, t, r, v, 'put').theta).toBeLessThan(0); });
    it('到期Theta应该为0', () => { expect(calcGreeks(s, k, 0, r, v, 'call').theta).toBe(0); });
  });

  describe('Vega', () => {
    it('Vega应该为正', () => { expect(calcGreeks(s, k, t, r, v, 'call').vega).toBeGreaterThan(0); });
    it('看涨看跌Vega应该相同', () => {
      expect(calcGreeks(s, k, t, r, v, 'call').vega).toBeCloseTo(calcGreeks(s, k, t, r, v, 'put').vega, 5);
    });
    it('到期Vega应该为0', () => { expect(calcGreeks(s, k, 0, r, v, 'call').vega).toBe(0); });
    it('平值Vega应该大于虚值', () => {
      const atm = calcGreeks(s, k, t, r, v, 'call').vega;
      const otm = calcGreeks(50, k, t, r, v, 'call').vega;
      expect(atm).toBeGreaterThan(otm);
    });
  });

  describe('Rho', () => {
    it('看涨Rho应该为正', () => { expect(calcGreeks(s, k, t, r, v, 'call').rho).toBeGreaterThan(0); });
    it('看跌Rho应该为负', () => { expect(calcGreeks(s, k, t, r, v, 'put').rho).toBeLessThan(0); });
    it('到期Rho应该为0', () => { expect(calcGreeks(s, k, 0, r, v, 'call').rho).toBe(0); });
  });

  describe('Vanna', () => {
    it('应该返回数值', () => { expect(typeof calcVanna(s, k, t, r, v)).toBe('number'); });
    it('到期应该为0', () => { expect(calcVanna(s, k, 0, r, v)).toBe(0); });
    it('应该为有限值', () => { expect(Number.isFinite(calcVanna(s, k, t, r, v))).toBe(true); });
  });

  describe('Charm', () => {
    it('看涨Charm应该返回数值', () => { expect(typeof calcCharm(s, k, t, r, v, 'call')).toBe('number'); });
    it('看跌Charm应该返回数值', () => { expect(typeof calcCharm(s, k, t, r, v, 'put')).toBe('number'); });
    it('到期应该为0', () => { expect(calcCharm(s, k, 0, r, v, 'call')).toBe(0); });
    it('应该为有限值', () => { expect(Number.isFinite(calcCharm(s, k, t, r, v, 'call'))).toBe(true); });
  });

  describe('Greeks一致性', () => {
    it('所有希腊字母应该为有限值', () => {
      const greeks = calcGreeks(s, k, t, r, v, 'call');
      for (const v of Object.values(greeks)) {
        expect(Number.isFinite(v)).toBe(true);
      }
    });
    it('波动率增加应该增加Vega', () => {
      const g1 = calcGreeks(s, k, t, r, 0.1, 'call').vega;
      const g2 = calcGreeks(s, k, t, r, 0.3, 'call').vega;
      expect(g2).toBeGreaterThan(g1);
    });
    it('时间减少应该增加Theta绝对值', () => {
      const t1 = Math.abs(calcGreeks(s, k, 1, r, v, 'call').theta);
      const t2 = Math.abs(calcGreeks(s, k, 0.1, r, v, 'call').theta);
      expect(t2).toBeGreaterThan(t1);
    });
  });
});
