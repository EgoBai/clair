/**
 * KalmanFilterEngine - 卡尔曼滤波引擎
 * 一维卡尔曼滤波用于平滑和预测时间序列
 */

export interface KalmanState {
  estimate: number;
  errorCovariance: number;
  kalmanGain: number;
}

export interface KalmanConfig {
  processNoise: number;    // Q
  measurementNoise: number; // R
  initialState: number;
  initialCovariance: number;
}

export function kalmanFilter(measurements: number[], config: Partial<KalmanConfig> = {}): KalmanState[] {
  const Q = config.processNoise ?? 0.01;
  const R = config.measurementNoise ?? 0.1;
  let x = config.initialState ?? measurements[0] ?? 0;
  let P = config.initialCovariance ?? 1;

  const states: KalmanState[] = [];
  for (const z of measurements) {
    const P_pred = P + Q;
    const K = P_pred / (P_pred + R);
    x = x + K * (z - x);
    P = (1 - K) * P_pred;
    states.push({ estimate: Math.round(x * 10000) / 10000, errorCovariance: Math.round(P * 10000) / 10000, kalmanGain: Math.round(K * 10000) / 10000 });
  }
  return states;
}

export function smoothSeries(data: number[], q: number = 0.01, r: number = 0.1): number[] {
  return kalmanFilter(data, { processNoise: q, measurementNoise: r }).map(s => s.estimate);
}

export function predictNext(measurements: number[], config: Partial<KalmanConfig> = {}): number {
  const states = kalmanFilter(measurements, config);
  if (states.length === 0) return 0;
  return states[states.length - 1].estimate;
}
