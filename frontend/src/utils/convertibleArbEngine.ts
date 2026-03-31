/**
 * 可转债套利引擎
 * - 转股溢价率计算
 * - 套利机会检测
 * - 到期收益率
 * - 下修博弈
 * - 赎回风险评估
 */
export interface ConvertibleBond {
  code: string;
  name: string;
  stockCode: string;
  stockName: string;
  bondPrice: number;
  stockPrice: number;
  conversionPrice: number;
  conversionRatio: number;
  parValue: number;
  couponRate: number;
  maturityDate: string;
  putPrice: number;
  callPrice: number;
  callTriggerPrice: number;
  putTriggerPrice: number;
}

export interface ConvertibleBondAnalysis {
  bond: ConvertibleBond;
  conversionValue: number;
  conversionPremium: number; // 转股溢价率
  ytm: number; // 到期收益率
  pureBondValue: number; // 纯债价值
  arbitrageSignal: 'buy_bond' | 'convert' | 'sell' | 'hold';
  arbProfit: number; // 套利利润
  riskLevel: 'low' | 'medium' | 'high';
  callRisk: boolean; // 赎回风险
  putOpportunity: boolean; // 回售机会
  downgradePotential: number; // 下修概率
}

export function analyzeConvertibleBond(bond: ConvertibleBond): ConvertibleBondAnalysis {
  const conversionValue = bond.stockPrice * bond.conversionRatio;
  const conversionPremium = (bond.bondPrice - conversionValue) / conversionValue;
  
  // 到期收益率估算
  const yearsToMaturity = Math.max(0.1, (new Date(bond.maturityDate).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000));
  const annualCoupon = bond.parValue * bond.couponRate;
  const ytm = (annualCoupon + (bond.parValue - bond.bondPrice) / yearsToMaturity) / bond.bondPrice;

  // 纯债价值 (简化DCF)
  const pureBondValue = bond.parValue * (1 + bond.couponRate * yearsToMaturity) / Math.pow(1.05, yearsToMaturity);

  // 赎回风险
  const callRisk = bond.stockPrice >= bond.callTriggerPrice;
  
  // 回售机会
  const putOpportunity = bond.bondPrice <= bond.putPrice * 1.02;

  // 下修概率 (基于转股溢价率和正股价格)
  let downgradePotential = 0;
  if (conversionPremium > 0.3) downgradePotential += 0.3;
  if (bond.stockPrice < bond.conversionPrice * 0.7) downgradePotential += 0.3;
  if (yearsToMaturity < 1) downgradePotential += 0.2;
  downgradePotential = Math.min(1, downgradePotential);

  // 套利信号
  let arbitrageSignal: 'buy_bond' | 'convert' | 'sell' | 'hold';
  const arbProfit = conversionValue - bond.bondPrice;
  
  if (conversionPremium < -0.01 && !callRisk) {
    arbitrageSignal = 'convert';
  } else if (conversionPremium < 0.05 && ytm > 0.02) {
    arbitrageSignal = 'buy_bond';
  } else if (conversionPremium > 0.3 && callRisk) {
    arbitrageSignal = 'sell';
  } else {
    arbitrageSignal = 'hold';
  }

  // 风险等级
  let riskLevel: 'low' | 'medium' | 'high';
  if (conversionPremium < 0.1 && ytm > 0) riskLevel = 'low';
  else if (conversionPremium < 0.3 && bond.bondPrice > 90) riskLevel = 'medium';
  else riskLevel = 'high';

  return {
    bond,
    conversionValue,
    conversionPremium,
    ytm,
    pureBondValue,
    arbitrageSignal,
    arbProfit,
    riskLevel,
    callRisk,
    putOpportunity,
    downgradePotential,
  };
}

export function scanConvertibleArbOpportunities(
  bonds: ConvertibleBond[]
): ConvertibleBondAnalysis[] {
  return bonds
    .map(b => analyzeConvertibleBond(b))
    .filter(a => a.arbitrageSignal !== 'hold')
    .sort((a, b) => {
      const priority = { convert: 0, buy_bond: 1, sell: 2 };
      return priority[a.arbitrageSignal] - priority[b.arbitrageSignal];
    });
}
