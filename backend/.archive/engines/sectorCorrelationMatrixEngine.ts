/**
 * 行业相关性矩阵引擎
 * 计算行业板块间的动态相关性
 */

export interface SectorReturnData {
  sector: string;
  returns: number[];
  timestamps: number[];
}

export interface CorrelationResult {
  sectorA: string;
  sectorB: string;
  correlation: number;
  rollingCorrelation: number[];
  isDiverging: boolean;
  divergenceMagnitude: number;
}

export interface CorrelationMatrix {
  sectors: string[];
  matrix: number[][];
  timestamp: number;
  avgCorrelation: number;
  eigenPortfolio: number[];
}

export interface CorrelationRegime {
  period: [number, number];
  avgCorrelation: number;
  regime: 'low' | 'normal' | 'high' | 'crisis';
  sectorDispersion: number;
}

/**
 * 计算Pearson相关系数
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const meanX = xSlice.reduce((s, v) => s + v, 0) / n;
  const meanY = ySlice.reduce((s, v) => s + v, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den > 1e-10 ? num / den : 0;
}

/**
 * Spearman秩相关系数
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const rank = (arr: number[]): number[] => {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    for (let i = 0; i < indexed.length; i++) {
      ranks[indexed[i].i] = i + 1;
    }
    return ranks;
  };

  return pearsonCorrelation(rank(x.slice(0, n)), rank(y.slice(0, n)));
}

/**
 * 滚动相关系数
 */
export function rollingCorrelation(
  x: number[],
  y: number[],
  window: number,
): number[] {
  const n = Math.min(x.length, y.length);
  if (n < window) return [];

  const result: number[] = [];
  for (let i = window - 1; i < n; i++) {
    result.push(pearsonCorrelation(
      x.slice(i - window + 1, i + 1),
      y.slice(i - window + 1, i + 1),
    ));
  }
  return result;
}

/**
 * 构建行业相关性矩阵
 */
export function buildCorrelationMatrix(
  sectors: SectorReturnData[],
  window?: number,
): CorrelationMatrix {
  const n = sectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let corr: number;
      if (i === j) {
        corr = 1;
      } else if (window) {
        const minLen = Math.min(sectors[i].returns.length, sectors[j].returns.length);
        corr = pearsonCorrelation(
          sectors[i].returns.slice(-window),
          sectors[j].returns.slice(-window),
        );
      } else {
        corr = pearsonCorrelation(sectors[i].returns, sectors[j].returns);
      }
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }

  // 平均相关性（排除对角线）
  let totalCorr = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      totalCorr += matrix[i][j];
      count++;
    }
  }
  const avgCorrelation = count > 0 ? totalCorr / count : 0;

  // 特征组合（等权近似）
  const eigenPortfolio = new Array(n).fill(1 / n);

  return {
    sectors: sectors.map(s => s.sector),
    matrix,
    timestamp: Date.now(),
    avgCorrelation,
    eigenPortfolio,
  };
}

/**
 * 检测相关性背离
 */
export function detectCorrelationDivergence(
  corrResult: CorrelationResult,
  threshold = 0.3,
): boolean {
  if (corrResult.rollingCorrelation.length < 2) return false;

  const recent = corrResult.rollingCorrelation.slice(-5);
  const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
  return Math.abs(corrResult.correlation - avg) > threshold;
}

/**
 * 分析行业配对相关性
 */
export function analyzeSectorPair(
  sectorA: SectorReturnData,
  sectorB: SectorReturnData,
  rollingWindow = 20,
): CorrelationResult {
  const correlation = pearsonCorrelation(sectorA.returns, sectorB.returns);
  const rollingCorr = rollingCorrelation(sectorA.returns, sectorB.returns, rollingWindow);

  let divergenceMagnitude = 0;
  if (rollingCorr.length >= 5) {
    const recent = rollingCorr.slice(-5);
    const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
    divergenceMagnitude = Math.abs(correlation - avg);
  }

  return {
    sectorA: sectorA.sector,
    sectorB: sectorB.sector,
    correlation,
    rollingCorrelation: rollingCorr,
    isDiverging: divergenceMagnitude > 0.3,
    divergenceMagnitude,
  };
}

/**
 * 检测相关性regime
 */
export function detectCorrelationRegime(
  corrMatrix: CorrelationMatrix,
  timestamps: number[],
  windowSize = 60,
): CorrelationRegime[] {
  const regimes: CorrelationRegime[] = [];
  const n = corrMatrix.sectors.length;

  // 简化：按时间段分段
  const step = Math.max(1, Math.floor(timestamps.length / windowSize));
  for (let start = 0; start < timestamps.length; start += step) {
    const end = Math.min(start + step, timestamps.length);
    if (end - start < 5) continue;

    // 计算该段的平均波动率离散度
    let dispersion = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        dispersion += (corrMatrix.matrix[i][j] - corrMatrix.avgCorrelation) ** 2;
      }
    }
    dispersion = Math.sqrt(dispersion / (n * (n - 1) / 2));

    let regime: CorrelationRegime['regime'];
    if (corrMatrix.avgCorrelation > 0.7) regime = 'crisis';
    else if (corrMatrix.avgCorrelation > 0.4) regime = 'high';
    else if (corrMatrix.avgCorrelation > 0.1) regime = 'normal';
    else regime = 'low';

    regimes.push({
      period: [timestamps[start], timestamps[end - 1]],
      avgCorrelation: corrMatrix.avgCorrelation,
      regime,
      sectorDispersion: dispersion,
    });
  }

  return regimes;
}

/**
 * 计算去相关化收益
 */
export function computeDecorrelatedReturns(
  returns: Record<string, number[]>,
): Record<string, number[]> {
  const sectors = Object.keys(returns);
  const sectorData: SectorReturnData[] = sectors.map(s => ({
    sector: s,
    returns: returns[s],
    timestamps: [],
  }));

  const corrMatrix = buildCorrelationMatrix(sectorData);
  const n = sectors.length;

  // 简单正交化：减去等权市场组合的投影
  const marketReturns: number[] = [];
  const minLen = Math.min(...sectors.map(s => returns[s].length));

  for (let t = 0; t < minLen; t++) {
    let sum = 0;
    for (const s of sectors) sum += returns[s][t];
    marketReturns.push(sum / n);
  }

  const result: Record<string, number[]> = {};
  for (const s of sectors) {
    const beta = pearsonCorrelation(returns[s], marketReturns);
    result[s] = returns[s].map((r, t) => r - beta * marketReturns[t]);
  }

  return result;
}
