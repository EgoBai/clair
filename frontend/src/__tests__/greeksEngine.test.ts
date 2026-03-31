/**
 * 期权希腊字母引擎测试
 */
import { describe, it, expect } from 'vitest';
import { GreeksEngine } from '../utils/greeksEngine';
import type { OptionParams } from '../utils/greeksEngine';

describe('GreeksEngine', () => {
  const engine = new GreeksEngine();

  const baseCallParams: OptionParams = {
    spotPrice: 100,
    strikePrice: 100,
    timeToExpiry: 0.25, // 3个月
    riskFreeRate: 0.05,
    volatility: 0.2,
    optionType: 'call'
  };

  const basePutParams: OptionParams = {
    ...baseCallParams,
    optionType: 'put'
  };

  describe('calculateGreeks', () => {
    it('应该计算看涨期权Greeks', () => {
      const result = engine.calculateGreeks(baseCallParams);

      expect(result.price).toBeGreaterThan(0);
      expect(result.delta).toBeGreaterThan(0);
      expect(result.delta).toBeLessThanOrEqual(1);
      expect(result.gamma).toBeGreaterThan(0);
      expect(result.vega).toBeGreaterThan(0);
      expect(result.intrinsicValue).toBeGreaterThanOrEqual(0);
      expect(result.timeValue).toBeGreaterThanOrEqual(0);
      expect(result.price).toBeCloseTo(result.intrinsicValue + result.timeValue, 2);
    });

    it('应该计算看跌期权Greeks', () => {
      const result = engine.calculateGreeks(basePutParams);

      expect(result.price).toBeGreaterThan(0);
      expect(result.delta).toBeLessThan(0);
      expect(result.delta).toBeGreaterThanOrEqual(-1);
      expect(result.gamma).toBeGreaterThan(0);
      expect(result.vega).toBeGreaterThan(0);
    });

    it('深度价内call delta应接近1', () => {
      const result = engine.calculateGreeks({
        ...baseCallParams,
        strikePrice: 50, // 深度价内
        timeToExpiry: 1
      });

      expect(result.delta).toBeGreaterThan(0.9);
    });

    it('深度价外call delta应接近0', () => {
      const result = engine.calculateGreeks({
        ...baseCallParams,
        strikePrice: 200, // 深度价外
        timeToExpiry: 0.25
      });

      expect(result.delta).toBeLessThan(0.1);
    });

    it('到期期权应返回内在价值', () => {
      const result = engine.calculateGreeks({
        ...baseCallParams,
        timeToExpiry: 0
      });

      expect(result.price).toBe(result.intrinsicValue);
      expect(result.timeValue).toBe(0);
      expect(result.gamma).toBe(0);
      expect(result.vega).toBe(0);
    });

    it('ATM期权call+put应满足put-call parity近似', () => {
      const call = engine.calculateGreeks(baseCallParams);
      const put = engine.calculateGreeks(basePutParams);

      // C - P ≈ S - K*e^(-rT)
      const { spotPrice: S, strikePrice: K, riskFreeRate: r, timeToExpiry: T } = baseCallParams;
      const parityDiff = call.price - put.price;
      const expectedDiff = S - K * Math.exp(-r * T);

      expect(Math.abs(parityDiff - expectedDiff)).toBeLessThan(0.1);
    });
  });

  describe('calculateGreeksSurface', () => {
    it('应该计算Greeks曲面', () => {
      const strikes = [90, 95, 100, 105, 110];
      const expiries = [0.25, 0.5, 1.0];

      const result = engine.calculateGreeksSurface(
        100, strikes, expiries, 0.05, 0.2, 'call'
      );

      expect(result.strikes).toEqual(strikes);
      expect(result.expiries).toEqual(expiries);
      expect(result.deltaSurface.length).toBe(3); // 3个到期日
      expect(result.deltaSurface[0].length).toBe(5); // 5个行权价
      expect(result.gammaSurface.length).toBe(3);
      expect(result.vegaSurface.length).toBe(3);
    });
  });

  describe('calculatePortfolioRisk', () => {
    it('应该计算组合Greeks风险', () => {
      const positions = [
        { params: baseCallParams, quantity: 10 },
        { params: basePutParams, quantity: -5 }
      ];

      const result = engine.calculatePortfolioRisk(positions);

      expect(typeof result.netDelta).toBe('number');
      expect(typeof result.netGamma).toBe('number');
      expect(typeof result.vegaExposure).toBe('number');
      expect(typeof result.thetaExposure).toBe('number');
      expect(result.breakevenPoints.length).toBe(2);
    });

    it('单腿买入call应有正Delta', () => {
      const result = engine.calculatePortfolioRisk([
        { params: baseCallParams, quantity: 1 }
      ]);

      expect(result.netDelta).toBeGreaterThan(0);
    });

    it('单腿买入put应有负Delta', () => {
      const result = engine.calculatePortfolioRisk([
        { params: basePutParams, quantity: 1 }
      ]);

      expect(result.netDelta).toBeLessThan(0);
    });
  });

  describe('generateGreeksProfile', () => {
    it('应该生成Greeks轮廓', () => {
      const result = engine.generateGreeksProfile(baseCallParams, 0.2, 20);

      expect(result.spotLevels.length).toBe(21); // 0-20 steps
      expect(result.pnlAtExpiry.length).toBe(21);
      expect(result.currentPnl.length).toBe(21);
      expect(result.deltaProfile.length).toBe(21);
      expect(result.gammaProfile.length).toBe(21);

      // ATM spot应在中间附近
      expect(result.spotLevels[10]).toBeCloseTo(100, 0);
    });

    it('ATM call的到期PnL应在行权价处变化', () => {
      const result = engine.generateGreeksProfile(baseCallParams, 0.2, 20);

      // 低价位应为负PnL (纯时间价值损失)
      // 高价位应为正PnL
      const lastPnl = result.pnlAtExpiry[result.pnlAtExpiry.length - 1];
      expect(lastPnl).toBeGreaterThan(result.pnlAtExpiry[0]);
    });
  });

  describe('impliedVolatility', () => {
    it('应该反算隐含波动率', () => {
      // 先用已知波动率算价格
      const marketPrice = engine.calculateGreeks(baseCallParams).price;

      // 反算波动率
      const iv = engine.impliedVolatility(marketPrice, {
        spotPrice: baseCallParams.spotPrice,
        strikePrice: baseCallParams.strikePrice,
        timeToExpiry: baseCallParams.timeToExpiry,
        riskFreeRate: baseCallParams.riskFreeRate,
        optionType: baseCallParams.optionType
      });

      expect(Math.abs(iv - baseCallParams.volatility)).toBeLessThan(0.01);
    });

    it('看跌期权也应反算正确', () => {
      const marketPrice = engine.calculateGreeks(basePutParams).price;

      const iv = engine.impliedVolatility(marketPrice, {
        spotPrice: basePutParams.spotPrice,
        strikePrice: basePutParams.strikePrice,
        timeToExpiry: basePutParams.timeToExpiry,
        riskFreeRate: basePutParams.riskFreeRate,
        optionType: basePutParams.optionType
      });

      expect(Math.abs(iv - basePutParams.volatility)).toBeLessThan(0.01);
    });
  });
});
