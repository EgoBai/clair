/**
 * 信用利差分析引擎
 * 分析信用利差变动、信用风险定价、违约概率估算
 */

export interface CreditSpread {
  bondCode: string;
  issuerName: string;
  rating: string;
  maturity: number; // 年
  yieldRate: number; // %
  benchmarkRate: number; // %
  spread: number; // bps
  date: string;
}

export interface CreditRiskScore {
  bondCode: string;
  score: number; // 0-100
  rating: 'AAA' | 'AA+' | 'AA' | 'AA-' | 'A+' | 'A' | 'A-' | 'BBB+' | 'BBB' | 'BBB-' | 'BB+' | 'BB' | 'B' | 'CCC' | 'CC' | 'C' | 'D';
  pd: number; // 违约概率 %
  lgd: number; // 违约损失率 %
  spreadFairValue: number; // bps
  spreadDeviation: number; // bps, 正=偏贵, 负=偏便宜
}

export interface SpreadCurve {
  date: string;
  tenors: number[]; // 年
  spreads: number[]; // bps
  slope: number; // bps/年
  curvature: number;
  inversion: boolean;
}

export interface CreditMigration {
  fromRating: string;
  toRating: string;
  probability: number;
  spreadImpact: number; // bps
}

export class CreditSpreadEngine {
  private readonly ratingScores: Record<string, number> = {
    'AAA': 95, 'AA+': 90, 'AA': 85, 'AA-': 80,
    'A+': 75, 'A': 70, 'A-': 65,
    'BBB+': 60, 'BBB': 55, 'BBB-': 50,
    'BB+': 45, 'BB': 40, 'B': 30,
    'CCC': 20, 'CC': 15, 'C': 10, 'D': 0
  };

  private readonly ratingPD: Record<string, number> = {
    'AAA': 0.01, 'AA+': 0.02, 'AA': 0.03, 'AA-': 0.05,
    'A+': 0.08, 'A': 0.12, 'A-': 0.20,
    'BBB+': 0.35, 'BBB': 0.50, 'BBB-': 0.80,
    'BB+': 1.20, 'BB': 2.00, 'B': 4.00,
    'CCC': 8.00, 'CC': 15.00, 'C': 25.00, 'D': 100.00
  };

  /**
   * 计算信用利差
   */
  calculateSpread(yieldRate: number, benchmarkRate: number): number {
    return (yieldRate - benchmarkRate) * 100; // 转为bps
  }

  /**
   * 信用风险评分
   */
  calculateRiskScore(spread: CreditSpread): CreditRiskScore {
    const score = spread.rating in this.ratingScores ? this.ratingScores[spread.rating] : 50;
    const pd = spread.rating in this.ratingPD ? this.ratingPD[spread.rating] : 1;
    const lgd = Math.min(100, Math.max(0, 100 - score)); // 简化模型

    // 公允利差 = PD * LGD + 流动性溢价 + 期限溢价
    const liquidityPremium = spread.maturity > 5 ? 15 : spread.maturity > 2 ? 10 : 5;
    const termPremium = spread.maturity * 3;
    const spreadFairValue = (pd * lgd / 100) * 100 + liquidityPremium + termPremium;
    const spreadDeviation = spread.spread - spreadFairValue;

    return {
      bondCode: spread.bondCode,
      score,
      rating: spread.rating as CreditRiskScore['rating'],
      pd,
      lgd,
      spreadFairValue,
      spreadDeviation
    };
  }

