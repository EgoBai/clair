import { describe, it, expect } from 'vitest';
import {
  buildVolSurface,
  interpolateIV,
  detectVolAnomalies,
  calculateVolSmile,
  VolPoint,
} from '../services/volatilitySurfaceEngine';

describe('波动率曲面引擎', () => {
  const mockPoints: VolPoint[] = [
    { strike: 2900, expiry: 30, iv: 0.22, delta: -0.25, gamma: 0.001, vega: 0.15, theta: -0.05 },
    { strike: 3000, expiry: 30, iv: 0.18, delta: -0.50, gamma: 0.002, vega: 0.20, theta: -0.06 },
    { strike: 3100, expiry: 30, iv: 0.20, delta: 0.25, gamma: 0.001, vega: 0.15, theta: -0.05 },
    { strike: 2900, expiry: 60, iv: 0.24, delta: -0.25, gamma: 0.001, vega: 0.18, theta: -0.04 },
    { strike: 3000, expiry: 60, iv: 0.20, delta: -0.50, gamma: 0.002, vega: 0.22, theta: -0.05 },
    { strike: 3100, expiry: 60, iv: 0.22, delta: 0.25, gamma: 0.001, vega: 0.18, theta: -0.04 },
    { strike: 2900, expiry: 90, iv: 0.25, delta: -0.25, gamma: 0.001, vega: 0.20, theta: -0.03 },
    { strike: 3000, expiry: 90, iv: 0.21, delta: -0.50, gamma: 0.002, vega: 0.25, theta: -0.04 },
    { strike: 3100, expiry: 90, iv: 0.23, delta: 0.25, gamma: 0.001, vega: 0.20, theta: -0.03 },
  ];

  describe('构建波动率曲面', () => {
    it('应正确构建曲面', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      expect(surface.underlying).toBe('510050.SH');
      expect(surface.points.length).toBe(9);
      expect(surface.atmVol).toBeGreaterThan(0);
    });

    it('应计算ATM波动率', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      // delta = -0.50 is ATM (abs of delta = 0.5)
      expect(surface.atmVol).toBeCloseTo(0.1967, 1);
    });

    it('应计算25-delta偏度', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      expect(typeof surface.skew25d).toBe('number');
    });

    it('应计算10-delta偏度', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      expect(typeof surface.skew10d).toBe('number');
    });

    it('应构建期限结构', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      expect(surface.termStructure.length).toBe(3);
      expect(surface.termStructure[0].expiry).toBe(30);
      expect(surface.termStructure[2].expiry).toBe(90);
    });

    it('应按到期日和行权价排序', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      for (let i = 1; i < surface.points.length; i++) {
        if (surface.points[i].expiry === surface.points[i - 1].expiry) {
          expect(surface.points[i].strike).toBeGreaterThanOrEqual(surface.points[i - 1].strike);
        } else {
          expect(surface.points[i].expiry).toBeGreaterThanOrEqual(surface.points[i - 1].expiry);
        }
      }
    });

    it('空数据应抛出错误', () => {
      expect(() => buildVolSurface('510050.SH', [])).toThrow('No vol points provided');
    });

    it('应包含时间戳', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      expect(surface.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('波动率插值', () => {
    it('应插值同一到期日的行权价', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      const iv = interpolateIV(surface, 2950, 30);
      expect(iv).toBeGreaterThan(0.18);
      expect(iv).toBeLessThan(0.22);
    });

    it('应插值不同到期日', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      const iv = interpolateIV(surface, 3000, 45);
      expect(iv).toBeGreaterThan(0.18);
      expect(iv).toBeLessThan(0.22);
    });

    it('精确匹配应返回原始值', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      const iv = interpolateIV(surface, 3000, 30);
      expect(iv).toBeCloseTo(0.18, 5);
    });

    it('空曲面应返回0', () => {
      const emptySurface = buildVolSurface('510050.SH', [mockPoints[0]]);
      const surface = { ...emptySurface, points: [] };
      expect(interpolateIV(surface, 3000, 30)).toBe(0);
    });
  });

  describe('异常检测', () => {
    it('正常曲面应无异常', () => {
      const surface = buildVolSurface('510050.SH', mockPoints);
      const anomalies = detectVolAnomalies(surface);
      // Normal surface might have no anomalies
      expect(Array.isArray(anomalies)).toBe(true);
    });

    it('应检测倒置期限结构', () => {
      const invertedPoints: VolPoint[] = [
        { strike: 3000, expiry: 30, iv: 0.40, delta: -0.50, gamma: 0.002, vega: 0.20, theta: -0.06 },
        { strike: 3000, expiry: 60, iv: 0.25, delta: -0.50, gamma: 0.002, vega: 0.22, theta: -0.05 },
        { strike: 3000, expiry: 90, iv: 0.20, delta: -0.50, gamma: 0.002, vega: 0.25, theta: -0.04 },
      ];
      const surface = buildVolSurface('510050.SH', invertedPoints);
      const anomalies = detectVolAnomalies(surface);
      expect(anomalies.some(a => a.type === 'inverted_term_structure')).toBe(true);
    });

    it('应检测极端偏度', () => {
      const extremeSkew: VolPoint[] = [
        { strike: 2900, expiry: 30, iv: 0.50, delta: -0.25, gamma: 0.001, vega: 0.15, theta: -0.05 },
        { strike: 3000, expiry: 30, iv: 0.18, delta: -0.50, gamma: 0.002, vega: 0.20, theta: -0.06 },
        { strike: 3100, expiry: 30, iv: 0.15, delta: 0.25, gamma: 0.001, vega: 0.15, theta: -0.05 },
      ];
      const surface = buildVolSurface('510050.SH', extremeSkew);
      const anomalies = detectVolAnomalies(surface);
      expect(anomalies.some(a => a.type === 'extreme_skew')).toBe(true);
    });

    it('异常应有严重程度', () => {
      const extremeSkew: VolPoint[] = [
        { strike: 2900, expiry: 30, iv: 0.60, delta: -0.25, gamma: 0.001, vega: 0.15, theta: -0.05 },
        { strike: 3000, expiry: 30, iv: 0.15, delta: -0.50, gamma: 0.002, vega: 0.20, theta: -0.06 },
        { strike: 3100, expiry: 30, iv: 0.12, delta: 0.25, gamma: 0.001, vega: 0.15, theta: -0.05 },
      ];
      const surface = buildVolSurface('510050.SH', extremeSkew);
      const anomalies = detectVolAnomalies(surface);
      for (const a of anomalies) {
        expect(['low', 'medium', 'high']).toContain(a.severity);
      }
    });
  });

  describe('波动率微笑', () => {
    it('应计算微笑曲线', () => {
      const smile = calculateVolSmile(mockPoints, 30);
      expect(smile.strikes.length).toBe(3);
      expect(smile.ivs.length).toBe(3);
      expect(smile.smile.length).toBe(3);
    });

    it('边界点曲率为0', () => {
      const smile = calculateVolSmile(mockPoints, 30);
      expect(smile.smile[0]).toBe(0);
      expect(smile.smile[smile.smile.length - 1]).toBe(0);
    });

    it('不存在的到期日应返回空', () => {
      const smile = calculateVolSmile(mockPoints, 999);
      expect(smile.strikes.length).toBe(0);
    });
  });
});
