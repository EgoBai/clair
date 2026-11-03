import { describe, it, expect } from 'vitest';
import { normCDF, bsmPrice, impliedVol } from '../services/impliedVolEngine';
import { delta, gamma, theta, vega, rho } from '../services/optionsGreeksEngine';

/**
 * 期权定价模型测试（影子测试迁移，批次 28a）
 *
 * 绑定哪一套生产实现：backend，不是 frontend/src/utils/optionsPricingEngine.ts。
 * - 本文件原内联实现与 backend 的 normCDF / bsmPrice / impliedVol 逐字符同构：位置参数
 *   (S, K, T, r, sigma[, isCall])、A&S normCDF、T<=0 返回内在价值。
 * - frontend 那套是另一套实现：对象参数 OptionParams（含 dividendYield）、normalCDF 带
 *   x<-8→0 / x>8→1 截断、calculateGreeks 合并返回 10 个希腊字母、calculateImpliedVolatility
 *   用 vega*100 且 sigma 限制在 [0.001, 10]。语义不同，故按被测文件原语义绑定 backend。
 *
 * 已绑定生产实现（唯一真源）：
 * - normalCDF → backend/src/services/impliedVolEngine.ts:6（A&S 近似，无 ±8 截断）
 * - blackScholes → backend/src/services/impliedVolEngine.ts:16 bsmPrice；
 *   T<=0 或 sigma<=0 返回内在价值（:17），否则标准 BSM（:18-22）
 * - impliedVolatility → backend/src/services/impliedVolEngine.ts:25 impliedVol
 *   （tol=1e-6, maxIter=100；vega<1e-10 停止 :33；sigma<=0 置 0.001 :35）
 * - greeks.delta / gamma / theta / vega / rho →
 *   backend/src/services/optionsGreeksEngine.ts:12 / :18 / :24 / :33 / :39
 *   本文件的 greeks() 只是把 type 映射为 isCall 的参数适配，不含任何定价/希腊字母公式。
 *
 * 影子实现与生产口径的订正（旧值 → 生产值）：
 * 1) theta：影子为年化值（未除 365）→ 生产 theta/365（optionsGreeksEngine.ts:29-30）；
 *    本文件原断言不校验 theta 数值，仅保留字段。
 * 2) vega：影子为每单位波动 S√T·φ(d1) → 生产再 /100（每 1% 波动，:36）。
 *    原断言「Vega>0」「call/put Vega 相同」仍成立，数值口径已变。
 * 3) rho：影子为每单位利率 → 生产 /100（:42-43）。
 * 4) 隐含波动率：影子 tol=1e-4、sigma 下限 0.01 → 生产 tol=1e-6、下限 0.001（:25 / :35）；
 *    原断言 |iv-sigma|<0.01 在生产更严容差下仍成立。
 * 5) 零波动率：影子 sigma→0 走 BSM 除零极限（110/100/1y ≈ 14.88）；生产 sigma<=0 直接返回
 *    内在价值 10（:17）。新增用例锁定生产短路行为。
 * 6) T<=0：影子与生产都返回内在价值，原断言不变（:17）。
 * 7) 标的价格 0：生产 normCDF(-Inf)=0 → call=0，与影子一致。
 *
 * 未迁移：无（全部符号已绑定生产）。
 */
