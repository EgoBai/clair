/**
 * 转融通分析引擎
 * 转融券余额、出借费率、供需分析
 */

export interface LendingData {
  date: string;
  stockCode: string;
  stockName: string;
  lentVolume: number;
  returnedVolume: number;
  lendingBalance: number;
  lendingRate: number;
  availableVolume: number;
}

export interface LendingAnalysis {
  currentBalance: number;
  balanceChange: number;
  utilizationRate: number;
  avgLendingRate: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  supplyPressure: 'low' | 'moderate' | 'high';
  signal: 'bearish' | 'neutral' | 'bullish';
  rateTrend: 'rising' | 'falling' | 'stable';
  warnings: string[];
}

/**
 * 分析转融通数据
 */
export function analyzeSecuritiesLending(data: LendingData[]): LendingAnalysis {
  if (data.length === 0) {
    return {
      currentBalance: 0, balanceChange: 0, utilizationRate: 0,
      avgLendingRate: 0, trend: 'stable', supplyPressure: 'low',
      signal: 'neutral', rateTrend: 'stable', warnings: [],
    };
  }

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : latest;

  const balanceChange = latest.lendingBalance - prev.lendingBalance;
  const utilizationRate = latest.availableVolume > 0 ? latest.lendingBalance / latest.availableVolume : 0;
  const avgLendingRate = sorted.reduce((s, d) => s + d.lendingRate, 0) / sorted.length;

  // 趋势
  const recent5 = sorted.slice(-5);
  let increasing = 0, decreasing = 0;
  for (let i = 1; i < recent5.length; i++) {
    if (recent5[i].lendingBalance > recent5[i - 1].lendingBalance) increasing++;
    else if (recent5[i].lendingBalance < recent5[i - 1].lendingBalance) decreasing++;
  }
  const trend = increasing > decreasing ? 'increasing' : decreasing > increasing ? 'decreasing' : 'stable';

  // 费率趋势
  const recentRates = sorted.slice(-5).map(d => d.lendingRate);
  const rateTrend: LendingAnalysis['rateTrend'] = recentRates.length >= 2
    ? recentRates[recentRates.length - 1] > recentRates[0] ? 'rising' : recentRates[recentRates.length - 1] < recentRates[0] ? 'falling' : 'stable'
    : 'stable';

  // 供给压力
  const supplyPressure: LendingAnalysis['supplyPressure'] =
    utilizationRate > 0.8 ? 'high' : utilizationRate > 0.5 ? 'moderate' : 'low';

  // 信号
  const signal: LendingAnalysis['signal'] =
    trend === 'increasing' && rateTrend === 'rising' ? 'bearish' :
    trend === 'decreasing' ? 'bullish' : 'neutral';

  // 警告
  const warnings: string[] = [];
  if (utilizationRate > 0.9) warnings.push('转融券利用率极高，做空力量集中');
  if (balanceChange > latest.lendingBalance * 0.2) warnings.push('转融券余额大幅增加');
  if (avgLendingRate > 0.15) warnings.push('转融券费率偏高');

  return {
    currentBalance: latest.lendingBalance,
    balanceChange: Math.round(balanceChange),
    utilizationRate: Math.round(utilizationRate * 10000) / 10000,
    avgLendingRate: Math.round(avgLendingRate * 10000) / 10000,
    trend,
    supplyPressure,
    signal,
    rateTrend,
    warnings,
  };
}
