/**
 * 市场状态检测引擎
 * 牛市/熊市/震荡/转折点识别，基于多种指标综合判断
 */

export interface MarketState {
  regime: 'bull' | 'bear' | 'sideways' | 'turning_up' | 'turning_down';
  confidence: number;
  duration: number; // days in current regime
  indicators: StateIndicator[];
}

export interface StateIndicator {
  name: string;
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  weight: number;
}

export interface RegimeTransition {
  from: MarketState['regime'];
  to: MarketState['regime'];
  date: string;
  trigger: string;
  confidence: number;
}

export interface MarketCycle {
  phases: { regime: MarketState['regime']; startIdx: number; endIdx: number }[];
  avgBullDuration: number;
  avgBearDuration: number;
  bullReturn: number;
  bearReturn: number;
}

export function detectMomentumRegime(prices: number[], shortWindow: number = 20, longWindow: number = 60): StateIndicator {
  if (prices.length < longWindow) {
    return { name: '动量趋势', value: 0, signal: 'neutral', weight: 0.25 };
  }
  
  const shortMA = prices.slice(-shortWindow).reduce((s, p) => s + p, 0) / shortWindow;
  const longMA = prices.slice(-longWindow).reduce((s, p) => s + p, 0) / longWindow;
  
  const ratio = shortMA / longMA;
  const value = (ratio - 1) * 100;
  
  return {
    name: '动量趋势',
    value,
    signal: value > 2 ? 'bullish' : value < -2 ? 'bearish' : 'neutral',
    weight: 0.25,
  };
}

export function detectVolatilityRegime(returns: number[], window: number = 20): StateIndicator {
  if (returns.length < window) {
    return { name: '波动率状态', value: 0, signal: 'neutral', weight: 0.2 };
  }
  
  const recentVol = Math.sqrt(
    returns.slice(-window).reduce((s, r) => s + r ** 2, 0) / window
  ) * Math.sqrt(252);
  
  const historicalVol = Math.sqrt(
    returns.reduce((s, r) => s + r ** 2, 0) / returns.length
  ) * Math.sqrt(252);
  
  const volRatio = historicalVol !== 0 ? recentVol / historicalVol : 1;
  
  // Low relative volatility is bullish (stability), high is bearish (uncertainty)
  const value = (1 - volRatio) * 50;
  
  return {
    name: '波动率状态',
    value,
    signal: volRatio < 0.8 ? 'bullish' : volRatio > 1.3 ? 'bearish' : 'neutral',
    weight: 0.2,
  };
}

export function detectVolumeRegime(volumes: number[], prices: number[], window: number = 20): StateIndicator {
  if (volumes.length < window || prices.length < window) {
    return { name: '量价关系', value: 0, signal: 'neutral', weight: 0.15 };
  }
  
  const recentVolumes = volumes.slice(-window);
  const recentPrices = prices.slice(-window);
  const avgVolume = recentVolumes.reduce((s, v) => s + v, 0) / window;
  
  // Check if price rise on increasing volume
  let upVolume = 0;
  let downVolume = 0;
  for (let i = 1; i < window; i++) {
    if (recentPrices[i] > recentPrices[i - 1]) {
      upVolume += recentVolumes[i];
    } else {
      downVolume += recentVolumes[i];
    }
  }
  
  const totalVolume = upVolume + downVolume;
  const upRatio = totalVolume > 0 ? upVolume / totalVolume : 0.5;
  const value = (upRatio - 0.5) * 100;
  
  return {
    name: '量价关系',
    value,
    signal: upRatio > 0.6 ? 'bullish' : upRatio < 0.4 ? 'bearish' : 'neutral',
    weight: 0.15,
  };
}

export function detectTrendStrength(prices: number[], period: number = 14): StateIndicator {
  if (prices.length < period + 1) {
    return { name: '趋势强度', value: 0, signal: 'neutral', weight: 0.2 };
  }
  
  let upMove = 0;
  let downMove = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) upMove += change;
    else downMove += Math.abs(change);
  }
  
  const totalMove = upMove + downMove;
  const adx = totalMove > 0 ? Math.abs(upMove - downMove) / totalMove * 100 : 0;
  const direction = upMove > downMove ? 1 : upMove < downMove ? -1 : 0;
  const value = adx * direction;
  
  return {
    name: '趋势强度',
    value,
    signal: direction > 0 && adx > 25 ? 'bullish' : direction < 0 && adx > 25 ? 'bearish' : 'neutral',
    weight: 0.2,
  };
}

export function detectMeanReversion(prices: number[], lookback: number = 60): StateIndicator {
  if (prices.length < lookback) {
    return { name: '均值回归', value: 0, signal: 'neutral', weight: 0.2 };
  }
  
  const mean = prices.slice(-lookback).reduce((s, p) => s + p, 0) / lookback;
  const current = prices[prices.length - 1];
  const deviation = mean !== 0 ? (current - mean) / mean * 100 : 0;
  
  return {
    name: '均值回归',
    value: -deviation, // Negative deviation = expect upward reversion
    signal: deviation < -10 ? 'bullish' : deviation > 10 ? 'bearish' : 'neutral',
    weight: 0.2,
  };
}

