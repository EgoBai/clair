/**
 * Walk-Forward Optimization & Monte Carlo Simulation Engine
 * 滚动优化与蒙特卡洛模拟引擎
 */

export interface WalkForwardWindow {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  trainSize: number;
  testSize: number;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  inSampleMetrics: Record<string, number[]>;
  outOfSampleMetrics: Record<string, number[]>;
  robustness: number;
  overfitting: number;
}

export interface MonteCarloConfig {
  simulations: number;
  timeSteps: number;
  initialValue: number;
  drift: number;
  volatility: number;
  seed?: number;
}

export interface MonteCarloResult {
  paths: number[][];
  finalValues: number[];
  mean: number;
  median: number;
  std: number;
  percentiles: Record<number, number>;
  var95: number;
  var99: number;
  maxDrawdownDistribution: number[];
}

export interface BootstrapResult {
  originalStatistic: number;
  bootstrapMean: number;
  bootstrapStd: number;
  confidenceInterval: [number, number];
  pValue: number;
}

// Simple seeded random for reproducibility
class SeededRandom {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0xffffffff;
  }

  nextGaussian(): number {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
  }
}

export function generateWalkForwardWindows(
  totalLength: number,
  trainSize: number,
  testSize: number,
  stepSize?: number
): WalkForwardWindow[] {
  const step = stepSize ?? testSize;
  const windows: WalkForwardWindow[] = [];

  let trainStart = 0;
  while (trainStart + trainSize + testSize <= totalLength) {
    const trainEnd = trainStart + trainSize;
    const testStart = trainEnd;
    const testEnd = Math.min(testStart + testSize, totalLength);

    windows.push({
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      trainSize,
      testSize: testEnd - testStart,
    });

    trainStart += step;
  }

  return windows;
}

export function expandingWindow(
  totalLength: number,
  minTrainSize: number,
  testSize: number
): WalkForwardWindow[] {
  const windows: WalkForwardWindow[] = [];
  let trainEnd = minTrainSize;

  while (trainEnd + testSize <= totalLength) {
    windows.push({
      trainStart: 0,
      trainEnd,
      testStart: trainEnd,
      testEnd: Math.min(trainEnd + testSize, totalLength),
      trainSize: trainEnd,
      testSize: Math.min(testSize, totalLength - trainEnd),
    });
    trainEnd += testSize;
  }

  return windows;
}

export function runMonteCarloSimulation(config: MonteCarloConfig): MonteCarloResult {
  const rng = new SeededRandom(config.seed);
  const paths: number[][] = [];
  const finalValues: number[] = [];
  const maxDrawdowns: number[] = [];

  const dt = 1 / 252; // Daily

  for (let sim = 0; sim < config.simulations; sim++) {
    const path: number[] = [config.initialValue];
    let peak = config.initialValue;
    let maxDd = 0;

    for (let step = 0; step < config.timeSteps; step++) {
      const z = rng.nextGaussian();
      const newValue = path[step] * Math.exp(
        (config.drift - 0.5 * config.volatility ** 2) * dt +
        config.volatility * Math.sqrt(dt) * z
      );
      path.push(newValue);

      if (newValue > peak) peak = newValue;
      const dd = (peak - newValue) / peak;
      if (dd > maxDd) maxDd = dd;
    }

    paths.push(path);
    finalValues.push(path[path.length - 1]);
    maxDrawdowns.push(maxDd);
  }

  finalValues.sort((a, b) => a - b);
  const mean = finalValues.reduce((a, b) => a + b, 0) / finalValues.length;
  const median = finalValues[Math.floor(finalValues.length / 2)];
  const std = Math.sqrt(finalValues.reduce((s, v) => s + (v - mean) ** 2, 0) / finalValues.length);

  const percentiles: Record<number, number> = {};
  for (const p of [1, 5, 10, 25, 50, 75, 90, 95, 99]) {
    const idx = Math.floor(finalValues.length * p / 100);
    percentiles[p] = finalValues[Math.min(idx, finalValues.length - 1)];
  }

  maxDrawdowns.sort((a, b) => a - b);

  return {
    paths,
    finalValues,
    mean,
    median,
    std,
    percentiles,
    var95: config.initialValue - percentiles[5],
    var99: config.initialValue - percentiles[1],
    maxDrawdownDistribution: maxDrawdowns,
  };
}

