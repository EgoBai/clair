/**
 * 宏观经济指标分析引擎
 * GDP/CPI/PPI/PMI/社融/M2/利率/汇率等宏观数据分析
 */

export interface MacroIndicator {
  name: string;
  value: number;
  prevValue: number;
  date: string;
  unit: string;
  category: 'growth' | 'inflation' | 'liquidity' | 'trade' | 'employment';
}

export interface MacroSnapshot {
  indicators: MacroIndicator[];
  date: string;
  score: number;
  regime: 'expansion' | 'contraction' | 'stagflation' | 'recovery';
}

export interface MacroTrend {
  name: string;
  direction: 'up' | 'down' | 'flat';
  strength: number; // 0-1
  acceleration: number;
  yoyChange: number;
  momChange: number;
}

export interface PolicySignal {
  type: 'monetary' | 'fiscal' | 'regulatory';
  direction: 'easing' | 'tightening' | 'neutral';
  strength: number;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export function calculateGrowthScore(indicators: MacroIndicator[]): number {
  const growthIndicators = indicators.filter(i => i.category === 'growth');
  if (growthIndicators.length === 0) return 50;
  
  let totalScore = 0;
  for (const ind of growthIndicators) {
    const change = ind.prevValue !== 0 ? (ind.value - ind.prevValue) / Math.abs(ind.prevValue) : 0;
    totalScore += 50 + change * 100;
  }
  return Math.max(0, Math.min(100, totalScore / growthIndicators.length));
}

export function calculateInflationScore(indicators: MacroIndicator[]): number {
  const inflIndicators = indicators.filter(i => i.category === 'inflation');
  if (inflIndicators.length === 0) return 50;
  
  let totalScore = 0;
  for (const ind of inflIndicators) {
    // CPI/PPI 适中最好 (2-3%)
    const optimal = ind.name === 'CPI' ? 2.5 : 2.0;
    const deviation = Math.abs(ind.value - optimal);
    totalScore += Math.max(0, 100 - deviation * 20);
  }
  return Math.max(0, Math.min(100, totalScore / inflIndicators.length));
}

export function calculateLiquidityScore(indicators: MacroIndicator[]): number {
  const liqIndicators = indicators.filter(i => i.category === 'liquidity');
  if (liqIndicators.length === 0) return 50;
  
  let totalScore = 0;
  for (const ind of liqIndicators) {
    const change = ind.prevValue !== 0 ? (ind.value - ind.prevValue) / Math.abs(ind.prevValue) : 0;
    // M2增速越高流动性越好
    if (ind.name === 'M2' || ind.name === '社融') {
      totalScore += 50 + change * 200;
    } else {
      // 利率越低越好
      totalScore += 50 - change * 200;
    }
  }
  return Math.max(0, Math.min(100, totalScore / liqIndicators.length));
}

export function determineMacroRegime(
  growthScore: number,
  inflationScore: number
): MacroSnapshot['regime'] {
  if (growthScore >= 50 && inflationScore >= 40) return 'expansion';
  if (growthScore < 50 && inflationScore < 40) return 'contraction';
  if (growthScore < 50 && inflationScore >= 60) return 'stagflation';
  return 'recovery';
}

export function analyzeMacroTrend(indicator: MacroIndicator, historicalValues: number[] = []): MacroTrend {
  const momChange = indicator.prevValue !== 0 
    ? (indicator.value - indicator.prevValue) / Math.abs(indicator.prevValue) 
    : 0;
  
  const yoyChange = historicalValues.length >= 12 
    ? (indicator.value - historicalValues[historicalValues.length - 12]) / Math.abs(historicalValues[historicalValues.length - 12] || 1)
    : momChange;
  
  const direction: MacroTrend['direction'] = momChange > 0.005 ? 'up' : momChange < -0.005 ? 'down' : 'flat';
  
  // Calculate acceleration from historical trend
  let acceleration = 0;
  if (historicalValues.length >= 3) {
    const recent = historicalValues.slice(-3);
    const change1 = recent[2] - recent[1];
    const change0 = recent[1] - recent[0];
    acceleration = change1 - change0;
  }
  
  return {
    name: indicator.name,
    direction,
    strength: Math.min(1, Math.abs(momChange) * 10),
    acceleration,
    yoyChange,
    momChange,
  };
}

export function generatePolicySignals(indicators: MacroIndicator[]): PolicySignal[] {
  const signals: PolicySignal[] = [];
  const growthInds = indicators.filter(i => i.category === 'growth');
  const inflInds = indicators.filter(i => i.category === 'inflation');
  const liqInds = indicators.filter(i => i.category === 'liquidity');
  
  // Monetary policy signal
  const avgGrowth = growthInds.length > 0 
    ? growthInds.reduce((s, i) => s + (i.prevValue !== 0 ? (i.value - i.prevValue) / Math.abs(i.prevValue) : 0), 0) / growthInds.length 
    : 0;
  const avgInflation = inflInds.length > 0 ? inflInds.reduce((s, i) => s + i.value, 0) / inflInds.length : 2;
  
  if (avgGrowth < -0.02 || avgInflation < 1) {
    signals.push({
      type: 'monetary',
      direction: 'easing',
      strength: Math.min(1, Math.abs(avgGrowth) * 20),
      description: '经济增长放缓，通胀低迷，预计货币政策趋向宽松',
      impact: 'positive',
    });
  } else if (avgGrowth > 0.05 && avgInflation > 4) {
    signals.push({
      type: 'monetary',
      direction: 'tightening',
      strength: Math.min(1, (avgInflation - 3) / 5),
      description: '经济过热，通胀压力较大，预计货币政策趋向收紧',
      impact: 'negative',
    });
  } else {
    signals.push({
      type: 'monetary',
      direction: 'neutral',
      strength: 0.5,
      description: '经济运行平稳，货币政策保持中性',
      impact: 'neutral',
    });
  }
  
  // Fiscal policy signal
  if (avgGrowth < -0.01) {
    signals.push({
      type: 'fiscal',
      direction: 'easing',
      strength: Math.min(1, Math.abs(avgGrowth) * 15),
      description: '经济下行压力加大，财政政策有望加码',
      impact: 'positive',
    });
  }
  
  // Liquidity signal
  const avgM2Change = liqInds.filter(i => i.name === 'M2').reduce((s, i) => 
    s + (i.prevValue !== 0 ? (i.value - i.prevValue) / Math.abs(i.prevValue) : 0), 0);
  if (avgM2Change > 0.02) {
    signals.push({
      type: 'monetary',
      direction: 'easing',
      strength: Math.min(1, avgM2Change * 10),
      description: 'M2增速回升，市场流动性充裕',
      impact: 'positive',
    });
  }
  
  return signals;
}

export function createMacroSnapshot(indicators: MacroIndicator[]): MacroSnapshot {
  const growthScore = calculateGrowthScore(indicators);
  const inflationScore = calculateInflationScore(indicators);
  const liquidityScore = calculateLiquidityScore(indicators);
  const regime = determineMacroRegime(growthScore, inflationScore);
  const score = (growthScore * 0.4 + inflationScore * 0.3 + liquidityScore * 0.3);
  
  return {
    indicators,
    date: indicators.length > 0 ? indicators[0].date : new Date().toISOString().split('T')[0],
    score,
    regime,
  };
}

export function compareMacroPeriods(current: MacroSnapshot, previous: MacroSnapshot): {
  scoreDiff: number;
  regimeChanged: boolean;
  improvedIndicators: string[];
  deterioratedIndicators: string[];
} {
  const scoreDiff = current.score - previous.score;
  const regimeChanged = current.regime !== previous.regime;
  
  const improvedIndicators: string[] = [];
  const deterioratedIndicators: string[] = [];
  
  for (const curr of current.indicators) {
    const prev = previous.indicators.find(i => i.name === curr.name);
    if (!prev) continue;
    
    const change = curr.value - prev.value;
    if (curr.category === 'growth' && change > 0) improvedIndicators.push(curr.name);
    else if (curr.category === 'growth' && change < 0) deterioratedIndicators.push(curr.name);
    else if (curr.category === 'inflation' && change >= -1 && change <= 1) improvedIndicators.push(curr.name);
    else if (curr.category === 'inflation' && Math.abs(change) > 2) deterioratedIndicators.push(curr.name);
    else if (curr.category === 'liquidity' && change > 0) improvedIndicators.push(curr.name);
    else if (curr.category === 'liquidity' && change < -1) deterioratedIndicators.push(curr.name);
  }
  
  return { scoreDiff, regimeChanged, improvedIndicators, deterioratedIndicators };
}

export function predictStockMarketImpact(snapshot: MacroSnapshot): {
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  factors: string[];
} {
  const factors: string[] = [];
  let bias = 0;
  
  if (snapshot.regime === 'expansion') { bias += 1; factors.push('经济扩张期利好股市'); }
  if (snapshot.regime === 'contraction') { bias -= 0.5; factors.push('经济收缩但预期宽松'); }
  if (snapshot.regime === 'stagflation') { bias -= 1; factors.push('滞胀环境压制估值'); }
  if (snapshot.regime === 'recovery') { bias += 0.8; factors.push('复苏期企业盈利改善'); }
  
  if (snapshot.score > 70) { bias += 0.3; factors.push('综合景气度高'); }
  if (snapshot.score < 30) { bias -= 0.3; factors.push('综合景气度低'); }
  
  const result: 'bullish' | 'bearish' | 'neutral' = bias > 0.3 ? 'bullish' : bias < -0.3 ? 'bearish' : 'neutral';
  const confidence = Math.min(1, Math.abs(bias) / 2 + 0.3);
  
  return { bias: result, confidence, factors };
}
