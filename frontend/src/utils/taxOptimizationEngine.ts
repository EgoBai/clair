/**
 * Tax Optimization & Cost Analysis Engine
 * 税务优化与成本分析引擎 - A股交易成本、税费计算
 */

export interface TradeCost {
  commission: number;
  stampDuty: number;
  transferFee: number;
  regulatoryFee: number;
  total: number;
}

export interface TaxLot {
  purchaseDate: string;
  quantity: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
  holdingDays: number;
  isLongTerm: boolean;
}

export interface TaxOptimizationResult {
  method: 'FIFO' | 'LIFO' | 'HIFO' | 'LOFO';
  totalGain: number;
  totalLoss: number;
  netGain: number;
  estimatedTax: number;
  taxSavings: number;
  lotsSold: TaxLot[];
}

export interface DividendTaxInfo {
  stockCode: string;
  dividendPerShare: number;
  holdingDays: number;
  taxRate: number;
  taxPerShare: number;
  netDividend: number;
}

// A股费率
export const A_STOCK_FEES = {
  // 佣金（默认万2.5，最低5元）
  commissionRate: 0.00025,
  minCommission: 5,
  // 印花税（卖出时千1）
  stampDutyRate: 0.001,
  // 过户费（万0.1）
  transferFeeRate: 0.00001,
  // 经手费
  exchangeFeeRate: 0.0000487,
  // 证管费
  regulatoryFeeRate: 0.00002,
};

// 科创板/创业板费率差异
export const STAR_GEM_FEES = {
  ...A_STOCK_FEES,
  transferFeeRate: 0, // 科创板无过户费
};

export function calculateTradeCost(
  amount: number,
  isSell: boolean,
  market: 'main' | 'star' | 'gem' | 'hk' = 'main',
  commissionRate?: number
): TradeCost {
  const fees = market === 'star' || market === 'gem' ? STAR_GEM_FEES : A_STOCK_FEES;
  const rate = commissionRate ?? fees.commissionRate;

  const commission = Math.max(amount * rate, fees.minCommission);
  const stampDuty = isSell ? amount * fees.stampDutyRate : 0;
  const transferFee = amount * fees.transferFeeRate;
  const regulatoryFee = amount * (fees.exchangeFeeRate + fees.regulatoryFeeRate);
  const total = commission + stampDuty + transferFee + regulatoryFee;

  return { commission, stampDuty, transferFee, regulatoryFee, total };
}

export function calculateRoundTripCost(
  buyAmount: number,
  sellAmount: number,
  market: 'main' | 'star' | 'gem' | 'hk' = 'main'
): { buyCost: TradeCost; sellCost: TradeCost; totalCost: number; costPercent: number } {
  const buyCost = calculateTradeCost(buyAmount, false, market);
  const sellCost = calculateTradeCost(sellAmount, true, market);
  const totalCost = buyCost.total + sellCost.total;
  const costPercent = buyAmount > 0 ? totalCost / buyAmount : 0;

  return { buyCost, sellCost, totalCost, costPercent };
}

export function calculateBreakevenPrice(
  buyPrice: number,
  market: 'main' | 'star' | 'gem' | 'hk' = 'main'
): number {
  const fees = market === 'star' || market === 'gem' ? STAR_GEM_FEES : A_STOCK_FEES;

  // Buy cost per unit
  const buyCommission = Math.max(buyPrice * fees.commissionRate, fees.minCommission / buyPrice);
  const buyTransfer = buyPrice * fees.transferFeeRate;
  const buyRegulatory = buyPrice * (fees.exchangeFeeRate + fees.regulatoryFeeRate);
  const totalBuyCost = buyPrice + buyCommission + buyTransfer + buyRegulatory;

  // Sell fees as percentage (minus min commission effect)
  const sellFeeRate = fees.commissionRate + fees.stampDutyRate + fees.transferFeeRate +
    fees.exchangeFeeRate + fees.regulatoryFeeRate;

  // Breakeven: sellPrice * (1 - sellFeeRate) = totalBuyCost
  // Approximate: use total fee rate
  const breakeven = totalBuyCost / (1 - sellFeeRate);

  return breakeven;
}

export function calculateMinProfitableHolding(
  buyPrice: number,
  dailyInterestRate: number = 0.0001,
  market: 'main' | 'star' | 'gem' | 'hk' = 'main'
): { minDays: number; minProfitPercent: number } {
  const breakeven = calculateBreakevenPrice(buyPrice, market);
  const profitPercent = (breakeven - buyPrice) / buyPrice;

  // Consider opportunity cost
  const minDays = dailyInterestRate > 0
    ? Math.ceil(profitPercent / dailyInterestRate)
    : 0;

  return { minDays, minProfitPercent: profitPercent };
}

