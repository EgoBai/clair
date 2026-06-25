/**
 * FutureValueEngine - 未来价值发现引擎
 * 综合评分系统：基本面 + 技术面 + 资金面 + AI分析
 *
 * 评分模型设计 [S3]:
 * - 基本面评分 (40%): PE、PB、营收增长、利润增长、ROE
 * - 技术面评分 (30%): MA、RSI、MACD、成交量
 * - 资金面评分 (20%): 主力资金、北向资金、融资融券
 * - AI分析评分 (10%): 行业前景、公司竞争力、风险因素
 */

import {
  calculateFundamentalScore,
  calculateTechnicalScore,
  calculateCapitalFlowScore,
  calculateAIAnalysisScore,
  calculateCompositeScore,
  calculateFullScore,
  type FundamentalData,
  type TechnicalData,
  type CapitalFlowData,
  type AIAnalysisData,
  type CompositeScore,
  type FundamentalScore,
  type TechnicalScore,
  type CapitalFlowScore,
  type AIAnalysisScore,
} from './futureValueCalculator';

// ==================== 重新导出类型 ====================

export type {
  FundamentalData,
  TechnicalData,
  CapitalFlowData,
  AIAnalysisData,
  CompositeScore,
  FundamentalScore,
  TechnicalScore,
  CapitalFlowScore,
  AIAnalysisScore,
};

// ==================== 权重配置 ====================

export interface ScoreWeights {
  fundamental: number;
  technical: number;
  capitalFlow: number;
  aiAnalysis: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  fundamental: 0.40,
  technical: 0.30,
  capitalFlow: 0.20,
  aiAnalysis: 0.10,
};

// ==================== 批量评分 ====================

export interface StockScoreInput {
  symbol: string;
  name: string;
  fundamental: FundamentalData;
  technical: TechnicalData;
  capitalFlow: CapitalFlowData;
  aiAnalysis: AIAnalysisData;
}

export interface StockScoreResult {
  symbol: string;
  name: string;
  score: CompositeScore;
}

/**
 * 批量计算多只股票评分
 */
export function batchCalculateScores(inputs: StockScoreInput[]): StockScoreResult[] {
  return inputs.map((input) => ({
    symbol: input.symbol,
    name: input.name,
    score: calculateFullScore(
      input.fundamental,
      input.technical,
      input.capitalFlow,
      input.aiAnalysis
    ),
  }));
}

/**
 * 按综合评分排序
 */
export function sortByScore(
  results: StockScoreResult[],
  order: 'asc' | 'desc' = 'desc'
): StockScoreResult[] {
  return [...results].sort((a, b) =>
    order === 'desc'
      ? b.score.total - a.score.total
      : a.score.total - b.score.total
  );
}

/**
 * 筛选推荐股票（评分 >= 阈值）
 */
export function filterRecommended(
  results: StockScoreResult[],
  minScore: number = 65
): StockScoreResult[] {
  return results.filter((r) => r.score.total >= minScore);
}

// ==================== 评分对比 ====================

export interface ScoreComparison {
  symbol: string;
  currentScore: CompositeScore;
  previousScore: CompositeScore | null;
  change: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * 对比评分变化
 */
export function compareScores(
  symbol: string,
  current: CompositeScore,
  previous: CompositeScore | null
): ScoreComparison {
  const change = previous ? current.total - previous.total : 0;
  let trend: ScoreComparison['trend'] = 'stable';
  if (change > 2) trend = 'up';
  else if (change < -2) trend = 'down';

  return {
    symbol,
    currentScore: current,
    previousScore: previous,
    change: Math.round(change * 100) / 100,
    trend,
  };
}

// ==================== 评分维度分析 ====================

export interface DimensionAnalysis {
  dimension: string;
  score: number;
  weight: number;
  contribution: number;
  status: 'strong' | 'normal' | 'weak';
}

/**
 * 分析各维度贡献
 */
export function analyzeDimensions(score: CompositeScore): DimensionAnalysis[] {
  const dimensions: DimensionAnalysis[] = [
    {
      dimension: '基本面',
      score: score.fundamental.total,
      weight: DEFAULT_WEIGHTS.fundamental,
      contribution: score.fundamental.total * DEFAULT_WEIGHTS.fundamental,
      status: score.fundamental.total >= 70 ? 'strong' : score.fundamental.total >= 40 ? 'normal' : 'weak',
    },
    {
      dimension: '技术面',
      score: score.technical.total,
      weight: DEFAULT_WEIGHTS.technical,
      contribution: score.technical.total * DEFAULT_WEIGHTS.technical,
      status: score.technical.total >= 70 ? 'strong' : score.technical.total >= 40 ? 'normal' : 'weak',
    },
    {
      dimension: '资金面',
      score: score.capitalFlow.total,
      weight: DEFAULT_WEIGHTS.capitalFlow,
      contribution: score.capitalFlow.total * DEFAULT_WEIGHTS.capitalFlow,
      status: score.capitalFlow.total >= 70 ? 'strong' : score.capitalFlow.total >= 40 ? 'normal' : 'weak',
    },
    {
      dimension: 'AI分析',
      score: score.aiAnalysis.total,
      weight: DEFAULT_WEIGHTS.aiAnalysis,
      contribution: score.aiAnalysis.total * DEFAULT_WEIGHTS.aiAnalysis,
      status: score.aiAnalysis.total >= 70 ? 'strong' : score.aiAnalysis.total >= 40 ? 'normal' : 'weak',
    },
  ];

  return dimensions;
}

/**
 * 找出主要优势和劣势
 */
export function findStrengthsAndWeaknesses(score: CompositeScore): {
  strengths: string[];
  weaknesses: string[];
} {
  const dimensions = analyzeDimensions(score);
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const dim of dimensions) {
    if (dim.status === 'strong') {
      strengths.push(`${dim.dimension}(${dim.score.toFixed(1)}分)`);
    } else if (dim.status === 'weak') {
      weaknesses.push(`${dim.dimension}(${dim.score.toFixed(1)}分)`);
    }
  }

  return { strengths, weaknesses };
}

// ==================== 导出核心函数 ====================

export {
  calculateFundamentalScore,
  calculateTechnicalScore,
  calculateCapitalFlowScore,
  calculateAIAnalysisScore,
  calculateCompositeScore,
  calculateFullScore,
};
