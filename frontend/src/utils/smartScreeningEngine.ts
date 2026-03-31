/**
 * 智能选股引擎 (Smart Stock Screening Engine)
 * - 多条件组合筛选
 * - 评分排名
 * - 动态因子权重
 * - 历史回测胜率
 * - 行业/市值分层
 */

export interface ScreeningCriteria {
  field: 'pe' | 'pb' | 'roe' | 'revenue_growth' | 'profit_growth' | 'dividend_yield'
    | 'debt_ratio' | 'current_ratio' | 'gross_margin' | 'market_cap' | 'turnover_rate'
    | 'price_change_5d' | 'price_change_20d' | 'volume_ratio';
  operator: '>' | '<' | '>=' | '<=' | '==' | 'between';
  value: number;
  value2?: number; // for 'between'
  weight: number;  // 0-1
}

export interface StockData {
  code: string;
  name: string;
  industry: string;
  marketCap: number;
  [key: string]: string | number;
}

export interface ScreeningResult {
  stock: string;
  name: string;
  score: number;
  matchedCriteria: number;
  totalCriteria: number;
  highlights: string[];
  riskFlags: string[];
}

export interface ScreeningReport {
  totalScreened: number;
  totalPassed: number;
  passRate: number;
  topResults: ScreeningResult[];
  industryDistribution: Record<string, number>;
  avgScore: number;
  scoreDistribution: { range: string; count: number }[];
}

/**
 * 评估单个条件
 */
function evaluateCriteria(stock: StockData, criteria: ScreeningCriteria): boolean {
  const value = stock[criteria.field] as number;
  if (value === undefined) return false;

  switch (criteria.operator) {
    case '>': return value > criteria.value;
    case '<': return value < criteria.value;
    case '>=': return value >= criteria.value;
    case '<=': return value <= criteria.value;
    case '==': return value === criteria.value;
    case 'between': return value >= criteria.value && value <= (criteria.value2 || criteria.value);
    default: return false;
  }
}

/**
 * 计算评分
 */
function calculateScore(stock: StockData, criteria: ScreeningCriteria[]): number {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const c of criteria) {
    const value = stock[c.field] as number;
    if (value === undefined) continue;

    totalWeight += c.weight;
    const matched = evaluateCriteria(stock, c);
    if (matched) {
      weightedScore += c.weight;
    } else {
      // 部分得分（接近阈值）
      const distance = Math.abs(value - c.value);
      const ratio = c.value !== 0 ? Math.max(0, 1 - distance / Math.abs(c.value)) : 0;
      weightedScore += c.weight * ratio * 0.3;
    }
  }

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight * 100) : 0;
}

/**
 * 智能选股
 */
export function screenStocks(
  stocks: StockData[],
  criteria: ScreeningCriteria[],
  minScore: number = 50
): ScreeningResult[] {
  // 空 criteria 时返回所有股票（无筛选条件 = 全部通过）
  if (criteria.length === 0) {
    return stocks.map(stock => ({
      stock: stock.code,
      name: stock.name,
      score: 0,
      matchedCriteria: 0,
      totalCriteria: 0,
      highlights: [],
      riskFlags: [],
    }));
  }

  const results: ScreeningResult[] = [];

  for (const stock of stocks) {
    let matchedCount = 0;
    const highlights: string[] = [];
    const riskFlags: string[] = [];

    for (const c of criteria) {
      if (evaluateCriteria(stock, c)) {
        matchedCount++;
        highlights.push(`${c.field}${c.operator}${c.value}`);
      }
    }

    const score = calculateScore(stock, criteria);

    // 风险标记
    const pe = stock.pe as number;
    const pb = stock.pb as number;
    const debtRatio = stock.debt_ratio as number;
    if (pe > 100) riskFlags.push('PE过高');
    if (pb > 10) riskFlags.push('PB过高');
    if (debtRatio > 70) riskFlags.push('负债率过高');

    if (score >= minScore) {
      results.push({
        stock: stock.code,
        name: stock.name,
        score,
        matchedCriteria: matchedCount,
        totalCriteria: criteria.length,
        highlights,
        riskFlags,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * 生成选股报告
 */
export function generateScreeningReport(
  allStocks: StockData[],
  results: ScreeningResult[]
): ScreeningReport {
  const topResults = results.slice(0, 20);

  // 行业分布
  const industryDistribution: Record<string, number> = {};
  for (const r of results) {
    const stock = allStocks.find(s => s.code === r.stock);
    if (stock) {
      industryDistribution[stock.industry] = (industryDistribution[stock.industry] || 0) + 1;
    }
  }

  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;

  // 评分分布
  const ranges = ['0-20', '20-40', '40-60', '60-80', '80-100'];
  const scoreDistribution = ranges.map(range => {
    const [min, max] = range.split('-').map(Number);
    const count = results.filter(r => r.score >= min && r.score < max).length;
    return { range, count };
  });

  return {
    totalScreened: allStocks.length,
    totalPassed: results.length,
    passRate: allStocks.length > 0 ? Math.round(results.length / allStocks.length * 100) / 100 : 0,
    topResults,
    industryDistribution,
    avgScore,
    scoreDistribution,
  };
}

/**
 * 动态因子权重调整
 */
export function adjustWeightsByPerformance(
  criteria: ScreeningCriteria[],
  backtestResults: { field: string; winRate: number }[]
): ScreeningCriteria[] {
  return criteria.map(c => {
    const result = backtestResults.find(r => r.field === c.field);
    if (result) {
      // 胜率高的因子增加权重
      const adjustment = result.winRate > 0.6 ? 1.2 : result.winRate < 0.4 ? 0.8 : 1;
      return { ...c, weight: Math.min(1, c.weight * adjustment) };
    }
    return c;
  });
}
