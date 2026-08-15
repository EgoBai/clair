import { describe, it, expect } from 'vitest';
import {
  GreeksEngine,
  type OptionParams,
} from '../utils/greeksEngine';

/**
 * 期权希腊字母引擎测试 —— 导入真实模块 src/utils/greeksEngine.ts
 *
 * 旧测试把 calculateGreeks / normalCDF / normalPDF 内联为独立函数；真实模块是一个
 * GreeksEngine 类（含 calculateGreeks / calculateGreeksSurface / calculatePortfolioRisk /
 * generateGreeksProfile / impliedVolatility），且 calculateGreeks 增加了 dividendYield 项与
 * impliedVolEstimate 字段。以下改为驱动真实类。
 */

const baseParams: OptionParams = {
  spotPrice: 100,
  strikePrice: 100,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.2,
  optionType: 'call',
};

describe('期权希腊字母引擎 (GreeksEngine)', () => {
  const engine = new GreeksEngine();

  describe('calculateGreeks', () => {
    it('看涨期权价格为正、delta 在 (0,1]', () => {
      const greeks = engine.calculateGreeks(baseParams);
      expect(greeks.price).toBeGreaterThan(0);
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThanOrEqual(1);
    });

    it('看跌期权 delta 为负且在 [-1,0)', () => {
      const greeks = engine.calculateGreeks({ ...baseParams, optionType: 'put' });
      expect(greeks.delta).toBeLessThan(0);
      expect(greeks.delta).toBeGreaterThanOrEqual(-1);
    });

    it('gamma 对看涨/看跌均为正', () => {
      const callGamma = engine.calculateGreeks(baseParams).gamma;
      const putGamma = engine.calculateGreeks({ ...baseParams, optionType: 'put' }).gamma;
      expect(callGamma).toBeGreaterThan(0);
      expect(putGamma).toBeGreaterThan(0);
    });

    it('vega 对看涨/看跌均为正', () => {
      expect(engine.calculateGreeks(baseParams).vega).toBeGreaterThan(0);
      expect(engine.calculateGreeks({ ...baseParams, optionType: 'put' }).vega).toBeGreaterThan(0);
    });

    it('实值看涨 delta 高于虚值看涨', () => {
      const itm = engine.calculateGreeks({ ...baseParams, spotPrice: 120 });
      const otm = engine.calculateGreeks({ ...baseParams, spotPrice: 80 });
      expect(itm.delta).toBeGreaterThan(otm.delta);
    });

    it('到期期权返回内在价值，ATM 时价格/ delta 为 0', () => {
      const greeks = engine.calculateGreeks({ ...baseParams, timeToExpiry: 0 });
      expect(greeks.price).toBe(0);
      expect(greeks.delta).toBe(0);
    });

    it('内在价值 + 时间价值 ≈ 价格', () => {
      const greeks = engine.calculateGreeks(baseParams);
      expect(greeks.intrinsicValue + greeks.timeValue).toBeCloseTo(greeks.price, 2);
    });

    it('波动率越高看涨价格越高', () => {
      const low = engine.calculateGreeks({ ...baseParams, volatility: 0.1 });
      const high = engine.calculateGreeks({ ...baseParams, volatility: 0.4 });
      expect(high.price).toBeGreaterThan(low.price);
    });

    it('返回 impliedVolEstimate 等于输入波动率', () => {
      const greeks = engine.calculateGreeks({ ...baseParams, volatility: 0.35 });
      expect(greeks.impliedVolEstimate).toBeCloseTo(0.35, 6);
    });
  });

  describe('impliedVolatility', () => {
    it('能从市场价格反推回原始波动率', () => {
      const target = 0.3;
      const params: OptionParams = { ...baseParams, volatility: target };
      const marketPrice = engine.calculateGreeks(params).price;
      const iv = engine.impliedVolatility(marketPrice, {
        spotPrice: params.spotPrice,
        strikePrice: params.strikePrice,
        timeToExpiry: params.timeToExpiry,
        riskFreeRate: params.riskFreeRate,
        optionType: params.optionType,
      });
      expect(iv).toBeCloseTo(target, 2);
    });
  });

  describe('calculateGreeksSurface', () => {
    it('返回维度正确的希腊字母曲面', () => {
      const strikes = [90, 100, 110];
      const expiries = [0.1, 0.25];
      const surface = engine.calculateGreeksSurface(100, strikes, expiries, 0.05, 0.2, 'call');
      expect(surface.strikes).toEqual(strikes);
      expect(surface.expiries).toEqual(expiries);
      expect(surface.deltaSurface.length).toBe(expiries.length);
      expect(surface.deltaSurface[0].length).toBe(strikes.length);
      expect(surface.gammaSurface.length).toBe(expiries.length);
      expect(surface.vegaSurface[0].length).toBe(strikes.length);
    });

    it('实值行权价的 delta 高于虚值', () => {
      const surface = engine.calculateGreeksSurface(100, [90, 110], [0.25], 0.05, 0.2, 'call');
      const itm = surface.deltaSurface[0][0]; // K=90, 实值
      const otm = surface.deltaSurface[0][1]; // K=110, 虚值
      expect(itm).toBeGreaterThan(otm);
    });
  });

  describe('calculatePortfolioRisk', () => {
    it('单仓位的净 delta 与直接计算一致', () => {
      const risk = engine.calculatePortfolioRisk([{ params: baseParams, quantity: 1 }]);
      const direct = engine.calculateGreeks(baseParams).delta;
      expect(risk.netDelta).toBeCloseTo(direct, 4);
    });

    it('多空组合计算对冲比率与盈亏平衡点', () => {
      const risk = engine.calculatePortfolioRisk([
        { params: baseParams, quantity: 10 },
        { params: { ...baseParams, optionType: 'put' }, quantity: -5 },
      ]);
      expect(typeof risk.netDelta).toBe('number');
      expect(risk.hedgeRatio).toBeCloseTo(-risk.netDelta, 4);
      expect(risk.breakevenPoints.length).toBe(2);
      expect(risk.maxProfit).toBeTypeOf('number');
      expect(risk.maxLoss).toBeTypeOf('number');
    });
  });

  describe('generateGreeksProfile', () => {
    it('生成长度正确的 spot 档位轮廓', () => {
      const profile = engine.generateGreeksProfile(baseParams, 0.2, 20);
      expect(profile.spotLevels.length).toBe(21);
      expect(profile.pnlAtExpiry.length).toBe(21);
      expect(profile.deltaProfile.length).toBe(21);
      // 看涨：spot 越高 delta 越大
      expect(profile.deltaProfile[20]).toBeGreaterThan(profile.deltaProfile[0]);
    });
  });
});
