/**
 * MarketSentimentCompositeEngine - 市场情绪综合引擎
 * 综合多个情绪维度生成市场整体情绪评分
 */

export interface SentimentInputs {
  putCallRatio: number;        // 看跌/看涨比率
  vixLevel: number;            // 波动率指数
  advanceDeclineRatio: number; // 涨跌比
  newHighLowRatio: number;     // 新高新低比
  marginBalance: number;       // 融资余额变化率
  northboundFlow: number;      // 北向资金净流入(亿)
  shortInterest: number;       // 融券余额变化率
  turnoverRate: number;        // 市场换手率
}

export interface SentimentResult {
  overallScore: number;        // 0~100
  level: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  components: {
    optionsSentiment: number;
    breadthSentiment: number;
    flowSentiment: number;
    volatilitySentiment: number;
    leverageSentiment: number;
  };
  signals: string[];
  contrarianSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
}

export interface SentimentConfig {
  weights: {
    options: number;
    breadth: number;
    flow: number;
    volatility: number;
    leverage: number;
  };
}

const DEFAULT_WEIGHTS = { options: 0.2, breadth: 0.25, flow: 0.2, volatility: 0.2, leverage: 0.15 };

function normalize(v: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}

export function computeSentiment(
  inputs: SentimentInputs,
  config: Partial<SentimentConfig> = {}
): SentimentResult {
  const weights = { ...DEFAULT_WEIGHTS, ...config.weights };

  // 期权情绪 (PCR越高越恐慌)
  const optionsSentiment = normalize(1 - inputs.putCallRatio, 0, 1);

  // 市场广度
  const breadthSentiment = normalize(inputs.advanceDeclineRatio, 0, 3) * 0.6 +
    normalize(inputs.newHighLowRatio, 0, 3) * 0.4;

  // 资金流
  const flowSentiment = normalize(inputs.northboundFlow + 100, 0, 200) * 0.6 +
    normalize(inputs.marginBalance + 0.05, 0, 0.10) * 0.4;

  // 波动率 (VIX越低越贪婪)
  const volatilitySentiment = normalize(30 - inputs.vixLevel, 0, 30);

  // 杠杆
  const leverageSentiment = normalize(inputs.marginBalance + 0.05, 0, 0.10) * 0.5 +
    normalize(-inputs.shortInterest + 0.05, 0, 0.10) * 0.5;

  const overallScore = Math.round(
    optionsSentiment * weights.options +
    breadthSentiment * weights.breadth +
    flowSentiment * weights.flow +
    volatilitySentiment * weights.volatility +
    leverageSentiment * weights.leverage
  );

  let level: SentimentResult['level'];
  if (overallScore <= 20) level = 'extreme_fear';
  else if (overallScore <= 40) level = 'fear';
  else if (overallScore <= 60) level = 'neutral';
  else if (overallScore <= 80) level = 'greed';
  else level = 'extreme_greed';

  const signals: string[] = [];
  if (inputs.putCallRatio > 1.2) signals.push('期权市场极度恐慌');
  if (inputs.advanceDeclineRatio < 0.3) signals.push('市场宽度极差');
  if (inputs.northboundFlow > 50) signals.push('北向资金大幅流入');
  if (inputs.vixLevel > 25) signals.push('波动率飙升');

  let contrarianSignal: SentimentResult['contrarianSignal'];
  if (overallScore <= 15) contrarianSignal = 'strong_buy';
  else if (overallScore <= 30) contrarianSignal = 'buy';
  else if (overallScore >= 85) contrarianSignal = 'strong_sell';
  else if (overallScore >= 70) contrarianSignal = 'sell';
  else contrarianSignal = 'neutral';

  return {
    overallScore,
    level,
    components: {
      optionsSentiment: Math.round(optionsSentiment),
      breadthSentiment: Math.round(breadthSentiment),
      flowSentiment: Math.round(flowSentiment),
      volatilitySentiment: Math.round(volatilitySentiment),
      leverageSentiment: Math.round(leverageSentiment),
    },
    signals,
    contrarianSignal,
  };
}

export function sentimentHistory(
  series: SentimentInputs[]
): Array<{ score: number; level: string }> {
  return series.map(inputs => {
    const r = computeSentiment(inputs);
    return { score: r.overallScore, level: r.level };
  });
}
