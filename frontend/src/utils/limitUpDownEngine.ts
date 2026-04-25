/**
 * 涨跌停分析引擎
 * 涨跌停统计、封板强度、连板分析
 */

export interface LimitData {
  stockCode: string;
  stockName: string;
  date: string;
  price: number;
  limitPrice: number;
  type: 'limit_up' | 'limit_down';
  sealVolume: number;   // 封板量
  sealTime: string;     // 封板时间
  openCount: number;    // 开板次数
  prevLimitDays: number; // 连板天数
  sector: string;
}

export interface LimitAnalysis {
  date: string;
  limitUpCount: number;
  limitDownCount: number;
  netLimit: number;
  sealStrength: number;
  topSealed: LimitData[];
  streakStocks: { stock: string; days: number; type: 'limit_up' | 'limit_down' }[];
  sectorDistribution: { sector: string; count: number }[];
  marketSentiment: 'extreme_fear' | 'fear' | 'neutral' | 'greedy' | 'extreme_greedy';
  nextDayReturn: number;
}

/**
 * 分析涨跌停数据
 */
export function analyzeLimitUpDown(data: LimitData[], date: string): LimitAnalysis {
  const dayData = data.filter(d => d.date === date);
  const limitUp = dayData.filter(d => d.type === 'limit_up');
  const limitDown = dayData.filter(d => d.type === 'limit_down');

  // 封板强度
  const sealedUp = limitUp.filter(d => d.openCount === 0);
  const sealStrength = limitUp.length > 0 ? sealedUp.length / limitUp.length : 0;

  // 最强封板
  const topSealed = [...limitUp]
    .sort((a, b) => b.sealVolume - a.sealVolume)
    .slice(0, 10);

  // 连板股
  const streakStocks = dayData
    .filter(d => d.prevLimitDays > 0)
    .map(d => ({ stock: d.stockName, days: d.prevLimitDays + 1, type: d.type }))
    .sort((a, b) => b.days - a.days);

  // 板块分布
  const sectorMap = new Map<string, number>();
  limitUp.forEach(d => sectorMap.set(d.sector, (sectorMap.get(d.sector) || 0) + 1));
  const sectorDistribution = Array.from(sectorMap.entries())
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count);

  // 市场情绪
  const netLimit = limitUp.length - limitDown.length;
  let marketSentiment: LimitAnalysis['marketSentiment'] = 'neutral';
  if (netLimit > 50) marketSentiment = 'extreme_greedy';
  else if (netLimit > 20) marketSentiment = 'greedy';
  else if (netLimit < -50) marketSentiment = 'extreme_fear';
  else if (netLimit < -20) marketSentiment = 'fear';

  return {
    date,
    limitUpCount: limitUp.length,
    limitDownCount: limitDown.length,
    netLimit,
    sealStrength: Math.round(sealStrength * 100) / 100,
    topSealed,
    streakStocks: streakStocks.slice(0, 10),
    sectorDistribution,
    marketSentiment,
    nextDayReturn: 0, // 需要后续数据计算
  };
}

/**
 * 涨跌停板强度评分
 */
export function sealStrengthScore(stock: LimitData): number {
  let score = 50;
  score += stock.openCount === 0 ? 20 : -stock.openCount * 10;
  score += stock.sealVolume > 1000000 ? 15 : stock.sealVolume > 500000 ? 10 : 5;
  score += stock.prevLimitDays > 0 ? stock.prevLimitDays * 5 : 0;
  // 封板时间越早越好
  const hour = parseInt(stock.sealTime.split(':')[0], 10);
  score += hour < 10 ? 15 : hour < 11 ? 10 : hour < 14 ? 5 : 0;
  return Math.max(0, Math.min(100, score));
}
