/**
 * Market Microstructure V2 Engine
 * 
 * 市场微观结构V2引擎 - 交易成本分析、信息不对称检测、价格发现效率
 */

export interface TradeData {
  timestamp: number;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
  isBlock: boolean;
}

export interface TradeCostAnalysis {
  effectiveSpread: number;
  realizedSpread: number;
  priceImpact: number;
  implementationShortfall: number;
  vwapDeviation: number;
  costBps: number;
}

export interface InformationAsymmetry {
  adverseSelectionCost: number;
  informedTradingProb: number;
  pinScore: number; // Probability of Informed Trading
  toxicity: 'high' | 'medium' | 'low';
}

export interface PriceDiscovery {
  efficiency: number;
  halfLife: number;
  priceReversion: number;
  noiseLevel: number;
  discoveryScore: number;
}

// ===== Trade Cost Analysis =====

export function analyzeTradeCosts(
  trades: TradeData[],
  arrivalPrice: number
): TradeCostAnalysis {
  if (trades.length === 0) {
    return {
      effectiveSpread: 0,
      realizedSpread: 0,
      priceImpact: 0,
      implementationShortfall: 0,
      vwapDeviation: 0,
      costBps: 0,
    };
  }

  // VWAP
  const totalVolume = trades.reduce((s, t) => s + t.volume, 0);
  const vwap =
    totalVolume > 0
      ? trades.reduce((s, t) => s + t.price * t.volume, 0) / totalVolume
      : arrivalPrice;

  // Effective spread (trade price vs midpoint)
  const midPrice = (trades[0].price + trades[trades.length - 1].price) / 2;
  const effectiveSpread =
    trades.reduce((s, t) => {
      const direction = t.side === 'buy' ? 1 : -1;
      return s + Math.abs(t.price - midPrice) * direction * t.volume;
    }, 0) / totalVolume;

  // Realized spread (5-min post-trade)
  const postTradePrice = trades.length > 1 ? trades[trades.length - 1].price : trades[0].price;
  const realizedSpread = effectiveSpread - (postTradePrice - midPrice);

  // Price impact
  const priceImpact = trades[trades.length - 1].price - trades[0].price;

  // Implementation shortfall
  const executionPrice = vwap;
  const implementationShortfall = executionPrice - arrivalPrice;

  // VWAP deviation
  const vwapDeviation = ((executionPrice - vwap) / vwap) * 10000;

  // Cost in bps
  const costBps = (Math.abs(implementationShortfall) / arrivalPrice) * 10000;

  return {
    effectiveSpread: Math.round(effectiveSpread * 10000) / 10000,
    realizedSpread: Math.round(realizedSpread * 10000) / 10000,
    priceImpact: Math.round(priceImpact * 10000) / 10000,
    implementationShortfall: Math.round(implementationShortfall * 10000) / 10000,
    vwapDeviation: Math.round(vwapDeviation * 100) / 100,
    costBps: Math.round(costBps * 100) / 100,
  };
}

// ===== Information Asymmetry =====

export function detectInformationAsymmetry(
  trades: TradeData[]
): InformationAsymmetry {
  if (trades.length < 10) {
    return {
      adverseSelectionCost: 0,
      informedTradingProb: 0,
      pinScore: 0,
      toxicity: 'low',
    };
  }

  // Buy vs sell imbalance
  const buyVolume = trades.filter((t) => t.side === 'buy').reduce((s, t) => s + t.volume, 0);
  const sellVolume = trades.filter((t) => t.side === 'sell').reduce((s, t) => s + t.volume, 0);
  const totalVolume = buyVolume + sellVolume;

  const imbalance = totalVolume > 0 ? Math.abs(buyVolume - sellVolume) / totalVolume : 0;

  // PIN approximation (Probability of Informed Trading)
  const pinScore = Math.min(1, imbalance * 2);

  // Adverse selection cost (price impact of trades)
  const priceImpact = trades.length > 1
    ? Math.abs(trades[trades.length - 1].price - trades[0].price) / trades[0].price
    : 0;

  // Informed trading probability
  const informedTradingProb = pinScore * (1 + priceImpact * 10);

  // Toxicity classification
  let toxicity: 'high' | 'medium' | 'low';
  if (pinScore > 0.4) toxicity = 'high';
  else if (pinScore > 0.2) toxicity = 'medium';
  else toxicity = 'low';

  return {
    adverseSelectionCost: Math.round(priceImpact * 10000) / 10000,
    informedTradingProb: Math.round(Math.min(1, informedTradingProb) * 100) / 100,
    pinScore: Math.round(pinScore * 100) / 100,
    toxicity,
  };
}

