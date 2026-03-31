/**
 * 行业轮动量化引擎 V2
 * - 动量轮动策略
 * - 均值回归轮动策略
 * - 多因子行业配置
 * - 轮动信号生成
 * - 风险调整后收益
 */
export interface IndustryData {
  name: string;
  returns1m: number; // 1个月收益率
  returns3m: number; // 3个月收益率
  returns6m: number; // 6个月收益率
  returns12m: number; // 12个月收益率
  volatility: number; // 年化波动率
  pePercentile: number; // PE历史百分位
  earningsRevision: number; // 盈利预期修正
  fundFlow: number; // 资金净流入(亿)
  momentum: number; // 动量得分
  meanReversion: number; // 均值回归得分
}

export interface RotationSignal {
  industry: string;
  signal: 'overweight' | 'neutral' | 'underweight';
  momentumScore: number;
  valueScore: number;
  compositeScore: number;
  confidence: number;
  expectedReturn: number;
  riskAdjustedReturn: number;
  reasons: string[];
}

export interface RotationResult {
  signals: RotationSignal[];
  topIndustries: string[];
  bottomIndustries: string[];
  rotationPhase: 'early_momentum' | 'mid_momentum' | 'late_momentum' | 'reversal';
  marketRegime: 'risk_on' | 'risk_off' | 'transition';
  portfolioRecommendation: { industry: string; weight: number }[];
}

export function analyzeIndustryRotation(industries: IndustryData[]): RotationResult {
  if (industries.length < 3) throw new Error('至少需要3个行业数据');

  const signals: RotationSignal[] = industries.map(ind => {
    // 动量得分 (基于各期收益率)
    const momentumScore = ind.returns1m * 0.4 + ind.returns3m * 0.3 + ind.returns6m * 0.2 + ind.returns12m * 0.1;

    // 价值得分 (PE越低越好，百分位越低越好)
    const valueScore = (1 - ind.pePercentile) * 50 + ind.earningsRevision * 30 + (ind.fundFlow > 0 ? 20 : 0);

    // 综合得分
    const compositeScore = momentumScore * 0.5 + valueScore * 0.3 + ind.momentum * 0.1 + ind.meanReversion * 0.1;

    // 信号判断
    let signal: RotationSignal['signal'];
    if (compositeScore > 30 && momentumScore > 0) signal = 'overweight';
    else if (compositeScore < -20 || momentumScore < -0.1) signal = 'underweight';
    else signal = 'neutral';

    // 置信度
    const confidence = Math.min(1, Math.abs(compositeScore) / 50);

    // 风险调整后收益
    const expectedReturn = ind.returns3m * 0.3 + ind.returns6m * 0.3 + ind.earningsRevision * 0.4;
    const riskAdjustedReturn = expectedReturn / Math.max(ind.volatility, 0.01);

    const reasons: string[] = [];
    if (ind.returns1m > 0.05) reasons.push('近1月涨幅居前');
    if (ind.earningsRevision > 0.1) reasons.push('盈利预期上修');
    if (ind.pePercentile < 0.3) reasons.push('估值处于历史低位');
    if (ind.fundFlow > 10) reasons.push('资金持续流入');

    return {
      industry: ind.name,
      signal,
      momentumScore: Math.round(momentumScore * 100) / 100,
      valueScore: Math.round(valueScore * 100) / 100,
      compositeScore: Math.round(compositeScore * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      expectedReturn: Math.round(expectedReturn * 100) / 100,
      riskAdjustedReturn: Math.round(riskAdjustedReturn * 100) / 100,
      reasons,
    };
  });

  // 排名
  signals.sort((a, b) => b.compositeScore - a.compositeScore);
  const topIndustries = signals.slice(0, 3).map(s => s.industry);
  const bottomIndustries = signals.slice(-3).map(s => s.industry);

  // 轮动阶段
  const avgMomentum = signals.reduce((s, sig) => s + sig.momentumScore, 0) / signals.length;
  let rotationPhase: RotationResult['rotationPhase'];
  if (avgMomentum > 0.05) rotationPhase = 'early_momentum';
  else if (avgMomentum > 0) rotationPhase = 'mid_momentum';
  else if (avgMomentum > -0.05) rotationPhase = 'late_momentum';
  else rotationPhase = 'reversal';

  // 市场状态
  const riskOnCount = signals.filter(s => s.signal === 'overweight').length;
  let marketRegime: RotationResult['marketRegime'];
  if (riskOnCount > signals.length * 0.5) marketRegime = 'risk_on';
  else if (riskOnCount < signals.length * 0.3) marketRegime = 'risk_off';
  else marketRegime = 'transition';

  // 组合推荐
  const overweightIndustries = signals.filter(s => s.signal === 'overweight');
  const totalWeight = overweightIndustries.length || 1;
  const portfolioRecommendation = overweightIndustries.map(s => ({
    industry: s.industry,
    weight: Math.round((1 / totalWeight) * 100) / 100,
  }));

  return {
    signals,
    topIndustries,
    bottomIndustries,
    rotationPhase,
    marketRegime,
    portfolioRecommendation,
  };
}
