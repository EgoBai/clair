/**
 * Elliott Wave Analysis Engine
 * 
 * 艾略特波浪分析引擎 - 用于识别和分析艾略特波浪形态
 * 支持完整波浪计数、斐波那契回撤/扩展、波浪确认信号
 */

// ===== Types =====

export interface PricePoint {
  index: number;
  price: number;
  timestamp: number;
  volume?: number;
}

export interface WaveSegment {
  type: 'impulse' | 'corrective';
  waves: PricePoint[];
  start: PricePoint;
  end: PricePoint;
  degree: WaveDegree;
  label: string;
  confidence: number;
}

export interface FibonacciLevels {
  retracement: Record<number, number>;
  extension: Record<number, number>;
  projection: Record<number, number>;
}

export interface ElliottWaveAnalysis {
  pattern: WavePattern;
  waves: WaveSegment[];
  fibonacci: FibonacciLevels;
  currentWave: number;
  nextExpectedDirection: 'up' | 'down' | 'uncertain';
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  invalidationPrice: number;
  waveLabels: string[];
}

export interface WavePattern {
  type: 'impulse' | 'corrective';
  subtype: string;
  degree: WaveDegree;
  isComplete: boolean;
  isValid: boolean;
}

export interface PivotPoint {
  index: number;
  price: number;
  type: 'high' | 'low';
  significance: number;
}

export type WaveDegree =
  | 'grand_supercycle'
  | 'supercycle'
  | 'cycle'
  | 'primary'
  | 'intermediate'
  | 'minor'
  | 'minute'
  | 'minuette'
  | 'subminuette';

// ===== Pivot Detection =====

export function detectPivots(
  prices: number[],
  lookback: number = 5
): PivotPoint[] {
  const pivots: PivotPoint[] = [];

  for (let i = lookback; i < prices.length - lookback; i++) {
    const windowLeft = prices.slice(i - lookback, i);
    const windowRight = prices.slice(i + 1, i + lookback + 1);
    const price = prices[i];

    // High pivot
    if (
      windowLeft.every((p) => p < price) &&
      windowRight.every((p) => p < price)
    ) {
      pivots.push({
        index: i,
        price,
        type: 'high',
        significance: calculateSignificance(prices, i, lookback, 'high'),
      });
    }

    // Low pivot
    if (
      windowLeft.every((p) => p > price) &&
      windowRight.every((p) => p > price)
    ) {
      pivots.push({
        index: i,
        price,
        type: 'low',
        significance: calculateSignificance(prices, i, lookback, 'low'),
      });
    }
  }

  return pivots.sort((a, b) => b.significance - a.significance);
}

function calculateSignificance(
  prices: number[],
  index: number,
  lookback: number,
  type: 'high' | 'low'
): number {
  const price = prices[index];
  const surrounding = prices.slice(
    Math.max(0, index - lookback * 2),
    Math.min(prices.length, index + lookback * 2 + 1)
  );

  if (type === 'high') {
    const max = Math.max(...surrounding);
    return (price / max) * 100;
  } else {
    const min = Math.min(...surrounding);
    return (min / price) * 100;
  }
}

// ===== Wave Pattern Detection =====