  /**
   * 构建信用利差曲线
   */
  buildSpreadCurve(spreads: CreditSpread[]): SpreadCurve {
    if (spreads.length === 0) {
      return { date: '', tenors: [], spreads: [], slope: 0, curvature: 0, inversion: false };
    }

    const sorted = [...spreads].sort((a, b) => a.maturity - b.maturity);
    const tenors = sorted.map(s => s.maturity);
    const spreadValues = sorted.map(s => s.spread);

    // 计算斜率
    let slope = 0;
    if (tenors.length >= 2) {
      const n = tenors.length;
      const sumX = tenors.reduce((a, b) => a + b, 0);
      const sumY = spreadValues.reduce((a, b) => a + b, 0);
      const sumXY = tenors.reduce((s, x, i) => s + x * spreadValues[i], 0);
      const sumX2 = tenors.reduce((s, x) => s + x * x, 0);
      slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
    }

    // 曲率 (二阶差分)
    let curvature = 0;
    if (spreadValues.length >= 3) {
      const secondDiffs = [];
      for (let i = 1; i < spreadValues.length - 1; i++) {
        secondDiffs.push(spreadValues[i + 1] - 2 * spreadValues[i] + spreadValues[i - 1]);
      }
      curvature = secondDiffs.reduce((a, b) => a + b, 0) / secondDiffs.length;
    }

    // 是否倒挂
    const inversion = spreadValues.length >= 2 && 
      spreadValues[0] > spreadValues[spreadValues.length - 1];

    return {
      date: sorted[0].date,
      tenors,
      spreads: spreadValues,
      slope,
      curvature,
      inversion
    };
  }

  /**
   * 信用迁移矩阵
   */
  calculateMigrationMatrix(
    transitions: { from: string; to: string }[]
  ): CreditMigration[] {
    const countMap = new Map<string, Map<string, number>>();
    let total = 0;

    for (const t of transitions) {
      if (!countMap.has(t.from)) countMap.set(t.from, new Map());
      const toMap = countMap.get(t.from)!;
      toMap.set(t.to, (toMap.get(t.to) || 0) + 1);
      total++;
    }

    const migrations: CreditMigration[] = [];
    const ratings = Object.keys(this.ratingScores);

    for (const [from, toMap] of countMap) {
      const fromTotal = Array.from(toMap.values()).reduce((a, b) => a + b, 0);
      for (const [to, count] of toMap) {
        const probability = fromTotal > 0 ? count / fromTotal : 0;
        const scoreDiff = (this.ratingScores[to] || 50) - (this.ratingScores[from] || 50);
        const spreadImpact = -scoreDiff * 2; // 评分下降→利差扩大

        migrations.push({
          fromRating: from,
          toRating: to,
          probability,
          spreadImpact
        });
      }
    }

    return migrations;
  }

  /**
   * Z-spread计算 (零波动率利差)
   */
  calculateZSpread(
    bondPrice: number,
    faceValue: number,
    couponRate: number,
    maturity: number,
    spotRates: number[] // 各期即期利率
  ): number {
    if (spotRates.length === 0 || maturity <= 0) return 0;

    const periods = spotRates.length;
    let pv = 0;
    const coupon = faceValue * couponRate / 100;

    for (let i = 0; i < periods; i++) {
      const discountFactor = 1 / Math.pow(1 + spotRates[i] / 100, i + 1);
      pv += coupon * discountFactor;
    }
    pv += faceValue / Math.pow(1 + spotRates[periods - 1] / 100, periods);

    // Z-spread近似: 使PV=市场价格的利差
    const zSpread = ((pv - bondPrice) / bondPrice) * 100 * 100; // bps
    return Math.round(zSpread * 100) / 100;
  }

  /**
   * OAS近似 (期权调整利差)
   */
  approximateOAS(
    zSpread: number,
    optionCost: number, // 期权成本 bps
    volatility: number // 隐含波动率 %
  ): number {
    // OAS = Z-spread - 期权成本
    const volAdjustment = volatility * 0.5;
    return Math.max(0, zSpread - optionCost - volAdjustment);
  }

  /**
   * 信用利差分解
   */
  decomposeSpread(spread: CreditSpread): {
    defaultRisk: number;
    liquidityPremium: number;
    termPremium: number;
    taxPremium: number;
    residual: number;
  } {
    const pd = this.ratingPD[spread.rating] || 1;
    const lgd = 60; // 假设60% LGD
    const defaultRisk = pd * lgd / 100 * 100; // bps
    const liquidityPremium = spread.maturity > 5 ? 20 : 10;
    const termPremium = spread.maturity * 5;
    const taxPremium = 5;
    const residual = spread.spread - defaultRisk - liquidityPremium - termPremium - taxPremium;

    return { defaultRisk, liquidityPremium, termPremium, taxPremium, residual };
  }
}
