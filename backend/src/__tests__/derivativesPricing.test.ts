import { describe, it, expect } from 'vitest';
import { bsmPrice, impliedVol } from '../services/impliedVolEngine';
import { delta, gamma, theta, vega } from '../services/optionsGreeksEngine';

// 衍生品定价引擎测试（影子测试治理批次 5）
// 生产真源（唯一）：backend/src/services/impliedVolEngine.ts（bsmPrice / impliedVol）
//                  backend/src/services/optionsGreeksEngine.ts（delta / gamma / theta / vega）
// 本文件已删除自抄的 normalCDF / bsCall / bsPut / delta / gamma / theta / vega / impliedVol，
// 全部直接调用上述生产导出；接口口径为 isCall:boolean（旧自抄为 type:'call'|'put'）。
// 未迁移（后端无生产对应物，保留本地 helper，不在生产侧虚构实现）：
//   1) putCallParity —— 仅作平价关系断言的谓词，不含定价逻辑；
//   2) binomialTree  —— CRR 二叉树定价，backend/src/services 无实现
//      （frontend 的 binomialTreePrice 为美式期权口径，跨包不可用）。
describe('衍生品定价引擎', () => {
  // 本地断言谓词（未迁移）：看涨看跌平价 |C - P - (S - K*e^(-rT))| < 0.01
  function putCallParity(call: number, put: number, S: number, K: number, T: number, r: number): boolean {
    const lhs = call - put;
    const rhs = S - K * Math.exp(-r * T);
    return Math.abs(lhs - rhs) < 0.01;
  }

  // 本地 helper（未迁移）：CRR 二叉树期权定价，后端无生产对应物
  function binomialTree(S: number, K: number, T: number, r: number, sigma: number, steps: number, type: 'call' | 'put'): number {
    const dt = T / steps;
    const u = Math.exp(sigma * Math.sqrt(dt));
    const d = 1 / u;
    const p = (Math.exp(r * dt) - d) / (u - d);
    const disc = Math.exp(-r * dt);

    const prices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      prices[i] = S * Math.pow(u, steps - i) * Math.pow(d, i);
    }

    let values = prices.map(px => type === 'call' ? Math.max(px - K, 0) : Math.max(K - px, 0));

    for (let step = steps - 1; step >= 0; step--) {
      const newValues: number[] = [];
      for (let i = 0; i <= step; i++) {
        newValues[i] = disc * (p * values[i] + (1 - p) * values[i + 1]);
      }
      values = newValues;
    }
    return values[0];
  }

  describe('Black-Scholes看涨期权', () => {
    it('ATM期权价格为正', () => {
      const price = bsmPrice(100, 100, 1, 0.05, 0.2, true);
      expect(price).toBeGreaterThan(0);
      expect(price).toBeLessThan(20);
    });

    it('深度ITM看涨 ≈ S - K*exp(-rT)', () => {
      const price = bsmPrice(200, 100, 1, 0.05, 0.2, true);
      const intrinsic = 200 - 100 * Math.exp(-0.05);
      expect(price).toBeCloseTo(intrinsic, 0);
    });

    it('深度OTM看涨 ≈ 0', () => {
      const price = bsmPrice(50, 100, 1, 0.05, 0.2, true);
      expect(price).toBeLessThan(0.01);
    });

    it('到期日为内含价值', () => {
      expect(bsmPrice(110, 100, 0, 0.05, 0.2, true)).toBe(10);
      expect(bsmPrice(90, 100, 0, 0.05, 0.2, true)).toBe(0);
    });

    it('波动率越高价格越高', () => {
      const p1 = bsmPrice(100, 100, 1, 0.05, 0.1, true);
      const p2 = bsmPrice(100, 100, 1, 0.05, 0.5, true);
      expect(p2).toBeGreaterThan(p1);
    });

    it('期限越长价格越高(欧式看涨)', () => {
      const p1 = bsmPrice(100, 100, 0.5, 0.05, 0.2, true);
      const p2 = bsmPrice(100, 100, 2, 0.05, 0.2, true);
      expect(p2).toBeGreaterThan(p1);
    });
  });

  describe('Black-Scholes看跌期权', () => {
    it('ATM看跌价格为正', () => {
      const price = bsmPrice(100, 100, 1, 0.05, 0.2, false);
      expect(price).toBeGreaterThan(0);
    });

    it('深度ITM看跌 ≈ K*exp(-rT) - S', () => {
      const price = bsmPrice(50, 100, 1, 0.05, 0.2, false);
      expect(price).toBeGreaterThan(40);
    });

    it('深度OTM看跌 ≈ 0', () => {
      const price = bsmPrice(200, 100, 1, 0.05, 0.2, false);
      expect(price).toBeLessThan(0.01);
    });

    it('到期日为内含价值', () => {
      expect(bsmPrice(90, 100, 0, 0.05, 0.2, false)).toBe(10);
      expect(bsmPrice(110, 100, 0, 0.05, 0.2, false)).toBe(0);
    });
  });

  describe('看涨看跌平价', () => {
    it('满足平价关系', () => {
      const call = bsmPrice(100, 100, 1, 0.05, 0.2, true);
      const put = bsmPrice(100, 100, 1, 0.05, 0.2, false);
      expect(putCallParity(call, put, 100, 100, 1, 0.05)).toBe(true);
    });

    it('不同行权价也满足', () => {
      const call = bsmPrice(100, 105, 1, 0.05, 0.2, true);
      const put = bsmPrice(100, 105, 1, 0.05, 0.2, false);
      expect(putCallParity(call, put, 100, 105, 1, 0.05)).toBe(true);
    });
  });

  describe('Greeks', () => {
    it('看涨Delta在(0,1)', () => {
      const d = delta(100, 100, 1, 0.05, 0.2, true);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
      expect(d).toBeCloseTo(0.6, 1);
    });

    it('看跌Delta在(-1,0)', () => {
      const d = delta(100, 100, 1, 0.05, 0.2, false);
      expect(d).toBeGreaterThan(-1);
      expect(d).toBeLessThan(0);
    });

    it('Gamma为正', () => {
      const g = gamma(100, 100, 1, 0.05, 0.2);
      expect(g).toBeGreaterThan(0);
    });

    it('Vega为正', () => {
      const v = vega(100, 100, 1, 0.05, 0.2);
      expect(v).toBeGreaterThan(0);
    });

    it('Theta为负(时间衰减)', () => {
      const t = theta(100, 100, 1, 0.05, 0.2, true);
      expect(t).toBeLessThan(0);
    });

    it('ATM时Gamma最大', () => {
      const gATM = gamma(100, 100, 1, 0.05, 0.2);
      const gOTM = gamma(80, 100, 1, 0.05, 0.2);
      expect(gATM).toBeGreaterThan(gOTM);
    });

    it('到期Delta为阶梯函数', () => {
      expect(delta(110, 100, 0, 0.05, 0.2, true)).toBe(1);
      expect(delta(90, 100, 0, 0.05, 0.2, true)).toBe(0);
    });
  });

  describe('隐含波动率', () => {
    it('从已知波动率反推', () => {
      const sigma = 0.25;
      const price = bsmPrice(100, 100, 1, 0.05, sigma, true);
      const iv = impliedVol(price, 100, 100, 1, 0.05, true);
      expect(iv).toBeCloseTo(sigma, 2);
    });

    it('看跌也能反推', () => {
      const sigma = 0.3;
      const price = bsmPrice(100, 100, 1, 0.05, sigma, false);
      const iv = impliedVol(price, 100, 100, 1, 0.05, false);
      expect(iv).toBeCloseTo(sigma, 2);
    });

    it('返回正值', () => {
      const price = bsmPrice(100, 100, 1, 0.05, 0.2, true);
      const iv = impliedVol(price, 100, 100, 1, 0.05, true);
      expect(iv).toBeGreaterThan(0);
    });
  });

  describe('二叉树定价', () => {
    it('步数越多越接近BS', () => {
      const bsPrice = bsmPrice(100, 100, 1, 0.05, 0.2, true);
      const bt10 = binomialTree(100, 100, 1, 0.05, 0.2, 10, 'call');
      const bt100 = binomialTree(100, 100, 1, 0.05, 0.2, 100, 'call');
      expect(Math.abs(bt100 - bsPrice)).toBeLessThan(Math.abs(bt10 - bsPrice));
    });

    it('价格为正', () => {
      const price = binomialTree(100, 100, 1, 0.05, 0.2, 50, 'call');
      expect(price).toBeGreaterThan(0);
    });

    it('看跌也有效', () => {
      const price = binomialTree(100, 100, 1, 0.05, 0.2, 50, 'put');
      expect(price).toBeGreaterThan(0);
    });
  });
});
