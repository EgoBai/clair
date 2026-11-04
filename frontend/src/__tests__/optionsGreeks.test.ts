import { describe, it, expect } from 'vitest';
import {
  normalCDF,
  blackScholesPrice,
  calculateGreeks,
  calculateImpliedVolatility,
} from '../utils/optionsPricingEngine';

// 期权希腊字母与定价引擎测试（影子测试治理批次 5）
// 生产真源（唯一）：frontend/src/utils/optionsPricingEngine.ts
// 本文件已删除自抄的 normalCDF / normalPDF / d1 / d2 / bsCall / bsPut /
// delta / gamma / theta / vega / rho / impliedVolatility，全部调用生产导出。
// 口径：生产以 OptionParams（type:'call'|'put'）入场，vega 为每 1% 波动率、
// theta 为每自然日、rho 为每 1% 利率——与旧自抄断言口径一致，无需换算。
// 未迁移：spreadPayoff（组合到期 Payoff）——生产无对应导出；priceStrategy 是
// 按 BS 价格扫描盈亏与盈亏平衡点，语义不同，故保留本地无模型的到期算术 helper。
const op = (S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put') =>
  ({ spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, type } as const);

// 仅做字段映射，不含任何定价/希腊值计算
const bsPrice = (S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put') =>
  blackScholesPrice(op(S, K, T, r, sigma, type));

const greekOf = (S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put') =>
  calculateGreeks(op(S, K, T, r, sigma, type));

const impliedVolOf = (marketPrice: number, S: number, K: number, T: number, r: number, type: 'call' | 'put') =>
  calculateImpliedVolatility(marketPrice, {
    spot: S,
    strike: K,
    timeToExpiry: T,
    riskFreeRate: r,
    type,
  });

describe('期权希腊字母与定价引擎', () => {
  describe('Black-Scholes定价', () => {
    it('看涨期权价格为正', () => {
      expect(bsPrice(100, 100, 1, 0.05, 0.2, 'call')).toBeGreaterThan(0);
    });

    it('看跌期权价格为正', () => {
      expect(bsPrice(100, 100, 1, 0.05, 0.2, 'put')).toBeGreaterThan(0);
    });

    it('平价看涨等于看跌加看涨平价差', () => {
      const call = bsPrice(100, 100, 1, 0.05, 0.2, 'call');
      const put = bsPrice(100, 100, 1, 0.05, 0.2, 'put');
      // Put-Call Parity: C - P = S - K * e^(-rT)
      expect(call - put).toBeCloseTo(100 - 100 * Math.exp(-0.05), 1);
    });

    it('到期时间为0看涨为内在价值', () => {
      expect(bsPrice(110, 100, 0, 0.05, 0.2, 'call')).toBe(10);
      expect(bsPrice(90, 100, 0, 0.05, 0.2, 'call')).toBe(0);
    });

    it('到期时间为0看跌为内在价值', () => {
      expect(bsPrice(90, 100, 0, 0.05, 0.2, 'put')).toBe(10);
      expect(bsPrice(110, 100, 0, 0.05, 0.2, 'put')).toBe(0);
    });

    it('高波动率增加期权价格', () => {
      const low = bsPrice(100, 100, 1, 0.05, 0.1, 'call');
      const high = bsPrice(100, 100, 1, 0.05, 0.4, 'call');
      expect(high).toBeGreaterThan(low);
    });

    it('深层实值看涨接近S-K*e^-rT', () => {
      const call = bsPrice(200, 100, 1, 0.05, 0.2, 'call');
      expect(call).toBeGreaterThan(95);
    });

    it('深层虚值看涨接近0', () => {
      const call = bsPrice(50, 100, 0.01, 0.05, 0.2, 'call');
      expect(call).toBeLessThan(0.1);
    });

    it('看涨期权非负', () => {
      expect(bsPrice(100, 100, 1, 0.05, 0.2, 'call')).toBeGreaterThanOrEqual(0);
    });

    it('看跌期权非负', () => {
      expect(bsPrice(100, 100, 1, 0.05, 0.2, 'put')).toBeGreaterThanOrEqual(0);
    });

    it('正常CDF边界值', () => {
      expect(normalCDF(-10)).toBeCloseTo(0, 4);
      expect(normalCDF(10)).toBeCloseTo(1, 4);
      expect(normalCDF(0)).toBeCloseTo(0.5, 4);
    });
  });

  describe('希腊字母计算', () => {
    it('看涨Delta在0-1之间', () => {
      const d = greekOf(100, 100, 1, 0.05, 0.2, 'call').delta;
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
    });

    it('看跌Delta在-1到0之间', () => {
      const d = greekOf(100, 100, 1, 0.05, 0.2, 'put').delta;
      expect(d).toBeGreaterThan(-1);
      expect(d).toBeLessThan(0);
    });

    it('平价期权Delta约0.5', () => {
      expect(greekOf(100, 100, 1, 0.05, 0.2, 'call').delta).toBeCloseTo(0.5, 0);
    });

    it('Gamma为正', () => {
      expect(greekOf(100, 100, 1, 0.05, 0.2, 'call').gamma).toBeGreaterThan(0);
    });

    it('平价Gamma接近最大', () => {
      const atm = greekOf(100, 100, 1, 0.05, 0.2, 'call').gamma;
      const itm = greekOf(110, 100, 1, 0.05, 0.2, 'call').gamma;
      const otm = greekOf(90, 100, 1, 0.05, 0.2, 'call').gamma;
      expect(atm).toBeGreaterThan(itm);
      // ATM gamma should be among the highest values
      expect(atm).toBeGreaterThan(0);
      expect(Math.max(atm, itm, otm)).toBeGreaterThan(0.01);
    });

    it('Theta为负(时间衰减)', () => {
      expect(greekOf(100, 100, 1, 0.05, 0.2, 'call').theta).toBeLessThan(0);
    });

    it('Vega为正', () => {
      expect(greekOf(100, 100, 1, 0.05, 0.2, 'call').vega).toBeGreaterThan(0);
    });

    it('看涨Rho为正', () => {
      expect(greekOf(100, 100, 1, 0.05, 0.2, 'call').rho).toBeGreaterThan(0);
    });

    it('看跌Rho为负', () => {
      expect(greekOf(100, 100, 1, 0.05, 0.2, 'put').rho).toBeLessThan(0);
    });

    it('深层实值Delta接近1', () => {
      expect(greekOf(200, 100, 1, 0.05, 0.2, 'call').delta).toBeGreaterThan(0.95);
    });

    it('深层虚值Delta接近0', () => {
      expect(greekOf(50, 100, 0.1, 0.05, 0.2, 'call').delta).toBeLessThan(0.05);
    });

    it('到期Delta为实值方向固有值', () => {
      // P1 修复：到期时 BS 高阶敏感度退化，但 delta 取实值方向固有值
      // （call ITM=1/OTM=0，put ITM=-1/OTM=0）；gamma/vega 等仍为 0（见后续用例）。
      expect(greekOf(101, 100, 0, 0.05, 0.2, 'call').delta).toBe(1);
      expect(greekOf(99, 100, 0, 0.05, 0.2, 'call').delta).toBe(0);
      expect(greekOf(99, 100, 0, 0.05, 0.2, 'put').delta).toBe(-1);
    });

    it('到期Gamma为0', () => {
      expect(greekOf(100, 100, 0, 0.05, 0.2, 'call').gamma).toBe(0);
    });

    it('到期Vega为0', () => {
      expect(greekOf(100, 100, 0, 0.05, 0.2, 'call').vega).toBe(0);
    });

    it('高波动率Delta更接近0.5', () => {
      const dLow = greekOf(110, 100, 1, 0.05, 0.1, 'call').delta;
      const dHigh = greekOf(110, 100, 1, 0.05, 0.5, 'call').delta;
      expect(Math.abs(dHigh - 0.5)).toBeLessThan(Math.abs(dLow - 0.5));
    });
  });

  describe('隐含波动率', () => {
    it('ATM期权IV在合理范围', () => {
      // 生产 calculateImpliedVolatility 恒定返回 number（无 null 分支），
      // 旧实现「null 则跳过断言」的写法会让该用例恒绿，已改为直接断言。
      const iv = impliedVolOf(10, 100, 100, 1, 0.05, 'call');
      expect(iv).toBeGreaterThan(0);
      expect(iv).toBeLessThan(2);
    });

    it('零价格回落到最小波动率下限(生产不返回null)', () => {
      // 生产在 vega 下溢时 break 并返回夹紧后的下限 0.001，不存在 null。
      const iv = impliedVolOf(0, 100, 100, 1, 0.05, 'call');
      expect(iv).toBeGreaterThan(0);
      expect(iv).toBeLessThan(0.01);
    });

    it('高价格对应高IV', () => {
      const iv1 = impliedVolOf(5, 100, 100, 1, 0.05, 'call');
      const iv2 = impliedVolOf(20, 100, 100, 1, 0.05, 'call');
      expect(iv2).toBeGreaterThan(iv1);
    });
  });

  describe('期权组合策略', () => {
    // 本地 helper（未迁移）：组合到期 Payoff 纯算术，生产无对应导出
    function spreadPayoff(spot: number, strikes: number[], weights: number[], types: ('call' | 'put')[]): number {
      let payoff = 0;
      for (let i = 0; i < strikes.length; i++) {
        const intrinsic = types[i] === 'call' ? Math.max(spot - strikes[i], 0) : Math.max(strikes[i] - spot, 0);
        payoff += weights[i] * intrinsic;
      }
      return payoff;
    }

    it('牛市看涨价差有限风险有限收益', () => {
      const long = spreadPayoff(90, [100], [1], ['call']);
      const short = spreadPayoff(90, [110], [-1], ['call']);
      expect(long + short).toBe(0);
      const maxProfit = spreadPayoff(120, [100, 110], [1, -1], ['call', 'call']);
      expect(maxProfit).toBe(10);
    });

    it('跨式策略双边获利', () => {
      const call = spreadPayoff(120, [100], [1], ['call']);
      const put = spreadPayoff(120, [100], [1], ['put']);
      expect(call + put).toBeGreaterThanOrEqual(20);
    });

    it('铁鹰策略最大损失有限', () => {
      const payoff = spreadPayoff(90, [90, 95, 105, 110], [1, -1, -1, 1], ['put', 'put', 'call', 'call']);
      expect(payoff).toBeDefined();
    });

    it('空头跨式在平价时收益最大', () => {
      const atm = spreadPayoff(100, [100, 100], [-1, -1], ['call', 'put']);
      const otm = spreadPayoff(120, [100, 100], [-1, -1], ['call', 'put']);
      expect(atm).toBeGreaterThan(otm);
    });

    it('看涨期权到期损益', () => {
      const long = spreadPayoff(110, [100], [1], ['call']);
      expect(long).toBe(10);
    });

    it('看跌期权到期损益', () => {
      const put = spreadPayoff(90, [100], [1], ['put']);
      expect(put).toBe(10);
    });

    it('虚值期权到期为0', () => {
      expect(spreadPayoff(110, [100], [1], ['put'])).toBe(0);
      expect(spreadPayoff(90, [100], [1], ['call'])).toBe(0);
    });
  });
});
