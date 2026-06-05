/**
 * 市场状态识别引擎 - Round 726
 * 使用HMM等方法识别市场状态
 */
export interface MarketState {
  regime: 'bull' | 'bear' | 'sideways' | 'volatile';
  confidence: number;
  duration: number; // days in current state
  transitionProb: Record<string, number>;
}

export interface RegimeHistory {
  states: { regime: string; startIdx: number; endIdx: number; avgReturn: number; volatility: number }[];
  transitions: { from: string; to: string; count: number }[];
}

export function detectRegime(
  returns: number[],
  windowSize: number = 20
): MarketState[] {
  if (returns.length < windowSize) return [];

  const states: MarketState[] = [];

  for (let i = windowSize - 1; i < returns.length; i++) {
    const window = returns.slice(i - windowSize + 1, i + 1);
    const mean = window.reduce((s, r) => s + r, 0) / window.length;
    const vol = Math.sqrt(window.reduce((s, r) => s + (r - mean) ** 2, 0) / (window.length - 1));
    const annualizedReturn = mean * 252;
    const annualizedVol = vol * Math.sqrt(252);

    let regime: 'bull' | 'bear' | 'sideways' | 'volatile';
    let confidence: number;

    if (annualizedVol > 0.3) {
      regime = 'volatile';
      confidence = Math.min(0.5 + annualizedVol, 0.95);
    } else if (annualizedReturn > 0.1) {
      regime = 'bull';
      confidence = Math.min(0.5 + annualizedReturn, 0.95);
    } else if (annualizedReturn < -0.1) {
      regime = 'bear';
      confidence = Math.min(0.5 + Math.abs(annualizedReturn), 0.95);
    } else {
      regime = 'sideways';
      confidence = Math.max(0.5 - Math.abs(annualizedReturn) - annualizedVol, 0.3);
    }

    // Calculate duration (how long in current regime)
    let duration = 1;
    for (let j = states.length - 1; j >= 0; j--) {
      if (states[j].regime === regime) duration++;
      else break;
    }

    // Transition probabilities based on historical patterns
    const transitionProb = calculateTransitionProbs(states, regime);

    states.push({ regime, confidence, duration, transitionProb });
  }

  return states;
}

function calculateTransitionProbs(
  history: MarketState[],
  currentRegime: string
): Record<string, number> {
  const probs: Record<string, number> = { bull: 0.25, bear: 0.25, sideways: 0.25, volatile: 0.25 };

  if (history.length < 2) return probs;

  // Count transitions from current regime
  const counts: Record<string, number> = { bull: 0, bear: 0, sideways: 0, volatile: 0 };
  let total = 0;

  for (let i = 1; i < history.length; i++) {
    if (history[i - 1].regime === currentRegime) {
      counts[history[i].regime]++;
      total++;
    }
  }

  if (total > 0) {
    for (const key of Object.keys(counts)) {
      probs[key] = counts[key] / total;
    }
  }

  return probs;
}

export function analyzeRegimeHistory(returns: number[], windowSize: number = 20): RegimeHistory {
  const states = detectRegime(returns, windowSize);
  if (states.length === 0) return { states: [], transitions: [] };

  // Group consecutive same-regime states
  const regimeGroups: { regime: string; startIdx: number; endIdx: number; returns: number[] }[] = [];
  let current = { regime: states[0].regime, startIdx: 0, endIdx: 0, returns: [returns[windowSize - 1]] };

  for (let i = 1; i < states.length; i++) {
    if (states[i].regime === current.regime) {
      current.endIdx = i + windowSize - 1;
      current.returns.push(returns[i + windowSize - 1]);
    } else {
      regimeGroups.push(current);
      current = { regime: states[i].regime, startIdx: i + windowSize - 1, endIdx: i + windowSize - 1, returns: [returns[i + windowSize - 1]] };
    }
  }
  regimeGroups.push(current);

  const stateSummary = regimeGroups.map(g => ({
    regime: g.regime,
    startIdx: g.startIdx,
    endIdx: g.endIdx,
    avgReturn: g.returns.reduce((s, r) => s + r, 0) / g.returns.length,
    volatility: Math.sqrt(g.returns.reduce((s, r) => {
      const m = g.returns.reduce((a, b) => a + b, 0) / g.returns.length;
      return s + (r - m) ** 2;
    }, 0) / Math.max(g.returns.length - 1, 1)),
  }));

  // Count transitions
  const transMap = new Map<string, number>();
  for (let i = 1; i < regimeGroups.length; i++) {
    const key = `${regimeGroups[i - 1].regime}->${regimeGroups[i].regime}`;
    transMap.set(key, (transMap.get(key) || 0) + 1);
  }
  const transitions = Array.from(transMap.entries()).map(([key, count]) => {
    const [from, to] = key.split('->');
    return { from, to, count };
  });

  return { states: stateSummary, transitions };
}

export function calculateRegimeAdjustedVolatility(
  returns: number[],
  regimes: MarketState[]
): number[] {
  if (regimes.length === 0) return returns.map(() => 0);

  const result: number[] = [];
  for (let i = 0; i < regimes.length; i++) {
    const idx = i + (returns.length - regimes.length);
    if (idx < 0) { result.push(0); continue; }

    const regime = regimes[i];
    let scaleFactor = 1;
    switch (regime.regime) {
      case 'volatile': scaleFactor = 1.5; break;
      case 'bear': scaleFactor = 1.2; break;
      case 'bull': scaleFactor = 0.8; break;
      case 'sideways': scaleFactor = 0.6; break;
    }
    result.push(returns[idx] * scaleFactor);
  }
  return result;
}

export function predictNextRegime(
  currentRegime: MarketState,
  recentReturns: number[]
): { predicted: string; probability: number; reasoning: string } {
  const probs = currentRegime.transitionProb;
  const maxEntry = Object.entries(probs).reduce((a, b) => a[1] > b[1] ? a : b);

  // Adjust based on recent trend
  const recentMean = recentReturns.length > 0
    ? recentReturns.reduce((s, r) => s + r, 0) / recentReturns.length
    : 0;

  let predicted = maxEntry[0];
  let probability = maxEntry[1];

  if (recentMean > 0.002 && predicted === 'bear') {
    predicted = 'bull';
    probability = 0.6;
  } else if (recentMean < -0.002 && predicted === 'bull') {
    predicted = 'bear';
    probability = 0.6;
  }

  return {
    predicted,
    probability,
    reasoning: `当前${currentRegime.regime}状态已持续${currentRegime.duration}天, 最近趋势${recentMean > 0 ? '偏多' : '偏空'}`,
  };
}
