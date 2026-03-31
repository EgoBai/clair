/**
 * 蒙特卡洛模拟引擎
 * 支持: 路径模拟、VaR/CVaR计算、组合压力测试、策略评估
 */

export interface MonteCarloConfig {
  numSimulations: number;
  numSteps: number;
  initialValue: number;
  drift: number; // 年化漂移率
  volatility: number; // 年化波动率
  dt?: number; // 时间步长 (默认1/252)
  randomSeed?: number;
}

export interface SimulationPath {
  id: number;
  values: number[];
  finalValue: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
}

export interface MonteCarloResult {
  paths: SimulationPath[];
  statistics: SimulationStatistics;
  percentiles: { [key: number]: number };
  riskMetrics: RiskMetrics;
}

export interface SimulationStatistics {
  mean: number;
  median: number;
  std: number;
  skewness: number;
  kurtosis: number;
  min: number;
  max: number;
}

export interface RiskMetrics {
  var95: number; // 95% VaR
  var99: number; // 99% VaR
  cvar95: number; // 95% CVaR (Expected Shortfall)
  cvar99: number; // 99% CVaR
  maxDrawdown95: number;
  probabilityOfLoss: number;
  expectedReturn: number;
}

export interface StressTestScenario {
  name: string;
  driftShift: number;
  volMultiplier: number;
  crashDay?: number;
  crashMagnitude?: number;
}

export interface StressTestResult {
  scenario: string;
  meanFinalValue: number;
  worstCase5pct: number;
  probabilityOfLoss: number;
  maxDrawdown95: number;
}

/**
 * 几何布朗运动 (GBM) 路径模拟
 */
export function simulateGBMPaths(config: MonteCarloConfig): SimulationPath[] {
  const {
    numSimulations, numSteps, initialValue,
    drift, volatility, dt = 1 / 252
  } = config;

  const paths: SimulationPath[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    const values: number[] = [initialValue];
    let currentValue = initialValue;
    let peak = initialValue;
    let maxDD = 0;
    let ddDuration = 0;
    let maxDDDuration = 0;

    for (let step = 1; step <= numSteps; step++) {
      const z = boxMullerRandom();
      const newValue = currentValue * Math.exp(
        (drift - 0.5 * volatility ** 2) * dt + volatility * Math.sqrt(dt) * z
      );

      values.push(newValue);
      currentValue = newValue;

      // 计算最大回撤
      if (newValue > peak) {
        peak = newValue;
        ddDuration = 0;
      } else {
        ddDuration++;
        if (ddDuration > maxDDDuration) maxDDDuration = ddDuration;
      }

      const dd = (peak - newValue) / peak;
      if (dd > maxDD) maxDD = dd;
    }

    paths.push({
      id: sim,
      values,
      finalValue: currentValue,
      maxDrawdown: maxDD,
      maxDrawdownDuration: maxDDDuration
    });
  }

  return paths;
}

/**
 * 跳跃扩散过程 (Merton Jump Diffusion)
 */
export function simulateJumpDiffusion(
  config: MonteCarloConfig & {
    jumpIntensity: number; // 泊松强度
    jumpMean: number; // 跳跃均值
    jumpStd: number; // 跳跃标准差
  }
): SimulationPath[] {
  const {
    numSimulations, numSteps, initialValue,
    drift, volatility, dt = 1 / 252,
    jumpIntensity, jumpMean, jumpStd
  } = config;

  const paths: SimulationPath[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    const values: number[] = [initialValue];
    let currentValue = initialValue;
    let peak = initialValue;
    let maxDD = 0;
    let ddDuration = 0;
    let maxDDDuration = 0;

    for (let step = 1; step <= numSteps; step++) {
      const z = boxMullerRandom();

      // 泊松跳跃
      const jump = Math.random() < jumpIntensity * dt
        ? Math.exp(jumpMean + jumpStd * boxMullerRandom()) - 1
        : 0;

      const newValue = currentValue * Math.exp(
        (drift - 0.5 * volatility ** 2) * dt + volatility * Math.sqrt(dt) * z
      ) * (1 + jump);

      values.push(newValue);
      currentValue = newValue;

      if (newValue > peak) {
        peak = newValue;
        ddDuration = 0;
      } else {
        ddDuration++;
        if (ddDuration > maxDDDuration) maxDDDuration = ddDuration;
      }

      const dd = (peak - newValue) / peak;
      if (dd > maxDD) maxDD = dd;
    }

    paths.push({
      id: sim,
      values,
      finalValue: currentValue,
      maxDrawdown: maxDD,
      maxDrawdownDuration: maxDDDuration
    });
  }

  return paths;
}

/**
 * 从蒙特卡洛结果计算统计和风险指标
 */
export function analyzeMonteCarloResults(paths: SimulationPath[]): MonteCarloResult {
  const finalValues = paths.map(p => p.finalValue);
  const returns = finalValues.map(v => v / (paths[0]?.values[0] ?? 1) - 1);

  const statistics = calculateStats(finalValues);
  const percentiles = calculatePercentiles(finalValues, [1, 5, 10, 25, 50, 75, 90, 95, 99]);
  const riskMetrics = calculateRiskMetrics(returns, paths.map(p => p.maxDrawdown));

  return { paths, statistics, percentiles, riskMetrics };
}

/**
 * 压力测试
 */
