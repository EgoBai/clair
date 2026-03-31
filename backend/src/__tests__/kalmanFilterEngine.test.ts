import { describe, it, expect } from 'vitest';

describe('自适应卡尔曼滤波引擎', () => {
  interface KalmanState { x: number; p: number; k: number }
  function kalmanFilter(measurements: number[], q = 0.01, r = 1, p0 = 1): KalmanState[] {
    if (!measurements.length) return [];
    const states: KalmanState[] = [];
    let x = measurements[0], p = p0;
    for (const z of measurements) {
      p = p + q;
      const k = p / (p + r);
      x = x + k * (z - x);
      p = (1 - k) * p;
      states.push({ x, p, k });
    }
    return states;
  }

  function adaptiveKalman(measurements: number[], window = 5): KalmanState[] {
    if (!measurements.length) return [];
    const states: KalmanState[] = [];
    let x = measurements[0], p = 1;
    for (let i = 0; i < measurements.length; i++) {
      const q = i >= window ? (() => {
        const recent = measurements.slice(i - window + 1, i + 1);
        const diffs = recent.slice(1).map((v, j) => (v - recent[j]) ** 2);
        return Math.max(0.001, diffs.reduce((a, b) => a + b, 0) / diffs.length);
      })() : 0.01;
      const r = i >= window ? (() => {
        const residuals = states.slice(Math.max(0, i - window), i);
        const vals = residuals.map((s, j) => (measurements[i - residuals.length + j] - s.x) ** 2);
        return Math.max(0.01, vals.reduce((a, b) => a + b, 0) / vals.length);
      })() : 1;
      p = p + q;
      const k = p / (p + r);
      x = x + k * (measurements[i] - x);
      p = (1 - k) * p;
      states.push({ x, p, k });
    }
    return states;
  }

  // 多维卡尔曼滤波简化版 (2D)
  function kalman2D(measurements: [number, number][], dt = 1) {
    if (!measurements.length) return [];
    const states: { pos: number; vel: number }[] = [];
    let pos = measurements[0][0], vel = 0, p = 1;
    for (const [obs, _] of measurements) {
      const predPos = pos + vel * dt;
      p = p + 0.01;
      const k = p / (p + 1);
      pos = predPos + k * (obs - predPos);
      vel = vel + k * ((obs - predPos) / dt);
      p = (1 - k) * p;
      states.push({ pos, vel });
    }
    return states;
  }

  function kalmanSmooth(states: KalmanState[], measurements: number[]) {
    if (states.length < 2) return states.map(s => s.x);
    const smoothed = [...states.map(s => s.x)];
    for (let i = states.length - 2; i >= 0; i--) {
      const gain = states[i].p / (states[i].p + 0.01);
      smoothed[i] = states[i].x + gain * (smoothed[i + 1] - states[i].x);
    }
    return smoothed;
  }

  describe('基础卡尔曼滤波', () => {
    it('平滑常数序列', () => {
      const m = Array.from({ length: 20 }, () => 100 + (Math.random() - 0.5) * 0.1);
      const states = kalmanFilter(m);
      const variance = states.map(s => s.x).reduce((s, v) => s + (v - 100) ** 2, 0) / states.length;
      const mVar = m.reduce((s, v) => s + (v - 100) ** 2, 0) / m.length;
      expect(variance).toBeLessThan(mVar);
    });

    it('K值递减', () => {
      const m = Array.from({ length: 20 }, () => 100);
      const states = kalmanFilter(m);
      for (let i = 1; i < states.length; i++) {
        expect(states[i].k).toBeLessThanOrEqual(states[i - 1].k + 0.001);
      }
    });

    it('空输入返回空', () => {
      expect(kalmanFilter([])).toEqual([]);
    });

    it('单个测量值', () => {
      const states = kalmanFilter([42]);
      expect(states).toHaveLength(1);
      expect(states[0].x).toBeCloseTo(42, 0);
    });

    it('P值始终非负', () => {
      const m = Array.from({ length: 50 }, (_, i) => i + Math.random() * 5);
      const states = kalmanFilter(m);
      expect(states.every(s => s.p >= 0)).toBe(true);
    });
  });

  describe('自适应卡尔曼滤波', () => {
    it('噪声自适应', () => {
      const quiet = Array.from({ length: 10 }, () => 100);
      const noisy = Array.from({ length: 10 }, () => 100 + (Math.random() - 0.5) * 20);
      const m = [...quiet, ...noisy];
      const states = adaptiveKalman(m, 5);
      expect(states.length).toBe(m.length);
    });

    it('趋势跟踪', () => {
      const m = Array.from({ length: 30 }, (_, i) => i * 2 + Math.random());
      const states = adaptiveKalman(m, 5);
      expect(states[states.length - 1].x).toBeGreaterThan(states[0].x);
    });
  });

  describe('卡尔曼平滑', () => {
    it('平滑比原始更平', () => {
      const m = [100, 105, 102, 108, 103, 107, 104, 106, 105, 103];
      const states = kalmanFilter(m);
      const smoothed = kalmanSmooth(states, m);
      const smoothVar = smoothed.reduce((s, v) => s + (v - 105) ** 2, 0) / smoothed.length;
      const mVar = m.reduce((s, v) => s + (v - 105) ** 2, 0) / m.length;
      expect(smoothVar).toBeLessThanOrEqual(mVar);
    });
  });

  describe('2D卡尔曼', () => {
    it('位置+速度估计', () => {
      const obs: [number, number][] = Array.from({ length: 20 }, (_, i) => [i * 2, i]);
      const states = kalman2D(obs);
      expect(states).toHaveLength(20);
      expect(states[states.length - 1].vel).toBeGreaterThan(0);
    });

    it('恒定位置速度接近0', () => {
      const obs: [number, number][] = Array.from({ length: 30 }, () => [50, 25]);
      const states = kalman2D(obs);
      expect(Math.abs(states[states.length - 1].vel)).toBeLessThan(0.5);
    });
  });
});
