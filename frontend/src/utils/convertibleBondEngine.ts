/**
 * 可转债分析引擎
 * 转股价值/溢价率/债底价值/条款分析/下修博弈/强赎触发
 */

export interface ConvertibleBond {
  code: string;
  name: string;
  ticker: string;         // 对应正股
  stockName: string;
  price: number;          // 转债价格
  parValue: number;       // 面值 (通常100)
  stockPrice: number;     // 正股价格
  conversionPrice: number; // 转股价
  conversionRatio: number; // 转股比例
  couponRate: number[];    // 各年票息
  yearsToMaturity: number;
  creditRating: string;
  putPrice: number;       // 回售价格
  callPrice: number;      // 赎回价格
  callTriggerPrice: number; // 强赎触发价 (通常转股价*1.3)
  putTriggerDays: number; // 回售触发条件(低于转股价的天数)
  ytm: number;            // 到期收益率
}

export interface CBValuation {
  code: string;
  conversionValue: number;   // 转股价值
  conversionPremium: number; // 转股溢价率
  bondFloor: number;         // 债底价值
  bondPremium: number;       // 纯债溢价率
  theoreticalPrice: number;  // 理论价格
  underpriced: boolean;      // 是否低估
  overpriced: boolean;       // 是否高估
  fairRange: { low: number; high: number };
}

export interface CBTriggerAnalysis {
  code: string;
  callRisk: {
    triggered: boolean;
    currentRatio: number;
    triggerRatio: number;
    distance: number;       // 距触发还有多少涨幅
    estimatedDays: number;
  };
  putOpportunity: {
    active: boolean;
    currentPrice: number;
    putPrice: number;
    protection: number;     // 保护空间
    ytmAtPut: number;
  };
  conversionDecision: {
    shouldConvert: boolean;
    conversionGain: number;
    reason: string;
  };
}

export interface CBSelectionCriteria {
  minPremium: number;
  maxPremium: number;
  minYtm: number;
  maxPrice: number;
  minRating: string;
  excludeCalled: boolean;
}

/**
 * 计算转股价值
 */
export function calcConversionValue(bond: ConvertibleBond): number {
  return bond.stockPrice * bond.conversionRatio;
}

/**
 * 计算转股溢价率
 */
export function calcConversionPremium(bond: ConvertibleBond): number {
  const cv = calcConversionValue(bond);
  if (cv === 0) return Infinity;
  return (bond.price - cv) / cv;
}

/**
 * 计算债底价值 (简化DCF)
 */
export function calcBondFloor(bond: ConvertibleBond): number {
  let floor = 0;
  const discountRate = 0.05; // 简化折现率

  // 各年利息
  for (let y = 0; y < bond.yearsToMaturity; y++) {
    const coupon = bond.couponRate[y] ?? bond.couponRate[bond.couponRate.length - 1] ?? 1;
    floor += (bond.parValue * coupon / 100) / Math.pow(1 + discountRate, y + 1);
  }

  // 到期还本
  floor += bond.parValue / Math.pow(1 + discountRate, bond.yearsToMaturity);

  return Math.round(floor * 100) / 100;
}

/**
 * 综合估值分析
 */
export function analyzeCBValuation(bond: ConvertibleBond): CBValuation {
  const conversionValue = calcConversionValue(bond);
  const conversionPremium = calcConversionPremium(bond);
  const bondFloor = calcBondFloor(bond);
  const bondPremium = (bond.price - bondFloor) / bondFloor;

  // 理论价格: 转股价值 + 期权价值(简化)
  const optionValue = Math.max(0, conversionValue - bondFloor) * 0.3;
  const theoreticalPrice = bondFloor + optionValue;

  // 公平区间
  const fairLow = Math.max(bondFloor, conversionValue * 0.95);
  const fairHigh = conversionValue * 1.15 + bondFloor * 0.1;

  return {
    code: bond.code,
    conversionValue,
    conversionPremium,
    bondFloor,
    bondPremium,
    theoreticalPrice,
    underpriced: bond.price < fairLow,
    overpriced: bond.price > fairHigh,
    fairRange: { low: fairLow, high: fairHigh },
  };
}

/**
 * 触发条款分析
 */
export function analyzeTriggers(bond: ConvertibleBond): CBTriggerAnalysis {
  const cv = calcConversionValue(bond);

  // 强赎风险
  const callTriggerRatio = bond.stockPrice / bond.callTriggerPrice;
  const callTriggered = bond.stockPrice >= bond.callTriggerPrice;

  // 回售机会
  const putActive = bond.price <= bond.putPrice;
  const protection = bond.putPrice > 0
    ? (bond.putPrice - bond.price) / bond.price
    : 0;

  // 转股决策: 转股价值 > 转债价格才值得转股
  const shouldConvert = cv > bond.price * 1.01; // 转股价值比转债价格多1%以上才转股
  const conversionGain = cv > 0 ? (cv - bond.price) / bond.price : 0;

  return {
    code: bond.code,
    callRisk: {
      triggered: callTriggered,
      currentRatio: callTriggerRatio,
      triggerRatio: 1.3,
      distance: callTriggered ? 0 : (bond.callTriggerPrice - bond.stockPrice) / bond.stockPrice,
      estimatedDays: callTriggered ? 0 : Math.ceil((1.3 - callTriggerRatio) * 200),
    },
    putOpportunity: {
      active: putActive,
      currentPrice: bond.price,
      putPrice: bond.putPrice,
      protection,
      ytmAtPut: bond.ytm,
    },
    conversionDecision: {
      shouldConvert,
      conversionGain,
      reason: shouldConvert
        ? '转股价值高于转债价格，建议转股'
        : '持有转债更优',
    },
  };
}

/**
 * 筛选可转债
 */
export function filterBonds(
  bonds: ConvertibleBond[],
  criteria: CBSelectionCriteria
): ConvertibleBond[] {
  const ratingOrder: Record<string, number> = {
    'AAA': 6, 'AA+': 5, 'AA': 4, 'AA-': 3, 'A+': 2, 'A': 1, 'A-': 0,
  };
  const minRatingLevel = ratingOrder[criteria.minRating] ?? 0;

  return bonds.filter(bond => {
    const premium = calcConversionPremium(bond);
    const price = bond.price;
    const ratingLevel = ratingOrder[bond.creditRating] ?? 0;

    if (premium < criteria.minPremium || premium > criteria.maxPremium) return false;
    if (bond.ytm < criteria.minYtm) return false;
    if (price > criteria.maxPrice) return false;
    if (ratingLevel < minRatingLevel) return false;
    if (criteria.excludeCalled && bond.stockPrice >= bond.callTriggerPrice) return false;

    return true;
  });
}

/**
 * 双低排名 (价格+溢价率)
 */
export function dualLowRanking(bonds: ConvertibleBond[]): {
  code: string;
  name: string;
  price: number;
  premium: number;
  dualLowScore: number;
  rank: number;
}[] {
  const withMetrics = bonds.map(b => {
    const premium = calcConversionPremium(b) * 100;
    const dualLowScore = b.price + premium;
    return {
      code: b.code,
      name: b.name,
      price: b.price,
      premium,
      dualLowScore,
      rank: 0,
    };
  });

  withMetrics.sort((a, b) => a.dualLowScore - b.dualLowScore);

  return withMetrics.map((m, i) => ({ ...m, rank: i + 1 }));
}
