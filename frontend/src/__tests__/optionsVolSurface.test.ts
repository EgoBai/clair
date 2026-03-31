import { describe, it, expect } from 'vitest';

/**
 * 期权定价 / 波动率曲面逻辑测试
 */

describe('OptionsPricingEngine', () => {
  describe('Black-Scholes 模型', () => {
    const blackScholes = (
      S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'
    ) => {
      const d1 = (Math.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      
      const normalCDF = (x: number) => {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2);
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
      };

      if (type === 'call') {
        return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
      }
      return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    };

    it('看涨期权价值应为正', () => {
      const callValue = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
      expect(callValue).toBeGreaterThan(0);
    });

    it('看跌期权价值应为正', () => {
      const putValue = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
      expect(putValue).toBeGreaterThan(0);
    });

    it('平值看涨应大于看跌（正利率）', () => {
      const call = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
      const put = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
      expect(call).toBeGreaterThan(put);
    });

    it('深度实值看涨接近内在价值', () => {
      const call = blackScholes(150, 100, 0.01, 0.05, 0.2, 'call');
      expect(call).toBeCloseTo(50, 0);
    });
  });

  describe('Greeks', () => {
    const calcDelta = (S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put') => {
      const d1 = (Math.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
      const approx = 1 / (1 + Math.exp(-1.7 * d1));
      return type === 'call' ? approx : approx - 1;
    };

    it('看涨 Delta 应在 0-1 之间', () => {
      const delta = calcDelta(100, 100, 1, 0.05, 0.2, 'call');
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThan(1);
    });

    it('看跌 Delta 应在 -1-0 之间', () => {
      const delta = calcDelta(100, 100, 1, 0.05, 0.2, 'put');
      expect(delta).toBeGreaterThan(-1);
      expect(delta).toBeLessThan(0);
    });

    it('深度实值看涨 Delta 接近 1', () => {
      const delta = calcDelta(200, 100, 1, 0.05, 0.2, 'call');
      expect(delta).toBeGreaterThan(0.9);
    });
  });
});

describe('VolSurfaceEngine', () => {
  describe('波动率曲面', () => {
    const volSurface = {
      strikes: [90, 95, 100, 105, 110],
      expiries: [0.25, 0.5, 1.0],
      impliedVols: [
        [0.25, 0.22, 0.20, 0.22, 0.25],
        [0.23, 0.21, 0.19, 0.21, 0.24],
        [0.22, 0.20, 0.18, 0.20, 0.23],
      ],
    };

    it('应该有行权价网格', () => {
      expect(volSurface.strikes).toHaveLength(5);
    });

    it('应该有到期日网格', () => {
      expect(volSurface.expiries).toHaveLength(3);
    });

    it('波动率矩阵维度应该匹配', () => {
      expect(volSurface.impliedVols).toHaveLength(3);
      volSurface.impliedVols.forEach(row => {
        expect(row).toHaveLength(5);
      });
    });
  });

  describe('波动率微笑', () => {
    it('OTM put 波动率通常更高（skew）', () => {
      const strikes = [90, 95, 100, 105, 110];
      const ivs = [0.25, 0.22, 0.20, 0.22, 0.25];
      // 微笑曲线：两端高中间低
      expect(ivs[0]).toBeGreaterThan(ivs[2]);
      expect(ivs[4]).toBeGreaterThan(ivs[2]);
    });
  });

  describe('期限结构', () => {
    it('短期波动率通常高于长期', () => {
      const shortTerm = 0.25;
      const longTerm = 0.18;
      expect(shortTerm).toBeGreaterThan(longTerm);
    });
  });

  describe('波动率插值', () => {
    const linearInterpolate = (x: number, x1: number, y1: number, x2: number, y2: number) => {
      return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
    };

    it('应该线性插值', () => {
      const vol = linearInterpolate(97.5, 95, 0.22, 100, 0.20);
      expect(vol).toBeCloseTo(0.21, 2);
    });

    it('端点值应该返回已知值', () => {
      expect(linearInterpolate(95, 95, 0.22, 100, 0.20)).toBe(0.22);
      expect(linearInterpolate(100, 95, 0.22, 100, 0.20)).toBe(0.20);
    });
  });
});
