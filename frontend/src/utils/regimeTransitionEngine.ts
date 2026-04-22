/**
 * 市场体制转换引擎
 * 隐马尔可夫模型(HMM)风格的市场体制检测与转换概率分析
 */

export interface MarketRegime {
  id: number;
  name: string;
  description: string;
  avgReturn: number;
  volatility: number;
  sharpeRatio: number;
  frequency: number; // 出现频率 0-1
  avgDuration: number; // 平均持续天数
}

export interface RegimeTransition {
  from: number;
  to: number;
  probability: number;
  avgTransitionDays: number;
}

export interface RegimeState {
  date: string;
  regime: number;
  probability: number; // 该体制的概率
  duration: number; // 已持续天数
  nextRegimeProb: Record<number, number>; // 转向各体制的概率
}

export interface RegimeAnalysis {
  regimes: MarketRegime[];
  transitions: RegimeTransition[];
  currentState: RegimeState;
  transitionMatrix: number[][];
  steadyState: number[];
  regimeHistory: RegimeState[];
}

/**
 * 简化的 K-Means 聚类（用于体制识别）
 */
function kMeans1D(data: number[], k: number, maxIter: number = 50): { centers: number[]; labels: number[] } {
  if (data.length === 0) return { centers: [], labels: [] };
  if (data.length <= k) {
    return {
      centers: data.slice(),
      labels: data.map((_, i) => i % k),
    };
  }

  // 初始化中心点
  const sorted = [...data].sort((a, b) => a - b);
  const centers: number[] = [];
  for (let i = 0; i < k; i++) {
    centers.push(sorted[Math.floor(i * sorted.length / k)]);
  }

  let labels = new Array(data.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // 分配标签
    const newLabels = data.map(val => {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const dist = Math.abs(val - centers[c]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }
      return bestCluster;
    });

    // 检查收敛
    if (newLabels.every((l, i) => l === labels[i])) break;
    labels = newLabels;

    // 更新中心
    for (let c = 0; c < k; c++) {
      const clusterData = data.filter((_, i) => labels[i] === c);
      if (clusterData.length > 0) {
        centers[c] = clusterData.reduce((a, b) => a + b, 0) / clusterData.length;
      }
    }
  }

  return { centers, labels };
}

/**
 * 检测市场体制
 */