export function stressTest(
  baseConfig: MonteCarloConfig,
  scenarios: StressTestScenario[]
): StressTestResult[] {
  const results: StressTestResult[] = [];

  for (const scenario of scenarios) {
    const paths = simulateGBMPaths({
      ...baseConfig,
      drift: baseConfig.drift + scenario.driftShift,
      volatility: baseConfig.volatility * scenario.volMultiplier
    });

    // 如果有crash scenario
    if (scenario.crashDay !== undefined && scenario.crashMagnitude !== undefined) {
      for (const path of paths) {
        if (scenario.crashDay < path.values.length) {
          const crashFactor = 1 + scenario.crashMagnitude;
          for (let i = scenario.crashDay; i < path.values.length; i++) {
            path.values[i] *= crashFactor;
          }
          path.finalValue = path.values[path.values.length - 1];
        }
      }
    }

    const finalValues = paths.map(p => p.finalValue);
    const returns = finalValues.map(v => v / baseConfig.initialValue - 1);
    const sorted = [...returns].sort((a, b) => a - b);
    const p5Index = Math.floor(sorted.length * 0.05);

    results.push({
      scenario: scenario.name,
      meanFinalValue: finalValues.reduce((a, b) => a + b, 0) / finalValues.length,
      worstCase5pct: sorted[p5Index] ?? sorted[0],
      probabilityOfLoss: returns.filter(r => r < 0).length / returns.length,
      maxDrawdown95: calculatePercentile(paths.map(p => p.maxDrawdown), 95)
    });
  }

  return results;
}

/**
 * 策略评估: 用蒙特卡洛评估策略鲁棒性
 */
export function evaluateStrategyRobustness(
  baseReturns: number[],
  numSimulations: number = 1000,
  blockSize: number = 20
): {
  meanReturn: number;
  probPositive: number;
  worstCase5pct: number;
  bestCase95pct: number;
  sharpeDistribution: { mean: number; std: number };
} {
  const n = baseReturns.length;
  const simulatedReturns: number[] = [];
  const sharpes: number[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    // Block bootstrap
    const simReturns: number[] = [];
    while (simReturns.length < n) {
      const start = Math.floor(Math.random() * Math.max(1, n - blockSize));
      const block = baseReturns.slice(start, start + blockSize);
      simReturns.push(...block);
    }

    const totalReturn = simReturns.slice(0, n).reduce((acc, r) => acc * (1 + r), 1) - 1;
    simulatedReturns.push(totalReturn);

    const mean = simReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(simReturns.slice(0, n).reduce((a, r) => a + (r - mean) ** 2, 0) / n);
    sharpes.push(std > 0 ? mean / std : 0);
  }

  const sorted = [...simulatedReturns].sort((a, b) => a - b);
  const p5Index = Math.floor(sorted.length * 0.05);
  const p95Index = Math.floor(sorted.length * 0.95);

  const sharpeMean = sharpes.reduce((a, b) => a + b, 0) / sharpes.length;
  const sharpeStd = Math.sqrt(sharpes.reduce((a, s) => a + (s - sharpeMean) ** 2, 0) / sharpes.length);

  return {
    meanReturn: simulatedReturns.reduce((a, b) => a + b, 0) / simulatedReturns.length,
    probPositive: simulatedReturns.filter(r => r > 0).length / simulatedReturns.length,
    worstCase5pct: sorted[p5Index],
    bestCase95pct: sorted[p95Index],
    sharpeDistribution: { mean: sharpeMean, std: sharpeStd }
  };
}

// ===== Helper Functions =====

function boxMullerRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function calculateStats(values: number[]): SimulationStatistics {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);

  const skewness = values.reduce((a, v) => a + ((v - mean) / std) ** 3, 0) / n;
  const kurtosis = values.reduce((a, v) => a + ((v - mean) / std) ** 4, 0) / n - 3;

  return {
    mean, median, std, skewness, kurtosis,
    min: sorted[0],
    max: sorted[n - 1]
  };
}

function calculatePercentiles(values: number[], pcts: number[]): { [key: number]: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const result: { [key: number]: number } = {};
  for (const p of pcts) {
    const idx = Math.floor(sorted.length * p / 100);
    result[p] = sorted[Math.min(idx, sorted.length - 1)];
  }
  return result;
}

function calculatePercentile(values: number[], pct: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * pct / 100);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function calculateRiskMetrics(returns: number[], maxDrawdowns: number[]): RiskMetrics {
  const sorted = [...returns].sort((a, b) => a - b);
  const n = sorted.length;

  const var95Idx = Math.floor(n * 0.05);
  const var99Idx = Math.floor(n * 0.01);

  const var95 = -sorted[var95Idx];
  const var99 = -sorted[var99Idx];

  const tail95 = sorted.slice(0, var95Idx + 1);
  const tail99 = sorted.slice(0, var99Idx + 1);

  const cvar95 = -tail95.reduce((a, b) => a + b, 0) / tail95.length;
  const cvar99 = -tail99.reduce((a, b) => a + b, 0) / tail99.length;

  const sortedDD = [...maxDrawdowns].sort((a, b) => b - a);
  const maxDD95Idx = Math.floor(n * 0.05);

  return {
    var95,
    var99,
    cvar95,
    cvar99,
    maxDrawdown95: sortedDD[maxDD95Idx] ?? 0,
    probabilityOfLoss: returns.filter(r => r < 0).length / n,
    expectedReturn: returns.reduce((a, b) => a + b, 0) / n
  };
}
