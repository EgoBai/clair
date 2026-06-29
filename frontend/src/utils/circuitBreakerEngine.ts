/**
 * Circuit Breaker Analysis Engine
 *
 * Analyzes A-share circuit breaker mechanics, limit up/down patterns,
 * and price limit effects on trading.
 */

export type CircuitBreakerType = 'limit_up' | 'limit_down' | 'none';

export interface StockLimitStatus {
  symbol: string;
  price: number;
  prevClose: number;
  limitUp: number;
  limitDown: number;
  limitType: CircuitBreakerType;
  consecutiveDays: number;
  volumeRatio: number;
  sealAmount: number; // seal order amount
  openProbability: number;
}

export interface LimitPattern {
  type: 'continuous_limit_up' | 'continuous_limit_down' | 'reversal' | 'broken_limit';
  symbol: string;
  days: number;
  strength: number;
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
}

export interface SectorHeatmap {
  sector: string;
  limitUpCount: number;
  limitDownCount: number;
  avgChange: number;
  intensity: number; // -1 to 1
  leader: string;
}

export interface MarketSentiment {
  limitUpCount: number;
  limitDownCount: number;
  limitUpRatio: number;
  sentiment: 'extreme_greed' | 'greed' | 'neutral' | 'fear' | 'extreme_fear';
  trendDirection: 'bullish' | 'bearish' | 'neutral';
  score: number; // -100 to 100
}