describe('Options Pricing Models', () => {
  type OptionType = 'call' | 'put';

  // 参数适配：type → isCall；不含公式。
  const blackScholes = (S: number, K: number, T: number, r: number, sigma: number, type: OptionType): number =>
    bsmPrice(S, K, T, r, sigma, type === 'call');

  const impliedVolatility = (marketPrice: number, S: number, K: number, T: number, r: number, type: OptionType): number =>
    impliedVol(marketPrice, S, K, T, r, type === 'call');

  // 参数适配：type → isCall；greeks 数值全部来自生产函数。
  const greeks = (S: number, K: number, T: number, r: number, sigma: number, type: OptionType) => {
    const isCall = type === 'call';
    return {
      delta: delta(S, K, T, r, sigma, isCall),
      gamma: gamma(S, K, T, r, sigma),
      theta: theta(S, K, T, r, sigma, isCall),
      vega: vega(S, K, T, r, sigma),
      rho: rho(S, K, T, r, sigma, isCall),
    };
  };

  describe('Black-Scholes 定价', () => {
    it('看涨期权价格应为正', () => {
      const price = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
      expect(price).toBeGreaterThan(0);
    });

    it('看跌期权价格应为正', () => {
      const price = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
      expect(price).toBeGreaterThan(0);
    });

    it('平值看涨应大于平值看跌(有利率时)', () => {
      const call = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
      const put = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
      expect(call).toBeGreaterThan(put);
    });

    it('深度实值看涨接近内在价值', () => {
      const price = blackScholes(200, 100, 1, 0.05, 0.2, 'call');
      expect(price).toBeGreaterThan(90);
    });

    it('深度虚值看涨接近零', () => {
      const price = blackScholes(50, 100, 0.01, 0.05, 0.2, 'call');
      expect(price).toBeLessThan(1);
    });

    it('到期时间零应返回内在价值', () => {
      const call = blackScholes(110, 100, 0, 0.05, 0.2, 'call');
      expect(call).toBe(10);
      const put = blackScholes(90, 100, 0, 0.05, 0.2, 'put');
      expect(put).toBe(10);
    });

    it('波动率增加应增加期权价格', () => {
      const low = blackScholes(100, 100, 1, 0.05, 0.1, 'call');
      const high = blackScholes(100, 100, 1, 0.05, 0.4, 'call');
      expect(high).toBeGreaterThan(low);
    });

    it('到期时间增加应增加期权价格', () => {
      const short = blackScholes(100, 100, 0.5, 0.05, 0.2, 'call');
      const long = blackScholes(100, 100, 2, 0.05, 0.2, 'call');
      expect(long).toBeGreaterThan(short);
    });

    it('看跌看涨平价关系', () => {
      const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.2;
      const call = blackScholes(S, K, T, r, sigma, 'call');
      const put = blackScholes(S, K, T, r, sigma, 'put');
      const parity = call - put - S + K * Math.exp(-r * T);
      expect(Math.abs(parity)).toBeLessThan(0.01);
    });

    it('20组不同参数都返回有限值', () => {
      for (let s = 80; s <= 120; s += 10) {
        for (const type of ['call', 'put'] as const) {
          const price = blackScholes(s, 100, 1, 0.05, 0.2, type);
          expect(isFinite(price)).toBe(true);
          expect(price).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('希腊字母', () => {
    it('看涨Delta应在0到1之间', () => {
      const { delta } = greeks(100, 100, 1, 0.05, 0.2, 'call');
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThan(1);
    });

    it('看跌Delta应在-1到0之间', () => {
      const { delta } = greeks(100, 100, 1, 0.05, 0.2, 'put');
      expect(delta).toBeGreaterThan(-1);
      expect(delta).toBeLessThan(0);
    });

    it('Gamma应为正', () => {
      const { gamma } = greeks(100, 100, 1, 0.05, 0.2, 'call');
      expect(gamma).toBeGreaterThan(0);
    });

    it('Vega应为正', () => {
      const { vega } = greeks(100, 100, 1, 0.05, 0.2, 'call');
      expect(vega).toBeGreaterThan(0);
    });

    it('平值Delta接近0.5', () => {
      const { delta } = greeks(100, 100, 1, 0, 0.2, 'call');
      expect(Math.abs(delta - 0.5)).toBeLessThan(0.05);
    });

    it('深度实值看涨Delta接近1', () => {
      const { delta } = greeks(200, 100, 1, 0.05, 0.2, 'call');
      expect(delta).toBeGreaterThan(0.9);
    });

    it('深度虚值看涨Delta接近0', () => {
      const { delta } = greeks(50, 100, 1, 0.05, 0.2, 'call');
      expect(delta).toBeLessThan(0.1);
    });

    it('Call Delta + Put Delta = 1 (近似)', () => {
      const callD = greeks(100, 100, 1, 0.05, 0.2, 'call').delta;
      const putD = greeks(100, 100, 1, 0.05, 0.2, 'put').delta;
      expect(Math.abs(callD - putD - 1)).toBeLessThan(0.01);
    });

    it('Vega相同(看涨和看跌)', () => {
      const callV = greeks(100, 100, 1, 0.05, 0.2, 'call').vega;
      const putV = greeks(100, 100, 1, 0.05, 0.2, 'put').vega;
      expect(Math.abs(callV - putV)).toBeLessThan(0.001);
    });

    it('希腊字母应按生产口径缩放(theta/365、vega/100、rho/100)', () => {
      // 100/100/1y/r=0.05/sigma=0.2：d1=0.35, d2=0.15, exp(-d1^2/2)=0.940586
      expect(vega(100, 100, 1, 0.05, 0.2)).toBeCloseTo(0.375, 3);
      expect(theta(100, 100, 1, 0.05, 0.2, true)).toBeCloseTo(-0.01757, 4);
      expect(rho(100, 100, 1, 0.05, 0.2, true)).toBeCloseTo(0.5323, 3);
    });
  });

  describe('隐含波动率', () => {
    it('应能反解出原始波动率', () => {
      const sigma = 0.25;
      const price = blackScholes(100, 100, 1, 0.05, sigma, 'call');
      const iv = impliedVolatility(price, 100, 100, 1, 0.05, 'call');
      expect(Math.abs(iv - sigma)).toBeLessThan(0.01);
    });

    it('不同价格应给出不同IV', () => {
      const iv1 = impliedVolatility(10, 100, 100, 1, 0.05, 'call');
      const iv2 = impliedVolatility(15, 100, 100, 1, 0.05, 'call');
      expect(iv2).toBeGreaterThan(iv1);
    });

    it('看跌IV应能反解', () => {
      const sigma = 0.3;
      const price = blackScholes(100, 100, 1, 0.05, sigma, 'put');
      const iv = impliedVolatility(price, 100, 100, 1, 0.05, 'put');
      expect(Math.abs(iv - sigma)).toBeLessThan(0.01);
    });
  });

  describe('边界条件', () => {
    it('零波动率-实值看涨应等于内在价值', () => {
      const price = blackScholes(110, 100, 1, 0.05, 0.001, 'call');
      // 0.001 仍走 BSM 分支（生产仅在 sigma<=0 时短路），结果 ≈ 110 - 100*e^-0.05 = 14.88；
      // 断言区间沿用旧用例，生产在 sigma=0 的短路行为由下方新增用例锁定。
      expect(price).toBeGreaterThan(5);
      expect(price).toBeLessThan(15);
    });

    it('零波动率应短路返回内在价值', () => {
      expect(blackScholes(110, 100, 1, 0.05, 0, 'call')).toBe(10);
      expect(blackScholes(90, 100, 1, 0.05, 0, 'put')).toBe(10);
    });

    it('极短到期', () => {
      const price = blackScholes(100, 100, 0.001, 0.05, 0.2, 'call');
      expect(isFinite(price)).toBe(true);
      expect(price).toBeGreaterThanOrEqual(0);
    });

    it('极高波动率', () => {
      const price = blackScholes(100, 100, 1, 0.05, 5, 'call');
      expect(isFinite(price)).toBe(true);
    });

    it('标的价格为零', () => {
      const call = blackScholes(0, 100, 1, 0.05, 0.2, 'call');
      expect(call).toBe(0);
    });
  });
});

describe('正态分布 CDF（生产实现）', () => {
  it('normCDF(0)应等于0.5', () => {
    expect(normCDF(0)).toBeCloseTo(0.5, 6);
  });

  it('normCDF(1.96)应接近0.975', () => {
    expect(normCDF(1.96)).toBeCloseTo(0.975, 3);
    expect(normCDF(-1.96)).toBeCloseTo(0.025, 3);
  });
});
