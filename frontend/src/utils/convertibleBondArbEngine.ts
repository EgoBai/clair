/**
 * 可转债套利引擎
 * 分析可转债转股溢价率、纯债价值、期权价值、套利机会
 */

export interface ConvertibleBond {
  code: string;
  name: string;
  faceValue: number; // 面值
  couponRate: number; // 票面利率 %
  maturity: number; // 剩余期限(年)
  conversionPrice: number; // 转股价
  stockPrice: number; // 正股价格
  bondPrice: number; // 可转债价格
  putPrice: number; // 回售价格
  callPrice: number; // 赎回价格
  creditRating: string;
  ytm: number; // 到期收益率 %
}

export interface ConvertibleMetrics {
  code: string;
  conversionValue: number; // 转换价值
  conversionPremium: number; // 转股溢价率 %
  pureBondValue: number; // 纯债价值
  optionValue: number; // 期权价值
  deltaValue: number; // Delta值
  breakEvenDays: number; // 回本天数
  downsideProtection: number; // 下跌保护空间 %
  arbitrageSignal: 'buy_bond' | 'convert' | 'sell_bond' | 'neutral';
}

export interface CBPairTrade {
  bondCode: string;
  stockCode: string;
  direction: 'long_bond_short_stock' | 'short_bond_long_stock';
  spread: number; // 当前价差
  expectedReturn: number; // 预期年化收益 %
  risk: 'low' | 'medium' | 'high';
  maxLoss: number;
}

export class ConvertibleBondEngine {
  /**
   * 计算可转债核心指标
   */
  calculateMetrics(bond: ConvertibleBond): ConvertibleMetrics {
    // 转换价值 = 面值 / 转股价 × 正股价格
    const conversionValue = bond.conversionPrice > 0 
      ? (bond.faceValue / bond.conversionPrice) * bond.stockPrice 
      : 0;

    // 转股溢价率 = (可转债价格 - 转换价值) / 转换价值
    const conversionPremium = conversionValue > 0 
      ? ((bond.bondPrice - conversionValue) / conversionValue) * 100 
      : 0;

    // 纯债价值 (简化DCF)
    const pureBondValue = this.calculatePureBondValue(bond);

    // 期权价值 = 可转债价格 - 纯债价值
    const optionValue = Math.max(0, bond.bondPrice - pureBondValue);

    // Delta近似
    const moneyness = conversionValue / bond.bondPrice;
    const deltaValue = this.approximateDelta(moneyness, bond.maturity);

    // 回本天数
    const dailyCoupon = bond.faceValue * bond.couponRate / 100 / 365;
    const priceGap = bond.bondPrice - conversionValue;
    const breakEvenDays = dailyCoupon > 0 && priceGap > 0 
      ? Math.ceil(priceGap / dailyCoupon) 
      : 0;

    // 下跌保护空间
    const downsideProtection = bond.bondPrice > 0 
      ? ((bond.bondPrice - pureBondValue) / bond.bondPrice) * 100 
      : 0;

    // 套利信号
    let arbitrageSignal: ConvertibleMetrics['arbitrageSignal'] = 'neutral';
    if (conversionPremium < -2) arbitrageSignal = 'convert';
    else if (conversionPremium > 30 && optionValue < pureBondValue * 0.1) arbitrageSignal = 'sell_bond';
    else if (bond.bondPrice < pureBondValue * 0.95) arbitrageSignal = 'buy_bond';

    return {
      code: bond.code,
      conversionValue,
      conversionPremium,
      pureBondValue,
      optionValue,
      deltaValue,
      breakEvenDays,
      downsideProtection,
      arbitrageSignal
    };
  }

  /**
   * 纯债价值计算
   */
  private calculatePureBondValue(bond: ConvertibleBond): number {
    let pv = 0;
    const coupon = bond.faceValue * bond.couponRate / 100;
    const discountRate = bond.ytm / 100;

    for (let t = 1; t <= bond.maturity; t++) {
      pv += coupon / Math.pow(1 + discountRate, t);
    }
    pv += bond.faceValue / Math.pow(1 + discountRate, bond.maturity);

    return Math.round(pv * 100) / 100;
  }

  /**
   * Delta近似值
   */
  private approximateDelta(moneyness: number, yearsToMaturity: number): number {
    // 简化的Delta计算
    if (moneyness > 1.2) return 0.9;
    if (moneyness > 1.1) return 0.75;
    if (moneyness > 1.0) return 0.6;
    if (moneyness > 0.9) return 0.45;
    if (moneyness > 0.8) return 0.3;
    return 0.15 + yearsToMaturity * 0.02;
  }