// ===== Price Discovery =====

export function analyzePriceDiscovery(
  prices: number[],
  fundamentalValue?: number
): PriceDiscovery {
  if (prices.length < 3) {
    return {
      efficiency: 0,
      halfLife: 0,
      priceReversion: 0,
      noiseLevel: 0,
      discoveryScore: 0,
    };
  }

  // Price changes
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;

  // Autocorrelation (mean reversion indicator)
  const autocorr = returns.length > 1
    ? returns.slice(0, -1).reduce((s, r, i) => s + (r - meanReturn) * (returns[i + 1] - meanReturn), 0) /
      returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0)
    : 0;

  // Half-life of mean reversion
  const halfLife = autocorr < 0 ? -Math.log(2) / Math.log(1 + autocorr) : Infinity;

  // Price reversion (negative autocorr = mean reverting)
  const priceReversion = -autocorr;

  // Noise level (volatility of returns)
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
  const noiseLevel = Math.sqrt(variance);

  // Efficiency (how close to fundamental value)
  const lastPrice = prices[prices.length - 1];
  const efficiency = fundamentalValue
    ? 1 - Math.abs(lastPrice - fundamentalValue) / fundamentalValue
    : 1 - Math.abs(autocorr);

  // Discovery score
  const discoveryScore = Math.max(0, Math.min(100,
    efficiency * 50 +
    (halfLife < 10 ? 25 : 0) +
    (noiseLevel < 0.02 ? 25 : 0)
  ));

  return {
    efficiency: Math.round(Math.max(0, efficiency) * 100) / 100,
    halfLife: Math.round(Math.min(halfLife, 100) * 100) / 100,
    priceReversion: Math.round(priceReversion * 10000) / 10000,
    noiseLevel: Math.round(noiseLevel * 10000) / 10000,
    discoveryScore: Math.round(discoveryScore * 100) / 100,
  };
}

// ===== Block Trade Impact =====

export function analyzeBlockTradeImpact(
  trades: TradeData[]
): { preBlockPrice: number; postBlockPrice: number; impact: number; recoveryTime: number } {
  const blockTrades = trades.filter((t) => t.isBlock);

  if (blockTrades.length === 0) {
    return { preBlockPrice: 0, postBlockPrice: 0, impact: 0, recoveryTime: 0 };
  }

  const block = blockTrades[0];
  const preBlockTrades = trades.filter((t) => t.timestamp < block.timestamp).slice(-5);
  const postBlockTrades = trades.filter((t) => t.timestamp > block.timestamp).slice(0, 5);

  const preBlockPrice = preBlockTrades.length > 0
    ? preBlockTrades.reduce((s, t) => s + t.price, 0) / preBlockTrades.length
    : block.price;

  const postBlockPrice = postBlockTrades.length > 0
    ? postBlockTrades.reduce((s, t) => s + t.price, 0) / postBlockTrades.length
    : block.price;

  const impact = ((postBlockPrice - preBlockPrice) / preBlockPrice) * 100;

  // Recovery time (trades until price returns)
  const recoveryIndex = postBlockTrades.findIndex(
    (t) => Math.abs(t.price - preBlockPrice) / preBlockPrice < 0.001
  );
  const recoveryTime = recoveryIndex >= 0 ? recoveryIndex + 1 : postBlockTrades.length;

  return {
    preBlockPrice: Math.round(preBlockPrice * 100) / 100,
    postBlockPrice: Math.round(postBlockPrice * 100) / 100,
    impact: Math.round(impact * 100) / 100,
    recoveryTime,
  };
}

// ===== Trade Size Distribution =====

export function analyzeTradeSizeDistribution(
  trades: TradeData[]
): { mean: number; median: number; skewness: number; kurtosis: number } {
  if (trades.length === 0) {
    return { mean: 0, median: 0, skewness: 0, kurtosis: 0 };
  }

  const sizes = trades.map((t) => t.volume);
  const n = sizes.length;

  const mean = sizes.reduce((s, v) => s + v, 0) / n;
  const sorted = [...sizes].sort((a, b) => a - b);
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  // Skewness
  const variance = sizes.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const skewness = stdDev > 0
    ? sizes.reduce((s, v) => s + ((v - mean) / stdDev) ** 3, 0) / n
    : 0;

  // Kurtosis
  const kurtosis = stdDev > 0
    ? sizes.reduce((s, v) => s + ((v - mean) / stdDev) ** 4, 0) / n - 3
    : 0;

  return {
    mean: Math.round(mean),
    median: Math.round(median),
    skewness: Math.round(skewness * 100) / 100,
    kurtosis: Math.round(kurtosis * 100) / 100,
  };
}
