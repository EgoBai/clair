/**
 * Sentiment Composite Engine
 *
 * Aggregates multiple sentiment sources: news, social media, options market,
 * fund flows, and technical sentiment into a unified composite score.
 */

export interface SentimentSource {
  name: string;
  score: number; // -100 to +100
  weight: number;
  reliability: number; // 0-1
  timestamp: string;
  dataPoints: number;
}

export interface CompositeSentiment {
  score: number; // -100 to +100
  label: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  confidence: number;
  sources: SentimentSource[];
  divergence: boolean;
  trend: 'improving' | 'deteriorating' | 'stable';
  historical: number[];
}

export interface SentimentDivergence {
  source1: string;
  source2: string;
  divergence: number;
  significance: 'low' | 'medium' | 'high';
}

/**
 * Calculate composite sentiment from multiple sources
 */
export function calculateCompositeSentiment(sources: SentimentSource[]): CompositeSentiment {
  if (sources.length === 0) {
    return {
      score: 0, label: 'neutral', confidence: 0, sources: [],
      divergence: false, trend: 'stable', historical: [],
    };
  }

  // Weighted average with reliability adjustment
  let totalWeight = 0;
  let weightedSum = 0;

  for (const source of sources) {
    const adjustedWeight = source.weight * source.reliability;
    weightedSum += source.score * adjustedWeight;
    totalWeight += adjustedWeight;
  }

  const score = totalWeight === 0 ? 0 : weightedSum / totalWeight;

  // Label
  let label: CompositeSentiment['label'];
  if (score >= 60) label = 'extreme_greed';
  else if (score >= 20) label = 'greed';
  else if (score <= -60) label = 'extreme_fear';
  else if (score <= -20) label = 'fear';
  else label = 'neutral';

  // Confidence based on agreement
  const directions = sources.map(s => Math.sign(s.score));
  const agreement = directions.filter(d => d === Math.sign(score)).length / sources.length;
  const confidence = agreement * Math.min(1, totalWeight / sources.length);

  // Divergence detection
  const scores = sources.map(s => s.score);
  const scoreRange = Math.max(...scores) - Math.min(...scores);
  const divergence = scoreRange > 60;

  return {
    score: Math.round(score * 10) / 10,
    label,
    confidence: Math.round(confidence * 100) / 100,
    sources,
    divergence,
    trend: 'stable',
    historical: [],
  };
}

/**
 * Detect sentiment divergences between sources
 */
export function detectSentimentDivergences(sources: SentimentSource[]): SentimentDivergence[] {
  const divergences: SentimentDivergence[] = [];

  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const diff = Math.abs(sources[i].score - sources[j].score);
      const sameDirection = Math.sign(sources[i].score) === Math.sign(sources[j].score);

      if (!sameDirection || diff > 30) {
        let significance: SentimentDivergence['significance'];
        if (diff > 60) significance = 'high';
        else if (diff > 40) significance = 'medium';
        else significance = 'low';

        divergences.push({
          source1: sources[i].name,
          source2: sources[j].name,
          divergence: diff,
          significance,
        });
      }
    }
  }

  return divergences.sort((a, b) => b.divergence - a.divergence);
}

/**
 * Calculate news sentiment from article scores
 */
export function calculateNewsSentiment(
  articles: { sentiment: number; relevance: number; date: string }[]
): SentimentSource {
  if (articles.length === 0) {
    return { name: 'news', score: 0, weight: 0.3, reliability: 0, timestamp: '', dataPoints: 0 };
  }

  // Weighted by relevance, with recency bias
  const now = Date.now();
  let totalWeight = 0;
  let weightedSum = 0;

  for (const article of articles) {
    const daysSince = (now - new Date(article.date).getTime()) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.max(0.1, 1 - daysSince / 30);
    const weight = article.relevance * recencyWeight;

    weightedSum += article.sentiment * weight;
    totalWeight += weight;
  }

  const score = totalWeight === 0 ? 0 : (weightedSum / totalWeight) * 100;

  return {
    name: 'news',
    score: Math.max(-100, Math.min(100, score)),
    weight: 0.3,
    reliability: Math.min(1, articles.length / 10),
    timestamp: articles[0]?.date || '',
    dataPoints: articles.length,
  };
}

/**
 * Calculate social media sentiment
 */
export function calculateSocialSentiment(
  posts: { sentiment: number; engagement: number; followers: number }[]
): SentimentSource {
  if (posts.length === 0) {
    return { name: 'social', score: 0, weight: 0.2, reliability: 0, timestamp: '', dataPoints: 0 };
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const post of posts) {
    const influence = Math.log10(Math.max(1, post.followers)) * post.engagement;
    weightedSum += post.sentiment * influence;
    totalWeight += influence;
  }

  const score = totalWeight === 0 ? 0 : (weightedSum / totalWeight) * 100;

  return {
    name: 'social',
    score: Math.max(-100, Math.min(100, score)),
    weight: 0.2,
    reliability: Math.min(1, posts.length / 50),
    timestamp: new Date().toISOString(),
    dataPoints: posts.length,
  };
}

/**
 * Calculate options market sentiment (Put/Call ratio based)
 */
export function calculateOptionsSentiment(
  putVolume: number,
  callVolume: number,
  putOI: number,
  callOI: number
): SentimentSource {
  const volumePCR = callVolume === 0 ? 1 : putVolume / callVolume;
  const oiPCR = callOI === 0 ? 1 : putOI / callOI;

  // PCR > 1 = bearish, PCR < 0.7 = bullish
  const volumeScore = (0.8 - volumePCR) * 100;
  const oiScore = (0.8 - oiPCR) * 100;
  const score = (volumeScore * 0.6 + oiScore * 0.4);

  return {
    name: 'options',
    score: Math.max(-100, Math.min(100, score)),
    weight: 0.25,
    reliability: 0.8,
    timestamp: new Date().toISOString(),
    dataPoints: putVolume + callVolume,
  };
}

/**
 * Calculate fund flow sentiment
 */
export function calculateFundFlowSentiment(
  inflows: number,
  outflows: number
): SentimentSource {
  const total = inflows + outflows;
  const score = total === 0 ? 0 : ((inflows - outflows) / total) * 100;

  return {
    name: 'fund_flow',
    score: Math.max(-100, Math.min(100, score)),
    weight: 0.15,
    reliability: 0.7,
    timestamp: new Date().toISOString(),
    dataPoints: total > 0 ? 1 : 0,
  };
}

/**
 * Calculate VIX-based fear sentiment
 */
export function calculateVIXSentiment(vix: number): SentimentSource {
  // VIX < 12 = extreme greed, VIX > 30 = extreme fear
  let score: number;
  if (vix < 12) score = 80;
  else if (vix < 15) score = 40;
  else if (vix < 20) score = 0;
  else if (vix < 25) score = -30;
  else if (vix < 30) score = -60;
  else score = -80;

  return {
    name: 'vix',
    score,
    weight: 0.1,
    reliability: 0.9,
    timestamp: new Date().toISOString(),
    dataPoints: 1,
  };
}
