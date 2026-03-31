/**
 * 技术面综合评分引擎
 * - 趋势评分(MA/EMA)
 * - 动量评分(RSI/MACD/ADX)
 * - 波动率评分
 * - 支撑阻力评分
 * - 综合技术信号
 */
export interface TechnicalInput {
  close: number;
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  ma120: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  adx: number;
  bollingerUpper: number;
  bollingerLower: number;
  bollingerMid: number;
  atr: number;
  volume: number;
  avgVolume: number;
  support: number;
  resistance: number;
}

export interface TechnicalCompositeResult {
  trendScore: number; // 0-100
  momentumScore: number; // 0-100
  volatilityScore: number; // 0-100
  supportResistanceScore: number; // 0-100
  totalScore: number; // 0-100
  signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
  volumeConfirmation: boolean;
  keyLevels: { support: number; resistance: number; pivot: number };
  signals: string[];
}

export function calculateTechnicalComposite(input: TechnicalInput): TechnicalCompositeResult {
  const signals: string[] = [];
  const { close } = input;

  // 趋势评分
  let trendScore = 50;
  // MA排列
  if (close > input.ma5 && input.ma5 > input.ma10 && input.ma10 > input.ma20) {
    trendScore += 25; signals.push('多头排列');
  } else if (close < input.ma5 && input.ma5 < input.ma10 && input.ma10 < input.ma20) {
    trendScore -= 25; signals.push('空头排列');
  }
  // 与MA60关系
  if (close > input.ma60) trendScore += 10;
  else trendScore -= 10;
  // ADX强度
  if (input.adx > 25) trendScore += 10;
  trendScore = Math.max(0, Math.min(100, trendScore));

  // 动量评分
  let momentumScore = 50;
  // RSI
  if (input.rsi > 70) { momentumScore -= 15; signals.push('RSI超买'); }
  else if (input.rsi > 50) momentumScore += 10;
  else if (input.rsi < 30) { momentumScore += 15; signals.push('RSI超卖'); }
  else momentumScore -= 10;
  // MACD
  if (input.macd > input.macdSignal && input.macdHistogram > 0) {
    momentumScore += 15; signals.push('MACD金叉');
  } else if (input.macd < input.macdSignal && input.macdHistogram < 0) {
    momentumScore -= 15; signals.push('MACD死叉');
  }
  momentumScore = Math.max(0, Math.min(100, momentumScore));

  // 波动率评分
  const bollingerWidth = (input.bollingerUpper - input.bollingerLower) / input.bollingerMid;
  let volatilityScore = 50;
  if (bollingerWidth < 0.05) { volatilityScore = 80; signals.push('波动率极低，可能突破'); }
  else if (bollingerWidth < 0.1) volatilityScore = 70;
  else if (bollingerWidth > 0.2) { volatilityScore = 30; signals.push('波动率极高'); }
  else volatilityScore = 50;

  // 支撑阻力评分
  let srScore = 50;
  const supportDistance = (close - input.support) / close;
  const resistanceDistance = (input.resistance - close) / close;
  if (supportDistance < 0.03) { srScore += 20; signals.push('接近支撑位'); }
  if (resistanceDistance < 0.03) { srScore -= 20; signals.push('接近阻力位'); }
  srScore = Math.max(0, Math.min(100, srScore));

  // 成交量确认
  const volumeConfirmation = input.volume > input.avgVolume * 1.5;

  // 综合评分
  const totalScore = Math.round(trendScore * 0.35 + momentumScore * 0.3 + volatilityScore * 0.15 + srScore * 0.2);

  // 信号
  let signal: TechnicalCompositeResult['signal'];
  if (totalScore >= 80) signal = 'strong_buy';
  else if (totalScore >= 65) signal = 'buy';
  else if (totalScore >= 40) signal = 'hold';
  else if (totalScore >= 25) signal = 'sell';
  else signal = 'strong_sell';

  // 趋势
  let trend: TechnicalCompositeResult['trend'];
  if (trendScore > 60) trend = 'bullish';
  else if (trendScore < 40) trend = 'bearish';
  else trend = 'neutral';

  // 强度
  let strength: TechnicalCompositeResult['strength'];
  if (input.adx > 30) strength = 'strong';
  else if (input.adx > 20) strength = 'moderate';
  else strength = 'weak';

  const pivot = (input.support + input.resistance + close) / 3;

  return {
    trendScore,
    momentumScore,
    volatilityScore,
    supportResistanceScore: srScore,
    totalScore,
    signal,
    trend,
    strength,
    volumeConfirmation,
    keyLevels: {
      support: input.support,
      resistance: input.resistance,
      pivot: Math.round(pivot * 100) / 100,
    },
    signals,
  };
}
