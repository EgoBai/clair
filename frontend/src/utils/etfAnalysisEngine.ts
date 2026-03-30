/**
 * ETF 分析引擎
 * ETF 溢折价、跟踪误差、流动性、规模变化分析
 */

export interface ETFData {
  ticker: string;
  name: string;
  nav: number;       // 净值
  price: number;     // 现价
  premium: number;   // 溢价率
  trackingError: number;
  volume: number;
  turnover: number;
  aum: number;       // 规模
  aumChange: number; // 规模变化
  expenseRatio: number;
  sector: string;
  holdings: { ticker: string; weight: number }[];
}

export interface ETFAnalysis {
  ticker: string;
  name: string;
  valuation: 'premium' | 'discount' | 'fair';
  premiumPercent: number;
  liquidityScore: number; // 0-100
  efficiencyScore: number; // 0-100
  overallScore: number;
  recommendation: 'buy' | 'hold' | 'avoid';
  reasons: string[];
}

export interface ETFComparison {
  metric: string;
  winner: string;
  details: { ticker: string; value: number }[];
}

/**
 * ETF 单只分析
 */
export function analyzeETF(etf: ETFData): ETFAnalysis {
  // 估值
  let valuation: 'premium' | 'discount' | 'fair';
  if (etf.premium > 0.5) valuation = 'premium';
  else if (etf.premium < -0.5) valuation = 'discount';
  else valuation = 'fair';

  // 流动性评分
  const volumeScore = Math.min(40, etf.volume / 1e8 * 10); // 日成交额
  const turnoverScore = Math.min(30, etf.turnover / 1e9 * 10);
  const aumScore = Math.min(30, etf.aum / 1e10 * 10);
  const liquidityScore = Math.round(volumeScore + turnoverScore + aumScore);

  // 效率评分
  const trackingScore = Math.max(0, 40 - etf.trackingError * 100);
  const expenseScore = Math.max(0, 30 - etf.expenseRatio * 1000);
  const aumTrend = etf.aumChange > 0 ? 15 : etf.aumChange > -0.05 ? 10 : 5;
  const efficiencyScore = Math.round(trackingScore + expenseScore + aumTrend);

  const overallScore = Math.round((liquidityScore + efficiencyScore) / 2);

  // 推荐
  let recommendation: 'buy' | 'hold' | 'avoid';
  const reasons: string[] = [];

  if (overallScore > 70 && valuation !== 'premium') {
    recommendation = 'buy';
    reasons.push('综合评分优异');
  } else if (overallScore < 40 || (valuation === 'premium' && etf.premium > 2)) {
    recommendation = 'avoid';
    if (valuation === 'premium') reasons.push('溢价过高');
    if (liquidityScore < 30) reasons.push('流动性不足');
    if (etf.trackingError > 0.5) reasons.push('跟踪误差大');
  } else {
    recommendation = 'hold';
    reasons.push('表现平稳');
  }

  if (etf.premium < -1) reasons.push(`折价${Math.abs(etf.premium).toFixed(1)}%，存在套利机会`);
  if (etf.aumChange > 0.1) reasons.push(`规模增长${(etf.aumChange * 100).toFixed(0)}%，资金流入`);

  return {
    ticker: etf.ticker,
    name: etf.name,
    valuation,
    premiumPercent: Math.round(etf.premium * 100) / 100,
    liquidityScore,
    efficiencyScore,
    overallScore,
    recommendation,
    reasons,
  };
}

/**
 * ETF 批量对比
 */
export function compareETFs(etfs: ETFData[]): ETFComparison[] {
  const metrics: { name: string; extract: (e: ETFData) => number; lowerBetter: boolean }[] = [
    { name: '溢价率(绝对值)', extract: (e) => Math.abs(e.premium), lowerBetter: true },
    { name: '跟踪误差', extract: (e) => e.trackingError, lowerBetter: true },
    { name: '费率', extract: (e) => e.expenseRatio, lowerBetter: true },
    { name: '日成交额', extract: (e) => e.turnover, lowerBetter: false },
    { name: '规模', extract: (e) => e.aum, lowerBetter: false },
    { name: '规模增速', extract: (e) => e.aumChange, lowerBetter: false },
  ];

  return metrics.map((m) => {
    const details = etfs.map((e) => ({ ticker: e.ticker, value: m.extract(e) }));
    const sorted = [...details].sort((a, b) => m.lowerBetter ? a.value - b.value : b.value - a.value);

    return {
      metric: m.name,
      winner: sorted[0]?.ticker ?? '',
      details,
    };
  });
}

/**
 * ETF 套利机会检测
 */
export interface ArbitrageOpportunity {
  ticker: string;
  name: string;
  type: '折价套利' | '溢价套利';
  spread: number;
  estimatedProfit: number;
  risk: 'low' | 'medium' | 'high';
}

export function detectArbitrageOpportunities(etfs: ETFData[]): ArbitrageOpportunity[] {
  return etfs
    .filter((e) => Math.abs(e.premium) > 1)
    .map((e) => ({
      ticker: e.ticker,
      name: e.name,
      type: e.premium > 0 ? '溢价套利' as const : '折价套利' as const,
      spread: Math.abs(e.premium),
      estimatedProfit: Math.round(Math.abs(e.premium) * 0.7 * 100) / 100, // 扣除交易成本后约70%
      risk: Math.abs(e.premium) > 5 ? 'high' as const : Math.abs(e.premium) > 2 ? 'medium' as const : 'low' as const,
    }))
    .sort((a, b) => b.estimatedProfit - a.estimatedProfit);
}
