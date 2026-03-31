/**
 * 融资融券分析引擎
 * 融资余额/融券余额、杠杆率、多空信号
 */

export interface MarginData {
  date: string;
  marginBuy: number;    // 融资买入额
  marginRepay: number;  // 融资偿还额
  marginBalance: number; // 融资余额
  shortSell: number;     // 融券卖出量
  shortRepay: number;    // 融券偿还量
  shortBalance: number;  // 融券余额
}

export interface MarginAnalysis {
  currentBalance: number;
  balanceChange: number;
  balanceChangePct: number;
  netMarginFlow: number;
  shortRatio: number;
  leverageRatio: number;
  marginTrend: 'increasing' | 'decreasing' | 'stable';
  signal: 'bullish' | 'bearish' | 'neutral';
  warningSignals: string[];
  dailyFlows: { date: string; net: number; cumulative: number }[];
}

/**
 * 分析融资融券数据
 */
export function analyzeMarginTrading(data: MarginData[]): MarginAnalysis {
  if (data.length === 0) {
    return {
      currentBalance: 0, balanceChange: 0, balanceChangePct: 0,
      netMarginFlow: 0, shortRatio: 0, leverageRatio: 0,
      marginTrend: 'stable', signal: 'neutral', warningSignals: [],
      dailyFlows: [],
    };
  }

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : latest;

  const balanceChange = latest.marginBalance - prev.marginBalance;
  const balanceChangePct = prev.marginBalance > 0 ? balanceChange / prev.marginBalance : 0;

  // 每日净融资流
  const dailyFlows = sorted.map(d => ({
    date: d.date,
    net: d.marginBuy - d.marginRepay,
    cumulative: 0,
  }));
  let cum = 0;
  dailyFlows.forEach(d => { cum += d.net; d.cumulative = cum; });

  const netMarginFlow = dailyFlows.reduce((s, d) => s + d.net, 0);

  // 融资融券比
  const shortRatio = latest.marginBalance > 0 ? latest.shortBalance / latest.marginBalance : 0;

  // 杠杆率
  const leverageRatio = latest.marginBalance > 0 ? (latest.marginBalance + latest.shortBalance) / latest.marginBalance : 1;

  // 趋势
  const recent5 = sorted.slice(-5);
  let increasing = 0, decreasing = 0;
  for (let i = 1; i < recent5.length; i++) {
    if (recent5[i].marginBalance > recent5[i - 1].marginBalance) increasing++;
    else decreasing++;
  }
  const marginTrend = increasing > decreasing ? 'increasing' : decreasing > increasing ? 'decreasing' : 'stable';

  // 信号
  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (marginTrend === 'increasing' && netMarginFlow > 0) signal = 'bullish';
  if (marginTrend === 'decreasing' && netMarginFlow < 0) signal = 'bearish';

  // 警告信号
  const warningSignals: string[] = [];
  if (shortRatio > 0.3) warningSignals.push('融券比例偏高，空头力量较强');
  if (leverageRatio > 1.5) warningSignals.push('杠杆率偏高，注意风险');
  if (Math.abs(balanceChangePct) > 0.05) warningSignals.push('融资余额波动较大');

  return {
    currentBalance: latest.marginBalance,
    balanceChange: Math.round(balanceChange),
    balanceChangePct: Math.round(balanceChangePct * 10000) / 10000,
    netMarginFlow: Math.round(netMarginFlow),
    shortRatio: Math.round(shortRatio * 10000) / 10000,
    leverageRatio: Math.round(leverageRatio * 1000) / 1000,
    marginTrend,
    signal,
    warningSignals,
    dailyFlows,
  };
}
