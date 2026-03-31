/**
 * 板块相关性分析引擎
 * - 板块间相关系数计算
 * - 动态相关性(滚动窗口)
 * - 相关性聚类
 * - 分散化评分
 */

export interface CorrelationMatrix {
  sectors: string[];
  matrix: number[][];
}

export interface CorrelationChange {
  sector1: string;
  sector2: string;
  currentCorr: number;
  previousCorr: number;
  change: number;
  regime: 'increasing' | 'decreasing' | 'stable';
}

export interface Cluster {
  members: string[];
  avgIntraCorrelation: number;
  representativeSector: string;
}

export interface DiversificationResult {
  score: number;           // 0-100
  maxCorrelation: number;
  avgCorrelation: number;
  independentPairs: Array<[string, string]>;
  correlatedPairs: Array<[string, string, number]>;
}

export class SectorCorrelationEngine {
  /**
   * 计算两列数据的相关系数
   */
  pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
    const yMean = ySlice.reduce((a, b) => a + b, 0) / n;

    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xSlice[i] - xMean;
      const dy = ySlice[i] - yMean;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const den = Math.sqrt(denX * denY);
    return den > 0 ? Math.round(num / den * 10000) / 10000 : 0;
  }

  /**
   * 计算相关性矩阵
   */
  computeCorrelationMatrix(returns: Record<string, number[]>): CorrelationMatrix {
    const sectors = Object.keys(returns);
    const n = sectors.length;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const corr = this.pearsonCorrelation(returns[sectors[i]], returns[sectors[j]]);
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }

    return { sectors, matrix };
  }

  /**
   * 检测相关性变化
   */
  detectCorrelationChanges(
    currentReturns: Record<string, number[]>,
    previousReturns: Record<string, number[]>,
    threshold: number = 0.3,
  ): CorrelationChange[] {
    const sectors = Object.keys(currentReturns);
    const changes: CorrelationChange[] = [];

    for (let i = 0; i < sectors.length; i++) {
      for (let j = i + 1; j < sectors.length; j++) {
        const currentCorr = this.pearsonCorrelation(currentReturns[sectors[i]], currentReturns[sectors[j]]);
        const previousCorr = previousReturns[sectors[i]] && previousReturns[sectors[j]]
          ? this.pearsonCorrelation(previousReturns[sectors[i]], previousReturns[sectors[j]])
          : currentCorr;

        const change = currentCorr - previousCorr;

        if (Math.abs(change) >= threshold) {
          let regime: 'increasing' | 'decreasing' | 'stable';
          if (change > threshold) regime = 'increasing';
          else if (change < -threshold) regime = 'decreasing';
          else regime = 'stable';

          changes.push({
            sector1: sectors[i],
            sector2: sectors[j],
            currentCorr: Math.round(currentCorr * 10000) / 10000,
            previousCorr: Math.round(previousCorr * 10000) / 10000,
            change: Math.round(change * 10000) / 10000,
            regime,
          });
        }
      }
    }

    return changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }

  /**
   * 相关性聚类(简化层次聚类)
   */
  clusterSectors(corrMatrix: CorrelationMatrix, threshold: number = 0.5): Cluster[] {
    const { sectors, matrix } = corrMatrix;
    const n = sectors.length;
    const visited = new Set<number>();
    const clusters: Cluster[] = [];

    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;

      const members: number[] = [i];
      visited.add(i);

      for (let j = i + 1; j < n; j++) {
        if (!visited.has(j) && matrix[i][j] >= threshold) {
          members.push(j);
          visited.add(j);
        }
      }

      const memberNames = members.map(m => sectors[m]);
      let totalCorr = 0, pairCount = 0;
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          totalCorr += matrix[members[a]][members[b]];
          pairCount++;
        }
      }

      // 代表性板块 = 与其他成员平均相关性最高的
      let bestSector = memberNames[0];
      let bestAvg = 0;
      for (const mi of members) {
        const avg = members.filter(m => m !== mi).reduce((s, m) => s + matrix[mi][m], 0) / Math.max(1, members.length - 1);
        if (avg > bestAvg) { bestAvg = avg; bestSector = sectors[mi]; }
      }

      clusters.push({
        members: memberNames,
        avgIntraCorrelation: pairCount > 0 ? Math.round(totalCorr / pairCount * 10000) / 10000 : 1,
        representativeSector: bestSector,
      });
    }

    return clusters.sort((a, b) => b.members.length - a.members.length);
  }

  /**
   * 分散化评分
   */
  assessDiversification(corrMatrix: CorrelationMatrix, portfolioSectors: string[]): DiversificationResult {
    const { sectors, matrix } = corrMatrix;
    const indices = portfolioSectors.map(s => sectors.indexOf(s)).filter(i => i >= 0);

    let totalCorr = 0, maxCorr = -1, pairCount = 0;
    const independentPairs: Array<[string, string]> = [];
    const correlatedPairs: Array<[string, string, number]> = [];

    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const corr = Math.abs(matrix[indices[i]][indices[j]]);
        totalCorr += corr;
        maxCorr = Math.max(maxCorr, corr);
        pairCount++;

        if (corr < 0.3) independentPairs.push([portfolioSectors[i], portfolioSectors[j]]);
        else if (corr > 0.7) correlatedPairs.push([portfolioSectors[i], portfolioSectors[j], Math.round(corr * 10000) / 10000]);
      }
    }

    const avgCorr = pairCount > 0 ? totalCorr / pairCount : 0;
    const score = Math.round((1 - avgCorr) * 100);

    return {
      score: Math.max(0, Math.min(100, score)),
      maxCorrelation: Math.round(maxCorr * 10000) / 10000,
      avgCorrelation: Math.round(avgCorr * 10000) / 10000,
      independentPairs,
      correlatedPairs,
    };
  }
}

export default new SectorCorrelationEngine();
