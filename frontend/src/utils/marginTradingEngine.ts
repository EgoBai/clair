/**
 * 融资融券分析引擎
 * 融资余额分析、融券监控、杠杆率、信用风险
 */

export interface MarginData {
  date: string;
 融资余额: number;
  融资买入额: number;
  融资偿还额: number;
  融券余量: number;
  融券卖出量: number;
  融券偿还量: number;
  融资融券余额: number;
}

export interface MarginSummary {
  currentBalance: number;
  weekChange: number;
  monthChange: number;
  balanceTrend: 'rising' | 'falling' | 'stable';
  dailyNetBuy: number;
  avgDailyBuy: number;
  leverageRatio: number;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export interface MarginSignal {
  type: 'bullish' | 'bearish' | 'warning';
  strength: number;
  message: string;
}

export interface StockMarginData {
  ticker: string;
  name: string;
  marginBalance: number;
  shortBalance: number;
  marginRatio: number; // 融资余额占流通市值比
  shortRatio: number;
  netMargin: number;
  fiveDayTrend: number;
}

/**
 * 融资融券市场概况
 */
export function summarizeMarginMarket(data: MarginData[]): MarginSummary {
  if (data.length === 0) {
    return {
      currentBalance: 0,
      weekChange: 0,
      monthChange: 0,
      balanceTrend: 'stable',
      dailyNetBuy: 0,
      avgDailyBuy: 0,
      leverageRatio: 0,
      riskLevel: 'low',
    };
  }

  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const weekAgo = sorted[Math.min(4, sorted.length - 1)];
  const monthAgo = sorted[Math.min(19, sorted.length - 1)];

  const weekChange = latest.融资余额 - weekAgo.融资余额;
  const monthChange = latest.融资余额 - monthAgo.融资余额;

  // 趋势
  let balanceTrend: 'rising' | 'falling' | 'stable';
  const weekAvgChange = weekChange / 5;
  if (weekAvgChange > latest.融资余额 * 0.002) balanceTrend = 'rising';
  else if (weekAvgChange < -latest.融资余额 * 0.002) balanceTrend = 'falling';
  else balanceTrend = 'stable';

  // 日均净买入
  const dailyNetBuy = latest.融资买入额 - latest.融资偿还额;
  const recent5 = sorted.slice(0, 5);
  const avgDailyBuy = recent5.reduce((s, d) => s + d.融资买入额, 0) / recent5.length;

  // 杠杆率 (融资余额 / 融资融券余额)
  const leverageRatio =
    latest.融资融券余额 > 0 ? latest.融资余额 / latest.融资融券余额 : 0;

  // 风险等级
  let riskLevel: MarginSummary['riskLevel'];
  if (latest.融资余额 > 1.8e12) riskLevel = 'extreme'; // 1.8万亿
  else if (latest.融资余额 > 1.5e12) riskLevel = 'high';
  else if (latest.融资余额 > 1e12) riskLevel = 'medium';
  else riskLevel = 'low';

  return {
    currentBalance: Math.round(latest.融资余额),
    weekChange: Math.round(weekChange),
    monthChange: Math.round(monthChange),
    balanceTrend,
    dailyNetBuy: Math.round(dailyNetBuy),
    avgDailyBuy: Math.round(avgDailyBuy),
    leverageRatio: Math.round(leverageRatio * 10000) / 10000,
    riskLevel,
  };
}

/**
 * 融资融券信号生成
 */
export function generateMarginSignals(summary: MarginSummary): MarginSignal[] {
  const signals: MarginSignal[] = [];

  // 余额大幅增长
  if (summary.balanceTrend === 'rising' && summary.weekChange > 0) {
    const pctChange = summary.weekChange / (summary.currentBalance - summary.weekChange);
    if (pctChange > 0.03) {
      signals.push({
        type: 'bullish',
        strength: Math.min(90, 50 + pctChange * 1000),
        message: `融资余额周增${(pctChange * 100).toFixed(1)}%，杠杆资金加速入场`,
      });
    }
  }

  // 余额大幅减少
  if (summary.balanceTrend === 'falling' && summary.weekChange < 0) {
    const pctChange = Math.abs(summary.weekChange) / summary.currentBalance;
    if (pctChange > 0.03) {
      signals.push({
        type: 'bearish',
        strength: Math.min(90, 50 + pctChange * 1000),
        message: `融资余额周降${(pctChange * 100).toFixed(1)}%，杠杆资金撤退`,
      });
    }
  }

  // 日均买入异常
  if (summary.dailyNetBuy > summary.avgDailyBuy * 1.5) {
    signals.push({
      type: 'bullish',
      strength: 70,
      message: `今日融资净买入${(summary.dailyNetBuy / 1e8).toFixed(0)}亿，显著高于近期均值`,
    });
  }

  if (summary.dailyNetBuy < -summary.avgDailyBuy * 0.5) {
    signals.push({
      type: 'bearish',
      strength: 65,
      message: `今日融资净偿还${(Math.abs(summary.dailyNetBuy) / 1e8).toFixed(0)}亿，去杠杆进行中`,
    });
  }

  // 风险警告
  if (summary.riskLevel === 'extreme') {
    signals.push({
      type: 'warning',
      strength: 85,
      message: '融资余额处于历史极值，警惕集中平仓风险',
    });
  } else if (summary.riskLevel === 'high') {
    signals.push({
      type: 'warning',
      strength: 60,
      message: '融资余额处于高位，需关注杠杆风险',
    });
  }

  if (signals.length === 0) {
    signals.push({
      type: 'bullish',
      strength: 50,
      message: '融资融券市场运行平稳',
    });
  }

  return signals;
}

/**
 * 个股融资融券分析
 */
export function analyzeStockMargin(
  stockData: StockMarginData[],
  marketAvgMarginRatio: number
): {
  highMargin: StockMarginData[];
  highShort: StockMarginData[];
  warnings: { ticker: string; message: string }[];
} {
  const highMargin = stockData
    .filter((s) => s.marginRatio > marketAvgMarginRatio * 2)
    .sort((a, b) => b.marginRatio - a.marginRatio);

  const highShort = stockData
    .filter((s) => s.shortRatio > 0.02)
    .sort((a, b) => b.shortRatio - a.shortRatio);

  const warnings: { ticker: string; message: string }[] = [];
  for (const stock of stockData) {
    if (stock.marginRatio > 0.1) {
      warnings.push({
        ticker: stock.ticker,
        message: `${stock.name}融资余额占流通市值比${(stock.marginRatio * 100).toFixed(1)}%，杠杆过高`,
      });
    }
    if (stock.fiveDayTrend < -20) {
      warnings.push({
        ticker: stock.ticker,
        message: `${stock.name}近5日融资余额下降${Math.abs(stock.fiveDayTrend).toFixed(1)}%，需关注`,
      });
    }
  }

  return { highMargin, highShort, warnings };
}

/**
 * 融资融券热度排行
 */
export function marginHeatRanking(stockData: StockMarginData[]): {
  ticker: string;
  name: string;
  heatScore: number;
  rank: number;
}[] {
  const scored = stockData.map((s) => {
    const volumeScore = Math.min(1, s.marginBalance / 1e10) * 40;
    const activityScore = Math.min(1, Math.abs(s.netMargin) / s.marginBalance) * 30;
    const trendScore = Math.min(1, Math.abs(s.fiveDayTrend) / 10) * 30;

    return {
      ticker: s.ticker,
      name: s.name,
      heatScore: Math.round(volumeScore + activityScore + trendScore),
      rank: 0,
    };
  });

  scored.sort((a, b) => b.heatScore - a.heatScore);
  scored.forEach((s, i) => (s.rank = i + 1));

  return scored;
}
