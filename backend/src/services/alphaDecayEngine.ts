/**
 * Alpha衰减引擎 (Alpha Decay Engine)
 * - 信号衰减分析
 * - 半衰期计算
 * - 衰减曲线拟合
 */

export interface AlphaSignal {
  timestamp: number;
  value: number;
  decayRate: number;
}

export interface DecayResult {
  halfLife: number;
  decayConstant: number;
  projectedAlpha: number[];
  confidence: number;
}

export class AlphaDecayEngine {
  /**
   * 计算Alpha半衰期
   */
  calculateHalfLife(signals: AlphaSignal[]): DecayResult {
    if (signals.length < 2) {
      return { halfLife: 0, decayConstant: 0, projectedAlpha: [], confidence: 0 };
    }

    const sorted = [...signals].sort((a, b) => a.timestamp - b.timestamp);
    const values = sorted.map(s => Math.abs(s.value));
    const times = sorted.map(s => s.timestamp);

    // 指数衰减拟合: y = A * exp(-λt)
    const logValues = values.map(v => Math.log(Math.max(v, 1e-10)));
    const dayTimes = times.map(t => t / 86400000);
    const { slope } = this.linearRegression(dayTimes, logValues);
    const decayConstant = -slope;
    const halfLife = decayConstant > 0 ? Math.LN2 / decayConstant : Infinity;

    // 预测未来5期
    const lastTime = times[times.length - 1];
    const lastValue = values[values.length - 1];
    const projectedAlpha: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const projected = lastValue * Math.exp(-decayConstant * i);
      projectedAlpha.push(projected);
    }

    const confidence = Math.min(1, signals.length / 20);
    return {
      halfLife: Math.round(halfLife * 100) / 100,
      decayConstant: Math.round(decayConstant * 10000) / 10000,
      projectedAlpha,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * 衰减曲线拟合
   */
  fitDecayCurve(signals: AlphaSignal[]): { fitted: number[]; rSquared: number } {
    if (signals.length < 3) return { fitted: [], rSquared: 0 };

    const sorted = [...signals].sort((a, b) => a.timestamp - b.timestamp);
    const values = sorted.map(s => Math.abs(s.value));
    const logValues = values.map(v => Math.log(Math.max(v, 1e-10)));
    const times = sorted.map(s => s.timestamp);

    const dayTimes = times.map(t => t / 86400000);
    const { slope, intercept, rSquared } = this.linearRegression(dayTimes, logValues);
    const fitted = times.map(t => Math.exp(intercept + slope * t));

    return { fitted, rSquared };
  }

  /**
   * 衰减率估计
   */
  estimateDecayRate(signals: AlphaSignal[]): number {
    const result = this.calculateHalfLife(signals);
    return result.decayConstant;
  }

  private linearRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
    const n = x.length;
    if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let num = 0, den = 0, ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - meanX) * (y[i] - meanY);
      den += (x[i] - meanX) ** 2;
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = meanY - slope * meanX;

    for (let i = 0; i < n; i++) {
      const predicted = intercept + slope * x[i];
      ssRes += (y[i] - predicted) ** 2;
      ssTot += (y[i] - meanY) ** 2;
    }
    const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;

    return { slope, intercept, rSquared };
  }
}

export default new AlphaDecayEngine();