  /**
   * 寻找套利配对
   */
  findArbitragePairs(
    bonds: ConvertibleBond[],
    maxPremium: number = 20,
    _minYield: number = 0
  ): CBPairTrade[] {
    const pairs: CBPairTrade[] = [];

    for (const bond of bonds) {
      const metrics = this.calculateMetrics(bond);

      // 正溢价做空配对
      if (metrics.conversionPremium > 0 && metrics.conversionPremium <= maxPremium) {
        const spread = bond.bondPrice - metrics.conversionValue;
        const annualizedReturn = (metrics.conversionPremium / bond.maturity) + bond.couponRate;

        pairs.push({
          bondCode: bond.code,
          stockCode: bond.code.substring(0, 6),
          direction: 'long_bond_short_stock',
          spread,
          expectedReturn: annualizedReturn,
          risk: metrics.conversionPremium < 5 ? 'low' : metrics.conversionPremium < 15 ? 'medium' : 'high',
          maxLoss: Math.max(0, bond.bondPrice - metrics.pureBondValue)
        });
      }

      // 负溢价转股套利
      if (metrics.conversionPremium < -1) {
        pairs.push({
          bondCode: bond.code,
          stockCode: bond.code.substring(0, 6),
          direction: 'short_bond_long_stock',
          spread: Math.abs(bond.bondPrice - metrics.conversionValue),
          expectedReturn: Math.abs(metrics.conversionPremium),
          risk: 'low',
          maxLoss: 0
        });
      }
    }

    return pairs.sort((a, b) => b.expectedReturn - a.expectedReturn);
  }

  /**
   * 下修转股价影响分析
   */
  analyzePriceRevision(
    bond: ConvertibleBond,
    newConversionPrice: number
  ): {
    oldPremium: number;
    newPremium: number;
    premiumChange: number;
    theoreticalGain: number;
    conversionValueChange: number;
  } {
    const oldMetrics = this.calculateMetrics(bond);
    const newBond = { ...bond, conversionPrice: newConversionPrice };
    const newMetrics = this.calculateMetrics(newBond);

    const conversionValueChange = newMetrics.conversionValue - oldMetrics.conversionValue;
    const theoreticalGain = conversionValueChange * (bond.faceValue / bond.conversionPrice);

    return {
      oldPremium: oldMetrics.conversionPremium,
      newPremium: newMetrics.conversionPremium,
      premiumChange: newMetrics.conversionPremium - oldMetrics.conversionPremium,
      theoreticalGain,
      conversionValueChange
    };
  }

  /**
   * 可转债估值评分
   */
  valuationScore(bond: ConvertibleBond): {
    score: number;
    factors: { name: string; score: number; weight: number }[];
    recommendation: string;
  } {
    const metrics = this.calculateMetrics(bond);
    const factors: { name: string; score: number; weight: number }[] = [];

    // 溢价率因子
    const premiumScore = metrics.conversionPremium < 0 ? 100 : 
      metrics.conversionPremium < 10 ? 80 : 
      metrics.conversionPremium < 20 ? 60 : 
      metrics.conversionPremium < 30 ? 40 : 20;
    factors.push({ name: '转股溢价率', score: premiumScore, weight: 0.25 });

    // 到期收益率因子
    const ytmScore = bond.ytm > 3 ? 100 : bond.ytm > 1 ? 70 : bond.ytm > 0 ? 40 : 10;
    factors.push({ name: '到期收益率', score: ytmScore, weight: 0.2 });

    // 下跌保护因子
    const protectionScore = metrics.downsideProtection > 20 ? 100 : 
      metrics.downsideProtection > 10 ? 70 : 
      metrics.downsideProtection > 5 ? 40 : 20;
    factors.push({ name: '下跌保护', score: protectionScore, weight: 0.2 });

    // 期权价值因子
    const optionRatio = metrics.optionValue / bond.bondPrice * 100;
    const optionScore = optionRatio > 30 ? 100 : optionRatio > 15 ? 70 : optionRatio > 5 ? 40 : 20;
    factors.push({ name: '期权价值', score: optionScore, weight: 0.2 });

    // 信用因子
    const creditScores: Record<string, number> = { 'AAA': 100, 'AA+': 85, 'AA': 70, 'AA-': 55, 'A+': 40, 'A': 25 };
    const creditScore = creditScores[bond.creditRating] || 50;
    factors.push({ name: '信用评级', score: creditScore, weight: 0.15 });

    const totalScore = factors.reduce((s, f) => s + f.score * f.weight, 0) / 
      factors.reduce((s, f) => s + f.weight, 0);

    let recommendation = '持有';
    if (totalScore > 80) recommendation = '强烈推荐';
    else if (totalScore > 60) recommendation = '推荐';
    else if (totalScore < 30) recommendation = '回避';

    return { score: Math.round(totalScore), factors, recommendation };
  }
}
