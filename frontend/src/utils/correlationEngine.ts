/**
 * 相关性分析引擎
 * 支持: 滚动相关、DCC-GARCH简化、相关性聚类、主成分分析
 */

export interface CorrelationResult {
  matrix: number[][];
  symbols: string[];
  avgCorrelation: number;
  eigenvalues: number[];
  principalComponents: number[][];
  explainedVariance: number[];
  clusters: CorrelationCluster[];
}

export interface CorrelationCluster {
  id: number;
  symbols: string[];
  avgIntraCorrelation: number;
  centroid: number[];
}

export interface RollingCorrelation {
  index: number;
  correlation: number;
  zScore: number;
}

export interface CorrelationRegime {
  period: [number, number];
  avgCorrelation: number;
  regime: 'low' | 'medium' | 'high';
  stability: number;
}

/**
 * 计算相关系数矩阵
 */
export function calculateCorrelationMatrix(
  returns: Map<string, number[]>
): CorrelationResult {
  const symbols = Array.from(returns.keys());
  const n = symbols.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const corr = pearsonCorrelation(
        returns.get(symbols[i])!,
        returns.get(symbols[j])!
      );
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }

  // 平均相关性 (不含对角线)
  let totalCorr = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      totalCorr += matrix[i][j];
      count++;
    }
  }
  const avgCorrelation = count > 0 ? totalCorr / count : 0;

  // 特征值分解 (幂迭代法)
  const { eigenvalues, eigenvectors } = powerIteration(matrix, Math.min(n, 5));
  const totalEigenvalue = eigenvalues.reduce((a, b) => a + b, 0);
  const explainedVariance = eigenvalues.map(e => totalEigenvalue > 0 ? e / totalEigenvalue : 0);

  // 相关性聚类
  const clusters = hierarchicalClustering(symbols, matrix, 3);

  return {
    matrix,
    symbols,
    avgCorrelation,
    eigenvalues,
    principalComponents: eigenvectors,
    explainedVariance,
    clusters
  };
}

/**
 * 滚动相关系数
 */
export function calculateRollingCorrelation(
  seriesA: number[],
  seriesB: number[],
  windowSize: number
): RollingCorrelation[] {
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < windowSize) return [];

  const results: RollingCorrelation[] = [];
  const allCorrs: number[] = [];

  for (let i = windowSize; i <= n; i++) {
    const a = seriesA.slice(i - windowSize, i);
    const b = seriesB.slice(i - windowSize, i);
    const corr = pearsonCorrelation(a, b);
    allCorrs.push(corr);
    results.push({ index: i - 1, correlation: corr, zScore: 0 });
  }

  // 计算z-score
  const mean = allCorrs.reduce((a, b) => a + b, 0) / allCorrs.length;
  const std = Math.sqrt(allCorrs.reduce((a, c) => a + (c - mean) ** 2, 0) / (allCorrs.length - 1));

  for (let i = 0; i < results.length; i++) {
    results[i].zScore = std > 0 ? (allCorrs[i] - mean) / std : 0;
  }

  return results;
}

/**
 * 相关性regime检测
 */
export function detectCorrelationRegime(
  rollingCorrs: RollingCorrelation[],
  windowSize: number = 60
): CorrelationRegime[] {
  if (rollingCorrs.length < windowSize) return [];

  const regimes: CorrelationRegime[] = [];

  for (let i = windowSize; i <= rollingCorrs.length; i += windowSize) {
    const window = rollingCorrs.slice(i - windowSize, i);
    const corrs = window.map(w => w.correlation);
    const avg = corrs.reduce((a, b) => a + b, 0) / corrs.length;
    const std = Math.sqrt(corrs.reduce((a, c) => a + (c - avg) ** 2, 0) / (corrs.length - 1));

    let regime: CorrelationRegime['regime'] = 'medium';
    if (avg < 0.3) regime = 'low';
    else if (avg > 0.6) regime = 'high';

    regimes.push({
      period: [window[0].index, window[window.length - 1].index],
      avgCorrelation: avg,
      regime,
      stability: 1 - Math.min(1, std * 2)
    });
  }

  return regimes;
}

/**
 * 最小生成树 (MST) 用于资产关系图
 */
export function minimumSpanningTree(
  symbols: string[],
  correlationMatrix: number[][]
): { from: string; to: string; distance: number }[] {
  const n = symbols.length;
  if (n < 2) return [];

  // 距离 = sqrt(2 * (1 - correlation))
  const distances: number[][] = correlationMatrix.map(row =>
    row.map(c => Math.sqrt(2 * (1 - c)))
  );

  const edges: { from: string; to: string; distance: number }[] = [];
  const inTree: boolean[] = new Array(n).fill(false);
  const minDist: number[] = new Array(n).fill(Infinity);
  const parent: number[] = new Array(n).fill(-1);

  minDist[0] = 0;

  for (let i = 0; i < n; i++) {
    let u = -1;
    for (let v = 0; v < n; v++) {
      if (!inTree[v] && (u === -1 || minDist[v] < minDist[u])) {
        u = v;
      }
    }

    inTree[u] = true;

    if (parent[u] !== -1) {
      edges.push({
        from: symbols[parent[u]],
        to: symbols[u],
        distance: distances[parent[u]][u]
      });
    }

    for (let v = 0; v < n; v++) {
      if (!inTree[v] && distances[u][v] < minDist[v]) {
        minDist[v] = distances[u][v];
        parent[v] = u;
      }
    }
  }

  return edges;
}

