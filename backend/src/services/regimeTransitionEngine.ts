/**
 * 市场状态转换概率引擎
 * - 隐马尔可夫模型 (HMM) 简化实现
 * - 状态转移概率矩阵
 * - 稳态分布计算
 * - 状态持续时间分布
 * - Viterbi 路径解码
 * - 前向-后向概率
 */

export type MarketRegime = 'bull' | 'bear' | 'sideways' | 'volatile';

export interface RegimeState {
  regime: MarketRegime;
  probability: number;
  duration: number;
  startIdx: number;
}

export interface TransitionMatrix {
  states: MarketRegime[];
  matrix: number[][];  // matrix[i][j] = P(j|i)
  steadyState: number[];
  eigenGap: number;
}

export interface HMMParams {
  transitionMatrix: number[][];
  emissionMeans: number[];
  emissionStds: number[];
  initialProbs: number[];
}

export interface ViterbiResult {
  states: number[];
  logProbability: number;
  regimes: MarketRegime[];
}

export interface DurationDistribution {
  regime: MarketRegime;
  meanDuration: number;
  medianDuration: number;
  maxDuration: number;
  durations: number[];
}

export class RegimeTransitionEngine {
  private regimes: MarketRegime[] = ['bull', 'bear', 'sideways', 'volatile'];

  /**
   * 基于收益特征分类市场状态
   */
  classifyRegime(returns: number[], window: number = 20): RegimeState[] {
    if (returns.length < window) return [];

    const states: RegimeState[] = [];
    for (let i = window; i <= returns.length; i++) {
      const slice = returns.slice(i - window, i);
      const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
      const annualizedVol = std * Math.sqrt(252);
      const annualizedReturn = mean * 252;

      let regime: MarketRegime;
      if (annualizedVol > 0.3) {
        regime = 'volatile';
      } else if (annualizedReturn > 0.05) {
        regime = 'bull';
      } else if (annualizedReturn < -0.05) {
        regime = 'bear';
      } else {
        regime = 'sideways';
      }

      const probability = this.regimeProbability(mean, std, regime);
      states.push({ regime, probability, duration: window, startIdx: i - window });
    }

    return this.mergeConsecutiveStates(states);
  }

  /**
   * 构建转移概率矩阵
   */
  buildTransitionMatrix(states: RegimeState[]): TransitionMatrix {
    const n = this.regimes.length;
    const counts: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 1; i < states.length; i++) {
      const from = this.regimes.indexOf(states[i - 1].regime);
      const to = this.regimes.indexOf(states[i].regime);
      if (from >= 0 && to >= 0) counts[from][to]++;
    }

    // Normalize
    const matrix: number[][] = counts.map(row => {
      const sum = row.reduce((s, v) => s + v, 0);
      return sum > 0 ? row.map(v => v / sum) : row.map(() => 1 / n);
    });

    // Ensure rows sum to 1
    matrix.forEach(row => {
      const sum = row.reduce((s, v) => s + v, 0);
      if (sum > 0) row.forEach((v, i) => row[i] = v / sum);
    });

    const steadyState = this.computeSteadyState(matrix);
    const eigenGap = this.computeEigenGap(matrix);

