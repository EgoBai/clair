/**
 * 股票相关性矩阵分析引擎
 * 计算股票间相关性、协方差、行业相关性聚类
 */

export interface PriceSeries {
  ticker: string;
  name: string;
  sector: string;
  prices: number[];
  returns: number[];
}

export interface CorrelationPair {
  ticker1: string;
  ticker2: string;
  correlation: number;
  covariance: number;
  beta1To2: number;
  beta2To1: number;
}

export interface CorrelationMatrix {
  tickers: string[];
  matrix: number[][];
  date: string;
  period: number;
}

export interface ClusterResult {
  clusterId: number;
  tickers: string[];
  avgIntraCorrelation: number;
  dominantSector: string;
}

export interface DivergenceAlert {
  ticker1: string;
  ticker2: string;
  expectedCorrelation: number;
  actualCorrelation: number;
  divergence: number;
  signal: 'converge' | 'diverge';
}

export function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(prices[i - 1] !== 0 ? (prices[i] - prices[i - 1]) / prices[i - 1] : 0);
  }
  return returns;
}

export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = calculateMean(values);
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function calculateCovariance(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const meanX = calculateMean(x.slice(0, n));
  const meanY = calculateMean(y.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (x[i] - meanX) * (y[i] - meanY);
  }
  return sum / (n - 1);
}

export function calculateCorrelation(x: number[], y: number[]): number {
  const cov = calculateCovariance(x, y);
  const stdX = calculateStdDev(x);
  const stdY = calculateStdDev(y);
  if (stdX === 0 || stdY === 0) return 0;
  return Math.max(-1, Math.min(1, cov / (stdX * stdY)));
}

export function calculateBeta(stockReturns: number[], marketReturns: number[]): number {
  const cov = calculateCovariance(stockReturns, marketReturns);
  const marketVar = calculateCovariance(marketReturns, marketReturns);
  return marketVar !== 0 ? cov / marketVar : 0;
}

export function buildCorrelationMatrix(series: PriceSeries[]): CorrelationMatrix {
  const tickers = series.map(s => s.ticker);
  const n = tickers.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const corr = calculateCorrelation(series[i].returns, series[j].returns);
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }
  
  return {
    tickers,
    matrix,
    date: new Date().toISOString().split('T')[0],
    period: series.length > 0 ? series[0].returns.length : 0,
  };
}

export function analyzeCorrelationPair(s1: PriceSeries, s2: PriceSeries): CorrelationPair {
  const correlation = calculateCorrelation(s1.returns, s2.returns);
  const covariance = calculateCovariance(s1.returns, s2.returns);
  const beta1To2 = calculateBeta(s1.returns, s2.returns);
  const beta2To1 = calculateBeta(s2.returns, s1.returns);
  
  return {
    ticker1: s1.ticker,
    ticker2: s2.ticker,
    correlation,
    covariance,
    beta1To2,
    beta2To1,
  };
}

export function findHighCorrelationPairs(
  matrix: CorrelationMatrix,
  threshold: number = 0.7
): CorrelationPair[] {
  const pairs: CorrelationPair[] = [];
  const n = matrix.tickers.length;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix.matrix[i][j]) >= threshold) {
        pairs.push({
          ticker1: matrix.tickers[i],
          ticker2: matrix.tickers[j],
          correlation: matrix.matrix[i][j],
          covariance: 0,
          beta1To2: 0,
          beta2To1: 0,
        });
      }
    }
  }
  
  return pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

export function findLowCorrelationPairs(
  matrix: CorrelationMatrix,
  threshold: number = 0.2
): CorrelationPair[] {
  const pairs: CorrelationPair[] = [];
  const n = matrix.tickers.length;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix.matrix[i][j]) <= threshold) {
        pairs.push({
          ticker1: matrix.tickers[i],
          ticker2: matrix.tickers[j],
          correlation: matrix.matrix[i][j],
          covariance: 0,
          beta1To2: 0,
          beta2To1: 0,
        });
      }
    }
  }
  
  return pairs.sort((a, b) => Math.abs(a.correlation) - Math.abs(b.correlation));
}