export function detectMarketState(prices: number[], returns: number[], volumes: number[]): MarketState {
  const indicators: StateIndicator[] = [
    detectMomentumRegime(prices),
    detectVolatilityRegime(returns),
    detectVolumeRegime(volumes, prices),
    detectTrendStrength(prices),
    detectMeanReversion(prices),
  ];
  
  // Weighted score
  let totalScore = 0;
  let totalWeight = 0;
  for (const ind of indicators) {
    const score = ind.signal === 'bullish' ? 1 : ind.signal === 'bearish' ? -1 : 0;
    totalScore += score * ind.weight;
    totalWeight += ind.weight;
  }
  
  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const confidence = Math.min(1, Math.abs(normalizedScore) + 0.3);
  
  let regime: MarketState['regime'];
  if (normalizedScore > 0.3) regime = 'bull';
  else if (normalizedScore < -0.3) regime = 'bear';
  else if (normalizedScore > 0.1) regime = 'turning_up';
  else if (normalizedScore < -0.1) regime = 'turning_down';
  else regime = 'sideways';
  
  // Calculate duration (consecutive same-regime days)
  let duration = 1;
  for (let i = returns.length - 2; i >= 0; i--) {
    const dayReturn = returns[i];
    if ((regime === 'bull' && dayReturn > 0) || (regime === 'bear' && dayReturn < 0)) {
      duration++;
    } else break;
  }
  
  return { regime, confidence, duration, indicators };
}

export function detectRegimeTransitions(
  prices: number[],
  returns: number[],
  volumes: number[],
  windowSize: number = 20
): RegimeTransition[] {
  const transitions: RegimeTransition[] = [];
  if (prices.length < windowSize * 2) return transitions;
  
  let prevRegime: MarketState['regime'] | null = null;
  
  for (let i = windowSize * 2; i <= prices.length; i += windowSize) {
    const state = detectMarketState(
      prices.slice(0, i),
      returns.slice(0, Math.min(i - 1, returns.length)),
      volumes.slice(0, i)
    );
    
    if (prevRegime && prevRegime !== state.regime) {
      transitions.push({
        from: prevRegime,
        to: state.regime,
        date: new Date(Date.now() - (prices.length - i) * 86400000).toISOString().split('T')[0],
        trigger: state.indicators.find(ind => ind.signal !== 'neutral')?.name || '综合判断',
        confidence: state.confidence,
      });
    }
    prevRegime = state.regime;
  }
  
  return transitions;
}

export function analyzeMarketCycle(returns: number[]): MarketCycle {
  const phases: MarketCycle['phases'] = [];
  let currentRegime: 'bull' | 'bear' | 'sideways' = 'sideways';
  let startIdx = 0;
  
  // Simple regime detection based on rolling returns
  const window = 20;
  for (let i = window; i < returns.length; i++) {
    const rollingReturn = returns.slice(i - window, i).reduce((s, r) => s + r, 0);
    const newRegime = rollingReturn > 0.02 ? 'bull' : rollingReturn < -0.02 ? 'bear' : 'sideways';
    
    if (newRegime !== currentRegime) {
      if (i > startIdx) {
        phases.push({ regime: currentRegime, startIdx, endIdx: i });
      }
      currentRegime = newRegime;
      startIdx = i;
    }
  }
  phases.push({ regime: currentRegime, startIdx, endIdx: returns.length });
  
  const bullPhases = phases.filter(p => p.regime === 'bull');
  const bearPhases = phases.filter(p => p.regime === 'bear');
  
  const avgBullDuration = bullPhases.length > 0 
    ? bullPhases.reduce((s, p) => s + (p.endIdx - p.startIdx), 0) / bullPhases.length 
    : 0;
  const avgBearDuration = bearPhases.length > 0 
    ? bearPhases.reduce((s, p) => s + (p.endIdx - p.startIdx), 0) / bearPhases.length 
    : 0;
  
  const bullReturn = bullPhases.reduce((s, p) => 
    s + returns.slice(p.startIdx, p.endIdx).reduce((a, r) => a + r, 0), 0);
  const bearReturn = bearPhases.reduce((s, p) => 
    s + returns.slice(p.startIdx, p.endIdx).reduce((a, r) => a + r, 0), 0);
  
  return { phases, avgBullDuration, avgBearDuration, bullReturn, bearReturn };
}

export function calculateRegimeProbability(
  state: MarketState,
  historicalStates: MarketState[]
): { bull: number; bear: number; sideways: number } {
  if (historicalStates.length === 0) {
    return { bull: 0.33, bear: 0.33, sideways: 0.34 };
  }
  
  // Count transitions from current regime
  const fromCurrent = historicalStates.filter((s, i) => 
    i > 0 && historicalStates[i - 1].regime === state.regime
  );
  
  const bullCount = fromCurrent.filter(s => s.regime === 'bull').length;
  const bearCount = fromCurrent.filter(s => s.regime === 'bear').length;
  const sideCount = fromCurrent.filter(s => s.regime === 'sideways').length;
  const total = fromCurrent.length || 1;
  
  return {
    bull: bullCount / total,
    bear: bearCount / total,
    sideways: sideCount / total,
  };
}
