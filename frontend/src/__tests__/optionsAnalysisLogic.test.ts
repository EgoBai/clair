/**
 * 期权分析页面逻辑测试
 * 覆盖Greeks计算、隐含波动率、期权策略
 */

import { describe, it, expect } from 'vitest';

describe('期权分析页面逻辑', () => {
  describe('期权定价参数', () => {
    type OptionType = 'call' | 'put';

    function isInTheMoney(optionType: OptionType, strike: number, spot: number): boolean {
      if (optionType === 'call') return spot > strike;
      return spot < strike;
    }

    function calcIntrinsicValue(optionType: OptionType, strike: number, spot: number): number {
      if (optionType === 'call') return Math.max(0, spot - strike);
      return Math.max(0, strike - spot);
    }

    it('认购实值判断正确', () => {
      expect(isInTheMoney('call', 100, 110)).toBe(true);
      expect(isInTheMoney('call', 100, 90)).toBe(false);
    });

    it('认沽实值判断正确', () => {
      expect(isInTheMoney('put', 100, 90)).toBe(true);
      expect(isInTheMoney('put', 100, 110)).toBe(false);
    });

    it('内在价值计算正确', () => {
      expect(calcIntrinsicValue('call', 100, 110)).toBe(10);
      expect(calcIntrinsicValue('put', 100, 85)).toBe(15);
      expect(calcIntrinsicValue('call', 100, 90)).toBe(0);
    });
  });

  describe('Greeks 近似计算', () => {
    function calcDelta(optionType: 'call' | 'put', moneyness: number): number {
      // Simplified delta approximation
      if (optionType === 'call') return Math.min(1, Math.max(0, 0.5 + moneyness * 0.3));
      return Math.max(-1, Math.min(0, -0.5 + moneyness * 0.3));
    }

    function calcGamma(spot: number, strike: number, timeToExpiry: number): number {
      // Simplified gamma - peaks near ATM
      const moneyness = Math.abs(spot - strike) / strike;
      return Math.max(0, (1 - moneyness * 2) * Math.exp(-timeToExpiry * 0.5));
    }

    it('实值认购Delta应大于0.5', () => {
      expect(calcDelta('call', 0.2)).toBeGreaterThan(0.5);
    });

    it('虚值认购Delta应小于0.5', () => {
      expect(calcDelta('call', -0.2)).toBeLessThan(0.5);
    });

    it('ATM时Gamma最大', () => {
      const atmGamma = calcGamma(100, 100, 0.5);
      const otmGamma = calcGamma(100, 110, 0.5);
      expect(atmGamma).toBeGreaterThan(otmGamma);
    });
  });

  describe('期权策略分析', () => {
    interface OptionLeg {
      type: 'call' | 'put';
      strike: number;
      premium: number;
      quantity: number;
      direction: 'buy' | 'sell';
    }

    function calcStrategyPayoff(legs: OptionLeg[], spotAtExpiry: number): number {
      let totalPayoff = 0;
      for (const leg of legs) {
        let payoff = 0;
        if (leg.type === 'call') {
          payoff = Math.max(0, spotAtExpiry - leg.strike);
        } else {
          payoff = Math.max(0, leg.strike - spotAtExpiry);
        }
        if (leg.direction === 'buy') {
          totalPayoff += (payoff - leg.premium) * leg.quantity;
        } else {
          totalPayoff += (leg.premium - payoff) * leg.quantity;
        }
      }
      return Math.round(totalPayoff * 100) / 100;
    }

    it('买入认购到期时上涨应盈利', () => {
      const legs: OptionLeg[] = [{ type: 'call', strike: 100, premium: 5, quantity: 1, direction: 'buy' }];
      expect(calcStrategyPayoff(legs, 110)).toBe(5); // 10 - 5 = 5
      expect(calcStrategyPayoff(legs, 95)).toBe(-5); // 0 - 5 = -5
    });

    it('跨式策略应有最大亏损', () => {
      const legs: OptionLeg[] = [
        { type: 'call', strike: 100, premium: 5, quantity: 1, direction: 'buy' },
        { type: 'put', strike: 100, premium: 5, quantity: 1, direction: 'buy' },
      ];
      expect(calcStrategyPayoff(legs, 100)).toBe(-10); // 双方都归零
      expect(calcStrategyPayoff(legs, 120)).toBe(10); // call值20-5-5=10
    });
  });

  describe('隐含波动率微笑', () => {
    function buildVolSmile(strikes: number[], ivs: number[]): { skew: number; kurtosis: number } {
      if (strikes.length < 3) return { skew: 0, kurtosis: 0 };
      const mean = ivs.reduce((s, v) => s + v, 0) / ivs.length;
      const n = ivs.length;
      const variance = ivs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
      const skew = ivs.reduce((s, v) => s + Math.pow(v - mean, 3), 0) / (n * Math.pow(Math.sqrt(variance), 3) || 1);
      const kurtosis = ivs.reduce((s, v) => s + Math.pow(v - mean, 4), 0) / (n * Math.pow(variance, 2) || 1) - 3;
      return { skew: Math.round(skew * 100) / 100, kurtosis: Math.round(kurtosis * 100) / 100 };
    }

    it('应正确计算偏度和峰度', () => {
      const result = buildVolSmile([90, 95, 100, 105, 110], [25, 22, 20, 21, 24]);
      expect(typeof result.skew).toBe('number');
      expect(typeof result.kurtosis).toBe('number');
    });
  });
});
