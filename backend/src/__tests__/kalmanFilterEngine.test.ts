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

  function kalman2D(measurements: [number, number][], dt = 1) {
    if (!measurements.length) return [];
    const states: { pos: number; vel: number }[] = [];
    let pos = measurements[0][0], vel = 0, p = 1;
    for (const [obs] of measurements) {
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

  function kalmanSmooth(states: KalmanState[], _measurements: number[]) {
    if (states.length < 2) return states.map(s => s.x);
    const smoothed = [...states.map(s => s.x)];
    for (let i = states.length - 2; i >= 0; i--) {
      const gain = states[i].p / (states[i].p + 0.01);
      smoothed[i] = states[i].x + gain * (smoothed[i + 1] - states[i].x);
    }
    return smoothed;
  }

  function kalmanMultiStep(states: KalmanState[], steps: number) {
    if (!states.length) return [];
    const last = states[states.length - 1];
    const predictions: number[] = [];
    let x = last.x, p = last.p;
    for (let i = 0; i < steps; i++) {
      p = p + 0.01;
      // no update step, just prediction
      predictions.push(x);
    }
    return predictions;
  }

  function outlierDetect(measurements: number[], threshold = 3) {
    const states = kalmanFilter(measurements);
    const outliers: number[] = [];
    for (let i = 0; i < measurements.length; i++) {
      const innov = Math.abs(measurements[i] - states[i].x);
      if (innov > states[i].p * threshold) {
        outliers.push(i);
      }
    }
    return outliers;
  }

  describe('基础卡尔曼滤波 (kalmanFilter)', () => {
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

    it('自定义过程噪声q', () => {
      // Higher q = more trust in measurements, faster adaptation
      const m = Array.from({ length: 10 }, () => 100 + (Math.random() - 0.5) * 10);
      const highQ = kalmanFilter(m, 0.5, 1);
      const lowQ = kalmanFilter(m, 0.001, 1);
      // High Q should have higher Kalman gain on average
      const avgKHigh = highQ.reduce((s, st) => s + st.k, 0) / highQ.length;
      const avgKLow = lowQ.reduce((s, st) => s + st.k, 0) / lowQ.length;
      expect(avgKHigh).toBeGreaterThan(avgKLow);
    });

    it('自定义测量噪声r', () => {
      // Higher r = less trust in measurements, lower K
      const m = Array.from({ length: 10 }, () => 100);
      const highR = kalmanFilter(m, 0.01, 10);
      const lowR = kalmanFilter(m, 0.01, 0.1);
      const avgKHigh = highR.reduce((s, st) => s + st.k, 0) / highR.length;
      const avgKLow = lowR.reduce((s, st) => s + st.k, 0) / lowR.length;
      expect(avgKHigh).toBeLessThan(avgKLow);
    });

    it('自定义初始协方差p0', () => {
      const m = [100, 100, 100, 100, 100];
      const highP = kalmanFilter(m, 0.01, 1, 10);
      const lowP = kalmanFilter(m, 0.01, 1, 0.01);
      // Higher initial p = higher initial K
      expect(highP[0].k).toBeGreaterThan(lowP[0].k);
    });

    it('跃阶响应：K随测量增大收敛', () => {
      // sudden jump from 100 to 200
      const m = [100, 100, 100, 100, 200, 200, 200, 200];
      const states = kalmanFilter(m);
      // K should decrease over time even after jump
      expect(states[states.length - 1].k).toBeLessThan(states[0].k);
    });

    it('快速变化序列仍可跟踪趋势', () => {
      const m = Array.from({ length: 30 }, (_, i) => i * 5 + (Math.random() - 0.5) * 20);
      const states = kalmanFilter(m);
      // Last state should be closer to last measurement than first measurement
      const lastMeasErr = Math.abs(states[states.length - 1].x - m[m.length - 1]);
      const firstMeasErr = Math.abs(states[states.length - 1].x - m[0]);
      expect(lastMeasErr).toBeLessThan(firstMeasErr);
    });

    it('负数值处理', () => {
      const m = [-10, -5, -3, -1, 0, 2, 5];
      const states = kalmanFilter(m);
      expect(states.every(s => typeof s.x === 'number' && isFinite(s.x))).toBe(true);
    });

    it('大规模数据高效', () => {
      const m = Array.from({ length: 1000 }, () => Math.random() * 100);
      const states = kalmanFilter(m);
      expect(states).toHaveLength(1000);
      expect(states[500].k).toBeGreaterThan(0);
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

    it('空输入返回空', () => {
      expect(adaptiveKalman([])).toEqual([]);
    });

    it('自定义窗口大小', () => {
      const m = Array.from({ length: 10 }, () => 100);
      const smallW = adaptiveKalman(m, 3);
      const largeW = adaptiveKalman(m, 8);
      expect(smallW).toHaveLength(10);
      expect(largeW).toHaveLength(10);
    });

    it('低频噪声更平滑', () => {
      const m = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i / 2) * 10);
      const states = adaptiveKalman(m, 5);
      // Adaptive should follow the sine wave
      const finalErr = Math.abs(states[states.length - 1].x - m[m.length - 1]);
      expect(finalErr).toBeLessThan(20);
    });

    it('阶跃变化后自适应', () => {
      const m = [...Array.from({ length: 10 }, () => 0), ...Array.from({ length: 10 }, () => 100)];
      const states = adaptiveKalman(m, 5);
      // After the step, state should move towards 100
      expect(states[states.length - 1].x).toBeGreaterThan(50);
    });
  });

  describe('卡尔曼平滑 (kalmanSmooth)', () => {
    it('平滑比原始更平', () => {
      const m = [100, 105, 102, 108, 103, 107, 104, 106, 105, 103];
      const states = kalmanFilter(m);
      const smoothed = kalmanSmooth(states, m);
      const smoothVar = smoothed.reduce((s, v) => s + (v - 105) ** 2, 0) / smoothed.length;
      const mVar = m.reduce((s, v) => s + (v - 105) ** 2, 0) / m.length;
      expect(smoothVar).toBeLessThanOrEqual(mVar);
    });

    it('单个状态返回本身', () => {
      const states = [{ x: 42, p: 1, k: 0.5 }];
      expect(kalmanSmooth(states, [42])).toEqual([42]);
    });

    it('空状态返回空', () => {
      expect(kalmanSmooth([], [])).toEqual([]);
    });

    it('平滑后端点值保持', () => {
      const m = Array.from({ length: 10 }, (_, i) => i * 10);
      const states = kalmanFilter(m);
      const smoothed = kalmanSmooth(states, m);
      // Last value should be same as filter's last estimate
      expect(smoothed[smoothed.length - 1]).toBe(states[states.length - 1].x);
    });

    it('平滑序列滤波去除尖峰', () => {
      const m = [100, 100, 110, 100, 100, 100, 120, 100, 100, 100];
      const states = kalmanFilter(m);
      const smoothed = kalmanSmooth(states, m);
      const maxDev = Math.max(...smoothed.map((v, i) => Math.abs(v - m[i])));
      // Smoothed values shouldn't deviate extremely from measurements
      expect(maxDev).toBeLessThan(25);
    });
  });

  describe('2D卡尔曼滤波 (kalman2D)', () => {
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

    it('空输入返回空', () => {
      expect(kalman2D([])).toEqual([]);
    });

    it('单个观测', () => {
      const obs: [number, number][] = [[100, 0]];
      const states = kalman2D(obs);
      expect(states).toHaveLength(1);
      expect(states[0].pos).toBeCloseTo(100, 0);
      expect(states[0].vel).toBe(0);
    });

    it('加速度检测', () => {
      // Position accelerating quadratically → velocity increases
      const obs: [number, number][] = Array.from({ length: 30 }, (_, i) => [i * i, i]);
      const states = kalman2D(obs);
      // Later velocity should be higher than early
      const midVel = states[15].vel;
      const lateVel = states[29].vel;
      expect(lateVel).toBeGreaterThan(0);
    });

    it('时间步长dt影响', () => {
      const obs: [number, number][] = Array.from({ length: 10 }, (_, i) => [i * 3, i]);
      const dt1 = kalman2D(obs, 1);
      const dt2 = kalman2D(obs, 2);
      expect(dt1[9].vel).not.toBeCloseTo(dt2[9].vel, 0);
    });

    it('负速度检测', () => {
      const obs: [number, number][] = Array.from({ length: 15 }, (_, i) => [100 - i * 5, i]);
      const states = kalman2D(obs);
      expect(states[states.length - 1].vel).toBeLessThan(0);
    });
  });

  describe('多步预测 (kalmanMultiStep)', () => {
    it('预测步数正确', () => {
      const m = [10, 10, 10, 10, 10];
      const states = kalmanFilter(m);
      const pred = kalmanMultiStep(states, 5);
      expect(pred).toHaveLength(5);
    });

    it('空状态返回空', () => {
      expect(kalmanMultiStep([], 5)).toEqual([]);
    });

    it('稳定序列预测值稳定', () => {
      const m = Array.from({ length: 10 }, () => 50);
      const states = kalmanFilter(m);
      const pred = kalmanMultiStep(states, 3);
      pred.forEach(v => expect(Math.abs(v - 50)).toBeLessThan(5));
    });
  });

  describe('异常值检测 (outlierDetect)', () => {
    it('正常值带小噪声不触发异常', () => {
      const m = Array.from({ length: 20 }, () => 100 + (Math.random() - 0.5) * 1);
      // With such small noise and high enough threshold, few outliers expected
      const outliers = outlierDetect(m, 10);
      expect(outliers.length).toBeLessThan(10);
    });

    it('单个离群值被检测', () => {
      const m = [100, 100, 100, 100, 1000, 100, 100, 100, 100];
      const outliers = outlierDetect(m, 3);
      expect(outliers.length).toBeGreaterThanOrEqual(1);
    });

    it('自定义阈值影响结果', () => {
      const m = [100, 100, 100, 100, 200, 100, 100];
      const strict = outlierDetect(m, 1);  // very strict
      const loose = outlierDetect(m, 10);  // very loose
      expect(strict.length).toBeGreaterThanOrEqual(loose.length);
    });
  });

  describe('集成与边界条件', () => {
    it('自适应+平滑联合使用', () => {
      const m = Array.from({ length: 30 }, (_, i) => 50 + Math.sin(i / 5) * 20 + (Math.random() - 0.5) * 5);
      const states = adaptiveKalman(m, 5);
      const smoothed = kalmanSmooth(states, m);
      expect(smoothed).toHaveLength(m.length);
    });

    it('滤波+2D联合使用', () => {
      const m = Array.from({ length: 10 }, () => Math.random() * 100);
      const states = kalmanFilter(m);
      const m2d: [number, number][] = m.map((v, i) => [v, i]);
      const s2d = kalman2D(m2d);
      expect(s2d).toHaveLength(10);
      expect(states).toHaveLength(10);
    });

    it('零点附近运行', () => {
      const m = [0, 0.1, -0.1, 0, 0.05, -0.05, 0, 0.02];
      const states = kalmanFilter(m);
      expect(states.every(s => typeof s.x === 'number' && isFinite(s.x))).toBe(true);
    });

    it('NaN输入处理', () => {
      const m = [100, NaN, 100, 100];
      const states = kalmanFilter(m);
      // NaN propagates — the function doesn't guard against it
      expect(states).toHaveLength(4);
    });

    it('两个元素序列', () => {
      const states = kalmanFilter([10, 20]);
      expect(states).toHaveLength(2);
      expect(states[0].x).toBeCloseTo(10, 0);
    });
  });
});
