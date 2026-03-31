/**
 * Multi-Timeframe Momentum Divergence Engine
 * Detects divergences between price action and momentum indicators across timeframes
 */

export interface TimeframeData {
  timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';
  prices: number[];
  volumes: number[];
  timestamps: number[];
}

export interface MomentumSignal {
  type: 'bullish_divergence' | 'bearish_divergence' | 'hidden_bullish' | 'hidden_bearish' | 'triple_divergence';
  timeframe: string;
  strength: number; // 0-100
  confidence: number; // 0-1
  pricePoints: { index: number; value: number }[];
  indicatorPoints: { index: number; value: number }[];
  description: string;
}

export interface DivergenceResult {
  symbol: string;
  signals: MomentumSignal[];
  compositeScore: number;
  multiTimeframeAlignment: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  timestamp: number;
}

/**
 * Calculate RSI for given period
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return [];
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < prices.length; i++) {
    if (i > period) {
      const change = prices[i] - prices[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) rsi.push(100);
    else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  return rsi;
}

/**
 * Calculate MACD histogram
 */
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  if (prices.length < slowPeriod) return { macd: [], signal: [], histogram: [] };

  const ema = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };

  const fastEMA = ema(prices, fastPeriod);
  const slowEMA = ema(prices, slowPeriod);
  const macdLine = fastEMA.map((f, i) => f - slowEMA[i]);
  const signalLine = ema(macdLine.slice(slowPeriod - 1), signalPeriod);

  const offset = slowPeriod - 1;
  const histogram: number[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[offset + i] - signalLine[i]);
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * Calculate Stochastic oscillator
 */
export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3
): { k: number[]; d: number[] } {
  if (closes.length < kPeriod) return { k: [], d: [] };

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const slice = closes.slice(i - kPeriod + 1, i + 1);
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...highSlice);
    const lowest = Math.min(...lowSlice);
    const range = highest - lowest;
    kValues.push(range === 0 ? 50 : ((closes[i] - lowest) / range) * 100);
  }

  const dValues: number[] = [];
  for (let i = dPeriod - 1; i < kValues.length; i++) {
    const slice = kValues.slice(i - dPeriod + 1, i + 1);
    dValues.push(slice.reduce((a, b) => a + b, 0) / dPeriod);
  }

  return { k: kValues, d: dValues };
}

/**
 * Detect pivot points (local highs and lows)
 */
export function findPivots(
  values: number[],
  lookback: number = 5
): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];

  for (let i = lookback; i < values.length - lookback; i++) {
    const leftSlice = values.slice(i - lookback, i);
    const rightSlice = values.slice(i + 1, i + lookback + 1);

    if (values[i] >= Math.max(...leftSlice) && values[i] >= Math.max(...rightSlice)) {
      highs.push(i);
    }
    if (values[i] <= Math.min(...leftSlice) && values[i] <= Math.min(...rightSlice)) {
      lows.push(i);
    }
  }

  return { highs, lows };
}

/**
 * Detect regular divergences between price and indicator
 */
