/**
 * 影子测试迁移（批次 24b）
 *
 * 旧文件只 import vitest，自抄了 BSM 定价、Greeks、二分法隐含波动率、波动率微笑与组合 P&L，
 * 断言对象是副本，生产实现改坏测试不会红。现改为 import 产品仓真实实现。
 *
 * 已绑定生产实现：
 * - bsPrice         → backend/src/services/impliedVolEngine.ts:16   bsmPrice（type 'call'|'put' → isCall boolean）
 * - impliedVol      → backend/src/services/impliedVolEngine.ts:25   impliedVol（二分法 → Newton-Raphson）
 * - volatilitySmile → backend/src/services/impliedVolEngine.ts:40   volatilitySmile
 * - greeks          → backend/src/services/optionsGreeksEngine.ts:12/18/24/33 delta/gamma/theta/vega
 *   （生产另导出 rho:39，旧用例未覆盖，本批不加用例；用户要求用例数只增不减，保持 14 条）
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * - volatilitySmile 返回 { strike, moneyness, iv }[] → 生产返回 number[]（只有 IV）；断言 point.iv → 数组元素。
 * - impliedVol 实现由二分法（0.001~5、固定 50 次）换为 Newton-Raphson（初值 0.3、tol 1e-6、maxIter 100）；
 *   对 σ=0.2 的回推结果一致，toBeCloseTo(σ, 1) 数值断言不变。
 * - greeks 由单个聚合函数改为 4 个独立导出；公式（Theta /365、Vega /100、Gamma、Delta）与旧副本一致，
 *   数值断言不变。
 * - bsPrice 入参符号由 type 改为 isCall，公式一致。
 *
 * 未迁移（生产无对应导出 / 契约不同，保留本地 helper 并注明）：
 * - deltaHedge：生产仓无「对冲合约数」导出，本地 helper 复用生产 delta 计算合约数。
 * - portfolioPnL：生产仓无期权组合 P&L 导出，本地 helper 复用生产 delta/gamma 计算组合敞口。
 */

import { describe, it, expect } from 'vitest';
import { bsmPrice, impliedVol, volatilitySmile } from '../services/impliedVolEngine';
import { delta, gamma, theta, vega } from '../services/optionsGreeksEngine';

describe('期权链分析引擎', () => {
  // 生产接口用 isCall: boolean，旧用例用 'call' | 'put'；此处只做符号适配。
  const isCall = (type: 'call' | 'put') => type === 'call';

  // 未迁移：生产无 delta 对冲合约数导出（optionsGreeksEngine 只到单个希腊字母）；
  // 本地 helper 仅做合约数换算，Delta 来自生产 delta()。
  function deltaHedge(s: number, k: number, t: number, r: number, sigma: number, type: 'call' | 'put', nContracts: number) {
    const d = delta(s, k, t, r, sigma, isCall(type));
    return { sharesNeeded: d * nContracts * 100, delta: d, hedgeRatio: Math.abs(d) };
  }

  // 未迁移：生产无期权组合 P&L 导出；本地 helper 只做组合聚合，Delta/Gamma 来自生产引擎。
  function portfolioPnL(
    positions: { strike: number; type: 'call' | 'put'; premium: number; qty: number }[],
    spotPrice: number,
    sigma: number,
    t: number,
    r: number
  ) {
    return positions.map(pos => {
      const intrinsic = pos.type === 'call' ? Math.max(0, spotPrice - pos.strike) : Math.max(0, pos.strike - spotPrice);
      const pnl = (intrinsic - pos.premium) * pos.qty * 100;
      return {
        ...pos,
        intrinsic,
        pnl,
        delta: delta(spotPrice, pos.strike, t, r, sigma, isCall(pos.type)) * pos.qty * 100,
        gamma: gamma(spotPrice, pos.strike, t, r, sigma) * pos.qty * 100,
      };
    });
  }

  const s = 100, k = 100, t = 0.25, r = 0.03, sigma = 0.2;

  describe('Black-Scholes定价', () => {
    it('看涨期权价格为正', () => {
      const price = bsmPrice(s, k, t, r, sigma, true);
      expect(price).toBeGreaterThan(0);
    });

    it('看跌期权价格为正', () => {
      const price = bsmPrice(s, k, t, r, sigma, false);
      expect(price).toBeGreaterThan(0);
    });

    it('深度价内看涨接近s-k*e^(-rt)', () => {
      const price = bsmPrice(s, 80, t, r, sigma, true);
      const intrinsic = s - 80 * Math.exp(-r * t);
      expect(price).toBeGreaterThan(intrinsic * 0.9);
    });

    it('看涨看跌平价', () => {
      const call = bsmPrice(s, k, t, r, sigma, true);
      const put = bsmPrice(s, k, t, r, sigma, false);
      const lhs = call - put;
      const rhs = s - k * Math.exp(-r * t);
      expect(lhs).toBeCloseTo(rhs, 1);
    });
  });

  describe('Greeks', () => {
    it('Delta在0-1(看涨)', () => {
      const d = delta(s, k, t, r, sigma, true);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
    });

    it('Delta在-1~0(看跌)', () => {
      const d = delta(s, k, t, r, sigma, false);
      expect(d).toBeGreaterThan(-1);
      expect(d).toBeLessThan(0);
    });

    it('Gamma为正', () => {
      expect(gamma(s, k, t, r, sigma)).toBeGreaterThan(0);
    });

    it('Vega为正', () => {
      expect(vega(s, k, t, r, sigma)).toBeGreaterThan(0);
    });

    it('Theta为负(看涨)', () => {
      expect(theta(s, k, t, r, sigma, true)).toBeLessThan(0);
    });
  });

  describe('隐含波动率', () => {
    it('回推正确的波动率', () => {
      const price = bsmPrice(s, k, t, r, sigma, true);
      const iv = impliedVol(price, s, k, t, r, true);
      expect(iv).toBeCloseTo(sigma, 1);
    });

    it('看跌回推波动率', () => {
      const price = bsmPrice(s, k, t, r, sigma, false);
      const iv = impliedVol(price, s, k, t, r, false);
      expect(iv).toBeCloseTo(sigma, 1);
    });
  });

  describe('波动率微笑', () => {
    it('返回微笑数据', () => {
      const strikes = [90, 95, 100, 105, 110];
      const prices = strikes.map(k2 => bsmPrice(s, k2, t, r, sigma, true));
      const smile = volatilitySmile(strikes, prices, s, t, r, true);
      expect(smile.length).toBe(5);
      smile.forEach(iv => {
        expect(iv).toBeCloseTo(sigma, 1);
      });
    });
  });

  describe('Delta对冲', () => {
    it('计算对冲比率', () => {
      const hedge = deltaHedge(s, k, t, r, sigma, 'call', 10);
      expect(hedge.sharesNeeded).toBeGreaterThan(0);
      expect(hedge.delta).toBeGreaterThan(0);
    });
  });

  describe('组合P&L', () => {
    it('计算组合盈亏', () => {
      const positions = [
        { strike: 100, type: 'call' as const, premium: 3, qty: 1 },
        { strike: 95, type: 'put' as const, premium: 1.5, qty: -2 },
      ];
      const result = portfolioPnL(positions, 105, sigma, t, r);
      expect(result.length).toBe(2);
      result.forEach(r2 => expect(typeof r2.pnl).toBe('number'));
    });
  });
});
