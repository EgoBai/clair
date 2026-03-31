/**
 * 跨资产相关性引擎
 * - 股债相关性
 * - 股金相关性
 * - 股汇相关性(USD/CNY)
 * - 行业间相关性矩阵
 * - 相关性时变分析
 * - 避险模式检测
 * - 资产配置建议
 */

export interface AssetCorrelation {
  asset1: string;
  asset2: string;
  correlation: number;
  rollingCorrelation: number;
  trend: 'strengthening' | 'weakening' | 'stable';
  significance: number;
}

export interface CorrelationMatrix {
  assets: string[];
  matrix: number[][];
  avgCorrelation: number;
  maxCorrelation: number;
  minCorrelation: number;
  diversificationRatio: number;
}

export interface SafeHavenStatus {
  isSafeHavenMode: boolean;
  goldSignal: number; // -100到100
  bondSignal: number;
  dollarSignal: number;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export interface AssetAllocationHint {
  equityWeight: number;
  bondWeight: number;
  goldWeight: number;
  cashWeight: number;
  reasoning: string;
}

export class CrossAssetCorrelationEngine {
  /**
   * 计算两个资产的相关性
   */
  calcCorrelation(
    returns1: number[],
    returns2: number[],
    lookback: number = 60,
  ): AssetCorrelation {
    const n = Math.min(returns1.length, returns2.length, lookback);
    if (n < 10) {
      return { asset1: '', asset2: '', correlation: 0, rollingCorrelation: 0, trend: 'stable', significance: 0 };
    }

    const r1 = returns1.slice(-n);
    const r2 = returns2.slice(-n);

    const corr = this.pearsonCorr(r1, r2);

    // 滚动相关性(后半段)
    const mid = Math.floor(n / 2);
    const rollingCorr = this.pearsonCorr(r1.slice(mid), r2.slice(mid));
    const firstHalfCorr = this.pearsonCorr(r1.slice(0, mid), r2.slice(0, mid));

    let trend: AssetCorrelation['trend'];
    if (rollingCorr - firstHalfCorr > 0.15) trend = 'strengthening';
    else if (rollingCorr - firstHalfCorr < -0.15) trend = 'weakening';
    else trend = 'stable';

    // 简化显著性
    const tStat = corr * Math.sqrt((n - 2) / (1 - corr * corr + 1e-10));
    const significance = Math.min(100, Math.abs(tStat) * 10);

    return {
      asset1: '',
      asset2: '',
      correlation: Math.round(corr * 10000) / 10000,
      rollingCorrelation: Math.round(rollingCorr * 10000) / 10000,
      trend,
      significance: Math.round(significance * 10) / 10,
    };
  }

  /**
   * 相关性矩阵
   */
  calcCorrelationMatrix(
    returnsMap: Record<string, number[]>,
    lookback: number = 60,
  ): CorrelationMatrix {
    const assets = Object.keys(returnsMap);
    const n = assets.length;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const corr = this.pearsonCorr(
          returnsMap[assets[i]].slice(-lookback),
          returnsMap[assets[j]].slice(-lookback),
        );
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }

    const allCorrs: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        allCorrs.push(matrix[i][j]);
      }
    }

    const avgCorrelation = allCorrs.length > 0 ? allCorrs.reduce((a, b) => a + b, 0) / allCorrs.length : 0;
    const maxCorrelation = allCorrs.length > 0 ? Math.max(...allCorrs) : 0;
    const minCorrelation = allCorrs.length > 0 ? Math.min(...allCorrs) : 0;

    // 分散化比率
    const diversificationRatio = 1 - Math.abs(avgCorrelation);

    return {
      assets,
      matrix: matrix.map(row => row.map(v => Math.round(v * 10000) / 10000)),
      avgCorrelation: Math.round(avgCorrelation * 10000) / 10000,
      maxCorrelation: Math.round(maxCorrelation * 10000) / 10000,
      minCorrelation: Math.round(minCorrelation * 10000) / 10000,
      diversificationRatio: Math.round(diversificationRatio * 10000) / 10000,
    };
  }

  /**
   * 避险模式检测
   */
  detectSafeHaven(
    stockReturns: number[],
    goldReturns: number[],
    bondReturns: number[],
    dollarReturns: number[],
  ): SafeHavenStatus {
    const lookback = 20;
    const stockMom = stockReturns.length >= lookback
      ? stockReturns.slice(-lookback).reduce((a, b) => a + b, 0) : 0;
    const goldMom = goldReturns.length >= lookback
      ? goldReturns.slice(-lookback).reduce((a, b) => a + b, 0) : 0;
    const bondMom = bondReturns.length >= lookback
      ? bondReturns.slice(-lookback).reduce((a, b) => a + b, 0) : 0;
    const dollarMom = dollarReturns.length >= lookback
      ? dollarReturns.slice(-lookback).reduce((a, b) => a + b, 0) : 0;

    const goldSignal = (goldMom - stockMom) * 5000;
    const bondSignal = (bondMom - stockMom) * 5000;
    const dollarSignal = dollarMom * 5000;

    const riskScore = -(goldSignal + bondSignal + dollarSignal) / 3;
    const isSafeHavenMode = riskScore < -20;

    let riskLevel: SafeHavenStatus['riskLevel'];
    if (riskScore > 30) riskLevel = 'low';
    else if (riskScore > 0) riskLevel = 'medium';
    else if (riskScore > -30) riskLevel = 'high';
    else riskLevel = 'extreme';

    return {
      isSafeHavenMode,
      goldSignal: Math.round(Math.max(-100, Math.min(100, goldSignal)) * 100) / 100,
      bondSignal: Math.round(Math.max(-100, Math.min(100, bondSignal)) * 100) / 100,
      dollarSignal: Math.round(Math.max(-100, Math.min(100, dollarSignal)) * 100) / 100,
      riskLevel,
    };
  }

  /**
   * 资产配置建议
   */
  suggestAllocation(
    stockReturns: number[],
    bondReturns: number[],
    goldReturns: number[],
    riskLevel: string,
  ): AssetAllocationHint {
    let equityWeight = 0.6;
    let bondWeight = 0.25;
    let goldWeight = 0.1;
    let cashWeight = 0.05;

    if (riskLevel === 'extreme') {
      equityWeight = 0.2; bondWeight = 0.4; goldWeight = 0.25; cashWeight = 0.15;
    } else if (riskLevel === 'high') {
      equityWeight = 0.35; bondWeight = 0.35; goldWeight = 0.2; cashWeight = 0.1;
    } else if (riskLevel === 'low') {
      equityWeight = 0.75; bondWeight = 0.15; goldWeight = 0.05; cashWeight = 0.05;
    }

    // 动量调整
    const stockMom = stockReturns.length >= 20 ? stockReturns.slice(-20).reduce((a, b) => a + b, 0) : 0;
    if (stockMom > 0.05) equityWeight = Math.min(0.85, equityWeight + 0.1);
    else if (stockMom < -0.05) equityWeight = Math.max(0.1, equityWeight - 0.1);

    // 归一化
    const total = equityWeight + bondWeight + goldWeight + cashWeight;
    equityWeight /= total;
    bondWeight /= total;
    goldWeight /= total;
    cashWeight /= total;

    const reasoning = `风险水平: ${riskLevel}, 股票动量: ${(stockMom * 100).toFixed(1)}%`;

    return {
      equityWeight: Math.round(equityWeight * 100) / 100,
      bondWeight: Math.round(bondWeight * 100) / 100,
      goldWeight: Math.round(goldWeight * 100) / 100,
      cashWeight: Math.round(cashWeight * 100) / 100,
      reasoning,
    };
  }

  // --- Helpers ---

  private pearsonCorr(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    if (n < 3) return 0;
    const meanA = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
    const meanB = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < n; i++) {
      num += (a[i] - meanA) * (b[i] - meanB);
      denA += (a[i] - meanA) ** 2;
      denB += (b[i] - meanB) ** 2;
    }
    return denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0;
  }
}

export default new CrossAssetCorrelationEngine();