export function detectRegimes(
  returns: number[],
  numRegimes: number = 3,
  window: number = 20
): RegimeAnalysis {
  if (returns.length < window) {
    const defaultRegime: MarketRegime = {
      id: 0, name: '未知', description: '数据不足',
      avgReturn: 0, volatility: 0, sharpeRatio: 0, frequency: 1, avgDuration: 0,
    };
    return {
      regimes: [defaultRegime],
      transitions: [],
      currentState: {
        date: 'unknown', regime: 0, probability: 1, duration: 0,
        nextRegimeProb: { 0: 1 },
      },
      transitionMatrix: [[1]],
      steadyState: [1],
      regimeHistory: [],
    };
  }

  // 计算滚动特征
  const features: number[] = [];
  for (let i = window - 1; i < returns.length; i++) {
    const slice = returns.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / window;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / window);
    // 特征: Sharpe-like
    features.push(std > 0 ? mean / std * Math.sqrt(252) : 0);
  }

  // 聚类识别体制
  const { centers, labels } = kMeans1D(features, numRegimes);

  // 对中心排序（从低到高）
  const sortedCenters = centers.map((c, i) => ({ center: c, id: i })).sort((a, b) => a.center - b.center);
  const idMapping = new Map<number, number>();
  sortedCenters.forEach((s, newId) => idMapping.set(s.id, newId));
  const remappedLabels = labels.map(l => idMapping.get(l)!);

  // 计算各体制统计
  const regimeNames = ['熊市', '震荡', '牛市', '极端波动', '恢复'];
  const regimes: MarketRegime[] = [];

  for (let r = 0; r < numRegimes; r++) {
    const regimeReturns = returns.slice(window - 1).filter((_, i) => remappedLabels[i] === r);
    const avgReturn = regimeReturns.length > 0
      ? regimeReturns.reduce((a, b) => a + b, 0) / regimeReturns.length * 252
      : 0;
    const vol = regimeReturns.length > 1
      ? Math.sqrt(regimeReturns.reduce((a, b) => a + b ** 2, 0) / regimeReturns.length * 252)
      : 0;
    const sharpe = vol > 0 ? avgReturn / vol : 0;
    const frequency = regimeReturns.length / remappedLabels.length;

    // 平均持续天数
    const durations: number[] = [];
    let currentDuration = 1;
    for (let i = 1; i < remappedLabels.length; i++) {
      if (remappedLabels[i] === remappedLabels[i - 1]) {
        currentDuration++;
      } else {
        if (remappedLabels[i - 1] === r) durations.push(currentDuration);
        currentDuration = 1;
      }
    }
    if (remappedLabels[remappedLabels.length - 1] === r) durations.push(currentDuration);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    regimes.push({
      id: r,
      name: regimeNames[r] || `体制${r}`,
      description: `年化收益 ${(avgReturn * 100).toFixed(1)}%，波动率 ${(vol * 100).toFixed(1)}%`,
      avgReturn: Math.round(avgReturn * 10000) / 10000,
      volatility: Math.round(vol * 10000) / 10000,
      sharpeRatio: Math.round(sharpe * 100) / 100,
      frequency: Math.round(frequency * 10000) / 10000,
      avgDuration: Math.round(avgDuration * 10) / 10,
    });
  }

  // 转移矩阵
  const transitionMatrix: number[][] = Array.from({ length: numRegimes }, () =>
    new Array(numRegimes).fill(0)
  );
  for (let i = 1; i < remappedLabels.length; i++) {
    transitionMatrix[remappedLabels[i - 1]][remappedLabels[i]]++;
  }
  // 归一化
  for (let r = 0; r < numRegimes; r++) {
    const sum = transitionMatrix[r].reduce((a, b) => a + b, 0);
    if (sum > 0) {
      transitionMatrix[r] = transitionMatrix[r].map(v => Math.round(v / sum * 10000) / 10000);
    } else {
      transitionMatrix[r][r] = 1;
    }
  }

  // 转移列表
  const transitions: RegimeTransition[] = [];
  for (let from = 0; from < numRegimes; from++) {
    for (let to = 0; to < numRegimes; to++) {
      if (from !== to && transitionMatrix[from][to] > 0) {
        transitions.push({
          from,
          to,
          probability: transitionMatrix[from][to],
          avgTransitionDays: regimes[from].avgDuration,
        });
      }
    }
  }

  // 稳态分布（迭代求解）
  let steadyState = new Array(numRegimes).fill(1 / numRegimes);
  for (let iter = 0; iter < 100; iter++) {
    const newSS = new Array(numRegimes).fill(0);
    for (let j = 0; j < numRegimes; j++) {
      for (let i = 0; i < numRegimes; i++) {
        newSS[j] += steadyState[i] * transitionMatrix[i][j];
      }
    }
    steadyState = newSS;
  }

  // 当前状态
  const currentRegime = remappedLabels[remappedLabels.length - 1];
  let currentDuration = 1;
  for (let i = remappedLabels.length - 2; i >= 0; i--) {
    if (remappedLabels[i] === currentRegime) currentDuration++;
    else break;
  }

  const currentState: RegimeState = {
    date: 'current',
    regime: currentRegime,
    probability: steadyState[currentRegime],
    duration: currentDuration,
    nextRegimeProb: Object.fromEntries(
      Array.from({ length: numRegimes }, (_, i) => [i, transitionMatrix[currentRegime][i]])
    ),
  };

  // 历史状态
  const regimeHistory: RegimeState[] = [];
  let histDuration = 1;
  for (let i = window; i < remappedLabels.length; i++) {
    if (i > window && remappedLabels[i] === remappedLabels[i - 1]) {
      histDuration++;
    } else {
      histDuration = 1;
    }
    regimeHistory.push({
      date: `day_${i}`,
      regime: remappedLabels[i],
      probability: steadyState[remappedLabels[i]],
      duration: histDuration,
      nextRegimeProb: {},
    });
  }

  return {
    regimes,
    transitions,
    currentState,
    transitionMatrix,
    steadyState: steadyState.map(v => Math.round(v * 10000) / 10000),
    regimeHistory,
  };
}

/**
 * 预测下一期体制概率
 */
