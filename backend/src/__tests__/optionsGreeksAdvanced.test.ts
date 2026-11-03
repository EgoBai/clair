import { describe, it, expect } from 'vitest';
import {
  normalCDF,
  normalPDF,
  blackScholesPrice,
  calculateGreeks,
} from '../../../frontend/src/utils/optionsPricingEngine';
import type { OptionParams } from '../../../frontend/src/utils/optionsPricingEngine';

// ==================== 高级期权希腊字母测试 ====================
// 影子测试迁移：normalCDF / normalPDF / blackScholesPrice / calculateGreeks
// 全部来自生产 frontend/src/utils/optionsPricingEngine.ts（54 / 68 / 130 / 152 行）。
// 下方 bs / greeks / calcVanna / calcCharm 仅做参数适配，不复制任何定价公式。
// 旧内联实现与生产的差异：生产 calculateGreeks 在 t<=0 或 vol<=0 时返回全部 0（含 delta）。

function bs(s: number, k: number, t: number, r: number, v: number, type: 'call' | 'put'): number {
  return blackScholesPrice({
    spot: s,
    strike: k,
    timeToExpiry: t,
    riskFreeRate: r,
    volatility: v,
    type,
  });
}

function greeks(s: number, k: number, t: number, r: number, v: number, type: 'call' | 'put') {
  const params: OptionParams = {
    spot: s,
    strike: k,
    timeToExpiry: t,
    riskFreeRate: r,
    volatility: v,
    type,
  };
  return calculateGreeks(params);
}

function calcVanna(s: number, k: number, t: number, r: number, v: number): number {
  return greeks(s, k, t, r, v, 'call').vanna;
}

function calcCharm(s: number, k: number, t: number, r: number, v: number, type: 'call' | 'put'): number {
  return greeks(s, k, t, r, v, type).charm;
}

