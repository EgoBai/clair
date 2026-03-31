/**
 * 跨市场套利引擎 - A/H溢价/跨交易所价差/汇率对冲/期现套利
 */

export interface MarketPrice {
  market: string; // 'SH' | 'SZ' | 'HK' | 'US'
  ticker: string;
  price: number;
  currency: 'CNY' | 'HKD' | 'USD';
  timestamp: string;
}

export interface AHAnalysis {
  tickerA: string;
  tickerH: string;
  priceA: number; // A股价(CNY)
  priceH: number; // H股价(CNY)
  premium: number; // A/H溢价率(%)
  historicalAvg: number;
  percentile: number;
  signal: 'buy_A_sell_H' | 'buy_H_sell_A' | 'neutral';
  hedgedReturn: number; // 对冲后预期收益
  riskFactors: string[];
}

export interface CrossExchangeArb {
  ticker: string;
  market1: string;
  market2: string;
  price1: number;
  price2: number;
  spread: number;
  spreadPct: number;
  tradingCost: number;
  netProfit: number;
  profitable: boolean;
  action: string;
}

export interface CashCarryArb {
  ticker: string;
  spotPrice: number;
  futuresPrice: number;
  basis: number;
  annualizedBasis: number;
  riskFreeRate: number;
  daysToExpiry: number;
  costOfCarry: number;
  netArbProfit: number;
  profitable: boolean;
  direction: 'cash_and_carry' | 'reverse_cash_and_carry' | 'none';
}

export interface FXHedgeAnalysis {
  baseCurrency: string;
  quoteCurrency: string;
  spotRate: number;
  forwardRate: number;
  forwardPoints: number;
  hedgeCost: number; // 年化对冲成本(%)
  breakevenMove: number; // 需要的汇率变动才能盈利
  recommendation: 'hedge' | 'partial_hedge' | 'no_hedge';
}

// 汇率 (简化)
const FX_RATES: Record<string, number> = {
  'CNY_HKD': 1.08,
  'CNY_USD': 0.137,
  'HKD_USD': 0.127,
  'USD_CNY': 7.25,
  'HKD_CNY': 0.92,
};

/**
 * 分析A/H溢价
 */
export function analyzeAHPremium(
  priceA: number, // A股价 CNY
  priceH: number, // H股价 HKD
  historicalPremium: number[] = [],
): AHAnalysis {
  const hkdToCny = FX_RATES['HKD_CNY'] || 0.92;
  const priceHCNY = priceH * hkdToCny;
  const premium = ((priceA - priceHCNY) / priceHCNY) * 100;

  const avgPremium = historicalPremium.length > 0
    ? historicalPremium.reduce((a, b) => a + b, 0) / historicalPremium.length
    : 30; // A/H平均溢价约30%

  const sorted = [...historicalPremium, premium].sort((a, b) => a - b);
  const percentile = (sorted.filter(s => s <= premium).length / sorted.length) * 100;

  let signal: AHAnalysis['signal'];
  if (percentile > 80) signal = 'buy_H_sell_A';
  else if (percentile < 20) signal = 'buy_A_sell_H';
  else signal = 'neutral';

  const hedgedReturn = Math.abs(premium - avgPremium) * 0.5;

  const riskFactors: string[] = [];
  if (Math.abs(premium) > 50) riskFactors.push('溢价率极端');
  if (premium < 0) riskFactors.push('A股折价，可能存在基本面差异');
  riskFactors.push('汇率波动风险');
  riskFactors.push('资金跨境限制');

  return {
    tickerA: '',
    tickerH: '',
    priceA,
    priceH: priceHCNY,
    premium: Math.round(premium * 100) / 100,
    historicalAvg: Math.round(avgPremium * 100) / 100,
    percentile: Math.round(percentile),
    signal,
    hedgedReturn: Math.round(hedgedReturn * 100) / 100,
    riskFactors,
  };
}

/**
 * 跨交易所套利
 */