export interface LimitUpPool {
  symbol: string;
  sealTime: string;
  sealAmount: number;
  prevLimitDays: number;
  sector: string;
  reason: string;
  probability: number;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Calculate limit up/down prices
 */
export function calculateLimits(prevClose: number, stFlag: boolean = false): { limitUp: number; limitDown: number } {
  const limitPct = stFlag ? 0.05 : 0.10; // ST stocks have 5% limit
  return {
    limitUp: Math.round(prevClose * (1 + limitPct) * 100) / 100,
    limitDown: Math.round(prevClose * (1 - limitPct) * 100) / 100,
  };
}

/**
 * Check if stock is at limit
 */
export function checkLimitStatus(
  symbol: string,
  price: number,
  prevClose: number,
  volume: number,
  avgVolume: number,
  stFlag: boolean = false
): StockLimitStatus {
  const { limitUp, limitDown } = calculateLimits(prevClose, stFlag);
  const limitUpRounded = Math.round(limitUp * 100) / 100;
  const limitDownRounded = Math.round(limitDown * 100) / 100;
  const priceRounded = Math.round(price * 100) / 100;

  let limitType: CircuitBreakerType = 'none';
  if (priceRounded >= limitUpRounded) limitType = 'limit_up';
  else if (priceRounded <= limitDownRounded) limitType = 'limit_down';

  return {
    symbol,
    price,
    prevClose,
    limitUp: limitUpRounded,
    limitDown: limitDownRounded,
    limitType,
    consecutiveDays: 0,
    volumeRatio: avgVolume === 0 ? 1 : volume / avgVolume,
    sealAmount: 0,
    openProbability: 0,
  };
}

/**
 * Detect limit patterns from price history
 */
export function detectLimitPatterns(
  symbol: string,
  prices: number[],
  volumes: number[],
  prevCloses: number[]
): LimitPattern[] {
  const patterns: LimitPattern[] = [];
  let consecutiveUp = 0;
  let consecutiveDown = 0;
  let streakStart = 0;

  for (let i = 0; i < prices.length; i++) {
    const { limitUp, limitDown } = calculateLimits(prevCloses[i] || prices[i] * 0.99);
    const atLimitUp = Math.abs(prices[i] - limitUp) < 0.02;
    const atLimitDown = Math.abs(prices[i] - limitDown) < 0.02;

    if (atLimitUp) {
      if (consecutiveUp === 0) streakStart = i;
      consecutiveUp++;
      consecutiveDown = 0;

      if (consecutiveUp >= 2) {
        const streakVolumes = volumes.slice(streakStart, i + 1);
        const volTrend: LimitPattern['volumeTrend'] =
          streakVolumes.length >= 2 && streakVolumes[streakVolumes.length - 1] > streakVolumes[0] * 1.5
            ? 'increasing'
            : streakVolumes.length >= 2 && streakVolumes[streakVolumes.length - 1] < streakVolumes[0] * 0.7
            ? 'decreasing' : 'stable';

        patterns.push({
          type: 'continuous_limit_up',
          symbol,
          days: consecutiveUp,
          strength: consecutiveUp / 10,
          volumeTrend: volTrend,
        });
      }
    } else if (atLimitDown) {
      if (consecutiveDown === 0) streakStart = i;
      consecutiveDown++;
      consecutiveUp = 0;

      if (consecutiveDown >= 2) {
        patterns.push({
          type: 'continuous_limit_down',
          symbol,
          days: consecutiveDown,
          strength: consecutiveDown / 10,
          volumeTrend: 'stable',
        });
      }
    } else {
      if (consecutiveUp >= 2) {
        patterns.push({ type: 'broken_limit', symbol, days: consecutiveUp, strength: 0.5, volumeTrend: 'stable' });
      }
      consecutiveUp = 0;
      consecutiveDown = 0;
    }
  }

  return patterns;
}

/**
 * Analyze sector heatmap from limit data
 */
export function analyzeSectorHeatmap(
  stocks: { symbol: string; sector: string; change: number; limitType: CircuitBreakerType }[]
): SectorHeatmap[] {
  const sectorMap = new Map<string, { changes: number[]; limitUp: number; limitDown: number; leader: string; leaderChange: number }>();

  for (const stock of stocks) {
    if (!sectorMap.has(stock.sector)) {
      sectorMap.set(stock.sector, { changes: [], limitUp: 0, limitDown: 0, leader: stock.symbol, leaderChange: stock.change });
    }
    const sector = sectorMap.get(stock.sector)!;
    sector.changes.push(stock.change);
    if (stock.limitType === 'limit_up') sector.limitUp++;
    if (stock.limitType === 'limit_down') sector.limitDown++;
    if (stock.change > sector.leaderChange) {
      sector.leader = stock.symbol;
      sector.leaderChange = stock.change;
    }
  }

  const results: SectorHeatmap[] = [];
  for (const [sector, data] of sectorMap) {
    const avgChange = mean(data.changes);
    const totalLimit = data.limitUp + data.limitDown;
    results.push({
      sector,
      limitUpCount: data.limitUp,
      limitDownCount: data.limitDown,
      avgChange,
      intensity: totalLimit === 0 ? avgChange * 10 : (data.limitUp - data.limitDown) / totalLimit,
      leader: data.leader,
    });
  }

  return results.sort((a, b) => b.intensity - a.intensity);
}

/**
 * Calculate market sentiment from limit data
 */
export function calculateMarketSentiment(
  limitUpCount: number,
  limitDownCount: number,
  _totalStocks: number
): MarketSentiment {
  const total = limitUpCount + limitDownCount;
  const limitUpRatio = total === 0 ? 0.5 : limitUpCount / total;

  let sentiment: MarketSentiment['sentiment'];
  let score: number;

  if (limitUpCount > 100 && limitUpRatio > 0.8) {
    sentiment = 'extreme_greed';
    score = 80 + (limitUpRatio - 0.8) * 100;
  } else if (limitUpRatio > 0.65) {
    sentiment = 'greed';
    score = 30 + (limitUpRatio - 0.65) * 100;
  } else if (limitDownCount > 100 && limitUpRatio < 0.2) {
    sentiment = 'extreme_fear';
    score = -80 - (0.2 - limitUpRatio) * 100;
  } else if (limitUpRatio < 0.35) {
    sentiment = 'fear';
    score = -30 - (0.35 - limitUpRatio) * 100;
  } else {
    sentiment = 'neutral';
    score = (limitUpRatio - 0.5) * 60;
  }

  let trendDirection: MarketSentiment['trendDirection'];
  if (score > 20) trendDirection = 'bullish';
  else if (score < -20) trendDirection = 'bearish';
  else trendDirection = 'neutral';

  return {
    limitUpCount,
    limitDownCount,
    limitUpRatio,
    sentiment,
    trendDirection,
    score: Math.max(-100, Math.min(100, score)),
  };
}

/**
 * Estimate limit-open probability
 */
export function estimateOpenProbability(
  sealAmount: number,
  sealVolume: number,
  consecutiveDays: number,
  avgVolume: number
): number {
  // Higher seal amount = lower open probability
  const sealRatio = avgVolume === 0 ? 1 : sealAmount / (avgVolume * 10);
  const dayFactor = Math.max(0, 1 - consecutiveDays * 0.15);

  // Base probability
  let probability = 0.5 - sealRatio * 0.3 + dayFactor * 0.2;
  probability = Math.max(0.01, Math.min(0.99, probability));

  return Math.round(probability * 100) / 100;
}

/**
 * Find potential limit-up pool stocks
 */
export function findLimitUpPool(
  stocks: {
    symbol: string;
    sector: string;
    change: number;
    volume: number;
    avgVolume: number;
    marketCap: number;
    hasNews: boolean;
  }[]
): LimitUpPool[] {
  const pool: LimitUpPool[] = [];

  for (const stock of stocks) {
    // Score each stock for limit-up potential
    let score = 0;

    // Volume surge
    const volRatio = stock.avgVolume === 0 ? 1 : stock.volume / stock.avgVolume;
    if (volRatio > 3) score += 30;
    else if (volRatio > 2) score += 20;
    else if (volRatio > 1.5) score += 10;

    // Price momentum
    if (stock.change > 0.07) score += 25;
    else if (stock.change > 0.05) score += 15;

    // Small cap more likely to hit limit
    if (stock.marketCap < 5e9) score += 15;
    else if (stock.marketCap < 20e9) score += 10;

    // News catalyst
    if (stock.hasNews) score += 20;

    if (score >= 40) {
      pool.push({
        symbol: stock.symbol,
        sealTime: '',
        sealAmount: 0,
        prevLimitDays: 0,
        sector: stock.sector,
        reason: score >= 60 ? 'high_momentum' : 'momentum',
        probability: Math.min(0.9, score / 100),
      });
    }
  }

  return pool.sort((a, b) => b.probability - a.probability);
}
