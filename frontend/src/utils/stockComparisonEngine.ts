/**
 * 个股对比分析引擎
 * 多维对比/雷达图数据/综合评分/投资建议
 */

export interface StockProfile {
  code: string;
  name: string;
  price: number;
  marketCap: number;
  pe: number;
  pb: number;
  ps: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  grossMargin: number;
  netMargin: number;
  debtRatio: number;
  currentRatio: number;
  dividendYield: number;
  turnoverRate: number;
  weekReturn: number;
  monthReturn: number;
  yearReturn: number;
  volatility: number;
  beta: number;
  industry: string;
}

export interface ComparisonDimension {
  dimension: string;
  values: { code: string; value: number; score: number; rank: number }[];
  leader: string;
  weight: number;
}

export interface RadarData {
  code: string;
  name: string;
  axes: { dimension: string; value: number }[];
  overallScore: number;
}

export interface ComparisonResult {
  dimensions: ComparisonDimension[];
  radarData: RadarData[];
  rankings: { code: string; name: string; totalScore: number; rank: number; strengths: string[]; weaknesses: string[] }[];
  recommendation: { code: string; verdict: string; reasons: string[] }[];
}

// ── 单维度评分 ──

function scoreValue(value: number, min: number, max: number, invert = false): number {
  const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return Math.round((invert ? 1 - normalized : normalized) * 100);
}

// ── 个股对比 ──

export function compareStocks(stocks: StockProfile[]): ComparisonResult {
  if (stocks.length < 2) {
    return { dimensions: [], radarData: [], rankings: [], recommendation: [] };
  }

  const dimensions: ComparisonDimension[] = [
    createDimension('估值(PE)', stocks.map(s => ({ code: s.code, value: s.pe })), true),
    createDimension('ROE', stocks.map(s => ({ code: s.code, value: s.roe })), false),
    createDimension('营收增速', stocks.map(s => ({ code: s.code, value: s.revenueGrowth })), false),
    createDimension('净利润增速', stocks.map(s => ({ code: s.code, value: s.profitGrowth })), false),
    createDimension('毛利率', stocks.map(s => ({ code: s.code, value: s.grossMargin })), false),
    createDimension('净利率', stocks.map(s => ({ code: s.code, value: s.netMargin })), false),
    createDimension('股息率', stocks.map(s => ({ code: s.code, value: s.dividendYield })), false),
    createDimension('近1月涨幅', stocks.map(s => ({ code: s.code, value: s.monthReturn })), false),
  ];

  // 雷达图数据
  const radarData: RadarData[] = stocks.map(stock => {
    const axes = dimensions.map(dim => {
      const item = dim.values.find(v => v.code === stock.code);
      return { dimension: dim.dimension, value: item?.score || 50 };
    });
    const overallScore = Math.round(axes.reduce((a, ax) => a + ax.value, 0) / axes.length);
    return { code: stock.code, name: stock.name, axes, overallScore };
  });

  // 排名
  const rankings = radarData
    .map(rd => {
      const strengths: string[] = [];
      const weaknesses: string[] = [];
      for (const axis of rd.axes) {
        if (axis.value >= 70) strengths.push(axis.dimension);
        if (axis.value <= 30) weaknesses.push(axis.dimension);
      }
      return { code: rd.code, name: rd.name, totalScore: rd.overallScore, rank: 0, strengths, weaknesses };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
  rankings.forEach((r, i) => r.rank = i + 1);

  // 投资建议
  const recommendation = rankings.map(r => {
    let verdict = '';
    if (r.totalScore >= 75) verdict = '强烈推荐';
    else if (r.totalScore >= 60) verdict = '推荐';
    else if (r.totalScore >= 45) verdict = '中性';
    else verdict = '回避';

    const reasons: string[] = [];
    if (r.strengths.length > 0) reasons.push(`优势: ${r.strengths.join('、')}`);
    if (r.weaknesses.length > 0) reasons.push(`劣势: ${r.weaknesses.join('、')}`);
    if (rankings.length > 1) reasons.push(`综合排名第${r.rank}位`);

    return { code: r.code, verdict, reasons };
  });

  return { dimensions, radarData, rankings, recommendation };
}

function createDimension(
  name: string,
  items: { code: string; value: number }[],
  invert: boolean
): ComparisonDimension {
  const values = items.map(item => {
    const allValues = items.map(i => i.value);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    return { code: item.code, value: item.value, score: scoreValue(item.value, min, max, invert), rank: 0 };
  });

  values.sort((a, b) => b.score - a.score);
  values.forEach((v, i) => v.rank = i + 1);

  return {
    dimension: name,
    values,
    leader: values[0]?.code || '',
    weight: 1,
  };
}

// ── 行业对比 ──

export function industryComparison(stocks: StockProfile[]) {
  const industries = new Map<string, StockProfile[]>();
  for (const s of stocks) {
    if (!industries.has(s.industry)) industries.set(s.industry, []);
    industries.get(s.industry)!.push(s);
  }

  return [...industries.entries()].map(([industry, sectorStocks]) => ({
    industry,
    count: sectorStocks.length,
    avgPE: roundTo(sectorStocks.reduce((a, s) => a + s.pe, 0) / sectorStocks.length, 2),
    avgROE: roundTo(sectorStocks.reduce((a, s) => a + s.roe, 0) / sectorStocks.length, 4),
    avgGrowth: roundTo(sectorStocks.reduce((a, s) => a + s.revenueGrowth, 0) / sectorStocks.length, 4),
    topStock: sectorStocks.reduce((a, s) => a.roe > s.roe ? a : s).name,
  }));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
