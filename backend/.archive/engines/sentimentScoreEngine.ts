/**
 * 市场情绪评分引擎
 * 综合多维度指标计算市场情绪分数
 */

export interface SentimentInput {
  /** 涨跌家数比 (0-1, 0.5为均衡) */
  advanceDeclineRatio: number;
  /** 换手率 (0-100) */
  turnoverRate: number;
  /** 融资余额变化率 (-1~1) */
  marginChangeRate: number;
  /** 北向资金净流入 (亿元) */
  northboundFlow: number;
  /** 波动率指数 (0-100) */
  volatilityIndex: number;
  /** 新股涨停比例 (0-1) */
  ipoLimitUpRatio: number;
  /** 连板股数量 */
  consecutiveLimitUpCount: number;
  /** 涨停家数 */
  limitUpCount: number;
  /** 跌停家数 */
  limitDownCount: number;
}

export interface SentimentResult {
  /** 总分 0-100 */
  totalScore: number;
  /** 情绪等级 */
  level: '极度恐慌' | '恐慌' | '偏空' | '中性' | '偏多' | '贪婪' | '极度贪婪';
  /** 各维度得分 */
  dimensions: {
    breadth: number;
    activity: number;
    leverage: number;
    foreignFlow: number;
    volatility: number;
    speculation: number;
  };
  /** 信号建议 */
  signal: '强烈卖出' | '卖出' | '观望' | '买入' | '强烈买入';
}

const WEIGHTS = {
  breadth: 0.2,
  activity: 0.15,
  leverage: 0.15,
  foreignFlow: 0.15,
  volatility: 0.2,
  speculation: 0.15,
};

function normalizeScore(value: number, min: number, max: number): number {
  if (max === min) return 50;
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

function calcBreadthScore(input: SentimentInput): number {
  const adScore = normalizeScore(input.advanceDeclineRatio, 0, 1);
  const limitScore = input.limitUpCount > input.limitDownCount
    ? 60 + normalizeScore(input.limitUpCount - input.limitDownCount, 0, 100) * 0.4
    : 40 - normalizeScore(input.limitDownCount - input.limitUpCount, 0, 100) * 0.4;
  return adScore * 0.6 + limitScore * 0.4;
}

function calcActivityScore(input: SentimentInput): number {
  return normalizeScore(input.turnoverRate, 0, 10);
}

function calcLeverageScore(input: SentimentInput): number {
  return normalizeScore(input.marginChangeRate, -0.1, 0.1);
}

function calcForeignFlowScore(input: SentimentInput): number {
  return normalizeScore(input.northboundFlow, -200, 200);
}

function calcVolatilityScore(input: SentimentInput): number {
  // 低波动率 = 高分(乐观), 高波动率 = 低分(恐慌)
  return 100 - normalizeScore(input.volatilityIndex, 10, 80);
}

function calcSpeculationScore(input: SentimentInput): number {
  const ipoScore = normalizeScore(input.ipoLimitUpRatio, 0, 1);
  const consecutiveScore = normalizeScore(input.consecutiveLimitUpCount, 0, 20);
  return ipoScore * 0.4 + consecutiveScore * 0.6;
}

export function calculateSentiment(input: SentimentInput): SentimentResult {
  const dimensions = {
    breadth: calcBreadthScore(input),
    activity: calcActivityScore(input),
    leverage: calcLeverageScore(input),
    foreignFlow: calcForeignFlowScore(input),
    volatility: calcVolatilityScore(input),
    speculation: calcSpeculationScore(input),
  };

  const totalScore = Math.round(
    dimensions.breadth * WEIGHTS.breadth +
    dimensions.activity * WEIGHTS.activity +
    dimensions.leverage * WEIGHTS.leverage +
    dimensions.foreignFlow * WEIGHTS.foreignFlow +
    dimensions.volatility * WEIGHTS.volatility +
    dimensions.speculation * WEIGHTS.speculation
  );

  const level = getSentimentLevel(totalScore);
  const signal = getSignal(totalScore);

  return { totalScore, level, dimensions, signal };
}

function getSentimentLevel(score: number): SentimentResult['level'] {
  if (score <= 15) return '极度恐慌';
  if (score <= 30) return '恐慌';
  if (score <= 45) return '偏空';
  if (score <= 55) return '中性';
  if (score <= 70) return '偏多';
  if (score <= 85) return '贪婪';
  return '极度贪婪';
}

function getSignal(score: number): SentimentResult['signal'] {
  if (score <= 20) return '强烈买入';
  if (score <= 35) return '买入';
  if (score <= 65) return '观望';
  if (score <= 80) return '卖出';
  return '强烈卖出';
}

export function getSentimentHistory(
  inputs: SentimentInput[]
): SentimentResult[] {
  return inputs.map(calculateSentiment);
}

export function detectSentimentDivergence(
  results: SentimentResult[],
  priceChanges: number[]
): { bullish: boolean; bearish: boolean; strength: number } {
  if (results.length < 2 || priceChanges.length < 2) {
    return { bullish: false, bearish: false, strength: 0 };
  }

  const lastSentiment = results[results.length - 1].totalScore;
  const prevSentiment = results[results.length - 2].totalScore;
  const lastPrice = priceChanges[priceChanges.length - 1];
  const prevPrice = priceChanges[priceChanges.length - 2];

  const sentimentDelta = lastSentiment - prevSentiment;
  const priceDelta = lastPrice - prevPrice;

  // 底背离: 价格创新低但情绪不再恶化
  const bullish = priceDelta < 0 && sentimentDelta > 0;
  // 顶背离: 价格创新高但情绪不再改善
  const bearish = priceDelta > 0 && sentimentDelta < 0;

  const strength = Math.abs(sentimentDelta - priceDelta);

  return { bullish, bearish, strength };
}
