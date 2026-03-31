/**
 * 跨市场套利引擎
 * - A/H股溢价分析
 * - 跨市场ETF套利
 * - 期货现货套利
 * - 跨期套利
 */
export interface CrossMarketPair {
  code1: string;
  market1: string;
  price1: number;
  code2: string;
  market2: string;
  price2: number;
  exchangeRate: number;
  conversionRatio: number;
  date: string;
}

export interface ArbOpportunity {
  pair: CrossMarketPair;
  premium: number; // 溢价率
  cost: number; // 交易成本
  netProfit: number;
  signal: 'buy_1_sell_2' | 'buy_2_sell_1' | 'hold';
  riskLevel: 'low' | 'medium' | 'high';
  expectedReturn: number;
  holdingPeriod: number; // 预期持有天数
}

export interface CrossMarketArbAnalysis {
  opportunities: ArbOpportunity[];
  topOpportunities: ArbOpportunity[];
  avgPremium: number;
  premiumStd: number;
  marketEfficiency: number; // 0-1
  alerts: string[];
}

export function analyzeCrossMarketArb(
  pairs: CrossMarketPair[],
  transactionCost: number = 0.003
): CrossMarketArbAnalysis {
  if (pairs.length === 0) throw new Error('跨市场数据不能为空');

  const opportunities: ArbOpportunity[] = pairs.map(pair => {
    const adjustedPrice2 = pair.price2 * pair.exchangeRate * pair.conversionRatio;
    const premium = adjustedPrice2 > 0 ? (pair.price1 - adjustedPrice2) / adjustedPrice2 : 0;
    const cost = transactionCost * 2; // 双边成本
    const netProfit = Math.abs(premium) - cost;

    let signal: 'buy_1_sell_2' | 'buy_2_sell_1' | 'hold';
    if (premium > cost && netProfit > 0.005) signal = 'buy_2_sell_1';
    else if (premium < -cost && netProfit > 0.005) signal = 'buy_1_sell_2';
    else signal = 'hold';

    const riskLevel = Math.abs(premium) > 0.1 ? 'high' : Math.abs(premium) > 0.05 ? 'medium' : 'low';
    const expectedReturn = netProfit * (signal !== 'hold' ? 1 : 0);
    const holdingPeriod = signal !== 'hold' ? Math.ceil(5 + Math.abs(premium) * 30) : 0;

    return { pair, premium, cost, netProfit, signal, riskLevel, expectedReturn, holdingPeriod };
  });

  const topOpportunities = opportunities
    .filter(o => o.signal !== 'hold')
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, 10);

  const premiums = opportunities.map(o => o.premium);
  const avgPremium = premiums.reduce((s, p) => s + p, 0) / premiums.length;
  const premiumStd = Math.sqrt(premiums.reduce((s, p) => s + (p - avgPremium) ** 2, 0) / premiums.length);

  // 市场效率(溢价越低效率越高)
  const marketEfficiency = Math.max(0, 1 - Math.abs(avgPremium) * 10);

  const alerts: string[] = [];
  if (topOpportunities.some(o => o.netProfit > 0.05)) alerts.push('存在显著套利机会');
  if (premiumStd > 0.15) alerts.push('跨市场溢价波动较大');

  return { opportunities, topOpportunities, avgPremium, premiumStd, marketEfficiency, alerts };
}
