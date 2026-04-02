/**
 * MacroSentimentEngine - 宏观情绪引擎
 * 综合利率、汇率、商品价格等宏观指标评估市场情绪
 */

export interface MacroIndicator {
  name: string;
  value: number;
  prevValue: number;
  weight: number;
  direction: 'positive' | 'negative' | 'neutral';
}

export interface MacroSentiment {
  score: number;           // -100 到 100
  trend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;      // 0-1
  contributors: Record<string, number>;
  riskLevel: 'low' | 'medium' | 'high';
}

function indicatorSignal(ind: MacroIndicator): number {
  const change = ind.prevValue !== 0 ? (ind.value - ind.prevValue) / Math.abs(ind.prevValue) : 0;
  const base = ind.direction === 'positive' ? change : ind.direction === 'negative' ? -change : 0;
  return Math.max(-1, Math.min(1, base * 10));
}

export function assessMacroSentiment(indicators: MacroIndicator[]): MacroSentiment | null {
  if (indicators.length === 0) return null;
  const totalWeight = indicators.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) return null;

  let weightedScore = 0;
  const contributors: Record<string, number> = {};
  for (const ind of indicators) {
    const signal = indicatorSignal(ind);
    const contrib = signal * (ind.weight / totalWeight);
    weightedScore += contrib;
    contributors[ind.name] = Math.round(signal * 100) / 100;
  }

  const score = Math.round(weightedScore * 100);
  let trend: MacroSentiment['trend'];
  if (score > 15) trend = 'bullish';
  else if (score < -15) trend = 'bearish';
  else trend = 'neutral';

  const confidence = Math.min(1, indicators.length / 8);
  const absScore = Math.abs(score);
  let riskLevel: MacroSentiment['riskLevel'];
  if (absScore > 60) riskLevel = 'high';
  else if (absScore > 30) riskLevel = 'medium';
  else riskLevel = 'low';

  return { score, trend, confidence, contributors, riskLevel };
}