export function optimizeTaxLots(
  lots: TaxLot[],
  sellQuantity: number,
  method: 'FIFO' | 'LIFO' | 'HIFO' | 'LOFO' = 'FIFO'
): TaxOptimizationResult {
  const sorted = [...lots];
  switch (method) {
    case 'FIFO':
      sorted.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
      break;
    case 'LIFO':
      sorted.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
      break;
    case 'HIFO':
      sorted.sort((a, b) => b.costBasis - a.costBasis);
      break;
    case 'LOFO':
      sorted.sort((a, b) => a.costBasis - b.costBasis);
      break;
  }

  const lotsSold: TaxLot[] = [];
  let remaining = sellQuantity;
  let totalGain = 0;
  let totalLoss = 0;

  for (const lot of sorted) {
    if (remaining <= 0) break;

    const sellQty = Math.min(lot.quantity, remaining);
    const pnl = (lot.currentPrice - lot.costBasis) * sellQty;

    lotsSold.push({ ...lot, quantity: sellQty, unrealizedPnL: pnl });

    if (pnl > 0) totalGain += pnl;
    else totalLoss += Math.abs(pnl);

    remaining -= sellQty;
  }

  const netGain = totalGain - totalLoss;
  // A股目前免征资本利得税
  const estimatedTax = 0;
  const taxSavings = 0;

  return { method, totalGain, totalLoss, netGain, estimatedTax, taxSavings, lotsSold };
}

export function compareTaxMethods(
  lots: TaxLot[],
  sellQuantity: number
): Record<string, TaxOptimizationResult> {
  const methods: ('FIFO' | 'LIFO' | 'HIFO' | 'LOFO')[] = ['FIFO', 'LIFO', 'HIFO', 'LOFO'];
  const results: Record<string, TaxOptimizationResult> = {};

  for (const method of methods) {
    results[method] = optimizeTaxLots(lots, sellQuantity, method);
  }

  return results;
}

export function calculateDividendTax(
  stockCode: string,
  dividendPerShare: number,
  holdingDays: number
): DividendTaxInfo {
  // A股股息税：持股>1年免税，1月-1年税率10%，<1月税率20%
  let taxRate = 0.2;
  if (holdingDays > 365) taxRate = 0;
  else if (holdingDays > 30) taxRate = 0.1;

  const taxPerShare = dividendPerShare * taxRate;
  const netDividend = dividendPerShare - taxPerShare;

  return { stockCode, dividendPerShare, holdingDays, taxRate, taxPerShare, netDividend };
}

export function calculateOptimalDividendStrategy(
  stockCode: string,
  dividendPerShare: number,
  exDividendDate: string,
  purchaseDate: string
): { holdUntil: string; taxRate: number; netDividend: number; recommendation: string } {
  const purchase = new Date(purchaseDate);
  const exDate = new Date(exDividendDate);

  // 持股到除权日后1年免税
  const holdUntilDate = new Date(exDate);
  holdUntilDate.setDate(holdUntilDate.getDate() + 366);

  const holdingDaysAtEx = Math.floor((exDate.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24));
  const currentTax = calculateDividendTax(stockCode, dividendPerShare, holdingDaysAtEx);

  let recommendation: string;
  if (holdingDaysAtEx > 365) {
    recommendation = '持股已超过1年，股息免税';
  } else if (holdingDaysAtEx > 30) {
    recommendation = `持股${holdingDaysAtEx}天，股息税率10%，考虑继续持有至1年`;
  } else {
    recommendation = `持股${holdingDaysAtEx}天，股息税率20%，强烈建议持有至30天以上`;
  }

  return {
    holdUntil: holdUntilDate.toISOString().split('T')[0],
    taxRate: currentTax.taxRate,
    netDividend: currentTax.netDividend,
    recommendation,
  };
}

export function calculateTotalTradingCost(
  trades: { amount: number; isSell: boolean; market?: 'main' | 'star' | 'gem' | 'hk' }[]
): { totalCost: number; avgCostPerTrade: number; costAsPercentOfVolume: number } {
  let totalCost = 0;
  let totalVolume = 0;

  for (const trade of trades) {
    const cost = calculateTradeCost(trade.amount, trade.isSell, trade.market ?? 'main');
    totalCost += cost.total;
    totalVolume += trade.amount;
  }

  return {
    totalCost,
    avgCostPerTrade: trades.length > 0 ? totalCost / trades.length : 0,
    costAsPercentOfVolume: totalVolume > 0 ? totalCost / totalVolume : 0,
  };
}

export function estimateAnnualCostImpact(
  annualTurnover: number,
  avgPositionSize: number,
  tradesPerYear: number,
  market: 'main' | 'star' | 'gem' | 'hk' = 'main'
): { annualCost: number; costPerTrade: number; dragOnReturns: number } {
  const totalVolume = annualTurnover * avgPositionSize;
  const roundTrips = tradesPerYear / 2;
  const avgTradeSize = totalVolume / tradesPerYear;

  const { totalCost } = calculateTotalTradingCost(
    Array.from({ length: tradesPerYear }, (_, i) => ({
      amount: avgTradeSize,
      isSell: i % 2 === 1,
      market,
    }))
  );

  return {
    annualCost: totalCost,
    costPerTrade: totalCost / tradesPerYear,
    dragOnReturns: avgPositionSize > 0 ? totalCost / avgPositionSize : 0,
  };
}