export function detectDivergences(
  prices: number[],
  indicator: number[],
  lookback: number = 5
): MomentumSignal[] {
  const signals: MomentumSignal[] = [];
  if (prices.length < lookback * 2 + 1 || indicator.length < lookback * 2 + 1) return signals;

  const pricePivots = findPivots(prices, lookback);
  const indicatorPivots = findPivots(indicator, lookback);

  // Bullish divergence: price makes lower low, indicator makes higher low
  for (let i = 1; i < pricePivots.lows.length; i++) {
    const prevIdx = pricePivots.lows[i - 1];
    const currIdx = pricePivots.lows[i];

    if (prices[currIdx] < prices[prevIdx]) {
      // Find corresponding indicator lows
      const indLows = indicatorPivots.lows.filter(
        idx => idx >= prevIdx - lookback && idx <= currIdx + lookback
      );
      if (indLows.length >= 2) {
        const lastTwo = indLows.slice(-2);
        if (indicator[lastTwo[1]] > indicator[lastTwo[0]]) {
          const strength = Math.min(100, Math.round(
            ((indicator[lastTwo[1]] - indicator[lastTwo[0]]) / Math.abs(indicator[lastTwo[0]])) * 100 +
            ((prices[prevIdx] - prices[currIdx]) / prices[prevIdx]) * 200
          ));

          signals.push({
            type: 'bullish_divergence',
            timeframe: '',
            strength: Math.max(0, Math.min(100, strength)),
            confidence: 0.6 + (strength / 500),
            pricePoints: [
              { index: prevIdx, value: prices[prevIdx] },
              { index: currIdx, value: prices[currIdx] }
            ],
            indicatorPoints: [
              { index: lastTwo[0], value: indicator[lastTwo[0]] },
              { index: lastTwo[1], value: indicator[lastTwo[1]] }
            ],
            description: `Bullish divergence: price lower low (${prices[currIdx].toFixed(2)} < ${prices[prevIdx].toFixed(2)}) with indicator higher low`
          });
        }
      }
    }
  }

  // Bearish divergence: price makes higher high, indicator makes lower high
  for (let i = 1; i < pricePivots.highs.length; i++) {
    const prevIdx = pricePivots.highs[i - 1];
    const currIdx = pricePivots.highs[i];

    if (prices[currIdx] > prices[prevIdx]) {
      const indHighs = indicatorPivots.highs.filter(
        idx => idx >= prevIdx - lookback && idx <= currIdx + lookback
      );
      if (indHighs.length >= 2) {
        const lastTwo = indHighs.slice(-2);
        if (indicator[lastTwo[1]] < indicator[lastTwo[0]]) {
          const strength = Math.min(100, Math.round(
            ((indicator[lastTwo[0]] - indicator[lastTwo[1]]) / Math.abs(indicator[lastTwo[0]])) * 100 +
            ((prices[currIdx] - prices[prevIdx]) / prices[prevIdx]) * 200
          ));

          signals.push({
            type: 'bearish_divergence',
            timeframe: '',
            strength: Math.max(0, Math.min(100, strength)),
            confidence: 0.6 + (strength / 500),
            pricePoints: [
              { index: prevIdx, value: prices[prevIdx] },
              { index: currIdx, value: prices[currIdx] }
            ],
            indicatorPoints: [
              { index: lastTwo[0], value: indicator[lastTwo[0]] },
              { index: lastTwo[1], value: indicator[lastTwo[1]] }
            ],
            description: `Bearish divergence: price higher high (${prices[currIdx].toFixed(2)} > ${prices[prevIdx].toFixed(2)}) with indicator lower high`
          });
        }
      }
    }
  }

  return signals;
}

/**
 * Detect hidden divergences (continuation patterns)
 */
export function detectHiddenDivergences(
  prices: number[],
  indicator: number[],
  lookback: number = 5
): MomentumSignal[] {
  const signals: MomentumSignal[] = [];
  if (prices.length < lookback * 2 + 1) return signals;

  const pricePivots = findPivots(prices, lookback);
  const indicatorPivots = findPivots(indicator, lookback);

  // Hidden bullish: price higher low, indicator lower low (uptrend continuation)
  for (let i = 1; i < pricePivots.lows.length; i++) {
    const prevIdx = pricePivots.lows[i - 1];
    const currIdx = pricePivots.lows[i];

    if (prices[currIdx] > prices[prevIdx]) {
      const indLows = indicatorPivots.lows.filter(
        idx => idx >= prevIdx - lookback && idx <= currIdx + lookback
      );
      if (indLows.length >= 2) {
        const lastTwo = indLows.slice(-2);
        if (indicator[lastTwo[1]] < indicator[lastTwo[0]]) {
          signals.push({
            type: 'hidden_bullish',
            timeframe: '',
            strength: 60,
            confidence: 0.55,
            pricePoints: [
              { index: prevIdx, value: prices[prevIdx] },
              { index: currIdx, value: prices[currIdx] }
            ],
            indicatorPoints: [
              { index: lastTwo[0], value: indicator[lastTwo[0]] },
              { index: lastTwo[1], value: indicator[lastTwo[1]] }
            ],
            description: 'Hidden bullish divergence: uptrend continuation signal'
          });
        }
      }
    }
  }

  // Hidden bearish: price lower high, indicator higher high (downtrend continuation)
  for (let i = 1; i < pricePivots.highs.length; i++) {
    const prevIdx = pricePivots.highs[i - 1];
    const currIdx = pricePivots.highs[i];

    if (prices[currIdx] < prices[prevIdx]) {
      const indHighs = indicatorPivots.highs.filter(
        idx => idx >= prevIdx - lookback && idx <= currIdx + lookback
      );
      if (indHighs.length >= 2) {
        const lastTwo = indHighs.slice(-2);
        if (indicator[lastTwo[1]] > indicator[lastTwo[0]]) {
          signals.push({
            type: 'hidden_bearish',
            timeframe: '',
            strength: 60,
            confidence: 0.55,
            pricePoints: [
              { index: prevIdx, value: prices[prevIdx] },
              { index: currIdx, value: prices[currIdx] }
            ],
            indicatorPoints: [
              { index: lastTwo[0], value: indicator[lastTwo[0]] },
              { index: lastTwo[1], value: indicator[lastTwo[1]] }
            ],
            description: 'Hidden bearish divergence: downtrend continuation signal'
          });
        }
      }
    }
  }

  return signals;
}

