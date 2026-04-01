/**
 * 量化因子挖掘引擎
 * 自动化因子挖掘、IC分析、因子合成
 */

export interface FactorData {
  name: string;
  values: { stockCode: string; value: number }[];
  date: string;
  category: 'value' | 'momentum' | 'quality' | 'volatility' | 'liquidity' | 'growth';
}

export interface FactorIC {
  factorName: string;
  ic: number; // 信息系数
  icIR: number; // IC信息比率
  rankIC: number; // 排名IC
  icStd: number;
  tStat: number;
  effective: boolean; // ICIR > 0.5
}

export interface FactorDecay {
  factorName: string;
  decaySpeed: number; // 衰减速度
  halfLife: number; // 半衰期(天)
  optimalHoldPeriod: number; // 最优持有期(天)
  persistence: number; // 持续性 0-1
}

export interface CompositeFactor {
  factors: { name: string; weight: number }[];
  compositeIC: number;
  diversificationRatio: number;
  turnover: number;
}

export class FactorMiningEngine {
  /**
   * 计算因子IC
   */
  calculateIC(
    factor: FactorData,
    returns: { stockCode: string; return: number }[]
  ): FactorIC {
    const returnMap = new Map(returns.map(r => [r.stockCode, r.return]));
    const matched = factor.values
      .filter(v => returnMap.has(v.stockCode))
      .map(v => ({ factor: v.value, ret: returnMap.get(v.stockCode)! }));

    if (matched.length < 3) {
      return { factorName: factor.name, ic: 0, icIR: 0, rankIC: 0, icStd: 0, tStat: 0, effective: false };
    }

    const n = matched.length;
    const avgFactor = matched.reduce((s, m) => s + m.factor, 0) / n;
    const avgReturn = matched.reduce((s, m) => s + m.ret, 0) / n;

    let cov = 0, varF = 0, varR = 0;
    for (const m of matched) {
      const df = m.factor - avgFactor;
      const dr = m.ret - avgReturn;
      cov += df * dr;
      varF += df * df;
      varR += dr * dr;
    }

    const ic = varF > 0 && varR > 0 ? cov / Math.sqrt(varF * varR) : 0;

    // 排名IC
    const sortedByFactor = [...matched].sort((a, b) => a.factor - b.factor);
    const ranks = new Map(sortedByFactor.map((m, i) => [m.factor, i + 1]));
    const sortedByReturn = [...matched].sort((a, b) => a.ret - b.ret);
    const retRanks = new Map(sortedByReturn.map((m, i) => [`${m.factor}_${m.ret}`, i + 1]));

    let rankCov = 0;
    const avgRank = (n + 1) / 2;
    for (let i = 0; i < n; i++) {
      const factorRank = ranks.get(sortedByFactor[i].factor) || avgRank;
      rankCov += (factorRank - avgRank) * (i + 1 - avgRank);
    }
    const rankIC = rankCov / (n * (n * n - 1) / 12) || 0;

    const icStd = Math.sqrt((1 - ic * ic) / (n - 2)) || 0.01;
    const tStat = ic / icStd;
    const icIR = icStd > 0 ? ic / icStd : 0;

    return {
      factorName: factor.name,
      ic,
      icIR,
      rankIC,
      icStd,
      tStat,
      effective: Math.abs(icIR) > 0.5
    };
  }

  /**
   * 因子衰减分析
   */
  analyzeDecay(
    factorName: string,
    icSeries: number[] // 多期IC序列
  ): FactorDecay {
    if (icSeries.length < 2) {
      return { factorName, decaySpeed: 0, halfLife: 999, optimalHoldPeriod: 1, persistence: 0 };
    }

    // 计算自相关系数
    const n = icSeries.length;
    const mean = icSeries.reduce((a, b) => a + b, 0) / n;
    let autoCorr = 0, varTotal = 0;
    for (let i = 1; i < n; i++) {
      autoCorr += (icSeries[i] - mean) * (icSeries[i - 1] - mean);
      varTotal += Math.pow(icSeries[i] - mean, 2);
    }
    const persistence = varTotal > 0 ? Math.abs(autoCorr / varTotal) : 0;
    const decaySpeed = 1 - persistence;
    const halfLife = decaySpeed > 0 ? Math.round(Math.log(2) / decaySpeed) : 999;
    const optimalHoldPeriod = Math.max(1, Math.round(halfLife * 0.7));

    return { factorName, decaySpeed, halfLife, optimalHoldPeriod, persistence };
  }