export function runBootstrap(
  data: number[],
  statistic: (sample: number[]) => number,
  nBootstrap: number = 1000,
  confidenceLevel: number = 0.95
): BootstrapResult {
  const originalStatistic = statistic(data);
  const bootstrapStats: number[] = [];
  const rng = new SeededRandom();

  for (let b = 0; b < nBootstrap; b++) {
    const sample: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const idx = Math.floor(rng.next() * data.length);
      sample.push(data[idx]);
    }
    bootstrapStats.push(statistic(sample));
  }

  bootstrapStats.sort((a, b) => a - b);
  const mean = bootstrapStats.reduce((a, b) => a + b, 0) / bootstrapStats.length;
  const std = Math.sqrt(bootstrapStats.reduce((s, v) => s + (v - mean) ** 2, 0) / bootstrapStats.length);

  const lowerIdx = Math.floor(bootstrapStats.length * (1 - confidenceLevel) / 2);
  const upperIdx = Math.floor(bootstrapStats.length * (1 + confidenceLevel) / 2);

  const pValue = bootstrapStats.filter(s => s >= originalStatistic).length / nBootstrap;

  return {
    originalStatistic,
    bootstrapMean: mean,
    bootstrapStd: std,
    confidenceInterval: [bootstrapStats[lowerIdx], bootstrapStats[Math.min(upperIdx, bootstrapStats.length - 1)]],
    pValue: Math.min(pValue, 1 - pValue) * 2,
  };
}

export function walkForwardOptimization<T>(
  data: number[][],
  labels: number[],
  optimize: (trainData: number[][], trainLabels: number[]) => T,
  evaluate: (params: T, testData: number[][], testLabels: number[]) => number,
  windows: WalkForwardWindow[]
): WalkForwardResult {
  const inSampleMetrics: Record<string, number[]> = { sharpe: [], returns: [], winRate: [] };
  const outOfSampleMetrics: Record<string, number[]> = { sharpe: [], returns: [], winRate: [] };

  for (const window of windows) {
    const trainData = data.slice(window.trainStart, window.trainEnd);
    const trainLabels = labels.slice(window.trainStart, window.trainEnd);
    const testData = data.slice(window.testStart, window.testEnd);
    const testLabels = labels.slice(window.testStart, window.testEnd);

    if (trainData.length === 0 || testData.length === 0) continue;

    const params = optimize(trainData, trainLabels);
    const inSampleScore = evaluate(params, trainData, trainLabels);
    const outOfSampleScore = evaluate(params, testData, testLabels);

    inSampleMetrics.returns.push(inSampleScore);
    outOfSampleMetrics.returns.push(outOfSampleScore);
  }

  const avgInSample = inSampleMetrics.returns.length > 0
    ? inSampleMetrics.returns.reduce((a, b) => a + b, 0) / inSampleMetrics.returns.length
    : 0;
  const avgOutOfSample = outOfSampleMetrics.returns.length > 0
    ? outOfSampleMetrics.returns.reduce((a, b) => a + b, 0) / outOfSampleMetrics.returns.length
    : 0;

  const robustness = avgInSample !== 0 ? avgOutOfSample / avgInSample : 0;
  const overfitting = avgInSample - avgOutOfSample;

  return {
    windows,
    inSampleMetrics,
    outOfSampleMetrics,
    robustness,
    overfitting,
  };
}

export function calculateConfidenceInterval(
  data: number[],
  confidenceLevel: number = 0.95
): { mean: number; lower: number; upper: number; std: number } {
  const n = data.length;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const se = std / Math.sqrt(n);

  // t-distribution approximation (for large n, z ≈ t)
  const z = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;

  return {
    mean,
    lower: mean - z * se,
    upper: mean + z * se,
    std,
  };
}

export function permutationTest(
  sample1: number[],
  sample2: number[],
  nPermutations: number = 1000
): { observedDiff: number; pValue: number; permutationDiffs: number[] } {
  const rng = new SeededRandom();
  const observedDiff = sample1.reduce((a, b) => a + b, 0) / sample1.length -
    sample2.reduce((a, b) => a + b, 0) / sample2.length;

  const combined = [...sample1, ...sample2];
  const n1 = sample1.length;
  const permutationDiffs: number[] = [];

  for (let p = 0; p < nPermutations; p++) {
    // Shuffle
    const shuffled = [...combined];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const perm1 = shuffled.slice(0, n1);
    const perm2 = shuffled.slice(n1);
    const diff = perm1.reduce((a, b) => a + b, 0) / n1 - perm2.reduce((a, b) => a + b, 0) / perm2.length;
    permutationDiffs.push(diff);
  }

  const pValue = permutationDiffs.filter(d => Math.abs(d) >= Math.abs(observedDiff)).length / nPermutations;

  return { observedDiff, pValue, permutationDiffs };
}

export function simulateGeometricBrownianMotion(
  s0: number,
  mu: number,
  sigma: number,
  T: number,
  steps: number,
  paths: number = 1000,
  seed?: number
): number[][] {
  const rng = new SeededRandom(seed);
  const dt = T / steps;
  const result: number[][] = [];

  for (let p = 0; p < paths; p++) {
    const path: number[] = [s0];
    for (let i = 1; i <= steps; i++) {
      const z = rng.nextGaussian();
      path.push(path[i - 1] * Math.exp((mu - 0.5 * sigma ** 2) * dt + sigma * Math.sqrt(dt) * z));
    }
    result.push(path);
  }

  return result;
}
