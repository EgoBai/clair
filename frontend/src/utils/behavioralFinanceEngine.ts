/**
 * 行为金融分析引擎
 * - 投资者情绪指标
 * - 过度反应/反应不足检测
 * - 羊群效应分析
 * - 损失厌恶评估
 * - 锚定效应分析
 */
export interface BehavioralData {
  turnoverRate: number; // 换手率
  marginBalance: number; // 融资余额(亿)
  marginChange: number; // 融资余额变动
  shortBalance: number; // 融券余额(亿)
  newAccountCount: number; // 新增开户数
  fundFlow: number; // 资金净流入(亿)
  sentimentIndex: number; // 情绪指数(0-100)
  volatility: number; // 波动率
  priceChange: number; // 价格变动
  volumeChange: number; // 成交量变动
  limitUpCount: number; // 涨停数
  limitDownCount: number; // 跌停数
  averageHoldingPeriod: number; // 平均持仓天数
}

export interface BehavioralResult {
  investorSentiment: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  overreactionScore: number; // 0-100
  herdBehaviorScore: number; // 0-100
  lossAversionLevel: 'low' | 'moderate' | 'high';
  anchoringEffect: boolean;
  contrarianSignal: 'buy' | 'hold' | 'sell';
  behaviorRisk: number; // 0-100
  crowdMomentum: 'accelerating' | 'steady' | 'decelerating';
  insights: string[];
}

export function analyzeBehavioralFinance(data: BehavioralData): BehavioralResult {
  const insights: string[] = [];

  // 投资者情绪
  let sentiment: BehavioralResult['investorSentiment'];
  if (data.sentimentIndex > 80) { sentiment = 'extreme_greed'; insights.push('市场极度贪婪'); }
  else if (data.sentimentIndex > 60) sentiment = 'greed';
  else if (data.sentimentIndex > 40) sentiment = 'neutral';
  else if (data.sentimentIndex > 20) sentiment = 'fear';
  else { sentiment = 'extreme_fear'; insights.push('市场极度恐惧'); }

  // 过度反应
  let overreactionScore = 50;
  if (Math.abs(data.priceChange) > 0.05 && data.volatility > 0.3) {
    overreactionScore += 30; insights.push('检测到过度反应');
  }
  if (data.limitUpCount + data.limitDownCount > 100) overreactionScore += 15;
  overreactionScore = Math.min(100, overreactionScore);

  // 羊群效应
  let herdScore = 50;
  if (data.newAccountCount > 500000) { herdScore += 25; insights.push('开户数激增，散户入场'); }
  if (data.turnoverRate > 0.05) herdScore += 15;
  if (data.marginBalance > 10000) herdScore += 10;
  herdScore = Math.min(100, herdScore);

  // 损失厌恶
  let lossAversion: BehavioralResult['lossAversionLevel'];
  if (data.averageHoldingPeriod < 10 && data.volatility > 0.25) {
    lossAversion = 'high'; insights.push('持仓周期短，损失厌恶明显');
  } else if (data.averageHoldingPeriod < 30) lossAversion = 'moderate';
  else lossAversion = 'low';

  // 锚定效应
  const anchoringEffect = data.marginChange > 0 && data.priceChange < 0;
  if (anchoringEffect) insights.push('价格下跌但融资增加，存在锚定效应');

  // 逆向信号
  let contrarianSignal: BehavioralResult['contrarianSignal'];
  if (sentiment === 'extreme_fear' && data.fundFlow < -50) { contrarianSignal = 'buy'; insights.push('逆向指标: 恐慌时买入'); }
  else if (sentiment === 'extreme_greed' && data.fundFlow > 50) { contrarianSignal = 'sell'; insights.push('逆向指标: 贪婪时卖出'); }
  else contrarianSignal = 'hold';

  // 群体动能
  let crowdMomentum: BehavioralResult['crowdMomentum'];
  if (data.volumeChange > 0.5 && data.priceChange > 0.02) crowdMomentum = 'accelerating';
  else if (data.volumeChange < -0.3) crowdMomentum = 'decelerating';
  else crowdMomentum = 'steady';

  // 行为风险
  let behaviorRisk = 50;
  if (sentiment === 'extreme_greed') behaviorRisk += 25;
  else if (sentiment === 'extreme_fear') behaviorRisk += 15;
  behaviorRisk += herdScore * 0.2;
  behaviorRisk += overreactionScore * 0.15;
  behaviorRisk = Math.max(0, Math.min(100, Math.round(behaviorRisk)));

  return {
    investorSentiment: sentiment,
    overreactionScore,
    herdBehaviorScore: herdScore,
    lossAversionLevel: lossAversion,
    anchoringEffect,
    contrarianSignal,
    behaviorRisk,
    crowdMomentum,
    insights,
  };
}
