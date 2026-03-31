import { describe, it, expect } from 'vitest';
import { OptionsGreeksEngine } from '../utils/optionsGreeksEngine';
import type { OptionParams } from '../utils/optionsGreeksEngine';

describe('OptionsGreeksEngine', () => {
  const engine = new OptionsGreeksEngine();

  const callParams: OptionParams = {
    type: 'call',
    spot: 100,
    strike: 100,
    timeToExpiry: 0.5,
    riskFreeRate: 0.05,
    volatility: 0.2,
  };

  const putParams: OptionParams = {
    type: 'put',
    spot: 100,
    strike: 100,
    timeToExpiry: 0.5,
    riskFreeRate: 0.05,
    volatility: 0.2,
  };

  describe('看涨期权Greeks', () => {
    it('应该计算正确的价格', () => {
      const greeks = engine.calculateGreeks(callParams);
      expect(greeks.price).toBeGreaterThan(0);
      expect(greeks.price).toBeCloseTo(6.89, 1); // ATM call约6.89
    });

    it('Delta应在0-1之间', () => {
      const greeks = engine.calculateGreeks(callParams);
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThanOrEqual(1);
      expect(greeks.delta).toBeCloseTo(0.61, 1); // ATM约0.61
    });

    it('Gamma应为正数', () => {
      const greeks = engine.calculateGreeks(callParams);
      expect(greeks.gamma).toBeGreaterThan(0);
    });

    it('Theta应为负数(时间衰减)', () => {
      const greeks = engine.calculateGreeks(callParams);
      expect(greeks.theta).toBeLessThan(0);
    });

    it('Vega应为正数', () => {
      const greeks = engine.calculateGreeks(callParams);
      expect(greeks.vega).toBeGreaterThan(0);
    });

    it('内在价值+时间价值=期权价格', () => {
      const greeks = engine.calculateGreeks(callParams);
      expect(greeks.intrinsicValue + greeks.timeValue).toBeCloseTo(greeks.price, 2);
    });
  });

  describe('看跌期权Greeks', () => {
    it('Delta应在-1到0之间', () => {
      const greeks = engine.calculateGreeks(putParams);
      expect(greeks.delta).toBeGreaterThan(-1);
      expect(greeks.delta).toBeLessThanOrEqual(0);
    });

    it('Gamma应为正数', () => {
      const greeks = engine.calculateGreeks(putParams);
      expect(greeks.gamma).toBeGreaterThan(0);
    });

    it('价格应满足Put-Call Parity', () => {
      const callGreeks = engine.calculateGreeks(callParams);
      const putGreeks = engine.calculateGreeks(putParams);
      const { spot, strike, timeToExpiry, riskFreeRate } = callParams;
      // C - P = S - K * e^(-rT)
      const parity = callGreeks.price - putGreeks.price;
      const expected = spot - strike * Math.exp(-riskFreeRate * timeToExpiry);
      expect(parity).toBeCloseTo(expected, 2);
    });
  });

  describe('实值/虚值期权', () => {
    it('实值看涨Delta应>0.5', () => {
      const itm = engine.calculateGreeks({ ...callParams, spot: 110, strike: 100 });
      expect(itm.delta).toBeGreaterThan(0.5);
    });

    it('虚值看涨Delta应<0.5', () => {
      const otm = engine.calculateGreeks({ ...callParams, spot: 90, strike: 100 });
      expect(otm.delta).toBeLessThan(0.5);
    });

    it('深度实值看涨Delta接近1', () => {
      const deepItm = engine.calculateGreeks({ ...callParams, spot: 200, strike: 100 });
      expect(deepItm.delta).toBeGreaterThan(0.95);
    });

    it('深度虚值看涨Delta接近0', () => {
      const deepOtm = engine.calculateGreeks({ ...callParams, spot: 50, strike: 100 });
      expect(deepOtm.delta).toBeLessThan(0.05);
    });
  });

  describe('到期处理', () => {
    it('到期时期权价值等于内在价值', () => {
      const expired = engine.calculateGreeks({ ...callParams, timeToExpiry: 0 });
      expect(expired.price).toBe(expired.intrinsicValue);
      expect(expired.timeValue).toBe(0);
      expect(expired.gamma).toBe(0);
      expect(expired.vega).toBe(0);
    });

    it('到期实值看涨Delta为1', () => {
      const expired = engine.calculateGreeks({ ...callParams, spot: 110, timeToExpiry: 0 });
      expect(expired.delta).toBe(1);
    });
  });

  describe('隐含波动率反算', () => {
    it('应该反算出正确的波动率', () => {
      const greeks = engine.calculateGreeks(callParams);
      const iv = engine.impliedVolatility(greeks.price, callParams);
      expect(iv).toBeCloseTo(callParams.volatility, 1);
    });

    it('无法收敛时应返回合理值', () => {
      const iv = engine.impliedVolatility(-1, callParams); // 负价格不可能
      expect(iv).toBeGreaterThan(0);
    });
  });

  describe('Greeks敏感度', () => {
    it('应该计算Gamma(二阶导数)', () => {
      const sens = engine.calculateSensitivity(callParams);
      expect(sens.spotChange.gamma).toBeGreaterThan(0);
    });

    it('应该计算Vomma(波动率敏感度)', () => {
      const sens = engine.calculateSensitivity(callParams);
      expect(typeof sens.volChange.vomma).toBe('number');
    });

    it('应该计算Charm(Delta衰减)', () => {
      const sens = engine.calculateSensitivity(callParams);
      expect(typeof sens.timeDecay.charm).toBe('number');
    });
  });

  describe('组合Greeks', () => {
    it('应该汇总多个头寸', () => {
      const positions = [
        { params: callParams, quantity: 1 },
        { params: putParams, quantity: -1 },
      ];
      const portfolio = engine.portfolioGreeks(positions);
      expect(portfolio.price).toBeGreaterThan(0);
      expect(portfolio.delta).toBeGreaterThan(0); // 买call卖put = 合成多头
    });

    it('空头头寸应该反转符号', () => {
      const long = engine.calculateGreeks(callParams);
      const portfolio = engine.portfolioGreeks([{ params: callParams, quantity: -1 }]);
      expect(portfolio.delta).toBeCloseTo(-long.delta, 3);
    });

    it('空组合应返回零', () => {
      const portfolio = engine.portfolioGreeks([]);
      expect(portfolio.price).toBe(0);
      expect(portfolio.delta).toBe(0);
    });
  });
});
