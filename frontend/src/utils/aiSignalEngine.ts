/**
 * AI Signal Engine
 *
 * Combines multiple technical, fundamental, and sentiment signals
 * using ensemble methods for stock scoring and ranking.
 */

export interface SignalComponent {
  name: string;
  value: number; // -1 to 1
  weight: number;
  confidence: number;
  category: 'technical' | 'fundamental' | 'sentiment' | 'flow' | 'macro';
}

export interface StockSignal {
  symbol: string;
  compositeScore: number; // -100 to 100
  direction: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  confidence: number;
  components: SignalComponent[];
  topDrivers: { name: string; contribution: number }[];
  riskScore: number;
  timeHorizon: 'short' | 'medium' | 'long';
}

export interface EnsembleConfig {
  weights: Record<string, number>;
  minConfidence: number;
  requireAgreement: number; // 0-1, fraction of signals that must agree
}

/**
 * Generate stock signal from components
 */
export function generateStockSignal(
  symbol: string,
  components: SignalComponent[],
  config: Partial<EnsembleConfig> = {}
): StockSignal {
  const minConfidence = config.minConfidence || 0.3;
  const requireAgreement = config.requireAgreement || 0.5;

  // Filter by minimum confidence
  const validComponents = components.filter(c => c.confidence >= minConfidence);

  // Weighted ensemble
  let totalWeight = 0;
  let weightedScore = 0;

  for (const comp of validComponents) {
    const customWeight = config.weights?.[comp.name] || 1;
    const w = comp.weight * comp.confidence * customWeight;
    weightedScore += comp.value * w;
    totalWeight += w;
  }

  const compositeScore = totalWeight === 0 ? 0 : (weightedScore / totalWeight) * 100;

  // Agreement check
  const positiveCount = validComponents.filter(c => c.value > 0).length;
  const negativeCount = validComponents.filter(c => c.value < 0).length;
  const agreement = Math.max(positiveCount, negativeCount) / Math.max(1, validComponents.length);

  // Direction
  let direction: StockSignal['direction'];
  if (compositeScore >= 50 && agreement >= requireAgreement) direction = 'strong_buy';
  else if (compositeScore >= 20) direction = 'buy';
  else if (compositeScore <= -50 && agreement >= requireAgreement) direction = 'strong_sell';
  else if (compositeScore <= -20) direction = 'sell';
  else direction = 'hold';

  // Confidence based on agreement and component count
  const confidence = agreement * Math.min(1, validComponents.length / 5);

  // Top drivers
  const topDrivers = validComponents
    .map(c => ({ name: c.name, contribution: c.value * c.weight * c.confidence }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  // Risk score from disagreement and variance
  const values = validComponents.map(c => c.value);
  const meanVal = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  const variance = values.reduce((s, v) => s + (v - meanVal) ** 2, 0) / Math.max(1, values.length);
  const riskScore = Math.min(100, variance * 200 + (1 - agreement) * 50);

  // Time horizon based on category mix
  const categories = new Set(validComponents.map(c => c.category));
  let timeHorizon: StockSignal['timeHorizon'] = 'medium';
  if (categories.has('technical') && !categories.has('fundamental')) timeHorizon = 'short';
  if (categories.has('fundamental') && categories.has('macro')) timeHorizon = 'long';

  return {
    symbol,
    compositeScore: Math.max(-100, Math.min(100, compositeScore)),
    direction,
    confidence,
    components: validComponents,
    topDrivers,
    riskScore,
    timeHorizon,
  };
}

/**
 * Rank stocks by AI signal
 */
export function rankStocks(signals: StockSignal[]): StockSignal[] {
  return [...signals].sort((a, b) => {
    // Primary: composite score
    const scoreDiff = b.compositeScore - a.compositeScore;
    if (Math.abs(scoreDiff) > 10) return scoreDiff;

    // Secondary: confidence
    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 0.1) return confDiff;

    // Tertiary: lower risk
    return a.riskScore - b.riskScore;
  });
}

/**
 * Generate technical signals
 */
export function technicalSignals(
  closes: number[],
  volumes: number[]
): SignalComponent[] {
  const signals: SignalComponent[] = [];

  // SMA crossover
  if (closes.length >= 50) {
    const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const sma50 = closes.slice(-50).reduce((s, v) => s + v, 0) / 50;
    const smaSignal = (sma20 - sma50) / sma50;
    signals.push({
      name: 'sma_crossover',
      value: Math.max(-1, Math.min(1, smaSignal * 20)),
      weight: 0.8,
      confidence: 0.7,
      category: 'technical',
    });
  }

  // RSI
  if (closes.length >= 15) {
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change; else losses -= change;
    }
    const rs = losses === 0 ? 10 : gains / losses;
    const rsi = 100 - 100 / (1 + rs);
    const rsiSignal = (50 - rsi) / 50; // Oversold = positive signal
    signals.push({
      name: 'rsi',
      value: Math.max(-1, Math.min(1, rsiSignal)),
      weight: 0.6,
      confidence: 0.6,
      category: 'technical',
    });
  }

  // Volume trend
  if (volumes.length >= 20) {
    const recentVol = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5;
    const avgVol = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const priceChange = (closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5];
    const volSignal = recentVol / avgVol > 1.5 && priceChange > 0 ? 0.5 :
                     recentVol / avgVol > 1.5 && priceChange < 0 ? -0.5 : 0;
    signals.push({
      name: 'volume_confirmation',
      value: volSignal,
      weight: 0.5,
      confidence: 0.5,
      category: 'technical',
    });
  }

  return signals;
}

/**
 * Detect signal consensus across multiple stock signals
 */
export function detectConsensus(
  signals: StockSignal[]
): {
  consensus: 'bullish' | 'bearish' | 'mixed';
  strength: number;
  outliers: string[];
} {
  const scores = signals.map(s => s.compositeScore);
  const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
  const posCount = scores.filter(s => s > 0).length;
  const agreement = Math.max(posCount, scores.length - posCount) / scores.length;

  let consensus: 'bullish' | 'bearish' | 'mixed';
  if (avgScore > 15 && agreement > 0.6) consensus = 'bullish';
  else if (avgScore < -15 && agreement > 0.6) consensus = 'bearish';
  else consensus = 'mixed';

  // Outliers: stocks far from consensus
  const outliers = signals
    .filter(s => Math.abs(s.compositeScore - avgScore) > 50)
    .map(s => s.symbol);

  return { consensus, strength: agreement, outliers };
}
