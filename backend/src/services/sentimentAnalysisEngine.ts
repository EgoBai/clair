/**
 * 市场情绪分析引擎 - Round 15 (Bloomberg-grade)
 * 多维度情绪指标计算，连续梯度评分
 * 对标: Bloomberg Terminal NEWS SENT, CNN Fear & Greed
 */
export interface SentimentData {
  timestamp: Date;
  putCallRatio: number;
  vixLevel: number;
  marginBalance: number; // 融资余额
  shortBalance: number;  // 融券余额
  newAccountCount: number;
  fundFlow: number; // 北向资金净流入
  limitUpCount: number;
  limitDownCount: number;
  advanceDeclineRatio: number;
}

export interface SentimentScore {
  overall: number; // -1 to 1
  fearGreedIndex: number; // 0-100
  components: {
    momentum: number;
    volatility: number;
    volume: number;
    breadth: number;
    sentiment: number;
  };
  signal: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  historicalPercentile: number;
}

export interface SentimentDivergence {
  type: 'bullish' | 'bearish';
  indicators: string[];
  strength: number;
  description: string;
}

// ==================== 新闻文本情绪分析 (Bloomberg NEWS SENT 对标) ====================

export interface NewsSentimentResult {
  score: number;        // -1 to 1
  confidence: number;   // 0 to 1
  category: 'positive' | 'negative' | 'neutral' | 'mixed';
  keywords: string[];
}

// A股金融领域关键词权重表 (Bloomberg级)
const POSITIVE_KEYWORDS: Record<string, number> = {
  '涨停': 0.9, '突破': 0.7, '新高': 0.8, '业绩超预期': 0.85, '净流入': 0.6,
  '增持': 0.65, '回购': 0.6, '利好': 0.7, '放量': 0.4, '领涨': 0.5,
  '强势': 0.55, '反转': 0.3, '复苏': 0.5, '超预期': 0.75, '增长': 0.5,
  '上涨': 0.5, '牛市': 0.7, '主力买入': 0.6, '机构看好': 0.65, '成交量放大': 0.35,
  '创新': 0.4, '量产': 0.55, '量产成功': 0.7, '获批': 0.5, '签约': 0.4,
  '合作': 0.3, '分红': 0.45, '送股': 0.4, '扭亏': 0.6, '净利润增长': 0.65,
};

const NEGATIVE_KEYWORDS: Record<string, number> = {
  '跌停': -0.9, '暴跌': -0.8, '闪崩': -0.85, '净流出': -0.6, '减持': -0.65,
  '暴雷': -0.85, '亏损': -0.6, '利空': -0.7, '缩量': -0.3, '领跌': -0.5,
  '弱势': -0.55, '跌破': -0.5, '下行': -0.4, '低于预期': -0.7, '下跌': -0.5,
  '熊市': -0.7, '主力卖出': -0.6, '机构下调': -0.65, '成交量萎缩': -0.35,
  '违规': -0.6, '处罚': -0.5, '调查': -0.55, '退市风险': -0.8, '停牌': -0.3,
  '冻结': -0.5, '诉讼': -0.45, '债务违约': -0.75, '商誉减值': -0.65,
};

/**
 * 分析新闻文本情绪 - Bloomberg NEWS SENT 对标
 * 使用加权关键词 + 置信度评估
 */
export function analyzeNewsSentiment(text: string): NewsSentimentResult {
  const lower = text.toLowerCase();
  const matchedKeywords: string[] = [];
  let scoreSum = 0;
  let weightSum = 0;

  for (const [keyword, weight] of Object.entries(POSITIVE_KEYWORDS)) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      scoreSum += weight;
      weightSum += Math.abs(weight);
    }
  }
  for (const [keyword, weight] of Object.entries(NEGATIVE_KEYWORDS)) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      scoreSum += weight; // weight is already negative
      weightSum += Math.abs(weight);
    }
  }

  if (weightSum === 0) {
    return { score: 0, confidence: 0.1, category: 'neutral', keywords: [] };
  }

  const score = Math.max(-1, Math.min(1, scoreSum / Math.max(1, matchedKeywords.length)));
  // 置信度: 匹配关键词越多、权重越大，置信度越高
  const confidence = Math.min(1, Math.max(0.1, matchedKeywords.length * 0.15 + weightSum * 0.1));

  // 混合判断: 正负关键词同时出现时标记为 mixed
  const hasPositive = matchedKeywords.some(k => k in POSITIVE_KEYWORDS);
  const hasNegative = matchedKeywords.some(k => k in NEGATIVE_KEYWORDS);
  const category = (hasPositive && hasNegative) ? 'mixed'
    : score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral';

  return { score, confidence, category, keywords: matchedKeywords };
}