/**
 * 相关性稳定性测试
 */
export function correlationStabilityTest(
  seriesA: number[],
  seriesB: number[],
  windowSize: number = 60,
  numBootstrap: number = 100
): {
  meanCorrelation: number;
  stdCorrelation: number;
  ci95Lower: number;
  ci95Upper: number;
  isStable: boolean;
} {
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < windowSize) {
    return { meanCorrelation: 0, stdCorrelation: 0, ci95Lower: 0, ci95Upper: 0, isStable: false };
  }

  const bootstrapCorrs: number[] = [];
  for (let b = 0; b < numBootstrap; b++) {
    const start = Math.floor(Math.random() * (n - windowSize));
    const a = seriesA.slice(start, start + windowSize);
    const bSeries = seriesB.slice(start, start + windowSize);
    bootstrapCorrs.push(pearsonCorrelation(a, bSeries));
  }

  const mean = bootstrapCorrs.reduce((a, b) => a + b, 0) / bootstrapCorrs.length;
  const std = Math.sqrt(bootstrapCorrs.reduce((a, c) => a + (c - mean) ** 2, 0) / (bootstrapCorrs.length - 1));

  const sorted = [...bootstrapCorrs].sort((a, b) => a - b);
  const ci95Lower = sorted[Math.floor(sorted.length * 0.025)];
  const ci95Upper = sorted[Math.floor(sorted.length * 0.975)];

  // 稳定性: 置信区间宽度
  const isStable = (ci95Upper - ci95Lower) < 0.5;

  return { meanCorrelation: mean, stdCorrelation: std, ci95Lower, ci95Upper, isStable };
}

// ===== Helpers =====

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den > 0 ? num / den : 0;
}

function powerIteration(
  matrix: number[][],
  numComponents: number
): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = matrix.length;
  if (n === 0) return { eigenvalues: [], eigenvectors: [] };

  const eigenvalues: number[] = [];
  const eigenvectors: number[][] = [];
  const workingMatrix = matrix.map(row => [...row]);

  for (let comp = 0; comp < numComponents; comp++) {
    let v = Array.from({ length: n }, () => Math.random());

    for (let iter = 0; iter < 100; iter++) {
      const Av = workingMatrix.map(row =>
        row.reduce((sum, val, i) => sum + val * v[i], 0)
      );
      const norm = Math.sqrt(Av.reduce((sum, val) => sum + val * val, 0));
      if (norm < 1e-10) break;
      v = Av.map(val => val / norm);
    }

    const eigenvalue = v.reduce((sum, vi, i) =>
      sum + vi * workingMatrix[i].reduce((s, val, j) => s + val * v[j], 0), 0
    );

    eigenvalues.push(eigenvalue);
    eigenvectors.push(v);

    // 减去已提取的成分
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        workingMatrix[i][j] -= eigenvalue * v[i] * v[j];
      }
    }
  }

  return { eigenvalues, eigenvectors };
}

function hierarchicalClustering(
  symbols: string[],
  corrMatrix: number[][],
  maxClusters: number
): CorrelationCluster[] {
  const n = symbols.length;
  if (n === 0) return [];

  // 初始化: 每个资产一个簇
  let clusters: { symbols: string[]; indices: number[] }[] = symbols.map((s, i) => ({
    symbols: [s],
    indices: [i]
  }));

  while (clusters.length > maxClusters) {
    // 找最相关的两个簇
    let bestI = 0, bestJ = 1, bestCorr = -Infinity;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        let totalCorr = 0;
        let count = 0;
        for (const a of clusters[i].indices) {
          for (const b of clusters[j].indices) {
            totalCorr += corrMatrix[a][b];
            count++;
          }
        }
        const avgCorr = count > 0 ? totalCorr / count : 0;
        if (avgCorr > bestCorr) {
          bestCorr = avgCorr;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // 合并
    clusters[bestI] = {
      symbols: [...clusters[bestI].symbols, ...clusters[bestJ].symbols],
      indices: [...clusters[bestI].indices, ...clusters[bestJ].indices]
    };
    clusters.splice(bestJ, 1);
  }

  return clusters.map((cluster, id) => {
    // 计算簇内平均相关性
    let totalCorr = 0;
    let count = 0;
    for (let i = 0; i < cluster.indices.length; i++) {
      for (let j = i + 1; j < cluster.indices.length; j++) {
        totalCorr += corrMatrix[cluster.indices[i]][cluster.indices[j]];
        count++;
      }
    }

    return {
      id,
      symbols: cluster.symbols,
      avgIntraCorrelation: count > 0 ? totalCorr / count : 0,
      centroid: cluster.indices.map(i => corrMatrix[i].reduce((a, b) => a + b, 0) / n)
    };
  });
}