export function clusterByCorrelation(
  matrix: CorrelationMatrix,
  series: PriceSeries[],
  minCorrelation: number = 0.5,
  minClusterSize: number = 2
): ClusterResult[] {
  const n = matrix.tickers.length;
  const visited = new Set<number>();
  const clusters: ClusterResult[] = [];
  let clusterId = 0;
  
  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    
    const cluster: number[] = [i];
    visited.add(i);
    
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      const avgCorr = cluster.reduce((s, c) => s + matrix.matrix[c][j], 0) / cluster.length;
      if (avgCorr >= minCorrelation) {
        cluster.push(j);
        visited.add(j);
      }
    }
    
    if (cluster.length >= minClusterSize) {
      const tickers = cluster.map(c => matrix.tickers[c]);
      
      // Calculate average intra-correlation
      let totalCorr = 0;
      let count = 0;
      for (let a = 0; a < cluster.length; a++) {
        for (let b = a + 1; b < cluster.length; b++) {
          totalCorr += matrix.matrix[cluster[a]][cluster[b]];
          count++;
        }
      }
      const avgIntraCorrelation = count > 0 ? totalCorr / count : 0;
      
      // Find dominant sector
      const sectorCount = new Map<string, number>();
      for (const t of tickers) {
        const s = series.find(sr => sr.ticker === t);
        if (s) sectorCount.set(s.sector, (sectorCount.get(s.sector) || 0) + 1);
      }
      let dominantSector = 'unknown';
      let maxCount = 0;
      sectorCount.forEach((count, sector) => {
        if (count > maxCount) { maxCount = count; dominantSector = sector; }
      });
      
      clusters.push({ clusterId: clusterId++, tickers, avgIntraCorrelation, dominantSector });
    }
  }
  
  return clusters.sort((a, b) => b.avgIntraCorrelation - a.avgIntraCorrelation);
}

export function detectDivergence(
  series1: PriceSeries,
  series2: PriceSeries,
  windowSize: number = 20,
  lookback: number = 60
): DivergenceAlert | null {
  if (series1.returns.length < lookback || series2.returns.length < lookback) return null;
  
  const historicalReturns1 = series1.returns.slice(0, -windowSize);
  const historicalReturns2 = series2.returns.slice(0, -windowSize);
  const expectedCorrelation = calculateCorrelation(historicalReturns1, historicalReturns2);
  
  const recentReturns1 = series1.returns.slice(-windowSize);
  const recentReturns2 = series2.returns.slice(-windowSize);
  const actualCorrelation = calculateCorrelation(recentReturns1, recentReturns2);
  
  const divergence = actualCorrelation - expectedCorrelation;
  
  if (Math.abs(divergence) > 0.3) {
    return {
      ticker1: series1.ticker,
      ticker2: series2.ticker,
      expectedCorrelation,
      actualCorrelation,
      divergence,
      signal: divergence > 0 ? 'converge' : 'diverge',
    };
  }
  
  return null;
}

export function calculateRollingCorrelation(
  x: number[],
  y: number[],
  window: number = 20
): number[] {
  const result: number[] = [];
  const n = Math.min(x.length, y.length);
  
  for (let i = window; i <= n; i++) {
    const xSlice = x.slice(i - window, i);
    const ySlice = y.slice(i - window, i);
    result.push(calculateCorrelation(xSlice, ySlice));
  }
  
  return result;
}

export function findDiversifiers(
  matrix: CorrelationMatrix,
  targetTicker: string,
  maxCorrelation: number = 0.3
): string[] {
  const idx = matrix.tickers.indexOf(targetTicker);
  if (idx === -1) return [];
  
  return matrix.tickers.filter((t, i) => 
    i !== idx && Math.abs(matrix.matrix[idx][i]) <= maxCorrelation
  );
}

export function calculatePortfolioCorrelationRisk(
  matrix: CorrelationMatrix,
  weights: number[]
): number {
  const n = matrix.tickers.length;
  if (n !== weights.length) return 0;
  
  let totalCorr = 0;
  let pairCount = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      totalCorr += matrix.matrix[i][j] * weights[i] * weights[j];
      pairCount++;
    }
  }
  
  return pairCount > 0 ? totalCorr : 0;
}
