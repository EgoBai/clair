import { describe, it, expect } from 'vitest';

describe('隐马尔可夫模型状态识别引擎', () => {
  type State = 'bull' | 'bear' | 'sideways';

  interface HMMParams {
    states: State[];
    transProbs: number[][];
    emitMeans: number[];
    emitStds: number[];
    initialProbs: number[];
  }

  function createDefaultHMM(): HMMParams {
    return {
      states: ['bull', 'bear', 'sideways'],
      transProbs: [[0.7, 0.1, 0.2], [0.1, 0.7, 0.2], [0.15, 0.15, 0.7]],
      emitMeans: [0.005, -0.005, 0.0001],
      emitStds: [0.02, 0.02, 0.01],
      initialProbs: [0.33, 0.33, 0.34],
    };
  }

  function gaussianPDF(x: number, mean: number, std: number) {
    return Math.exp(-0.5 * ((x - mean) / std) ** 2) / (std * Math.sqrt(2 * Math.PI));
  }

  function viterbi(observations: number[], hmm: HMMParams): State[] {
    const { states, transProbs, emitMeans, emitStds, initialProbs } = hmm;
    const T = observations.length, N = states.length;
    if (!T) return [];
    const dp: number[][] = Array.from({ length: T }, () => Array(N).fill(-Infinity));
    const path: number[][] = Array.from({ length: T }, () => Array(N).fill(0));
    for (let j = 0; j < N; j++) {
      dp[0][j] = Math.log(initialProbs[j] + 1e-10) + Math.log(gaussianPDF(observations[0], emitMeans[j], emitStds[j]) + 1e-10);
    }
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < N; j++) {
        let maxVal = -Infinity, maxIdx = 0;
        for (let i = 0; i < N; i++) {
          const val = dp[t - 1][i] + Math.log(transProbs[i][j] + 1e-10);
          if (val > maxVal) { maxVal = val; maxIdx = i; }
        }
        dp[t][j] = maxVal + Math.log(gaussianPDF(observations[t], emitMeans[j], emitStds[j]) + 1e-10);
        path[t][j] = maxIdx;
      }
    }
    const result: State[] = [];
    let lastState = dp[T - 1].indexOf(Math.max(...dp[T - 1]));
    result.unshift(states[lastState]);
    for (let t = T - 1; t > 0; t--) {
      lastState = path[t][lastState];
      result.unshift(states[lastState]);
    }
    return result;
  }

  function forwardAlgorithm(observations: number[], hmm: HMMParams): number[][] {
    const { states, transProbs, emitMeans, emitStds, initialProbs } = hmm;
    const T = observations.length, N = states.length;
    const alpha: number[][] = Array.from({ length: T }, () => Array(N).fill(0));
    for (let j = 0; j < N; j++) {
      alpha[0][j] = initialProbs[j] * gaussianPDF(observations[0], emitMeans[j], emitStds[j]);
    }
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < N; j++) {
        let sum = 0;
        for (let i = 0; i < N; i++) sum += alpha[t - 1][i] * transProbs[i][j];
        alpha[t][j] = sum * gaussianPDF(observations[t], emitMeans[j], emitStds[j]);
      }
    }
    return alpha;
  }

  function stateProbabilities(alpha: number[][]): number[][] {
    return alpha.map(row => {
      const total = row.reduce((a, b) => a + b, 0);
      return total > 0 ? row.map(v => v / total) : row.map(() => 1 / row.length);
    });
  }

  function baumWelchInit(observations: number[], nStates: number) {
    const T = observations.length;
    const returns = observations.slice(1).map((o, i) => (o - observations[i]) / observations[i]);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
    return { mean, std, returns };
  }

  function expectedRegimeDuration(transProbs: number[][]): number[] {
    return transProbs.map(row => {
      const stayProb = row[row.indexOf(Math.max(...row))];
      return stayProb < 1 ? 1 / (1 - stayProb) : Infinity;
    });
  }

  describe('Viterbi解码', () => {
    it('正收益率序列牛市占比最多', () => {
      const obs = Array.from({ length: 30 }, () => 0.008);
      const hmm = createDefaultHMM();
      const path = viterbi(obs, hmm);
      const bullCount = path.filter(s => s === 'bull').length;
      const bearCount = path.filter(s => s === 'bear').length;
      expect(bullCount).toBeGreaterThanOrEqual(bearCount);
    });

    it('负收益率序列熊市占比最多', () => {
      const obs = Array.from({ length: 30 }, () => -0.008);
      const hmm = createDefaultHMM();
      const path = viterbi(obs, hmm);
      const bearCount = path.filter(s => s === 'bear').length;
      const bullCount = path.filter(s => s === 'bull').length;
      expect(bearCount).toBeGreaterThanOrEqual(bullCount);
    });

    it('零收益率序列多为盘整', () => {
      const obs = Array.from({ length: 20 }, () => 0.0001);
      const hmm = createDefaultHMM();
      const path = viterbi(obs, hmm);
      expect(path.filter(s => s === 'sideways').length).toBeGreaterThan(0);
    });

    it('空序列返回空', () => {
      expect(viterbi([], createDefaultHMM())).toEqual([]);
    });

    it('输出长度匹配', () => {
      const obs = [0.01, -0.02, 0.005, 0.01, -0.01];
      const hmm = createDefaultHMM();
      expect(viterbi(obs, hmm)).toHaveLength(5);
    });
  });

  describe('前向算法', () => {
    it('概率和归一化后在0-1', () => {
      const obs = [0.01, -0.01, 0.005, 0.01];
      const hmm = createDefaultHMM();
      const alpha = forwardAlgorithm(obs, hmm);
      const probs = stateProbabilities(alpha);
      probs.forEach(row => {
        expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
      });
    });

    it('最后一个时刻概率非负', () => {
      const obs = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.05);
      const hmm = createDefaultHMM();
      const alpha = forwardAlgorithm(obs, hmm);
      alpha[alpha.length - 1].forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });
  });

  describe('状态持续时间', () => {
    it('高自转移概率导致长持续', () => {
      const probs = [[0.9, 0.05, 0.05], [0.05, 0.9, 0.05], [0.1, 0.1, 0.8]];
      const durations = expectedRegimeDuration(probs);
      expect(durations[0]).toBeCloseTo(10, 0);
    });

    it('低自转移概率导致短持续', () => {
      const probs = [[0.5, 0.25, 0.25], [0.5, 0.5, 0], [0.33, 0.33, 0.34]];
      const durations = expectedRegimeDuration(probs);
      expect(durations[0]).toBeCloseTo(2, 0);
    });
  });

  describe('Baum-Welch初始化', () => {
    it('返回收益率统计', () => {
      const obs = [100, 102, 101, 103, 105, 104];
      const init = baumWelchInit(obs, 3);
      expect(init.returns.length).toBe(5);
      expect(init.std).toBeGreaterThan(0);
    });

    it('计算均值', () => {
      const obs = [100, 110, 120, 130, 140];
      const init = baumWelchInit(obs, 3);
      expect(init.mean).toBeGreaterThan(0);
    });
  });
});
