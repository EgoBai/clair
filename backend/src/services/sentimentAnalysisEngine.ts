/**
 * 市场情绪分析引擎 - Round 727
 * 多维度情绪指标计算
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

export function calculateSentimentScore(data: SentimentData): SentimentScore {
  // Momentum component (fund flow + advance/decline)
  const momentum = Math.max(-1, Math.min(1,
    (data.fundFlow > 0 ? 0.5 : -0.5) + (data.advanceDeclineRatio - 0.5)
  ));

  // Volatility component (VIX-based, inverted)
  const volNormalized = Math.max(0, Math.min(1, (40 - data.vixLevel) / 30));
  const volatility = volNormalized * 2 - 1; // -1 to 1

  // Volume component (margin balance changes)
  const volume = Math.max(-1, Math.min(1,
    (data.marginBalance > 1e12 ? 0.3 : -0.3) +
    (data.shortBalance < data.marginBalance * 0.05 ? 0.3 : -0.3)
  ));

  // Breadth component (limit up/down ratio)
  const totalLimits = data.limitUpCount + data.limitDownCount;
  const breadth = totalLimits > 0
    ? (data.limitUpCount - data.limitDownCount) / totalLimits
    : 0;

  // Sentiment component (put/call ratio, new accounts)
  const pcrSentiment = data.putCallRatio < 0.7 ? 0.8 : data.putCallRatio > 1.3 ? -0.8 : 0;
  const accountSentiment = data.newAccountCount > 500000 ? 0.5 : data.newAccountCount < 100000 ? -0.5 : 0;
  const sentiment = Math.max(-1, Math.min(1, (pcrSentiment + accountSentiment) / 2));

  // Overall score
  const overall = (momentum * 0.25 + volatility * 0.2 + volume * 0.2 + breadth * 0.15 + sentiment * 0.2);

  // Fear & Greed Index (0-100)
  const fearGreedIndex = Math.max(0, Math.min(100, (overall + 1) * 50));

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
    historicalPercentile: fearGreedIndex, // simplified
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