describe('高级期权希腊字母', () => {
  const s = 100, k = 100, t = 1, r = 0.05, v = 0.2;

  describe('正态分布（生产实现）', () => {
    it('normalCDF(0)应该约等于0.5', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 6);
    });
    it('normalCDF(1.96)应该约等于0.975', () => {
      expect(normalCDF(1.96)).toBeCloseTo(0.975, 4);
    });
    it('normalPDF(0)应该等于标准正态峰值', () => {
      expect(normalPDF(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 10);
    });
  });

  describe('Black-Scholes基础', () => {
    it('看涨价格应该为正', () => { expect(bs(s, k, t, r, v, 'call')).toBeGreaterThan(0); });
    it('看跌价格应该为正', () => { expect(bs(s, k, t, r, v, 'put')).toBeGreaterThan(0); });
    it('平值看涨价格应该等于生产值', () => {
      expect(bs(s, k, t, r, v, 'call')).toBeCloseTo(10.450575415435083, 10);
    });
    it('到期应该返回内在价值', () => {
      expect(bs(110, 100, 0, r, v, 'call')).toBe(10);
      expect(bs(90, 100, 0, r, v, 'put')).toBe(10);
    });
    it('虚值到期应该为0', () => {
      expect(bs(90, 100, 0, r, v, 'call')).toBe(0);
      expect(bs(110, 100, 0, r, v, 'put')).toBe(0);
    });
    it('看涨看跌平价关系', () => {
      const call = bs(s, k, t, r, v, 'call');
      const put = bs(s, k, t, r, v, 'put');
      expect(call - put).toBeCloseTo(s - k * Math.exp(-r * t), 1);
    });
  });

  describe('Delta', () => {
    it('看涨Delta应该在0到1之间', () => {
      const g = greeks(s, k, t, r, v, 'call');
      expect(g.delta).toBeGreaterThan(0);
      expect(g.delta).toBeLessThan(1);
    });
    it('看跌Delta应该在-1到0之间', () => {
      const g = greeks(s, k, t, r, v, 'put');
      expect(g.delta).toBeGreaterThan(-1);
      expect(g.delta).toBeLessThan(0);
    });
    it('深度实值看涨Delta应该接近1', () => {
      const g = greeks(200, 100, t, r, v, 'call');
      expect(g.delta).toBeGreaterThan(0.9);
    });
    it('深度虚值看涨Delta应该接近0', () => {
      const g = greeks(50, 100, t, r, v, 'call');
      expect(g.delta).toBeLessThan(0.1);
    });
    // 缺陷候选：生产 calculateGreeks 在 t<=0 时对实值期权也返回 delta=0，
    // 旧内联实现对实值 call 返回 1。保留宽松断言，不在测试里固化错误值。
    it('到期时Delta应该为0或1', () => {
      const g = greeks(s, k, 0, r, v, 'call');
      expect([0, 1]).toContain(g.delta);
    });
  });

  describe('Gamma', () => {
    it('平值Gamma应该最大', () => {
      const atm = greeks(s, k, t, r, v, 'call').gamma;
      const otm = greeks(50, k, t, r, v, 'call').gamma;
      expect(atm).toBeGreaterThan(otm);
    });
    it('Gamma应该为正', () => { expect(greeks(s, k, t, r, v, 'call').gamma).toBeGreaterThan(0); });
    it('看涨看跌Gamma应该相同', () => {
      const callGamma = greeks(s, k, t, r, v, 'call').gamma;
      const putGamma = greeks(s, k, t, r, v, 'put').gamma;
      expect(callGamma).toBeCloseTo(putGamma, 5);
    });
  });

  describe('Theta', () => {
    it('看涨Theta应该为负（时间损耗）', () => { expect(greeks(s, k, t, r, v, 'call').theta).toBeLessThan(0); });
    it('看跌Theta应该为负', () => { expect(greeks(s, k, t, r, v, 'put').theta).toBeLessThan(0); });
    it('到期Theta应该为0', () => { expect(greeks(s, k, 0, r, v, 'call').theta).toBe(0); });
  });

  describe('Vega', () => {
    it('Vega应该为正', () => { expect(greeks(s, k, t, r, v, 'call').vega).toBeGreaterThan(0); });
    it('看涨看跌Vega应该相同', () => {
      expect(greeks(s, k, t, r, v, 'call').vega).toBeCloseTo(greeks(s, k, t, r, v, 'put').vega, 5);
    });
    it('到期Vega应该为0', () => { expect(greeks(s, k, 0, r, v, 'call').vega).toBe(0); });
    it('平值Vega应该大于虚值', () => {
      const atm = greeks(s, k, t, r, v, 'call').vega;
      const otm = greeks(50, k, t, r, v, 'call').vega;
      expect(atm).toBeGreaterThan(otm);
    });
  });

  describe('Rho', () => {
    it('看涨Rho应该为正', () => { expect(greeks(s, k, t, r, v, 'call').rho).toBeGreaterThan(0); });
    it('看跌Rho应该为负', () => { expect(greeks(s, k, t, r, v, 'put').rho).toBeLessThan(0); });
    it('到期Rho应该为0', () => { expect(greeks(s, k, 0, r, v, 'call').rho).toBe(0); });
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
      const g = greeks(s, k, t, r, v, 'call');
      for (const value of Object.values(g)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    });
    it('波动率增加应该增加Vega', () => {
      const g1 = greeks(s, k, t, r, 0.1, 'call').vega;
      const g2 = greeks(s, k, t, r, 0.3, 'call').vega;
      expect(g2).toBeGreaterThan(g1);
    });
    it('时间减少应该增加Theta绝对值', () => {
      const t1 = Math.abs(greeks(s, k, 1, r, v, 'call').theta);
      const t2 = Math.abs(greeks(s, k, 0.1, r, v, 'call').theta);
      expect(t2).toBeGreaterThan(t1);
    });
  });
});
