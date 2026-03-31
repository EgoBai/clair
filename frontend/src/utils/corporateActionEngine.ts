/**
 * 公司行为分析引擎
 * - 股权激励分析
 * - 增减持分析
 * - 回购分析
 * - 分红分析
 * - 行为信号评分
 */
export interface CorporateAction {
  type: 'buyback' | 'bonus' | 'split' | 'incentive' | 'increase_holding' | 'decrease_holding' | 'special_dividend';
  date: string;
  amount: number; // 金额(万)或比例
  details: string;
  participant: string; // 参与方
  price?: number;
  shares?: number;
}

export interface CorporateActionResult {
  totalBuybackAmount: number;
  buybackSignal: 'bullish' | 'neutral' | 'bearish';
  insiderActivity: 'accumulation' | 'neutral' | 'distribution';
  incentiveCoverage: number; // 激励覆盖率
  dividendYield: number; // 综合分红收益率
  actionScore: number; // 0-100
  signals: string[];
  actionSummary: { type: string; count: number; totalAmount: number }[];
  shareholderFriendliness: 'high' | 'moderate' | 'low';
}

export function analyzeCorporateActions(actions: CorporateAction[], stockPrice: number, totalShares: number): CorporateActionResult {
  const signals: string[] = [];

  // 按类型统计
  const typeMap = new Map<string, { count: number; totalAmount: number }>();
  actions.forEach(a => {
    const entry = typeMap.get(a.type) || { count: 0, totalAmount: 0 };
    entry.count++;
    entry.totalAmount += a.amount;
    typeMap.set(a.type, entry);
  });

  const actionSummary = Array.from(typeMap.entries()).map(([type, data]) => ({
    type, count: data.count, totalAmount: data.totalAmount,
  }));

  // 回购分析
  const buyback = typeMap.get('buyback');
  const totalBuybackAmount = buyback?.totalAmount || 0;
  let buybackSignal: CorporateActionResult['buybackSignal'];
  if (totalBuybackAmount > 10000) { buybackSignal = 'bullish'; signals.push('大额回购计划'); }
  else if (totalBuybackAmount > 0) buybackSignal = 'neutral';
  else buybackSignal = 'bearish';

  // 增减持分析
  const increases = actions.filter(a => a.type === 'increase_holding');
  const decreases = actions.filter(a => a.type === 'decrease_holding');
  const netChange = increases.reduce((s, a) => s + a.amount, 0) - decreases.reduce((s, a) => s + a.amount, 0);

  let insiderActivity: CorporateActionResult['insiderActivity'];
  if (netChange > 0) { insiderActivity = 'accumulation'; signals.push('高管净增持'); }
  else if (netChange < 0) { insiderActivity = 'distribution'; signals.push('高管净减持'); }
  else insiderActivity = 'neutral';

  // 股权激励
  const incentives = actions.filter(a => a.type === 'incentive');
  const incentiveCoverage = incentives.length > 0 ? 0.15 : 0; // 简化

  // 分红
  const dividends = actions.filter(a => a.type === 'bonus' || a.type === 'special_dividend');
  const totalDividend = dividends.reduce((s, a) => s + a.amount, 0);
  const dividendYield = totalShares > 0 && stockPrice > 0
    ? totalDividend / (totalShares * stockPrice) * 100
    : 0;
  if (dividendYield > 3) signals.push('高分红收益率');

  // 综合评分
  let score = 50;
  if (buybackSignal === 'bullish') score += 20;
  else if (buybackSignal === 'bearish') score -= 10;
  if (insiderActivity === 'accumulation') score += 20;
  else if (insiderActivity === 'distribution') score -= 15;
  if (dividendYield > 3) score += 15;
  else if (dividendYield > 1) score += 5;
  if (incentiveCoverage > 0) score += 10;
  score = Math.max(0, Math.min(100, score));

  // 股东友好度
  let shareholderFriendliness: CorporateActionResult['shareholderFriendliness'];
  if (score >= 70) shareholderFriendliness = 'high';
  else if (score >= 45) shareholderFriendliness = 'moderate';
  else shareholderFriendliness = 'low';

  return {
    totalBuybackAmount,
    buybackSignal,
    insiderActivity,
    incentiveCoverage,
    dividendYield: Math.round(dividendYield * 100) / 100,
    actionScore: score,
    signals,
    actionSummary,
    shareholderFriendliness,
  };
}