  /**
   * 因子合成
   */
  compositeFactors(
    factors: { name: string; ic: number; icStd: number; values: number[] }[]
  ): CompositeFactor {
    if (factors.length === 0) {
      return { factors: [], compositeIC: 0, diversificationRatio: 0, turnover: 0 };
    }

    // 权重 = IC / IC_std (风险调整IC)
    const rawWeights = factors.map(f => {
      const ir = f.icStd > 0 ? f.ic / f.icStd : 0;
      return Math.abs(ir);
    });
    const totalWeight = rawWeights.reduce((a, b) => a + b, 0);
    const weights = rawWeights.map(w => totalWeight > 0 ? w / totalWeight : 1 / factors.length);

    // 合成IC
    const compositeIC = factors.reduce((s, f, i) => s + f.ic * weights[i], 0);

    // 分散化比率
    const avgIC = factors.reduce((s, f) => s + Math.abs(f.ic), 0) / factors.length;
    const diversificationRatio = avgIC > 0 ? Math.abs(compositeIC) / avgIC : 0;

    const factorList = factors.map((f, i) => ({ name: f.name, weight: weights[i] }));

    return { factors: factorList, compositeIC, diversificationRatio, turnover: 0 };
  }

  /**
   * 因子有效性检验
   */
  validateFactor(
    factor: FactorData,
    returns: { stockCode: string; return: number }[],
    groups: number = 5
  ): {
    longShortReturn: number;
    monotonicity: number; // 单调性 0-1
    groupReturns: number[];
    ic: FactorIC;
    isEffective: boolean;
  } {
    const returnMap = new Map(returns.map(r => [r.stockCode, r.return]));
    const matched = factor.values
      .filter(v => returnMap.has(v.stockCode))
      .map(v => ({ stockCode: v.stockCode, factor: v.value, ret: returnMap.get(v.stockCode)! }))
      .sort((a, b) => a.factor - b.factor);

    const ic = this.calculateIC(factor, returns);

    if (matched.length < groups * 2) {
      return { longShortReturn: 0, monotonicity: 0, groupReturns: [], ic, isEffective: false };
    }

    // 分组
    const groupSize = Math.floor(matched.length / groups);
    const groupReturns: number[] = [];
    for (let g = 0; g < groups; g++) {
      const group = matched.slice(g * groupSize, (g + 1) * groupSize);
      const avgReturn = group.reduce((s, m) => s + m.ret, 0) / group.length;
      groupReturns.push(avgReturn);
    }

    // 多空收益
    const longShortReturn = groupReturns[groupReturns.length - 1] - groupReturns[0];

    // 单调性
    let increases = 0;
    for (let i = 1; i < groupReturns.length; i++) {
      if (groupReturns[i] > groupReturns[i - 1]) increases++;
    }
    const monotonicity = increases / (groupReturns.length - 1);

    const isEffective = ic.effective && Math.abs(longShortReturn) > 0.5;

    return { longShortReturn, monotonicity, groupReturns, ic, isEffective };
  }

  /**
   * 因子拥挤度检测
   */
  detectCrowding(
    factorExposure: number[],
    factorReturns: number[]
  ): {
    crowdingScore: number;
    turnover: number;
    returnCompression: number;
    riskLevel: 'low' | 'medium' | 'high';
  } {
    if (factorExposure.length < 2) {
      return { crowdingScore: 0, turnover: 0, returnCompression: 0, riskLevel: 'low' };
    }

    // 换手率
    let turnover = 0;
    for (let i = 1; i < factorExposure.length; i++) {
      turnover += Math.abs(factorExposure[i] - factorExposure[i - 1]);
    }
    turnover /= factorExposure.length;

    // 收益压缩
    const recentReturns = factorReturns.slice(-5);
    const earlierReturns = factorReturns.slice(-10, -5);
    const recentAvg = recentReturns.length > 0 
      ? recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length : 0;
    const earlierAvg = earlierReturns.length > 0 
      ? earlierReturns.reduce((a, b) => a + b, 0) / earlierReturns.length : 0;
    const returnCompression = earlierAvg > 0 ? (earlierAvg - recentAvg) / earlierAvg : 0;

    const crowdingScore = Math.min(100, turnover * 50 + returnCompression * 50);

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (crowdingScore > 70) riskLevel = 'high';
    else if (crowdingScore > 40) riskLevel = 'medium';

    return { crowdingScore, turnover, returnCompression, riskLevel };
  }
}
