/**
 * 北向资金分析引擎
 * - 沪股通/深股通净流入
 * - 累计净流入趋势
 * - 持仓变动跟踪
 * - 重仓股分析
 * - 买卖信号
 */
export interface NorthboundFlow {
  date: string;
  shNetBuy: number; // 沪股通净买入
  szNetBuy: number; // 深股通净买入
  totalNetBuy: number;
  shBuyAmount: number;
  shSellAmount: number;
  szBuyAmount: number;
  szSellAmount: number;
}

export interface StockHolding {
  stockCode: string;
  stockName: string;
  shares: number;
  marketValue: number;
  changeFromPrev: number;
  holdingRatio: number; // 占流通股比
}

export interface NorthboundAnalysis {
  latestFlow: NorthboundFlow;
  totalNetInflow: number;
  avgDailyNetInflow: number;
  flowTrend: 'inflow' | 'outflow' | 'stable';
  consecutiveDays: number;
  topBuyStocks: StockHolding[];
  topSellStocks: StockHolding[];
  marketSignal: 'bullish' | 'bearish' | 'neutral';
  signalStrength: number;
  alerts: string[];
}

export function analyzeNorthbound(
  flows: NorthboundFlow[],
  holdings?: StockHolding[]
): NorthboundAnalysis {
  if (flows.length === 0) throw new Error('北向资金数据不能为空');

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const latestFlow = sorted[sorted.length - 1];
  const totalNetInflow = sorted.reduce((s, f) => s + f.totalNetBuy, 0);
  const avgDailyNetInflow = totalNetInflow / sorted.length;

  // 连续流入/流出天数
  let consecutiveDays = 0;
  const lastDir = latestFlow.totalNetBuy > 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const dir = sorted[i].totalNetBuy > 0;
    if (dir === lastDir) consecutiveDays++;
    else break;
  }

  // 趋势判断 (最近10天)
  const recent10 = sorted.slice(-10);
  const recentAvg = recent10.reduce((s, f) => s + f.totalNetBuy, 0) / recent10.length;
  const flowTrend = recentAvg > 1e9 ? 'inflow' : recentAvg < -1e9 ? 'outflow' : 'stable';

  // 信号
  let score = 50;
  if (latestFlow.totalNetBuy > 0) score += 10;
  if (consecutiveDays >= 3 && lastDir) score += 15;
  if (totalNetInflow > 0) score += 10;
  if (avgDailyNetInflow > 5e9) score += 10;
  if (latestFlow.totalNetBuy < 0) score -= 10;
  if (consecutiveDays >= 3 && !lastDir) score -= 15;
  if (totalNetInflow < 0) score -= 10;

  const marketSignal = score > 60 ? 'bullish' : score < 40 ? 'bearish' : 'neutral';
  const signalStrength = Math.abs(score - 50) * 2;

  // 持仓分析
  const sortedHoldings = [...(holdings ?? [])].sort((a, b) => b.marketValue - a.marketValue);
  const topBuyStocks = sortedHoldings.filter(h => h.changeFromPrev > 0).slice(0, 10);
  const topSellStocks = sortedHoldings.filter(h => h.changeFromPrev < 0).sort((a, b) => a.changeFromPrev - b.changeFromPrev).slice(0, 10);

  const alerts: string[] = [];
  if (Math.abs(latestFlow.totalNetBuy) > 20e9) alerts.push('北向资金大幅异动');
  if (consecutiveDays >= 7) alerts.push(`北向资金连续${consecutiveDays}天${lastDir ? '流入' : '流出'}`);

  return { latestFlow, totalNetInflow, avgDailyNetInflow, flowTrend, consecutiveDays, topBuyStocks, topSellStocks, marketSignal, signalStrength, alerts };
}