    return { states: this.regimes, matrix, steadyState, eigenGap };
  }

  /**
   * 简化 HMM 拟合 (Baum-Welch-like)
   */
  fitHMM(observations: number[], numStates: number = 3, maxIter: number = 20): HMMParams | null {
    if (observations.length < 10) return null;

    // Initialize parameters
    const transMatrix = Array.from({ length: numStates }, () =>
      Array.from({ length: numStates }, () => 1 / numStates)
    );

    const obsMin = Math.min(...observations);
    const obsMax = Math.max(...observations);
    const range = obsMax - obsMin || 1;

    const emissionMeans = Array.from({ length: numStates }, (_, i) =>
      obsMin + (i + 0.5) * range / numStates
    );
    const emissionStds = Array.from({ length: numStates }, () => range / numStates / 2);
    const initialProbs = Array(numStates).fill(1 / numStates);

    // Run forward-backward iterations
    for (let iter = 0; iter < maxIter; iter++) {
      const { alpha, scale } = this.forward(observations, transMatrix, emissionMeans, emissionStds, initialProbs);
      const { beta } = this.backward(observations, transMatrix, emissionMeans, emissionStds, scale);

      // Update transition matrix
      for (let i = 0; i < numStates; i++) {
        let denom = 0;
        for (let t = 0; t < observations.length - 1; t++) {
          denom += alpha[t][i] * beta[t][i];
        }

        for (let j = 0; j < numStates; j++) {
          let numer = 0;
          for (let t = 0; t < observations.length - 1; t++) {
            const emit = this.gaussianPDF(observations[t + 1], emissionMeans[j], emissionStds[j]);
            numer += alpha[t][i] * transMatrix[i][j] * emit * beta[t + 1][j];
          }
          transMatrix[i][j] = denom > 0 ? numer / denom : 1 / numStates;
        }
      }

      // Normalize rows
      transMatrix.forEach(row => {
        const sum = row.reduce((s, v) => s + v, 0);
        if (sum > 0) row.forEach((v, i) => row[i] = v / sum);
      });

      // Update emission parameters
      for (let j = 0; j < numStates; j++) {
        let numerMean = 0, denomGamma = 0;
        for (let t = 0; t < observations.length; t++) {
          const gamma = alpha[t][j] * beta[t][j];
          numerMean += gamma * observations[t];
          denomGamma += gamma;
        }
        if (denomGamma > 0) emissionMeans[j] = numerMean / denomGamma;

        let numerVar = 0;
        denomGamma = 0;
        for (let t = 0; t < observations.length; t++) {
          const gamma = alpha[t][j] * beta[t][j];
          numerVar += gamma * (observations[t] - emissionMeans[j]) ** 2;
          denomGamma += gamma;
        }
        if (denomGamma > 0) emissionStds[j] = Math.sqrt(Math.max(numerVar / denomGamma, 1e-6));
      }
    }

    return { transitionMatrix: transMatrix, emissionMeans, emissionStds, initialProbs };
  }

  /**
   * Viterbi 路径解码
   */
  viterbi(
    observations: number[],
    hmm: HMMParams
  ): ViterbiResult | null {
    const n = observations.length;
    const s = hmm.emissionMeans.length;
    if (n === 0 || s === 0) return null;

    const logTrans = hmm.transitionMatrix.map(row =>
      row.map(v => Math.log(Math.max(v, 1e-10)))
    );
    const logInit = hmm.initialProbs.map(v => Math.log(Math.max(v, 1e-10)));

    // Forward pass
    const delta: number[][] = Array.from({ length: n }, () => Array(s).fill(-Infinity));
    const psi: number[][] = Array.from({ length: n }, () => Array(s).fill(0));

    for (let j = 0; j < s; j++) {
      delta[0][j] = logInit[j] + Math.log(this.gaussianPDF(observations[0], hmm.emissionMeans[j], hmm.emissionStds[j]));
    }

    for (let t = 1; t < n; t++) {
      for (let j = 0; j < s; j++) {
        let maxVal = -Infinity, maxIdx = 0;
        for (let i = 0; i < s; i++) {
          const val = delta[t - 1][i] + logTrans[i][j];
          if (val > maxVal) { maxVal = val; maxIdx = i; }
        }
        delta[t][j] = maxVal + Math.log(this.gaussianPDF(observations[t], hmm.emissionMeans[j], hmm.emissionStds[j]));
        psi[t][j] = maxIdx;
      }
    }

    // Backtrack
    const states: number[] = Array(n).fill(0);
    let maxProb = -Infinity;
    for (let j = 0; j < s; j++) {
      if (delta[n - 1][j] > maxProb) { maxProb = delta[n - 1][j]; states[n - 1] = j; }
    }

    for (let t = n - 2; t >= 0; t--) {
      states[t] = psi[t + 1][states[t + 1]];
    }

    const regimes = states.map(s => this.regimes[s % this.regimes.length]);
    return { states, logProbability: maxProb, regimes };
  }

  /**
   * 计算稳态分布
   */
  computeSteadyState(matrix: number[][]): number[] {
    const n = matrix.length;
    if (n === 0) return [];

    // Power iteration
    let pi = Array(n).fill(1 / n);
    for (let iter = 0; iter < 1000; iter++) {
      const newPi = Array(n).fill(0);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          newPi[j] += pi[i] * matrix[i][j];
        }
      }
      const diff = newPi.reduce((s, v, i) => s + Math.abs(v - pi[i]), 0);
      pi = newPi;
      if (diff < 1e-10) break;
    }

    // Normalize
    const sum = pi.reduce((s, v) => s + v, 0);
    return sum > 0 ? pi.map(v => v / sum) : pi;
  }

  /**
   * 状态持续时间分析
   */
  analyzeDurations(states: RegimeState[]): DurationDistribution[] {
    const durations = new Map<MarketRegime, number[]>();

    let currentRegime = states[0]?.regime;
    let currentDuration = 1;

    for (let i = 1; i < states.length; i++) {
      if (states[i].regime === currentRegime) {
        currentDuration++;
      } else {
        if (!durations.has(currentRegime)) durations.set(currentRegime, []);
        durations.get(currentRegime)!.push(currentDuration);
        currentRegime = states[i].regime;
        currentDuration = 1;
      }
    }
    // Last segment
    if (currentRegime && currentDuration > 0) {
      if (!durations.has(currentRegime)) durations.set(currentRegime, []);
      durations.get(currentRegime)!.push(currentDuration);
    }

    return Array.from(durations.entries()).map(([regime, durs]) => {
      const sorted = [...durs].sort((a, b) => a - b);
      return {
        regime,
        meanDuration: durs.reduce((s, v) => s + v, 0) / durs.length,
        medianDuration: sorted[Math.floor(sorted.length / 2)] || 0,
        maxDuration: sorted[sorted.length - 1] || 0,
        durations: durs
      };
    });
  }

  /**
   * 条件转移概率: P(next state | current state and features)
   */
  conditionalTransition(
    from: MarketRegime,
    features: { momentum: number; volatility: number; volume: number },
    transitionMatrix: TransitionMatrix
  ): Map<MarketRegime, number> {
    const fromIdx = this.regimes.indexOf(from);
    const result = new Map<MarketRegime, number>();

    if (fromIdx < 0) {
      this.regimes.forEach(r => result.set(r, 1 / this.regimes.length));
      return result;
    }

    // Base transition probs adjusted by features
    let adjustedProbs = transitionMatrix.matrix[fromIdx].map(p => p);

    // Momentum adjustment: positive momentum favors bull
    if (features.momentum > 0.02) {
      adjustedProbs[this.regimes.indexOf('bull')] *= 1.3;
    } else if (features.momentum < -0.02) {
      adjustedProbs[this.regimes.indexOf('bear')] *= 1.3;
    }

    // Volatility adjustment
    if (features.volatility > 0.25) {
      adjustedProbs[this.regimes.indexOf('volatile')] *= 1.5;
    }

    // Normalize
    const sum = adjustedProbs.reduce((s, v) => s + v, 0);
    adjustedProbs = adjustedProbs.map(v => v / sum);

    this.regimes.forEach((r, i) => result.set(r, adjustedProbs[i]));
    return result;
  }

  // Private helpers
  private regimeProbability(mean: number, std: number, regime: MarketRegime): number {
    switch (regime) {
      case 'bull': return Math.min(0.95, 0.5 + mean * 50);
      case 'bear': return Math.min(0.95, 0.5 - mean * 50);
      case 'volatile': return Math.min(0.95, std * 5);
      case 'sideways': return Math.min(0.95, 1 - std * 5);
      default: return 0.5;
    }
  }

  private mergeConsecutiveStates(states: RegimeState[]): RegimeState[] {
    if (states.length === 0) return [];
    const merged: RegimeState[] = [states[0]];

    for (let i = 1; i < states.length; i++) {
      const last = merged[merged.length - 1];
      if (states[i].regime === last.regime) {
        last.duration++;
        last.probability = Math.max(last.probability, states[i].probability);
      } else {
        merged.push(states[i]);
      }
    }
    return merged;
  }

  private computeEigenGap(matrix: number[][]): number {
    const n = matrix.length;
    if (n < 2) return 0;
    // Transpose for left eigenvector
    const eigenvalues: number[] = [];
    const working = matrix.map(row => [...row]);

    for (let k = 0; k < 2; k++) {
      let v = Array(n).fill(1 / n);
      for (let iter = 0; iter < 100; iter++) {
        const Av = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            Av[i] += working[i][j] * v[j];
          }
        }
        const norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0)) || 1;
        v = Av.map(x => x / norm);
      }
      let eigenvalue = 0;
      for (let i = 0; i < n; i++) {
        let Avi = 0;
        for (let j = 0; j < n; j++) Avi += working[i][j] * v[j];
        eigenvalue += v[i] * Avi;
      }
      eigenvalues.push(eigenvalue);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          working[i][j] -= eigenvalue * v[i] * v[j];
        }
      }
    }

    return eigenvalues.length >= 2 ? Math.abs(eigenvalues[0]) - Math.abs(eigenvalues[1]) : 0;
  }

  private forward(
    obs: number[],
    trans: number[][],
    means: number[],
    stds: number[],
    init: number[]
  ): { alpha: number[][]; scale: number[] } {
    const n = obs.length, s = means.length;
    const alpha: number[][] = Array.from({ length: n }, () => Array(s).fill(0));
    const scale: number[] = Array(n).fill(0);

    for (let j = 0; j < s; j++) {
      alpha[0][j] = init[j] * this.gaussianPDF(obs[0], means[j], stds[j]);
    }
    scale[0] = alpha[0].reduce((s, v) => s + v, 0) || 1;
    alpha[0].forEach((v, i) => alpha[0][i] = v / scale[0]);

    for (let t = 1; t < n; t++) {
      for (let j = 0; j < s; j++) {
        let sum = 0;
        for (let i = 0; i < s; i++) sum += alpha[t - 1][i] * trans[i][j];
        alpha[t][j] = sum * this.gaussianPDF(obs[t], means[j], stds[j]);
      }
      scale[t] = alpha[t].reduce((s, v) => s + v, 0) || 1;
      alpha[t].forEach((v, i) => alpha[t][i] = v / scale[t]);
    }

    return { alpha, scale };
  }

  private backward(
    obs: number[],
    trans: number[][],
    means: number[],
    stds: number[],
    scale: number[]
  ): { beta: number[][] } {
    const n = obs.length, s = means.length;
    const beta: number[][] = Array.from({ length: n }, () => Array(s).fill(0));

    for (let j = 0; j < s; j++) beta[n - 1][j] = 1 / (scale[n - 1] || 1);

    for (let t = n - 2; t >= 0; t--) {
      for (let i = 0; i < s; i++) {
        let sum = 0;
        for (let j = 0; j < s; j++) {
          sum += trans[i][j] * this.gaussianPDF(obs[t + 1], means[j], stds[j]) * beta[t + 1][j];
        }
        beta[t][i] = sum / (scale[t] || 1);
      }
    }

    return { beta };
  }

  private gaussianPDF(x: number, mean: number, std: number): number {
    if (std <= 0) return 1e-10;
    const z = (x - mean) / std;
    return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
  }
}
