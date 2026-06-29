/**
 * A股交易成本计算引擎
 * 精确计算佣金、印花税、过户费等交易成本
 * 支持不同券商费率和交易类型
 */

/** 交易方向 */
export type TradeSide = 'buy' | 'sell';

/** 交易市场 */
export type TradeMarket = 'sh' | 'sz' | 'bj';

/** 券商费率方案 */
export interface BrokerFee {
  /** 券商名称 */
  name: string;
  /** 佣金费率 (万分之) */
  commissionRate: number;
  /** 最低佣金 (元) */
  minCommission: number;
  /** 是否免五 */
  isWuMian: boolean;
}

/** 交易成本明细 */
export interface TradeCostBreakdown {
  /** 交易金额 */
  tradeAmount: number;
  /** 佣金 */
  commission: number;
  /** 印花税 (仅卖出) */
  stampDuty: number;
  /** 过户费 */
  transferFee: number;
  /** 经手费 */
  handlingFee: number;
  /** 证管费 */
  regulatoryFee: number;
  /** 总成本 */
  totalCost: number;
  /** 成本占比 (万分之) */
  costRatio: number;
  /** 盈亏平衡涨幅 (万分之) */
  breakevenMove: number;
}

/** 批量交易统计 */
export interface BatchTradeStats {
  totalTrades: number;
  totalAmount: number;
  totalCost: number;
  avgCostRatio: number;
  buyCosts: number;
  sellCosts: number;
  maxSingleCost: number;
  minSingleCost: number;
}

/** 默认券商费率 */
export const DEFAULT_BROKERS: Record<string, BrokerFee> = {
  standard: { name: '标准费率', commissionRate: 2.5, minCommission: 5, isWuMian: false },
  lowCost: { name: '低佣券商', commissionRate: 1.5, minCommission: 5, isWuMian: false },
  wuMian: { name: '免五券商', commissionRate: 1.5, minCommission: 0, isWuMian: true },
  vip: { name: 'VIP费率', commissionRate: 0.8, minCommission: 0, isWuMian: true },
};

/** A股印花税率 (千分之一) */
export const STAMP_DUTY_RATE = 0.001;

/** 过户费率 (万分之0.1) */
export const TRANSFER_FEE_RATE = 0.00001;

/** 经手费率 (万分之0.487) */
export const HANDLING_FEE_RATE = 0.0000487;

/** 证管费率 (万分之0.02) */
export const REGULATORY_FEE_RATE = 0.000002;

/**
 * 计算单笔交易成本
 */
export function calculateTradeCost(
  price: number,
  quantity: number,
  side: TradeSide,
  _market: TradeMarket = 'sh',
  broker: BrokerFee = DEFAULT_BROKERS.standard
): TradeCostBreakdown {
  const tradeAmount = price * quantity;

  // 佣金
  let commission = tradeAmount * (broker.commissionRate / 10000);
  if (!broker.isWuMian && commission < broker.minCommission) {
    commission = broker.minCommission;
  }
  commission = Math.round(commission * 100) / 100;

  // 印花税 (仅卖出时收取)
  const stampDuty = side === 'sell'
    ? Math.round(tradeAmount * STAMP_DUTY_RATE * 100) / 100
    : 0;

  // 过户费 (2022年改革后沪深北统一收取)
  let transferFee = 0;
  transferFee = Math.round(tradeAmount * TRANSFER_FEE_RATE * 100) / 100;

  // 经手费
  const handlingFee = Math.round(tradeAmount * HANDLING_FEE_RATE * 100) / 100;

  // 证管费
  const regulatoryFee = Math.round(tradeAmount * REGULATORY_FEE_RATE * 100) / 100;

  const totalCost = commission + stampDuty + transferFee + handlingFee + regulatoryFee;
  const costRatio = tradeAmount > 0 ? (totalCost / tradeAmount) * 10000 : 0;
  const breakevenMove = costRatio;

  return {
    tradeAmount: Math.round(tradeAmount * 100) / 100,
    commission,
    stampDuty,
    transferFee,
    handlingFee,
    regulatoryFee,
    totalCost: Math.round(totalCost * 100) / 100,
    costRatio: Math.round(costRatio * 100) / 100,
    breakevenMove: Math.round(breakevenMove * 100) / 100,
  };
}

