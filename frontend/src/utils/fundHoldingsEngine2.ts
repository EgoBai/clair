/**
 * 基金持仓分析引擎V2
 * - 重仓股变动分析
 * - 持仓集中度
 * - 行业配置偏离
 * - 换手率分析
 * - 基金风格漂移检测
 */
export interface FundHolding {
  stockCode: string;
  stockName: string;
  weight: number; // 持仓占比
  prevWeight: number; // 上期持仓占比
  industry: string;
  marketCap: number; // 市值(亿)
  pe: number;
}

export interface FundHoldingsData {
  fundName: string;
  fundType: 'equity' | 'balanced' | 'bond' | 'index';
  holdings: FundHolding[];
  benchmarkIndustryWeights: { industry: string; weight: number }[];
  prevTopHoldings: string[]; // 上期前十大
  turnoverRate: number; // 换手率
  totalAssets: number; // 总规模(亿)
  benchmarkName: string;
}

export interface FundHoldingsResult {
  concentration: number; // 前十大占比
  topHoldings: { stock: string; weight: number; change: number }[];
  industryDeviations: { industry: string; deviation: number; signal: string }[];
  turnoverAssessment: 'low' | 'moderate' | 'high' | 'excessive';
  styleDrift: boolean;
  styleLabel: string;
  holdingQuality: number; // 0-100
  riskMetrics: {
    singleStockRisk: boolean;
    sectorConcentration: number;
    effectiveHoldings: number; // 有效持仓数
  };
  signals: string[];
}

export function analyzeFundHoldings(data: FundHoldingsData): FundHoldingsResult {
  const signals: string[] = [];

  // 按权重排序
  const sorted = [...data.holdings].sort((a, b) => b.weight - a.weight);
  const top10 = sorted.slice(0, 10);

  // 集中度
  const concentration = top10.reduce((s, h) => s + h.weight, 0);
  if (concentration > 0.6) signals.push('持仓高度集中，前十大占比超60%');

  // 重仓股变动
  const topHoldings = top10.map(h => ({
    stock: h.stockName,
    weight: Math.round(h.weight * 100) / 100,
    change: Math.round((h.weight - h.prevWeight) * 100) / 100,
  }));

  const newTop = top10.map(h => h.stockCode);
  const exitFromTop = data.prevTopHoldings.filter(c => !newTop.includes(c));
  if (exitFromTop.length > 3) signals.push('前十大重仓股变动较大');

  // 行业偏离
  const industryWeights = new Map<string, number>();
  data.holdings.forEach(h => {
    industryWeights.set(h.industry, (industryWeights.get(h.industry) || 0) + h.weight);
  });

  const industryDeviations = data.benchmarkIndustryWeights.map(bw => {
    const fundWeight = industryWeights.get(bw.industry) || 0;
    const deviation = fundWeight - bw.weight;
    let signal = '';
    if (deviation > 0.1) signal = '超配';
    else if (deviation < -0.1) signal = '低配';
    else signal = '标配';
    return { industry: bw.industry, deviation: Math.round(deviation * 10000) / 10000, signal };
  });

  const maxDeviation = Math.max(...industryDeviations.map(d => Math.abs(d.deviation)));
  if (maxDeviation > 0.15) signals.push('行业配置偏离基准较大');

  // 换手率评估
  let turnoverAssessment: FundHoldingsResult['turnoverAssessment'];
  if (data.turnoverRate < 1) turnoverAssessment = 'low';
  else if (data.turnoverRate < 3) turnoverAssessment = 'moderate';
  else if (data.turnoverRate < 5) { turnoverAssessment = 'high'; signals.push('换手率偏高'); }
  else { turnoverAssessment = 'excessive'; signals.push('换手率过高，交易成本大'); }

  // 风格漂移检测
  const avgPE = data.holdings.reduce((s, h) => s + h.pe * h.weight, 0) / data.holdings.reduce((s, h) => s + h.weight, 0.01);
  const avgMktCap = data.holdings.reduce((s, h) => s + h.marketCap * h.weight, 0) / data.holdings.reduce((s, h) => s + h.weight, 0.01);

  let styleLabel = '';
  if (avgMktCap > 500) styleLabel = '大盘';
  else if (avgMktCap > 100) styleLabel = '中盘';
  else styleLabel = '小盘';

  if (avgPE > 40) styleLabel += '成长';
  else if (avgPE > 20) styleLabel += '均衡';
  else styleLabel += '价值';

  // 风格漂移 (简化: 基于PE和市值的变化)
  const styleDrift = false; // 需要历史数据比较

  // 风险指标
  const maxWeight = sorted[0]?.weight || 0;
  const singleStockRisk = maxWeight > 0.1;
  const effectiveHoldings = 1 / data.holdings.reduce((s, h) => s + h.weight ** 2, 0.001);
  const sectorConcentration = Math.max(...Array.from(industryWeights.values()));

  if (singleStockRisk) signals.push(`单一股票持仓过高: ${(maxWeight * 100).toFixed(1)}%`);

  // 持仓质量评分
  let quality = 70;
  if (concentration > 0.7) quality -= 15;
  if (turnoverAssessment === 'excessive') quality -= 15;
  if (singleStockRisk) quality -= 10;
  if (effectiveHoldings > 30) quality += 10;
  if (maxDeviation < 0.1) quality += 10;
  quality = Math.max(0, Math.min(100, quality));

  return {
    concentration: Math.round(concentration * 100) / 100,
    topHoldings,
    industryDeviations,
    turnoverAssessment,
    styleDrift,
    styleLabel,
    holdingQuality: quality,
    riskMetrics: {
      singleStockRisk,
      sectorConcentration: Math.round(sectorConcentration * 100) / 100,
      effectiveHoldings: Math.round(effectiveHoldings * 10) / 10,
    },
    signals,
  };
}