export function predictNextRegime(
  currentState: number,
  transitionMatrix: number[][],
  horizon: number = 5
): { regime: number; probability: number }[][] {
  const numRegimes = transitionMatrix.length;
  const predictions: { regime: number; probability: number }[][] = [];

  let currentProb = new Array(numRegimes).fill(0);
  currentProb[currentState] = 1;

  for (let step = 0; step < horizon; step++) {
    const nextProb = new Array(numRegimes).fill(0);
    for (let j = 0; j < numRegimes; j++) {
      for (let i = 0; i < numRegimes; i++) {
        nextProb[j] += currentProb[i] * transitionMatrix[i][j];
      }
    }
    currentProb = nextProb;

    predictions.push(
      currentProb
        .map((prob, regime) => ({ regime, probability: Math.round(prob * 10000) / 10000 }))
        .sort((a, b) => b.probability - a.probability)
    );
  }

  return predictions;
}

/**
 * 计算体制持续时间分布
 */
export function regimeDurationDistribution(
  labels: number[],
  numRegimes: number
): Record<number, { mean: number; median: number; max: number; distribution: number[] }> {
  const durations: Record<number, number[]> = {};

  for (let r = 0; r < numRegimes; r++) {
    durations[r] = [];
  }

  let currentRegime = labels[0];
  let currentDuration = 1;

  for (let i = 1; i < labels.length; i++) {
    if (labels[i] === currentRegime) {
      currentDuration++;
    } else {
      durations[currentRegime].push(currentDuration);
      currentRegime = labels[i];
      currentDuration = 1;
    }
  }
  durations[currentRegime].push(currentDuration);

  const result: Record<number, { mean: number; median: number; max: number; distribution: number[] }> = {};

  for (let r = 0; r < numRegimes; r++) {
    const d = durations[r].sort((a, b) => a - b);
    result[r] = {
      mean: d.length > 0 ? Math.round(d.reduce((a, b) => a + b, 0) / d.length * 10) / 10 : 0,
      median: d.length > 0 ? d[Math.floor(d.length / 2)] : 0,
      max: d.length > 0 ? d[d.length - 1] : 0,
      distribution: d,
    };
  }

  return result;
}

/**
 * 检测体制转换预警信号
 */
export function regimeWarningSignals(
  returns: number[],
  analysis: RegimeAnalysis,
  window: number = 20
): {
  currentRegime: number;
  regimeAge: number;
  expectedRemaining: number;
  transitionRisk: Record<number, number>;
  warning: string;
} {
  const { currentState, regimes, transitionMatrix } = analysis;
  const currentRegime = currentState.regime;
  const regimeAge = currentState.duration;
  const avgDuration = regimes[currentRegime]?.avgDuration || 1;

  // 预期剩余天数（几何分布）
  const persistence = transitionMatrix[currentRegime][currentRegime];
  const expectedRemaining = persistence < 1 ? 1 / (1 - persistence) - regimeAge : Infinity;

  // 各体制转换风险
  const transitionRisk: Record<number, number> = {};
  for (let r = 0; r < transitionMatrix.length; r++) {
    if (r !== currentRegime) {
      // 随着持续时间增加，转换概率提升
      const baseRisk = transitionMatrix[currentRegime][r];
      const ageFactor = regimeAge > avgDuration ? 1 + (regimeAge - avgDuration) / avgDuration : 1;
      transitionRisk[r] = Math.min(1, baseRisk * ageFactor);
    }
  }

  // 警告信息
  let warning = '';
  if (regimeAge > avgDuration * 1.5) {
    warning = `${regimes[currentRegime]?.name}体制已持续${regimeAge}天，超过平均${avgDuration.toFixed(0)}天，转换概率增加`;
  }

  const maxTransitionRisk = Math.max(...Object.values(transitionRisk));
  if (maxTransitionRisk > 0.3) {
    const targetRegime = Object.entries(transitionRisk).find(([, v]) => v === maxTransitionRisk);
    if (targetRegime) {
      warning += ` 警惕转向${regimes[parseInt(targetRegime[0])]?.name}`;
    }
  }

  return {
    currentRegime,
    regimeAge,
    expectedRemaining: Math.round(expectedRemaining * 10) / 10,
    transitionRisk,
    warning: warning || '当前体制稳定',
  };
}