export function detectImpulseWave(
  pivots: PivotPoint[],
  prices: number[]
): WaveSegment | null {
  if (pivots.length < 5) return null;

  const sortedPivots = [...pivots].sort((a, b) => a.index - b.index);

  // Need alternating highs and lows for impulse: 1-2-3-4-5
  // Pattern: up-down-up-down-up (for bullish) or down-up-down-up-down (for bearish)
  for (let i = 0; i <= sortedPivots.length - 5; i++) {
    const sequence = sortedPivots.slice(i, i + 5);

    // Check alternating pattern
    const isValidSequence =
      sequence[0].type !== sequence[1].type &&
      sequence[1].type !== sequence[2].type &&
      sequence[2].type !== sequence[3].type &&
      sequence[3].type !== sequence[4].type;

    if (!isValidSequence) continue;

    // Check Elliott rules for impulse waves
    if (sequence[0].type === 'low') {
      // Bullish impulse: low-high-low-high-low (1-2-3-4-5)
      const wave1 = sequence[1].price - sequence[0].price; // Wave 1
      const wave2 = sequence[1].price - sequence[2].price; // Wave 2 retracement
      const wave3 = sequence[3].price - sequence[2].price; // Wave 3
      const wave4 = sequence[3].price - sequence[4].price; // Wave 4 retracement

      if (wave1 > 0 && wave2 > 0 && wave3 > 0 && wave4 > 0) {
        // Rule: Wave 2 doesn't retrace more than 100% of Wave 1
        if (sequence[2].price <= sequence[0].price) continue;
        // Rule: Wave 3 is not the shortest impulse wave
        if (wave3 < wave1 && wave3 < wave4) continue;
        // Rule: Wave 4 doesn't overlap Wave 1 price territory
        if (sequence[4].price <= sequence[1].price) continue;

        const confidence = calculateImpulseConfidence(sequence, prices);
        if (confidence > 0.3) {
          return {
            type: 'impulse',
            waves: sequence.map((p) => ({
              index: p.index,
              price: p.price,
              timestamp: p.index,
            })),
            start: { index: sequence[0].index, price: sequence[0].price, timestamp: sequence[0].index },
            end: { index: sequence[4].index, price: sequence[4].price, timestamp: sequence[4].index },
            degree: 'minor',
            label: 'impulse-12345',
            confidence,
          };
        }
      }
    }

    if (sequence[0].type === 'high') {
      // Bearish impulse: high-low-high-low-high (5-4-3-2-1)
      const wave1 = sequence[0].price - sequence[1].price;
      const wave2 = sequence[2].price - sequence[1].price;
      const wave3 = sequence[2].price - sequence[3].price;
      const wave4 = sequence[4].price - sequence[3].price;

      if (wave1 > 0 && wave2 > 0 && wave3 > 0 && wave4 > 0) {
        if (sequence[2].price >= sequence[0].price) continue;
        if (wave3 < wave1 && wave3 < wave4) continue;
        if (sequence[4].price >= sequence[1].price) continue;

        const confidence = calculateImpulseConfidence(sequence, prices);
        if (confidence > 0.3) {
          return {
            type: 'impulse',
            waves: sequence.map((p) => ({
              index: p.index,
              price: p.price,
              timestamp: p.index,
            })),
            start: { index: sequence[0].index, price: sequence[0].price, timestamp: sequence[0].index },
            end: { index: sequence[4].index, price: sequence[4].price, timestamp: sequence[4].index },
            degree: 'minor',
            label: 'impulse-54321',
            confidence,
          };
        }
      }
    }
  }

  return null;
}

function calculateImpulseConfidence(
  pivots: PivotPoint[],
  _prices: number[]
): number {
  let score = 0;

  // Fibonacci ratio checks (Wave 3 often ~1.618x Wave 1)
  const wave1Len = Math.abs(pivots[1].price - pivots[0].price);
  const wave3Len = Math.abs(pivots[3].price - pivots[2].price);
  const wave2Retrace = Math.abs(pivots[2].price - pivots[1].price) / wave1Len;
  const wave4Retrace = Math.abs(pivots[4].price - pivots[3].price) / wave3Len;

  // Wave 2 typically retraces 0.5-0.786 of Wave 1
  if (wave2Retrace >= 0.382 && wave2Retrace <= 0.786) score += 0.2;
  // Wave 4 typically retraces 0.382-0.5 of Wave 3
  if (wave4Retrace >= 0.236 && wave4Retrace <= 0.618) score += 0.2;
  // Wave 3 is often the longest
  if (wave3Len > wave1Len) score += 0.2;
  // Wave 3 is ~1.618x Wave 1 (Fibonacci)
  const fibRatio = wave3Len / wave1Len;
  if (fibRatio >= 1.272 && fibRatio <= 2.618) score += 0.2;
  // Significance of pivots
  const avgSignificance =
    pivots.reduce((sum, p) => sum + p.significance, 0) / pivots.length;
  if (avgSignificance > 95) score += 0.2;

  return Math.min(1, score);
}

// ===== Corrective Wave Detection =====

