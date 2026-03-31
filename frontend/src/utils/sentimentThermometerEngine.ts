/**
 * 情绪温度计引擎 - 市场情绪综合评分/恐慌贪婪指数/社交媒体情绪/资金情绪
 */

export interface SentimentInput {
  vixLevel?: number;
  putCallRatio?: number;
  advanceDeclineRatio?: number;
  newHighsNewLows?: { highs: number; lows: number };
  marginBalance?: number;
  northboundFlow?: number;
  socialMentions?: number;
  socialPositiveRatio?: number;
  newsPositiveRatio?: number;
  fundFlow?: number;
  shortInterest?: number;
}

export interface SentimentResult {
  score: number; // 0-100, 0=extreme fear, 100=extreme greed
  label: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  components: Record<string, { value: number; weight: number; contribution: number }>;
  trend: 'improving' | 'deteriorating' | 'stable';
  divergences: string[];
}

export interface FearGreedGauge {
  current: number;
  previousClose: number;
  weekAgo: number;
  monthAgo: number;
  sparkline: number[];
  interpretation: string;
}

export interface SocialSentimentResult {
  overallScore: number; // -1 to 1
  volume: number;
  momentum: number; // -1 to 1
  topThemes: Array<{ theme: string; sentiment: number; count: number }>;
  alerts: string[];
}

export interface MarketRegime {
  regime: 'risk_on' | 'risk_off' | 'transition' | 'uncertain';
  confidence: number;
  indicators: Record<string, boolean>;
  duration: number; // estimated days
}

/**
 * 计算综合情绪分数
 */
export function calculateSentimentScore(input: SentimentInput): SentimentResult {
  const components: Record<string, { value: number; weight: number; contribution: number }> = {};

  // VIX (inverse: low VIX = greed)
  if (input.vixLevel !== undefined) {
    const vixScore = Math.max(0, Math.min(100, 100 - (input.vixLevel - 10) * 2.5));
    components.vix = { value: input.vixLevel, weight: 0.15, contribution: vixScore * 0.15 };
  }

  // Put/Call ratio (inverse: low = greed)
  if (input.putCallRatio !== undefined) {
    const pcScore = Math.max(0, Math.min(100, 100 - input.putCallRatio * 100));
    components.putCall = { value: input.putCallRatio, weight: 0.1, contribution: pcScore * 0.1 };
  }

  // Advance/Decline ratio
  if (input.advanceDeclineRatio !== undefined) {
    const adScore = Math.max(0, Math.min(100, input.advanceDeclineRatio * 50));
    components.advanceDecline = { value: input.advanceDeclineRatio, weight: 0.1, contribution: adScore * 0.1 };
  }

  // New highs vs lows
  if (input.newHighsNewLows) {
    const { highs, lows } = input.newHighsNewLows;
    const total = highs + lows || 1;
    const hlScore = (highs / total) * 100;
    components.newHighsLows = { value: highs / total, weight: 0.1, contribution: hlScore * 0.1 };
  }

  // Northbound flow
  if (input.northboundFlow !== undefined) {
    const nbScore = Math.max(0, Math.min(100, 50 + input.northboundFlow / 1000));
    components.northbound = { value: input.northboundFlow, weight: 0.1, contribution: nbScore * 0.1 };
  }

  // Social sentiment
  if (input.socialPositiveRatio !== undefined) {
    components.social = { value: input.socialPositiveRatio, weight: 0.1, contribution: input.socialPositiveRatio * 100 * 0.1 };
  }

  // News sentiment
  if (input.newsPositiveRatio !== undefined) {
    components.news = { value: input.newsPositiveRatio, weight: 0.1, contribution: input.newsPositiveRatio * 100 * 0.1 };
  }

  // Fund flow
  if (input.fundFlow !== undefined) {
    const flowScore = Math.max(0, Math.min(100, 50 + input.fundFlow / 10000));
    components.fundFlow = { value: input.fundFlow, weight: 0.15, contribution: flowScore * 0.15 };
  }

  // Calculate weighted total
  let totalWeight = 0;
  let weightedSum = 0;
  for (const comp of Object.values(components)) {
    weightedSum += comp.contribution;
    totalWeight += comp.weight;
  }

  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 50;

  // Label
  let label: SentimentResult['label'];
  if (score <= 20) label = 'extreme_fear';
  else if (score <= 40) label = 'fear';
  else if (score <= 60) label = 'neutral';
  else if (score <= 80) label = 'greed';
  else label = 'extreme_greed';

  // Divergences
  const divergences: string[] = [];
  const compValues = Object.values(components);
  if (compValues.length >= 2) {
    const max = Math.max(...compValues.map(c => c.contribution / c.weight));
    const min = Math.min(...compValues.map(c => c.contribution / c.weight));
    if (max - min > 40) {
      divergences.push('情绪指标出现显著分歧，市场观点不一致');
    }
  }

  return { score, label, components, trend: 'stable', divergences };
}

/**
 * 恐慌贪婪仪表盘
 */
