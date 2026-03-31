/**
 * ETF套利引擎
 * 溢折价套利/一二级市场联动/成分股替代/事件套利
 */

export interface ETFPosition {
  ticker: string;
  name: string;
  nav: number;
  price: number;
  premium: number;
  volume: number;
  creationUnit: number;    // 最小申购赎回单位
  holdings: { ticker: string; weight: number; price: number }[];
  trackingError: number;
  expenseRatio: number;
}

export interface ArbitrageOpportunity {
  type: 'premium_arb' | 'discount_arb' | 'substitution' | 'event_arb';
  etf: string;
  direction: 'buy_etf_sell_stocks' | 'sell_etf_buy_stocks' | 'substitute';
  estimatedProfit: number;
  profitBps: number;
  cost: {
    commission: number;
    spread: number;
    impact: number;
    tracking: number;
    total: number;
  };
  executionSteps: string[];
  risk: 'low' | 'medium' | 'high';
  timeConstraint: string;
}

export interface CreationRedemption {
  etf: string;
  action: 'create' | 'redeem';
  units: number;
  cashComponent: number;
  stockComponents: { ticker: string; shares: number; amount: number }[];
  totalCost: number;
  navDiff: number;
  netProfit: number;
  feasible: boolean;
  reason?: string;
}

export interface SubstitutionPair {
  primary: string;
  substitute: string;
  correlation: number;
  trackingError: number;
  costSaving: number;
  liquidityRatio: number;
  recommendation: string;
}

/**
 * 检测溢价套利
 */
export function detectPremiumArb(etf: ETFPosition): ArbitrageOpportunity | null {
  if (etf.premium < 0.5) return null; // 溢价至少0.5%

  const creationUnit = etf.creationUnit;
  const navPerUnit = etf.nav * creationUnit;
  const pricePerUnit = etf.price * creationUnit;
  const grossProfit = pricePerUnit - navPerUnit;

  // 成本估算
  const commission = navPerUnit * 0.0003;
  const spread = navPerUnit * 0.001;
  const impact = navPerUnit * 0.0005;
  const tracking = navPerUnit * etf.trackingError;
  const totalCost = commission + spread + impact + tracking;

  const netProfit = grossProfit - totalCost;
  const profitBps = (netProfit / navPerUnit) * 10000;

  if (netProfit <= 0) return null;

  return {
    type: 'premium_arb',
    etf: etf.ticker,
    direction: 'sell_etf_buy_stocks',
    estimatedProfit: netProfit,
    profitBps,
    cost: { commission, spread, impact, tracking, total: totalCost },
    executionSteps: [
      `1. 一级市场申购${creationUnit}份ETF`,
      `2. 二级市场卖出${creationUnit}份ETF`,
      `3. 净利润: ${(netProfit / 1e4).toFixed(2)}万元`,
    ],
    risk: etf.premium > 2 ? 'high' : etf.premium > 1 ? 'medium' : 'low',
    timeConstraint: 'T+0日内完成',
  };
}

/**
 * 检测折价套利
 */
export function detectDiscountArb(etf: ETFPosition): ArbitrageOpportunity | null {
  if (etf.premium > -0.5) return null; // 折价至少0.5%

  const creationUnit = etf.creationUnit;
  const navPerUnit = etf.nav * creationUnit;
  const pricePerUnit = etf.price * creationUnit;
  const grossProfit = navPerUnit - pricePerUnit;

  const commission = navPerUnit * 0.0003;
  const spread = navPerUnit * 0.001;
  const impact = navPerUnit * 0.0005;
  const tracking = navPerUnit * etf.trackingError;
  const totalCost = commission + spread + impact + tracking;

  const netProfit = grossProfit - totalCost;

  if (netProfit <= 0) return null;

  return {
    type: 'discount_arb',
    etf: etf.ticker,
    direction: 'buy_etf_sell_stocks',
    estimatedProfit: netProfit,
    profitBps: (netProfit / navPerUnit) * 10000,
    cost: { commission, spread, impact, tracking, total: totalCost },
    executionSteps: [
      `1. 二级市场买入${creationUnit}份ETF`,
      `2. 一级市场赎回获取一篮子股票`,
      `3. 二级市场卖出股票`,
    ],
    risk: Math.abs(etf.premium) > 2 ? 'high' : 'medium',
    timeConstraint: 'T+2完成(赎回需要)',
  };
}

/**
 * 申购赎回分析
 */
export function analyzeCreationRedemption(
  etf: ETFPosition,
  units: number,
  action: 'create' | 'redeem'
): CreationRedemption {
  const nav = etf.nav;
  const totalValue = nav * units;

  const stockComponents = etf.holdings.map(h => {
    const targetValue = totalValue * h.weight;
    const shares = Math.round(targetValue / h.price / 100) * 100; // 整手
    return {
      ticker: h.ticker,
      shares,
      amount: shares * h.price,
    };
  });

  const cashComponent = totalValue - stockComponents.reduce((s, c) => s + c.amount, 0);
  const totalCost = totalValue * 0.001; // 简化交易成本

  const navDiff = action === 'create'
    ? (etf.price * units - totalValue)
    : (totalValue - etf.price * units);

  const netProfit = navDiff - totalCost;
  const feasible = units >= etf.creationUnit && units % etf.creationUnit === 0;

  return {
    etf: etf.ticker,
    action,
    units,
    cashComponent,
    stockComponents,
    totalCost,
    navDiff,
    netProfit,
    feasible,
    reason: !feasible ? `最小申购赎回单位为${etf.creationUnit}份` : undefined,
  };
}

/**
 * 成分股替代方案
 */
export function findSubstitutionPairs(
  etfs: ETFPosition[]
): SubstitutionPair[] {
  const pairs: SubstitutionPair[] = [];

  for (let i = 0; i < etfs.length; i++) {
    for (let j = i + 1; j < etfs.length; j++) {
      const a = etfs[i];
      const b = etfs[j];

      // 检查持仓重叠
      const aSet = new Set(a.holdings.map(h => h.ticker));
      const bSet = new Set(b.holdings.map(h => h.ticker));
      const overlap = [...aSet].filter(t => bSet.has(t)).length;
      const union = new Set([...aSet, ...bSet]).size;
      const correlation = union > 0 ? overlap / union : 0;

      if (correlation >= 0.5) {
        const costSaving = a.expenseRatio - b.expenseRatio;
        const liquidityRatio = b.volume / (a.volume || 1);

        pairs.push({
          primary: a.ticker,
          substitute: b.ticker,
          correlation,
          trackingError: Math.abs(a.trackingError - b.trackingError),
          costSaving,
          liquidityRatio,
          recommendation: costSaving > 0
            ? `${b.ticker}费率更低，可替代${a.ticker}`
            : correlation > 0.8
              ? '持仓高度重叠，可做交叉对冲'
              : '部分重叠，可做组合配置',
        });
      }
    }
  }

  return pairs.sort((a, b) => b.correlation - a.correlation);
}

/**
 * 扫描所有套利机会
 */
export function scanArbitrageOpportunities(
  etfs: ETFPosition[]
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const etf of etfs) {
    const premium = detectPremiumArb(etf);
    if (premium) opportunities.push(premium);

    const discount = detectDiscountArb(etf);
    if (discount) opportunities.push(discount);
  }

  return opportunities.sort((a, b) => b.profitBps - a.profitBps);
}