export function detectCorrectiveWave(
  pivots: PivotPoint[],
  _prices: number[]
): WaveSegment | null {
  if (pivots.length < 3) return null;

  const sortedPivots = [...pivots].sort((a, b) => a.index - b.index);

  for (let i = 0; i <= sortedPivots.length - 3; i++) {
    const sequence = sortedPivots.slice(i, i + 3);

    // ABC correction: needs 3 points with specific alternation
    const isValidABC =
      sequence[0].type !== sequence[1].type &&
      sequence[1].type !== sequence[2].type;

    if (!isValidABC) continue;

    // Zigzag: sharp correction, B retraces 0.382-0.618 of A
    const aLen = Math.abs(sequence[1].price - sequence[0].price);
    const bLen = Math.abs(sequence[2].price - sequence[1].price);
    const bRetrace = bLen / aLen;

    if (bRetrace >= 0.382 && bRetrace <= 0.786) {
      const confidence = 0.4 + bRetrace * 0.3;
      return {
        type: 'corrective',
        waves: sequence.map((p) => ({
          index: p.index,
          price: p.price,
          timestamp: p.index,
        })),
        start: { index: sequence[0].index, price: sequence[0].price, timestamp: sequence[0].index },
        end: { index: sequence[2].index, price: sequence[2].price, timestamp: sequence[2].index },
        degree: 'minor',
        label: 'corrective-ABC',
        confidence,
      };
    }
  }

  return null;
}

// ===== Fibonacci Analysis =====

export function calculateFibonacciLevels(
  high: number,
  low: number
): FibonacciLevels {
  const range = high - low;

  return {
    retracement: {
      0.0: high,
      0.236: high - range * 0.236,
      0.382: high - range * 0.382,
      0.5: high - range * 0.5,
      0.618: high - range * 0.618,
      0.786: high - range * 0.786,
      1.0: low,
    },
    extension: {
      1.272: low - range * 0.272,
      1.618: low - range * 0.618,
      2.0: low - range,
      2.618: low - range * 1.618,
      3.618: low - range * 2.618,
    },
    projection: {
      1.0: high + range,
      1.272: high + range * 1.272,
      1.618: high + range * 1.618,
      2.0: high + range * 2,
      2.618: high + range * 2.618,
    },
  };
}

// ===== Wave Projection =====

export function projectNextWave(
  analysis: ElliottWaveAnalysis,
  currentPrice: number
): { target: number; probability: number; direction: 'up' | 'down' } {
  const { fibonacci, currentWave, pattern } = analysis;

  if (pattern.type === 'impulse') {
    if (currentWave < 5) {
      // In impulse, expect continuation
      const targets = Object.values(fibonacci.projection);
      const nearestTarget =
        targets.find((t) => t > currentPrice) || targets[targets.length - 1];
      return {
        target: nearestTarget,
        probability: 0.6,
        direction: 'up',
      };
    } else {
      // Completed impulse, expect correction
      const targets = Object.values(fibonacci.retracement);
      const correctionTarget =
        targets.find((t) => t < currentPrice) || targets[2];
      return {
        target: correctionTarget,
        probability: 0.5,
        direction: 'down',
      };
    }
  }

  // Corrective pattern
  return {
    target: fibonacci.retracement[0.618],
    probability: 0.4,
    direction: currentPrice > fibonacci.retracement[0.5] ? 'down' : 'up',
  };
}

// ===== Main Analysis =====