/**
 * Calculate composite score from all signals
 */
export function calculateCompositeScore(signals: MomentumSignal[]): number {
  if (signals.length === 0) return 50;

  let bullishScore = 0;
  let bearishScore = 0;

  for (const signal of signals) {
    const weighted = signal.strength * signal.confidence;
    if (signal.type.includes('bullish') && !signal.type.includes('bearish')) {
      bullishScore += weighted;
    } else if (signal.type.includes('bearish')) {
      bearishScore += weighted;
    }
  }

  const total = bullishScore + bearishScore;
  if (total === 0) return 50;

  return Math.round((bullishScore / total) * 100);
}

/**
 * Check multi-timeframe alignment
 */
export function checkTimeframeAlignment(signals: MomentumSignal[]): boolean {
  if (signals.length < 2) return false;

  const bullishCount = signals.filter(
    s => s.type.includes('bullish') && !s.type.includes('bearish')
  ).length;
  const bearishCount = signals.filter(
    s => s.type.includes('bearish')
  ).length;

  // Alignment means >70% of signals agree
  const total = bullishCount + bearishCount;
  return total > 0 && (Math.max(bullishCount, bearishCount) / total) >= 0.7;
}

/**
 * Main analysis function
 */
export function analyzeMomentumDivergence(
  symbol: string,
  timeframeData: TimeframeData[]
): DivergenceResult {
  const allSignals: MomentumSignal[] = [];

  for (const tf of timeframeData) {
    const rsi = calculateRSI(tf.prices);
    const macd = calculateMACD(tf.prices);
    const stoch = calculateStochastic(
      tf.prices.map(p => p * 1.01), // approximate highs
      tf.prices.map(p => p * 0.99), // approximate lows
      tf.prices
    );

    // Detect divergences with RSI
    const rsiDivergences = detectDivergences(
      tf.prices.slice(tf.prices.length - rsi.length),
      rsi
    );
    rsiDivergences.forEach(s => { s.timeframe = tf.timeframe; });

    // Detect divergences with MACD histogram
    const macdDivergences = detectDivergences(
      tf.prices.slice(tf.prices.length - macd.histogram.length),
      macd.histogram
    );
    macdDivergences.forEach(s => { s.timeframe = tf.timeframe; });

    // Detect divergences with Stochastic
    const stochDivergences = detectDivergences(
      tf.prices.slice(tf.prices.length - stoch.k.length),
      stoch.k
    );
    stochDivergences.forEach(s => { s.timeframe = tf.timeframe; });

    allSignals.push(...rsiDivergences, ...macdDivergences, ...stochDivergences);
  }

  const compositeScore = calculateCompositeScore(allSignals);
  const aligned = checkTimeframeAlignment(allSignals);

  let recommendedAction: DivergenceResult['recommendedAction'];
  if (compositeScore >= 75 && aligned) recommendedAction = 'strong_buy';
  else if (compositeScore >= 60) recommendedAction = 'buy';
  else if (compositeScore <= 25 && aligned) recommendedAction = 'strong_sell';
  else if (compositeScore <= 40) recommendedAction = 'sell';
  else recommendedAction = 'hold';

  let riskLevel: DivergenceResult['riskLevel'];
  if (allSignals.length >= 4 && aligned) riskLevel = 'low';
  else if (allSignals.length >= 2) riskLevel = 'medium';
  else riskLevel = 'high';

  return {
    symbol,
    signals: allSignals,
    compositeScore,
    multiTimeframeAlignment: aligned,
    riskLevel,
    recommendedAction,
    timestamp: Date.now()
  };
}
