/**
 * 综合投资评分引擎
 * 多维度综合评分、信号汇总、最终建议
 */

export interface ScoreDimension {
  name: string;
  score: number;      // 0-100
  weight: number;     // 0-1
  details?: string;
}

export interface StockScoreInput {
  symbol: string;
  name: string;
  dimensions: ScoreDimension[];
  price: number;
  targetPrice?: number;
}

export interface CompositeScore {
  symbol: string;
  name: string;
  totalScore: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
  recommendation: '强烈推荐' | '推荐' | '中性' | '减持' | '回避';
  dimensionScores: { name: string; score: number; contribution: number; level: string }[];
  riskLevel: '低风险' | '中低风险' | '中等风险' | '中高风险' | '高风险';
  upsidePotential: number;
  confidence: number;
}

/**
 * 计算综合评分
 */
export function calculateCompositeScore(input: StockScoreInput): CompositeScore {
  const { symbol, name, dimensions, price, targetPrice } = input;

  if (dimensions.length === 0) {
    return {
      symbol, name, totalScore: 0, grade: 'F', recommendation: '回避',
      dimensionScores: [], riskLevel: '高风险', upsidePotential: 0, confidence: 0,
    };
  }

  // 归一化权重
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const normalized = dimensions.map(d => ({ ...d, weight: totalWeight > 0 ? d.weight / totalWeight : 1 / dimensions.length }));

  // 加权总分
  let totalScore = 0;
  const dimensionScores = normalized.map(d => {
    const contribution = d.score * d.weight;
    totalScore += contribution;
    const level = d.score >= 80 ? '优秀' : d.score >= 60 ? '良好' : d.score >= 40 ? '一般' : d.score >= 20 ? '偏弱' : '极弱';
    return { name: d.name, score: d.score, contribution: Math.round(contribution * 10) / 10, level };
  });

  totalScore = Math.round(totalScore * 10) / 10;

  // 评分等级
  const grade: CompositeScore['grade'] =
    totalScore >= 90 ? 'A+' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B+' :
    totalScore >= 60 ? 'B' : totalScore >= 45 ? 'C' : totalScore >= 30 ? 'D' : 'F';

  // 建议
  const recommendation: CompositeScore['recommendation'] =
    totalScore >= 80 ? '强烈推荐' : totalScore >= 65 ? '推荐' :
    totalScore >= 45 ? '中性' : totalScore >= 30 ? '减持' : '回避';

  // 风险等级
  const scoreStd = Math.sqrt(dimensions.reduce((s, d) => s + (d.score - totalScore) ** 2, 0) / dimensions.length);
  const riskLevel: CompositeScore['riskLevel'] =
    totalScore >= 70 && scoreStd < 15 ? '低风险' :
    totalScore >= 55 && scoreStd < 20 ? '中低风险' :
    totalScore >= 40 ? '中等风险' :
    totalScore >= 25 ? '中高风险' : '高风险';

  // 上涨空间
  const upsidePotential = targetPrice && price > 0 ? (targetPrice - price) / price : 0;

  // 置信度
  const confidence = Math.min(1, dimensions.length / 5) * (1 - scoreStd / 100);

  return {
    symbol,
    name,
    totalScore,
    grade,
    recommendation,
    dimensionScores: dimensionScores.sort((a, b) => b.score - a.score),
    riskLevel,
    upsidePotential: Math.round(upsidePotential * 10000) / 10000,
    confidence: Math.round(Math.max(0, confidence) * 100) / 100,
  };
}

/**
 * 批量评分排名
 */
export function rankStocks(stocks: StockScoreInput[]): CompositeScore[] {
  return stocks
    .map(s => calculateCompositeScore(s))
    .sort((a, b) => b.totalScore - a.totalScore);
}
