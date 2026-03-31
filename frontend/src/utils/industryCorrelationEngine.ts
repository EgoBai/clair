/**
 * 行业相关性矩阵引擎
 * 计算行业间收益率相关性、领先滞后关系、联动强度
 */

export interface IndustryReturns {
  name: string;
  returns: number[];
}

export interface CorrelationPair {
  industry1: string;
  industry2: string;
  correlation: number;
  leadLag: number; // 正值表示industry1领先
  strength: 'strong' | 'moderate' | 'weak';
}

export interface CorrelationMatrix {
  industries: string[];
  matrix: number[][];
  pairs: CorrelationPair[];
  clusters: string[][];
  averageCorrelation: number;
}

/**
 * Pearson相关系数
 */
function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i] - mx, yi = y[i] - my;
    num += xi * yi;
    dx += xi * xi;
    dy += yi * yi;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 0 ? num / denom : 0;
}

/**
 * 交叉相关（领先滞后分析）
 */
function crossCorrelation(x: number[], y: number[], maxLag: number = 5): { lag: number; corr: number } {
  let bestLag = 0, bestCorr = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const n = Math.min(x.length, y.length) - Math.abs(lag);
    if (n < 3) continue;
    const xs = lag >= 0 ? x.slice(lag, lag + n) : x.slice(0, n);
    const ys = lag >= 0 ? y.slice(0, n) : y.slice(-lag, -lag + n);
    const c = Math.abs(pearson(xs, ys));
    if (c > bestCorr) { bestCorr = c; bestLag = lag; }
  }
  return { lag: bestLag, corr: bestCorr };
}

/**
 * 构建行业相关性矩阵
 */
export function buildCorrelationMatrix(industries: IndustryReturns[]): CorrelationMatrix {
  const names = industries.map(i => i.name);
  const n = names.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const pairs: CorrelationPair[] = [];

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const corr = pearson(industries[i].returns, industries[j].returns);
      matrix[i][j] = corr;
      matrix[j][i] = corr;
      const { lag } = crossCorrelation(industries[i].returns, industries[j].returns);
      const absCorr = Math.abs(corr);
      pairs.push({
        industry1: names[i],
        industry2: names[j],
        correlation: Math.round(corr * 1000) / 1000,
        leadLag: lag,
        strength: absCorr > 0.7 ? 'strong' : absCorr > 0.4 ? 'moderate' : 'weak',
      });
    }
  }

  // 聚类 (简单贪心)
  const clusters: string[][] = [];
  const visited = new Set<string>();
  for (const pair of pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))) {
    if (Math.abs(pair.correlation) < 0.5) break;
    if (!visited.has(pair.industry1) || !visited.has(pair.industry2)) {
      const existing = clusters.find(c => c.includes(pair.industry1) || c.includes(pair.industry2));
      if (existing) {
        if (!existing.includes(pair.industry1)) existing.push(pair.industry1);
        if (!existing.includes(pair.industry2)) existing.push(pair.industry2);
      } else {
        clusters.push([pair.industry1, pair.industry2]);
      }
      visited.add(pair.industry1);
      visited.add(pair.industry2);
    }
  }

  const avgCorr = pairs.reduce((s, p) => s + Math.abs(p.correlation), 0) / Math.max(1, pairs.length);

  return {
    industries: names,
    matrix,
    pairs: pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)),
    clusters,
    averageCorrelation: Math.round(avgCorr * 1000) / 1000,
  };
}

/**
 * 行业联动强度分析
 */
export function industryLinkageStrength(matrix: CorrelationMatrix): {
  industry: string;
  linkageScore: number;
  connectedIndustries: string[];
}[] {
  const { industries, matrix: m } = matrix;
  return industries.map((name, i) => {
    const correlations = m[i].filter((_, j) => j !== i);
    const linkageScore = correlations.reduce((s, c) => s + Math.abs(c), 0) / Math.max(1, correlations.length);
    const connected = industries.filter((_, j) => j !== i && Math.abs(m[i][j]) > 0.5);
    return {
      industry: name,
      linkageScore: Math.round(linkageScore * 1000) / 1000,
      connectedIndustries: connected,
    };
  }).sort((a, b) => b.linkageScore - a.linkageScore);
}