/**
 * 计算完整一轮交易成本 (买入+卖出)
 */
export function calculateRoundTripCost(
  price: number,
  quantity: number,
  market: TradeMarket = 'sh',
  broker: BrokerFee = DEFAULT_BROKERS.standard
): { buyCost: TradeCostBreakdown; sellCost: TradeCostBreakdown; totalCost: number; breakevenMove: number } {
  const buyCost = calculateTradeCost(price, quantity, 'buy', market, broker);
  const sellCost = calculateTradeCost(price, quantity, 'sell', market, broker);
  const totalCost = buyCost.totalCost + sellCost.totalCost;
  const tradeAmount = price * quantity;
  const breakevenMove = tradeAmount > 0 ? (totalCost / tradeAmount) * 10000 : 0;

  return {
    buyCost,
    sellCost,
    totalCost: Math.round(totalCost * 100) / 100,
    breakevenMove: Math.round(breakevenMove * 100) / 100,
  };
}

/**
 * 批量计算交易成本
 */
export function calculateBatchTradeCost(
  trades: Array<{ price: number; quantity: number; side: TradeSide; market?: TradeMarket }>,
  broker: BrokerFee = DEFAULT_BROKERS.standard
): BatchTradeStats {
  const costs = trades.map(t => calculateTradeCost(t.price, t.quantity, t.side, t.market || 'sh', broker));

  const totalAmount = costs.reduce((s, c) => s + c.tradeAmount, 0);
  const totalCost = costs.reduce((s, c) => s + c.totalCost, 0);
  const buyCosts = costs.filter((_, i) => trades[i].side === 'buy').reduce((s, c) => s + c.totalCost, 0);
  const sellCosts = costs.filter((_, i) => trades[i].side === 'sell').reduce((s, c) => s + c.totalCost, 0);

  return {
    totalTrades: trades.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    avgCostRatio: totalAmount > 0 ? Math.round((totalCost / totalAmount) * 10000 * 100) / 100 : 0,
    buyCosts: Math.round(buyCosts * 100) / 100,
    sellCosts: Math.round(sellCosts * 100) / 100,
    maxSingleCost: Math.round(Math.max(...costs.map(c => c.totalCost)) * 100) / 100,
    minSingleCost: Math.round(Math.min(...costs.map(c => c.totalCost)) * 100) / 100,
  };
}

/**
 * 比较不同券商费率
 */
export function compareBrokerCosts(
  price: number,
  quantity: number,
  side: TradeSide = 'buy',
  market: TradeMarket = 'sh'
): Array<{ broker: string; cost: TradeCostBreakdown }> {
  return Object.entries(DEFAULT_BROKERS).map(([_key, broker]) => ({
    broker: broker.name,
    cost: calculateTradeCost(price, quantity, side, market, broker),
  }));
}

/**
 * 计算最优交易金额 (使得佣金不浪费)
 */
export function calculateOptimalTradeAmount(broker: BrokerFee = DEFAULT_BROKERS.standard): number {
  if (broker.isWuMian || broker.minCommission === 0) return 0;
  // 最低佣金对应的实际费率点
  // minCommission = amount * rate/10000 → amount = minCommission * 10000 / rate
  return Math.round((broker.minCommission * 10000 / broker.commissionRate) * 100) / 100;
}

export default {
  calculateTradeCost,
  calculateRoundTripCost,
  calculateBatchTradeCost,
  compareBrokerCosts,
  calculateOptimalTradeAmount,
  DEFAULT_BROKERS,
  STAMP_DUTY_RATE,
  TRANSFER_FEE_RATE,
  HANDLING_FEE_RATE,
  REGULATORY_FEE_RATE,
};
