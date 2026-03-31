/**
 * 内部人交易分析引擎 - 高管/大股东增减持/股权激励/质押分析
 */

export interface InsiderTrade {
  ticker: string;
  name: string;
  role: 'chairman' | 'ceo' | 'cfo' | 'director' | 'supervisor' | 'senior_mgmt' | 'major_shareholder';
  type: 'buy' | 'sell' | 'increase' | 'decrease';
  shares: number;
  price: number;
  date: string;
  reason?: string; // 增持原因
  afterHolding: number; // 变动后持股
  holdingPct: number; // 持股比例
}

export interface InsiderAnalysis {
  ticker: string;
  period: string;
  summary: {
    totalBuyAmount: number;
    totalSellAmount: number;
    netAmount: number;
    buyCount: number;
    sellCount: number;
    netDirection: 'buy' | 'sell' | 'neutral';
  };
  topInsiders: Array<{
    name: string;
    role: string;
    netChange: number;
    avgPrice: number;
    signal: string;
  }>;
  signals: {
    clusterBuying: boolean; // 集中增持
    clusterSelling: boolean; // 集中减持
    ceoBuying: boolean; // CEO增持
    smartMoney: boolean; // 高管低位增持
    dumping: boolean; // 高位减持
  };
  conviction: number; // 信心指标 0-100
  historicalAccuracy: number; // 历史准确率
  recommendation: string;
}

export interface SharePledgeAnalysis {
  ticker: string;
  totalPledgeRatio: number; // 总质押率(%)
  controllingShareholderPledge: number; // 控股股东质押率
  riskLevel: 'low' | 'moderate' | 'elevated' | 'high' | 'critical';
  nearWarningLine: number; // 接近预警线笔数
  nearLiquidation: number; // 接近平仓线笔数
  recentPledges: Array<{
    shareholder: string;
    shares: number;
    ratio: number;
    price: number;
    warningLine: number;
    liquidationLine: number;
  }>;
  riskWarning: string;
}

export interface EquityIncentive {
  ticker: string;
  type: 'option' | 'restricted_stock' | 'stock_appreciation_right';
  totalShares: number;
  grantPrice: number;
  currentPrice: number;
  vestingSchedule: string[];
  performanceCondition?: string;
  inTheMoney: boolean; // 是否实值
  intrinsicValue: number;
  participants: number;
  coverageRatio: number; // 激励覆盖率
}

/**
 * 分析内部人交易
 */
export function analyzeInsiderTrades(trades: InsiderTrade[], currentPrice: number): InsiderAnalysis {
  const ticker = trades[0]?.ticker || '';

  if (trades.length === 0) {
    return {
      ticker,
      period: '',
      summary: { totalBuyAmount: 0, totalSellAmount: 0, netAmount: 0, buyCount: 0, sellCount: 0, netDirection: 'neutral' },
      topInsiders: [],
      signals: { clusterBuying: false, clusterSelling: false, ceoBuying: false, smartMoney: false, dumping: false },
      conviction: 50,
      historicalAccuracy: 50,
      recommendation: '暂无内部人交易数据',
    };
  }

  // 汇总
  const buys = trades.filter(t => t.type === 'buy' || t.type === 'increase');
  const sells = trades.filter(t => t.type === 'sell' || t.type === 'decrease');

  const totalBuyAmount = buys.reduce((s, t) => s + t.shares * t.price, 0);
  const totalSellAmount = sells.reduce((s, t) => s + t.shares * t.price, 0);
  const netAmount = totalBuyAmount - totalSellAmount;

  let netDirection: 'buy' | 'sell' | 'neutral';
  if (netAmount > totalBuyAmount * 0.1) netDirection = 'buy';
  else if (netAmount < -totalSellAmount * 0.1) netDirection = 'sell';
  else netDirection = 'neutral';

  // Top insiders
  const insiderMap = new Map<string, { netChange: number; totalPrice: number; count: number; role: string }>();
  trades.forEach(t => {
    const key = t.name;
    const existing = insiderMap.get(key) || { netChange: 0, totalPrice: 0, count: 0, role: t.role };
    const isBuy = t.type === 'buy' || t.type === 'increase';
    existing.netChange += isBuy ? t.shares * t.price : -t.shares * t.price;
    existing.totalPrice += t.price * t.shares;
    existing.count++;
    existing.role = t.role;
    insiderMap.set(key, existing);
  });

  const topInsiders = Array.from(insiderMap.entries())
    .map(([name, data]) => ({
      name,
      role: data.role,
      netChange: Math.round(data.netChange),
      avgPrice: Math.round(data.totalPrice / (data.count > 0 ? Math.abs(data.netChange / (data.totalPrice / data.count)) : 1) * 100) / 100 || data.totalPrice / data.count,
      signal: data.netChange > 0 ? '增持' : '减持',
    }))
    .sort((a, b) => Math.abs(b.netChange) - Math.abs(a.netChange))
    .slice(0, 5);

  // 信号
  const buyDates = new Set(buys.map(b => b.date));
  const clusterBuying = buyDates.size > 0 && buys.filter(b => {
    const sameDay = buys.filter(b2 => b2.date === b.date);
    return sameDay.length >= 3;
  }).length > 0;

  const sellDates = new Set(sells.map(s => s.date));
  const clusterSelling = sellDates.size > 0 && sells.filter(s => {
    const sameDay = sells.filter(s2 => s2.date === s.date);
    return sameDay.length >= 3;
  }).length > 0;

  const ceoBuying = buys.some(b => b.role === 'ceo' || b.role === 'chairman');
  const avgBuyPrice = buys.length > 0 ? buys.reduce((s, b) => s + b.price, 0) / buys.length : currentPrice;
  const smartMoney = ceoBuying && avgBuyPrice < currentPrice * 0.9;
  const dumping = sells.length > 0 && sells.some(s => s.price > currentPrice * 1.1);

  // 信心指标
  let conviction = 50;
  if (netDirection === 'buy') conviction += 20;
  if (clusterBuying) conviction += 15;
  if (ceoBuying) conviction += 10;
  if (smartMoney) conviction += 10;
  if (dumping) conviction -= 20;
  if (clusterSelling) conviction -= 15;
  conviction = Math.min(100, Math.max(0, conviction));

  // 建议
  let recommendation = '';
  if (smartMoney) recommendation = '高管低位增持，信号强烈，建议关注';
  else if (clusterBuying) recommendation = '多位内部人集中增持，正面信号';
  else if (dumping) recommendation = '内部人高位减持，注意风险';
  else if (clusterSelling) recommendation = '多位内部人减持，谨慎观望';
  else if (netDirection === 'buy') recommendation = '内部人净增持，偏正面';
  else if (netDirection === 'sell') recommendation = '内部人净减持，偏负面';
  else recommendation = '内部人交易信号中性';

  const dates = trades.map(t => t.date).sort();
  const period = dates.length >= 2 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : dates[0] || '';

  return {
    ticker,
    period,
    summary: {
      totalBuyAmount: Math.round(totalBuyAmount),
      totalSellAmount: Math.round(totalSellAmount),
      netAmount: Math.round(netAmount),
      buyCount: buys.length,
      sellCount: sells.length,
      netDirection,
    },
    topInsiders,
    signals: {
      clusterBuying,
      clusterSelling,
      ceoBuying,
      smartMoney,
      dumping,
    },
    conviction,
    historicalAccuracy: 65, // 简化处理
    recommendation,
  };
}

