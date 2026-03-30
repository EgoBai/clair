import { describe, it, expect } from 'vitest';

// 期权希腊字母计算
function calcDelta(spot: number, strike: number, timeToExpiry: number, volatility: number, type: 'call' | 'put'): number {
  // Simplified delta approximation
  const moneyness = spot / strike;
  const timeFactor = Math.sqrt(timeToExpiry);
  if (type === 'call') {
    const d1 = (Math.log(moneyness) + 0.5 * volatility ** 2 * timeToExpiry) / (volatility * timeFactor);
    return +normalCDF(d1).toFixed(4);
  } else {
    const d1 = (Math.log(moneyness) + 0.5 * volatility ** 2 * timeToExpiry) / (volatility * timeFactor);
    return +(normalCDF(d1) - 1).toFixed(4);
  }
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327;
  const p = d * Math.exp(-x * x / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function calcGamma(spot: number, strike: number, timeToExpiry: number, volatility: number): number {
  const moneyness = spot / strike;
  const timeFactor = Math.sqrt(timeToExpiry);
  const d1 = (Math.log(moneyness) + 0.5 * volatility ** 2 * timeToExpiry) / (volatility * timeFactor);
  const d = 0.3989422804014327;
  const gamma = d * Math.exp(-d1 * d1 / 2) / (spot * volatility * timeFactor);
  return +gamma.toFixed(6);
}

function calcTheta(spot: number, strike: number, timeToExpiry: number, volatility: number, type: 'call' | 'put'): number {
  if (timeToExpiry <= 0) return 0;
  const timeFactor = Math.sqrt(timeToExpiry);
  const moneyness = spot / strike;
  const d1 = (Math.log(moneyness) + 0.5 * volatility ** 2 * timeToExpiry) / (volatility * timeFactor);
  const d2 = d1 - volatility * timeFactor;
  const d = 0.3989422804014327;
  const pdf = d * Math.exp(-d1 * d1 / 2);
  const theta = -(spot * pdf * volatility) / (2 * timeFactor);
  return +(theta / 365).toFixed(4); // daily theta
}

// 波动率微笑
function calcVolatilitySmile(strikes: number[], baseVol: number, spot: number): number[] {
  return strikes.map(k => {
    const moneyness = k / spot;
    const skew = (moneyness - 1) * 0.5; // mild skew
    const smile = (moneyness - 1) ** 2 * 3; // curvature dominates → U-shape
    return +(baseVol + smile - Math.abs(skew) * 0.1).toFixed(4);
  });
}

// 隐含波动率近似 (Newton-Raphson)
function impliedVolatility(marketPrice: number, spot: number, strike: number, timeToExpiry: number, type: 'call' | 'put', maxIter: number = 50): number {
  let vol = 0.3; // initial guess
  for (let i = 0; i < maxIter; i++) {
    const price = blackScholesApprox(spot, strike, timeToExpiry, vol, type);
    const vega = calcGamma(spot, strike, timeToExpiry, vol) * spot * Math.sqrt(timeToExpiry) * 100;
    if (vega < 0.0001) break;
    const diff = price - marketPrice;
    vol = vol - diff / vega;
    vol = Math.max(0.01, Math.min(vol, 5));
    if (Math.abs(diff) < 0.001) break;
  }
  return +vol.toFixed(4);
}

function blackScholesApprox(spot: number, strike: number, timeToExpiry: number, vol: number, type: 'call' | 'put'): number {
  const moneyness = spot / strike;
  const timeFactor = Math.sqrt(timeToExpiry);
  const d1 = (Math.log(moneyness) + 0.5 * vol ** 2 * timeToExpiry) / (vol * timeFactor);
  const d2 = d1 - vol * timeFactor;
  if (type === 'call') {
    return spot * normalCDF(d1) - strike * normalCDF(d2);
  } else {
    return strike * normalCDF(-d2) - spot * normalCDF(-d1);
  }
}

describe('期权希腊字母与波动率', () => {
  describe('Delta计算', () => {
    it('看涨Delta在0-1之间', () => {
      const d = calcDelta(100, 100, 0.25, 0.2, 'call');
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
    });

    it('看跌Delta在-1到0之间', () => {
      const d = calcDelta(100, 100, 0.25, 0.2, 'put');
      expect(d).toBeGreaterThan(-1);
      expect(d).toBeLessThan(0);
    });

    it('深度实值看涨Delta接近1', () => {
      const d = calcDelta(200, 100, 0.25, 0.2, 'call');
      expect(d).toBeGreaterThan(0.9);
    });

    it('深度虚值看涨Delta接近0', () => {
      const d = calcDelta(50, 100, 0.25, 0.2, 'call');
      expect(d).toBeLessThan(0.1);
    });

    it('平值看涨Delta约0.5', () => {
      const d = calcDelta(100, 100, 1, 0.2, 'call');
      expect(d).toBeCloseTo(0.5, 1);
    });
  });

  describe('Gamma计算', () => {
    it('Gamma为正', () => {
      const g = calcGamma(100, 100, 0.25, 0.2);
      expect(g).toBeGreaterThan(0);
    });

    it('平值Gamma最大', () => {
      const atm = calcGamma(100, 100, 0.25, 0.2);
      const itm = calcGamma(120, 100, 0.25, 0.2);
      const otm = calcGamma(80, 100, 0.25, 0.2);
      expect(atm).toBeGreaterThan(itm);
      expect(atm).toBeGreaterThan(otm);
    });

    it('时间减少Gamma增加(平值)', () => {
      const g1 = calcGamma(100, 100, 0.5, 0.2);
      const g2 = calcGamma(100, 100, 0.1, 0.2);
      expect(g2).toBeGreaterThan(g1);
    });
  });

  describe('Theta计算', () => {
    it('Theta通常为负(时间衰减)', () => {
      const t = calcTheta(100, 100, 0.25, 0.2, 'call');
      expect(t).toBeLessThan(0);
    });

    it('到期Theta为0', () => {
      const t = calcTheta(100, 100, 0, 0.2, 'call');
      expect(t).toBe(0);
    });

    it('看跌Theta也为负', () => {
      const t = calcTheta(100, 100, 0.25, 0.2, 'put');
      expect(t).toBeLessThanOrEqual(0);
    });
  });

  describe('波动率微笑', () => {
    it('ATM波动率等于基准', () => {
      const smile = calcVolatilitySmile([100], 0.2, 100);
      expect(smile[0]).toBe(0.2);
    });

    it('微笑曲线U形', () => {
      const smile = calcVolatilitySmile([80, 90, 100, 110, 120], 0.2, 100);
      expect(smile[0]).toBeGreaterThan(smile[1]);
      expect(smile[4]).toBeGreaterThan(smile[3]);
      expect(smile[2]).toBeLessThan(smile[0]);
    });

    it('空数组返回空', () => {
      expect(calcVolatilitySmile([], 0.2, 100)).toHaveLength(0);
    });
  });

  describe('隐含波动率', () => {
    it('返回正值', () => {
      const iv = impliedVolatility(10, 100, 100, 0.25, 'call');
      expect(iv).toBeGreaterThan(0);
    });

    it('高价对应高IV', () => {
      const iv1 = impliedVolatility(5, 100, 100, 0.25, 'call');
      const iv2 = impliedVolatility(15, 100, 100, 0.25, 'call');
      expect(iv2).toBeGreaterThan(iv1);
    });

    it('看跌也能计算IV', () => {
      const iv = impliedVolatility(5, 100, 100, 0.25, 'put');
      expect(iv).toBeGreaterThan(0);
    });
  });
});