export function createFearGreedGauge(
  current: number,
  history: number[],
): FearGreedGauge {
  const previousClose = history.length >= 2 ? history[history.length - 2] : current;
  const weekAgo = history.length >= 5 ? history[history.length - 5] : current;
  const monthAgo = history.length >= 20 ? history[history.length - 20] : current;

  let interpretation: string;
  if (current <= 25) interpretation = '市场极度恐慌，可能是逆向买入机会';
  else if (current <= 45) interpretation = '市场情绪偏悲观，观望为主';
  else if (current <= 55) interpretation = '市场情绪中性，趋势待确认';
  else if (current <= 75) interpretation = '市场情绪偏乐观，注意过热信号';
  else interpretation = '市场极度贪婪，警惕回调风险';

  return {
    current,
    previousClose,
    weekAgo,
    monthAgo,
    sparkline: history.slice(-20),
    interpretation,
  };
}

/**
 * 社交媒体情绪分析
 */
export function analyzeSocialSentiment(
  posts: Array<{ text: string; likes: number; timestamp: string }>,
): SocialSentimentResult {
  if (posts.length === 0) {
    return { overallScore: 0, volume: 0, momentum: 0, topThemes: [], alerts: [] };
  }

  const positiveWords = ['涨', '牛', '好', '买入', '加仓', '看好', '突破', '新高'];
  const negativeWords = ['跌', '熊', '差', '卖出', '减仓', '看空', '破位', '新低'];

  let totalScore = 0;
  const themeMap = new Map<string, { sentiment: number; count: number }>();
  const alerts: string[] = [];

  for (const post of posts) {
    let score = 0;
    for (const w of positiveWords) {
      if (post.text.includes(w)) score += 1;
    }
    for (const w of negativeWords) {
      if (post.text.includes(w)) score -= 1;
    }
    totalScore += Math.max(-1, Math.min(1, score / 3)) * (1 + Math.log10(post.likes + 1));

    // Extract themes (simple keyword matching)
    const keywords = post.text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    for (const kw of keywords) {
      if (!themeMap.has(kw)) themeMap.set(kw, { sentiment: 0, count: 0 });
      const t = themeMap.get(kw)!;
      t.sentiment += score > 0 ? 1 : score < 0 ? -1 : 0;
      t.count++;
    }
  }

  const totalWeight = posts.reduce((s, p) => s + 1 + Math.log10(p.likes + 1), 0);
  const overallScore = Math.round((totalScore / (totalWeight || 1)) * 100) / 100;

  // Momentum (recent vs earlier)
  const half = Math.floor(posts.length / 2);
  const recentScore = posts.slice(half).reduce((s, p) => {
    let sc = 0;
    for (const w of positiveWords) if (p.text.includes(w)) sc++;
    for (const w of negativeWords) if (p.text.includes(w)) sc--;
    return s + sc;
  }, 0);
  const earlierScore = posts.slice(0, half).reduce((s, p) => {
    let sc = 0;
    for (const w of positiveWords) if (p.text.includes(w)) sc++;
    for (const w of negativeWords) if (p.text.includes(w)) sc--;
    return s + sc;
  }, 0);
  const momentum = half > 0 ? Math.round(((recentScore - earlierScore) / half) * 100) / 100 : 0;

  // Top themes
  const topThemes = [...themeMap.entries()]
    .filter(([_, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([theme, { sentiment, count }]) => ({
      theme,
      sentiment: Math.round((sentiment / count) * 100) / 100,
      count,
    }));

  // Alerts
  if (posts.length > 50 && overallScore > 0.5) {
    alerts.push('社交媒体情绪过热，注意风险');
  }
  if (posts.length > 50 && overallScore < -0.5) {
    alerts.push('社交媒体极度悲观，可能存在反向机会');
  }

  return { overallScore, volume: posts.length, momentum, topThemes, alerts };
}

/**
 * 识别市场风格
 */
export function identifyMarketRegime(
  indicators: {
    vix: number;
    creditSpreads: number;
    yieldCurveSlope: number;
    dollarStrength: number;
    commodityMomentum: number;
  },
): MarketRegime {
  const checks: Record<string, boolean> = {
    lowVix: indicators.vix < 20,
    tightCredit: indicators.creditSpreads < 0.03,
    normalCurve: indicators.yieldCurveSlope > 0,
    weakDollar: indicators.dollarStrength < 0,
    commodityRising: indicators.commodityMomentum > 0,
  };

  const riskOnSignals = Object.values(checks).filter(Boolean).length;
  const totalSignals = Object.keys(checks).length;

  let regime: MarketRegime['regime'];
  const confidence = riskOnSignals / totalSignals;

  if (riskOnSignals >= 4) regime = 'risk_on';
  else if (riskOnSignals <= 1) regime = 'risk_off';
  else if (riskOnSignals === 2 || riskOnSignals === 3) regime = 'transition';
  else regime = 'uncertain';

  return {
    regime,
    confidence: Math.round(confidence * 100) / 100,
    indicators: checks,
    duration: regime === 'risk_on' ? 30 : regime === 'risk_off' ? 20 : 10,
  };
}