/**
 * 分析股权质押风险
 */
export function analyzeSharePledge(
  ticker: string,
  pledges: Array<{ shareholder: string; shares: number; totalShares: number; price: number; isControlling: boolean }>,
  currentPrice: number,
): SharePledgeAnalysis {
  const totalPledgedShares = pledges.reduce((s, p) => s + p.shares, 0);
  const totalShares = pledges.reduce((s, p) => s + p.totalShares, 0);
  const totalPledgeRatio = totalShares > 0 ? (totalPledgedShares / totalShares) * 100 : 0;

  const controllingPledges = pledges.filter(p => p.isControlling);
  const controllingPledgedShares = controllingPledges.reduce((s, p) => s + p.shares, 0);
  const controllingTotalShares = controllingPledges.reduce((s, p) => s + p.totalShares, 0);
  const controllingShareholderPledge = controllingTotalShares > 0
    ? (controllingPledgedShares / controllingTotalShares) * 100 : 0;

  // 风险等级
  let riskLevel: SharePledgeAnalysis['riskLevel'];
  if (totalPledgeRatio > 60) riskLevel = 'critical';
  else if (totalPledgeRatio > 40) riskLevel = 'high';
  else if (totalPledgeRatio > 25) riskLevel = 'elevated';
  else if (totalPledgeRatio > 10) riskLevel = 'moderate';
  else riskLevel = 'low';

  // 预警线和平仓线 (简化: 质押价 * 1.5为预警, * 1.3为平仓)
  const recentPledges = pledges.slice(-5).map(p => {
    const warningLine = p.price * 1.5;
    const liquidationLine = p.price * 1.3;
    return {
      shareholder: p.shareholder,
      shares: p.shares,
      ratio: totalShares > 0 ? (p.shares / totalShares) * 100 : 0,
      price: p.price,
      warningLine: Math.round(warningLine * 100) / 100,
      liquidationLine: Math.round(liquidationLine * 100) / 100,
    };
  });

  const nearWarningLine = recentPledges.filter(p => currentPrice < p.warningLine).length;
  const nearLiquidation = recentPledges.filter(p => currentPrice < p.liquidationLine).length;

  let riskWarning = '';
  if (nearLiquidation > 0) riskWarning = `${nearLiquidation}笔质押接近平仓线，存在强制平仓风险`;
  else if (nearWarningLine > 0) riskWarning = `${nearWarningLine}笔质押接近预警线，需关注股价走势`;
  else if (totalPledgeRatio > 40) riskWarning = '总质押率偏高，存在流动性风险';
  else riskWarning = '质押风险可控';

  return {
    ticker,
    totalPledgeRatio: Math.round(totalPledgeRatio * 100) / 100,
    controllingShareholderPledge: Math.round(controllingShareholderPledge * 100) / 100,
    riskLevel,
    nearWarningLine,
    nearLiquidation,
    recentPledges,
    riskWarning,
  };
}
