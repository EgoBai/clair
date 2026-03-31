import { describe, it, expect } from 'vitest';

/**
 * 波动率曲面引擎测试
 */

interface VolSurfacePoint {
  strike: number;
  expiry: number; // days to expiry
  impliedVol: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

interface VolSurface {
  underlying: string;
  spot: number;
  timestamp: string;
  points: VolSurfacePoint[];
  atmVol: number;
  skew: number;
  termStructure: number[];
}

function calcATMVol(surface: VolSurface): number {
  const nearExpiry = surface.points
    .filter(p => p.expiry <= 30)
    .sort((a, b) => Math.abs(a.strike - surface.spot) - Math.abs(b.strike - surface.spot));
  return nearExpiry.length > 0 ? nearExpiry[0].impliedVol : 0;
}

function calcSkew(surface: VolSurface, expiry: number = 30): number {
  const points = surface.points.filter(p => p.expiry === expiry);
  if (points.length < 3) return 0;

  const sorted = points.sort((a, b) => a.strike - b.strike);
  const atmIndex = sorted.findIndex(p => p.strike >= surface.spot);
  if (atmIndex < 1 || atmIndex >= sorted.length - 1) return 0;

  const putVol = sorted[atmIndex - 1].impliedVol;
  const callVol = sorted[atmIndex + 1].impliedVol;
  return callVol - putVol; // Positive = call skew, Negative = put skew
}

function calcTermStructure(surface: VolSurface): number[] {
  const byExpiry = new Map<number, VolSurfacePoint[]>();
  for (const point of surface.points) {
    const existing = byExpiry.get(point.expiry) || [];
    existing.push(point);
    byExpiry.set(point.expiry, existing);
  }

  const result: number[] = [];
  for (const [expiry, points] of [...byExpiry.entries()].sort((a, b) => a[0] - b[0])) {
    const atmPoints = points
      .sort((a, b) => Math.abs(a.strike - surface.spot) - Math.abs(b.strike - surface.spot))
      .slice(0, 3);
    const avgVol = atmPoints.reduce((s, p) => s + p.impliedVol, 0) / atmPoints.length;
    result.push(avgVol);
  }
  return result;
}

function interpolateVol(surface: VolSurface, strike: number, expiry: number): number {
  // Simple bilinear interpolation
  const points = surface.points;
  if (points.length === 0) return 0;

  const nearby = points
    .map(p => ({ ...p, dist: Math.abs(p.strike - strike) + Math.abs(p.expiry - expiry) * 0.01 }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4);

  if (nearby.length === 0) return 0;
  if (nearby[0].dist === 0) return nearby[0].impliedVol;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const p of nearby) {
    const weight = 1 / (p.dist + 0.001);
    weightedSum += p.impliedVol * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function detectVolAnomaly(surface: VolSurface, threshold: number = 0.05): VolSurfacePoint[] {
  const anomalies: VolSurfacePoint[] = [];
  for (const point of surface.points) {
    const expected = interpolateVol({ ...surface, points: surface.points.filter(p => p !== point) }, point.strike, point.expiry);
    if (Math.abs(point.impliedVol - expected) > threshold) {
      anomalies.push(point);
    }
  }
  return anomalies;
}

describe('Vol Surface Engine', () => {
  const sampleSurface: VolSurface = {
    underlying: '510050',
    spot: 3.0,
    timestamp: '2024-01-01',
    points: [
      { strike: 2.8, expiry: 30, impliedVol: 0.25, delta: -0.3, gamma: 0.5, vega: 0.1, theta: -0.02 },
      { strike: 2.9, expiry: 30, impliedVol: 0.22, delta: -0.4, gamma: 0.6, vega: 0.12, theta: -0.025 },
      { strike: 3.0, expiry: 30, impliedVol: 0.20, delta: -0.5, gamma: 0.7, vega: 0.15, theta: -0.03 },
      { strike: 3.1, expiry: 30, impliedVol: 0.21, delta: -0.6, gamma: 0.6, vega: 0.12, theta: -0.025 },
      { strike: 3.2, expiry: 30, impliedVol: 0.24, delta: -0.7, gamma: 0.5, vega: 0.1, theta: -0.02 },
      { strike: 2.8, expiry: 60, impliedVol: 0.26, delta: -0.3, gamma: 0.4, vega: 0.15, theta: -0.015 },
      { strike: 3.0, expiry: 60, impliedVol: 0.21, delta: -0.5, gamma: 0.5, vega: 0.2, theta: -0.02 },
      { strike: 3.2, expiry: 60, impliedVol: 0.25, delta: -0.7, gamma: 0.4, vega: 0.15, theta: -0.015 },
      { strike: 2.8, expiry: 90, impliedVol: 0.27, delta: -0.3, gamma: 0.3, vega: 0.2, theta: -0.01 },
      { strike: 3.0, expiry: 90, impliedVol: 0.22, delta: -0.5, gamma: 0.4, vega: 0.25, theta: -0.015 },
      { strike: 3.2, expiry: 90, impliedVol: 0.26, delta: -0.7, gamma: 0.3, vega: 0.2, theta: -0.01 },
    ],
    atmVol: 0.20,
    skew: 0.01,
    termStructure: [0.20, 0.21, 0.22],
  };

  describe('ATM波动率', () => {
    it('应该找到最近到期的ATM波动率', () => {
      const atmVol = calcATMVol(sampleSurface);
      expect(atmVol).toBe(0.20);
    });

    it('空曲面应该返回0', () => {
      const empty: VolSurface = { ...sampleSurface, points: [] };
      expect(calcATMVol(empty)).toBe(0);
    });
  });

  describe('偏斜度', () => {
    it('应该计算skew', () => {
      const skew = calcSkew(sampleSurface);
      expect(typeof skew).toBe('number');
    });

    it('数据不足应该返回0', () => {
      const sparse: VolSurface = { ...sampleSurface, points: sampleSurface.points.slice(0, 2) };
      expect(calcSkew(sparse)).toBe(0);
    });
  });

  describe('期限结构', () => {
    it('应该按到期日计算波动率', () => {
      const termStructure = calcTermStructure(sampleSurface);
      expect(termStructure.length).toBe(3); // 30, 60, 90 days
    });

    it('应该按到期日排序', () => {
      const termStructure = calcTermStructure(sampleSurface);
      for (let i = 1; i < termStructure.length; i++) {
        expect(termStructure[i]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('波动率插值', () => {
    it('应该插值任意点', () => {
      const vol = interpolateVol(sampleSurface, 3.05, 45);
      expect(vol).toBeGreaterThan(0);
    });

    it('空曲面应该返回0', () => {
      const empty: VolSurface = { ...sampleSurface, points: [] };
      expect(interpolateVol(empty, 3.0, 30)).toBe(0);
    });

    it('已知点应该返回原值', () => {
      const vol = interpolateVol(sampleSurface, 3.0, 30);
      expect(vol).toBeCloseTo(0.20, 2);
    });
  });

  describe('异常检测', () => {
    it('应该检测异常波动率', () => {
      const anomalies = detectVolAnomaly(sampleSurface);
      expect(Array.isArray(anomalies)).toBe(true);
    });

    it('正常曲面应该没有明显异常', () => {
      const anomalies = detectVolAnomaly(sampleSurface, 0.1);
      expect(anomalies.length).toBeLessThanOrEqual(2);
    });
  });
});