export function analyzeElliottWave(
  prices: number[],
  _timestamps?: number[]
): ElliottWaveAnalysis {
  const pivots = detectPivots(prices, 5);
  const highPivots = pivots.filter((p) => p.type === 'high').sort((a, b) => b.price - a.price);
  const lowPivots = pivots.filter((p) => p.type === 'low').sort((a, b) => a.price - b.price);

  const highestHigh = highPivots[0]?.price ?? Math.max(...prices);
  const lowestLow = lowPivots[0]?.price ?? Math.min(...prices);

  const fibonacci = calculateFibonacciLevels(highestHigh, lowestLow);

  const impulse = detectImpulseWave(pivots, prices);
  const corrective = detectCorrectiveWave(pivots, prices);

  const currentPrice = prices[prices.length - 1];
  let pattern: WavePattern;
  let waves: WaveSegment[] = [];
  let currentWave = 1;
  let confidence = 0.3;
  let waveLabels: string[] = [];
  let nextExpectedDirection: 'up' | 'down' | 'uncertain' = 'uncertain';
  let targetPrice = currentPrice;
  let stopLoss = currentPrice;

  if (impulse) {
    pattern = {
      type: 'impulse',
      subtype: 'motive',
      degree: impulse.degree,
      isComplete: true,
      isValid: true,
    };
    waves = [impulse];
    currentWave = 5;
    confidence = impulse.confidence;
    waveLabels = ['1', '2', '3', '4', '5'];
    nextExpectedDirection = 'down'; // After impulse 5, expect correction
    targetPrice = fibonacci.retracement[0.382];
    stopLoss = fibonacci.retracement[0.786];
  } else if (corrective) {
    pattern = {
      type: 'corrective',
      subtype: 'zigzag',
      degree: corrective.degree,
      isComplete: true,
      isValid: true,
    };
    waves = [corrective];
    currentWave = 3;
    confidence = corrective.confidence;
    waveLabels = ['A', 'B', 'C'];
    nextExpectedDirection = 'up'; // After correction, expect new impulse
    targetPrice = fibonacci.projection[1.0];
    stopLoss = fibonacci.retracement[1.0];
  } else {
    pattern = {
      type: 'impulse',
      subtype: 'developing',
      degree: 'minor',
      isComplete: false,
      isValid: false,
    };
    waveLabels = ['?'];
  }

  return {
    pattern,
    waves,
    fibonacci,
    currentWave,
    nextExpectedDirection,
    targetPrice,
    stopLoss,
    confidence,
    invalidationPrice:
      pattern.type === 'impulse'
        ? fibonacci.retracement[1.0]
        : fibonacci.projection[1.0],
    waveLabels,
  };
}

// ===== Wave Degree Classifier =====

export function classifyWaveDegree(
  priceRange: number,
  avgPrice: number
): WaveDegree {
  const pctRange = (priceRange / avgPrice) * 100;

  if (pctRange > 500) return 'grand_supercycle';
  if (pctRange > 200) return 'supercycle';
  if (pctRange > 100) return 'cycle';
  if (pctRange > 50) return 'primary';
  if (pctRange > 20) return 'intermediate';
  if (pctRange > 10) return 'minor';
  if (pctRange > 5) return 'minute';
  if (pctRange > 2) return 'minuette';
  return 'subminuette';
}

// ===== Wave Alternation Check =====

export function checkWaveAlternation(
  wave2: { start: number; end: number },
  wave4: { start: number; end: number }
): { isAlternating: boolean; description: string } {
  const w2Length = Math.abs(wave2.end - wave2.start);
  const w4Length = Math.abs(wave4.end - wave4.start);
  const ratio = w4Length / w2Length;

  if (ratio < 0.5 || ratio > 2.0) {
    return {
      isAlternating: true,
      description: `Strong alternation (${ratio.toFixed(2)}x)`,
    };
  }

  if (ratio >= 0.8 && ratio <= 1.2) {
    return {
      isAlternating: false,
      description: `Similar length (${ratio.toFixed(2)}x) - weak alternation`,
    };
  }

  return {
    isAlternating: true,
    description: `Moderate alternation (${ratio.toFixed(2)}x)`,
  };
}

// ===== Channel Analysis =====

export function analyzeWaveChannel(
  waves: PricePoint[]
): {
  upperChannel: number[];
  lowerChannel: number[];
  isBreakingUp: boolean;
  isBreakingDown: boolean;
} {
  if (waves.length < 3) {
    return {
      upperChannel: [],
      lowerChannel: [],
      isBreakingUp: false,
      isBreakingDown: false,
    };
  }

  const prices = waves.map((w) => w.price);
  const upper = Math.max(...prices);
  const lower = Math.min(...prices);
  const mid = (upper + lower) / 2;
  const range = upper - lower;

  const upperChannel = prices.map((_, i) => upper - (range * i) / (prices.length * 2));
  const lowerChannel = prices.map((_, i) => lower + (range * i) / (prices.length * 2));

  const lastPrice = prices[prices.length - 1];
  const isBreakingUp = lastPrice > upperChannel[upperChannel.length - 1];
  const isBreakingDown = lastPrice < lowerChannel[lowerChannel.length - 1];

  return { upperChannel, lowerChannel, isBreakingUp, isBreakingDown };
}