export function findCrossExchangeArb(
  prices: MarketPrice[],
  tradingCostPct: number = 0.3,
): CrossExchangeArb[] {
  const arbList: CrossExchangeArb[] = [];
  const tickerMap = new Map<string, MarketPrice[]>();

  prices.forEach(p => {
    const existing = tickerMap.get(p.ticker) || [];
    existing.push(p);
    tickerMap.set(p.ticker, existing);
  });

  tickerMap.forEach((marketPrices, ticker) => {
    for (let i = 0; i < marketPrices.length; i++) {
      for (let j = i + 1; j < marketPrices.length; j++) {
        const p1 = marketPrices[i];
        const p2 = marketPrices[j];

        // 统一货币
        const fxKey = `${p1.currency}_${p2.currency}`;
        const fxRate = FX_RATES[fxKey] || 1;
        const price2InC1 = p2.price * fxRate;

        const spread = p1.price - price2InC1;
        const spreadPct = (spread / price2InC1) * 100;
        const totalCost = tradingCostPct * 2; // 双边成本
        const netProfit = Math.abs(spreadPct) - totalCost;

        if (netProfit > 0) {
          arbList.push({
            ticker,
            market1: p1.market,
            market2: p2.market,
            price1: p1.price,
            price2: price2InC1,
            spread: Math.round(spread * 100) / 100,
            spreadPct: Math.round(spreadPct * 100) / 100,
            tradingCost: totalCost,
            netProfit: Math.round(netProfit * 100) / 100,
            profitable: true,
            action: spread > 0
              ? `卖${p1.market}买${p2.market}`
              : `买${p1.market}卖${p2.market}`,
          });
        }
      }
    }
  });

  return arbList.sort((a, b) => b.netProfit - a.netProfit);
}

/**
 * 期现套利
 */
export function analyzeCashCarryArb(
  spotPrice: number,
  futuresPrice: number,
  daysToExpiry: number,
  riskFreeRate: number = 0.025,
): CashCarryArb {
  const basis = futuresPrice - spotPrice;
  const annualizedBasis = daysToExpiry > 0 ? (basis / spotPrice) * (365 / daysToExpiry) * 100 : 0;
  const costOfCarry = riskFreeRate * 100 * (daysToExpiry / 365);

  const netArbProfit = annualizedBasis - riskFreeRate * 100 - 0.5; // 减去交易成本0.5%

  let direction: CashCarryArb['direction'];
  if (netArbProfit > 1) direction = 'cash_and_carry'; // 买现货卖期货
  else if (netArbProfit < -1) direction = 'reverse_cash_and_carry'; // 卖现货买期货
  else direction = 'none';

  return {
    ticker: '',
    spotPrice,
    futuresPrice,
    basis: Math.round(basis * 100) / 100,
    annualizedBasis: Math.round(annualizedBasis * 100) / 100,
    riskFreeRate,
    daysToExpiry,
    costOfCarry: Math.round(costOfCarry * 10000) / 10000,
    netArbProfit: Math.round(netArbProfit * 100) / 100,
    profitable: Math.abs(netArbProfit) > 1,
    direction,
  };
}

/**
 * 汇率对冲分析
 */
export function analyzeFXHedge(
  spotRate: number,
  forwardRate: number,
  investmentAmount: number,
  holdingDays: number,
): FXHedgeAnalysis {
  const forwardPoints = forwardRate - spotRate;
  const hedgeCost = (forwardPoints / spotRate) * (365 / holdingDays) * 100;
  const breakevenMove = Math.abs(hedgeCost);

  let recommendation: FXHedgeAnalysis['recommendation'];
  if (Math.abs(hedgeCost) > 3) recommendation = 'no_hedge';
  else if (Math.abs(hedgeCost) > 1) recommendation = 'partial_hedge';
  else recommendation = 'hedge';

  return {
    baseCurrency: '',
    quoteCurrency: '',
    spotRate,
    forwardRate,
    forwardPoints: Math.round(forwardPoints * 10000) / 10000,
    hedgeCost: Math.round(hedgeCost * 100) / 100,
    breakevenMove: Math.round(breakevenMove * 100) / 100,
    recommendation,
  };
}