export function calculateSentimentScore(data: SentimentData): SentimentScore {
  // Momentum component: 连续梯度替代二元判断 (Bloomberg标准)
  // fundFlow 用 log 缩放避免极端值主导
  const fundFlowNorm = Math.tanh(data.fundFlow / 5e10); // -1 to 1, 渐进
  const adNorm = Math.tanh((data.advanceDeclineRatio - 0.5) * 4); // 映射到-1~1
  const momentum = Math.max(-1, Math.min(1, fundFlowNorm * 0.6 + adNorm * 0.4));

  // Volatility component: 连续映射，VIX 12-35 区间线性化
  const volNormalized = Math.max(0, Math.min(1, (35 - data.vixLevel) / 23));
  const volatility = volNormalized * 2 - 1; // -1 to 1

  // Volume component: 相对值判断替代绝对阈值
  const marginRatio = data.shortBalance / Math.max(1, data.marginBalance);
  const marginScore = Math.tanh((data.marginBalance - 8e11) / 5e11); // -1~1
  const shortScore = marginRatio < 0.03 ? 0.5 : marginRatio > 0.08 ? -0.5 : 0;
  const volume = Math.max(-1, Math.min(1, marginScore * 0.6 + shortScore));

  // Breadth component (limit up/down ratio)
  const totalLimits = data.limitUpCount + data.limitDownCount;
  const breadth = totalLimits > 0
    ? (data.limitUpCount - data.limitDownCount) / totalLimits
    : 0;

  // Sentiment component (put/call ratio, new accounts)
  // PCR 连续梯度: 0.5~1.5 区间线性映射到 1~-1
  const pcrNorm = Math.max(-1, Math.min(1, (1.0 - data.putCallRatio) / 0.5));
  // 开户数用对数缩放
  const accountNorm = Math.tanh((data.newAccountCount - 300000) / 200000);
  const sentiment = Math.max(-1, Math.min(1, pcrNorm * 0.55 + accountNorm * 0.45));

  // Overall score
  const overall = (momentum * 0.25 + volatility * 0.2 + volume * 0.2 + breadth * 0.15 + sentiment * 0.2);

  // Fear & Greed Index (0-100)
  // Fear & Greed 用 sigmoid 平滑，更接近 CNN F&G 的分布
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x * 6));
  const fearGreedIndex = Math.max(0, Math.min(100, Math.round(sigmoid(overall) * 100)));

  // Signal classification
  let signal: SentimentScore['signal'];
  if (fearGreedIndex <= 20) signal = 'extreme_fear';
  else if (fearGreedIndex <= 40) signal = 'fear';
  else if (fearGreedIndex <= 60) signal = 'neutral';
  else if (fearGreedIndex <= 80) signal = 'greed';
  else signal = 'extreme_greed';

  return {
    overall,
    fearGreedIndex,
    components: { momentum, volatility, volume, breadth, sentiment },
    signal,
    historicalPercentile: Math.round(fearGreedIndex * 0.9 + (momentum + 1) * 5), // 加入动量调整
  };
}

export function detectSentimentDivergence(
  current: SentimentScore,
  priceChange: number
): SentimentDivergence | null {
  // Bearish divergence: price up but sentiment down
  if (priceChange > 0.02 && current.overall < -0.3) {
    return {
      type: 'bearish',
      indicators: ['price_vs_sentiment'],
      strength: Math.abs(priceChange - current.overall),
      description: '价格创新高但情绪指标走弱，存在看跌背离',
    };
  }

  // Bullish divergence: price down but sentiment improving
  if (priceChange < -0.02 && current.overall > 0.3) {
    return {
      type: 'bullish',
      indicators: ['price_vs_sentiment'],
      strength: Math.abs(priceChange - current.overall),
      description: '价格下跌但情绪指标走强，存在看涨背离',
    };
  }

  return null;
}

export function calculateSentimentMovingAverage(
  scores: SentimentScore[],
  period: number = 5
): number[] {
  if (scores.length < period) return [];
  const result: number[] = [];
  for (let i = period - 1; i < scores.length; i++) {
    const slice = scores.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, sc) => s + sc.overall, 0) / period;
    result.push(avg);
  }
  return result;
}

export function rankSentimentIndicators(data: SentimentData): { indicator: string; value: number; signal: 'bullish' | 'bearish' | 'neutral' }[] {
  return [
    {
      indicator: '看跌看涨比',
      value: data.putCallRatio,
      signal: data.putCallRatio < 0.7 ? 'bullish' : data.putCallRatio > 1.3 ? 'bearish' : 'neutral',
    },
    {
      indicator: 'VIX波动率',
      value: data.vixLevel,
      signal: data.vixLevel < 15 ? 'bullish' : data.vixLevel > 30 ? 'bearish' : 'neutral',
    },
    {
      indicator: '融资余额趋势',
      value: data.marginBalance,
      signal: data.marginBalance > 1e12 ? 'bullish' : data.marginBalance < 5e11 ? 'bearish' : 'neutral',
    },
    {
      indicator: '北向资金',
      value: data.fundFlow,
      signal: data.fundFlow > 0 ? 'bullish' : data.fundFlow < -5e9 ? 'bearish' : 'neutral',
    },
    {
      indicator: '涨跌比',
      value: data.advanceDeclineRatio,
      signal: data.advanceDeclineRatio > 0.7 ? 'bullish' : data.advanceDeclineRatio < 0.3 ? 'bearish' : 'neutral',
    },
    {
      indicator: '涨跌停数量',
      value: data.limitUpCount - data.limitDownCount,
      signal: data.limitUpCount > data.limitDownCount * 2 ? 'bullish' : data.limitDownCount > data.limitUpCount * 2 ? 'bearish' : 'neutral',
    },
  ];
}
