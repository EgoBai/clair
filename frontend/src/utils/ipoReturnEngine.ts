/**
 * IPO收益分析引擎
 * - 首日涨幅统计
 * - 破发率分析
 * - 行业IPO表现对比
 * - 打新收益率
 * - IPO热度指标
 */
export interface IPORecord {
  stockCode: string;
  stockName: string;
  industry: string;
  issuePrice: number;
  firstDayOpen: number;
  firstDayClose: number;
  firstDayHigh: number;
  firstDayLow: number;
  firstDayVolume: number;
  marketCap: number;
  peRatio: number;
  issueDate: string;
}

export interface IPOReturnAnalysis {
  totalIPOs: number;
  avgFirstDayReturn: number;
  medianFirstDayReturn: number;
  maxFirstDayReturn: number;
  minFirstDayReturn: number;
  breakRate: number; // 破发率
  doubleRate: number; // 翻倍率
  industryPerformance: Array<{
    industry: string;
    count: number;
    avgReturn: number;
    breakRate: number;
  }>;
  hotIPOs: IPORecord[];
  coldIPOs: IPORecord[];
  marketHeat: 'hot' | 'warm' | 'cold';
  expectedIPOProfit: number; // 预期打新收益率(年化)
}

export function analyzeIPOReturns(
  records: IPORecord[],
  capitalForNew: number = 1000000 // 打新资金
): IPOReturnAnalysis {
  if (records.length === 0) throw new Error('IPO数据不能为空');

  const returns = records.map(r => (r.firstDayClose - r.issuePrice) / r.issuePrice);
  const sortedReturns = [...returns].sort((a, b) => a - b);

  const avgFirstDayReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const medianFirstDayReturn = sortedReturns[Math.floor(sortedReturns.length / 2)];
  const maxFirstDayReturn = Math.max(...returns);
  const minFirstDayReturn = Math.min(...returns);
  const breakRate = returns.filter(r => r < 0).length / returns.length;
  const doubleRate = returns.filter(r => r >= 1).length / returns.length;

  // 行业分析
  const industryMap = new Map<string, { returns: number[]; breaks: number }>();
  for (let i = 0; i < records.length; i++) {
    let ind = industryMap.get(records[i].industry);
    if (!ind) {
      ind = { returns: [], breaks: 0 };
      industryMap.set(records[i].industry, ind);
    }
    ind.returns.push(returns[i]);
    if (returns[i] < 0) ind.breaks++;
  }

  const industryPerformance = [...industryMap.entries()].map(([industry, data]) => ({
    industry,
    count: data.returns.length,
    avgReturn: data.returns.reduce((s, r) => s + r, 0) / data.returns.length,
    breakRate: data.breaks / data.returns.length,
  })).sort((a, b) => b.avgReturn - a.avgReturn);

  const sortedByReturn = records.map((r, i) => ({ r, ret: returns[i] })).sort((a, b) => b.ret - a.ret);
  const hotIPOs = sortedByReturn.slice(0, 5).map(x => x.r);
  const coldIPOs = sortedByReturn.slice(-5).reverse().map(x => x.r);

  const marketHeat = avgFirstDayReturn > 1 ? 'hot' : avgFirstDayReturn > 0.2 ? 'warm' : 'cold';
  const expectedIPOProfit = (avgFirstDayReturn * capitalForNew * records.length) / 250 / capitalForNew;

  return {
    totalIPOs: records.length,
    avgFirstDayReturn,
    medianFirstDayReturn,
    maxFirstDayReturn,
    minFirstDayReturn,
    breakRate,
    doubleRate,
    industryPerformance,
    hotIPOs,
    coldIPOs,
    marketHeat,
    expectedIPOProfit,
  };
}
