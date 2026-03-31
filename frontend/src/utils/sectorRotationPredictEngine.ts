/**
 * 行业轮动预测引擎
 * 基于经济周期/动量/拥挤度/政策/资金面的行业轮动预测
 */

// ── 类型定义 ──

export interface SectorData {
  name: string;
  code: string;
  returns: { week: number; month: number; quarter: number; year: number };
  valuation: { pe: number; pePercentile: number; pb: number; pbPercentile: number };
  momentum: { rsi: number; macdSignal: 'golden' | 'death' | 'neutral'; trend: 'up' | 'down' | 'sideways' };
  crowding: { turnoverRate: number; northboundChange: number; fundAllocation: number };
  fundamentals: { earningsGrowth: number; revenueGrowth: number; roeChange: number };
  policy: { supportLevel: number; recentPolicies: string[] };
}

export type EconomicPhase = 'recovery' | 'expansion' | 'peak' | 'contraction';

export interface RotationSignal {
  sector: string;
  action: 'overweight' | 'neutral' | 'underweight';
  score: number;            // 0-100
  phase: string;
  drivers: string[];
  risks: string[];
  expectedReturn: number;
  timeHorizon: string;
  confidence: number;
}

export interface RotationPrediction {
  currentPhase: EconomicPhase;
  phaseConfidence: number;
  topSectors: RotationSignal[];
  bottomSectors: RotationSignal[];
  transitionProbabilities: { fromPhase: EconomicPhase; toPhase: EconomicPhase; probability: number }[];
  rotationStrategy: string;
  nextRotationTiming: string;
}

export interface SectorHeatmap {
  sector: string;
  momentumScore: number;
  valuationScore: number;
  crowdingScore: number;
  policyScore: number;
  compositeScore: number;
  rank: number;
  signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
}

// ── 经济周期判断 ──

export function detectEconomicPhase(
  indicators: {
    pmiGrowth: number;          // PMI环比
    creditGrowth: number;       // 社融增速
    inventoryCycle: number;     // 库存周期 (-1 to 1)
    consumerConfidence: number; // 消费者信心
  }
): { phase: EconomicPhase; confidence: number } {
  let recoveryScore = 0, expansionScore = 0, peakScore = 0, contractionScore = 0;

  // PMI判断
  if (indicators.pmiGrowth > 0) { recoveryScore += 1; expansionScore += 1; }
  else { peakScore += 1; contractionScore += 1; }

  // 信用周期
  if (indicators.creditGrowth > 10) { recoveryScore += 1; expansionScore += 1; }
  else if (indicators.creditGrowth < 5) { peakScore += 1; contractionScore += 1; }

  // 库存周期
  if (indicators.inventoryCycle > 0.3) { expansionScore += 1; peakScore += 1; }
  else if (indicators.inventoryCycle < -0.3) { contractionScore += 1; recoveryScore += 1; }

  // 消费者信心
  if (indicators.consumerConfidence > 100) { recoveryScore += 1; expansionScore += 0.5; }
  else { peakScore += 0.5; contractionScore += 1; }

  const scores = { recovery: recoveryScore, expansion: expansionScore, peak: peakScore, contraction: contractionScore };
  const maxPhase = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
  const total = recoveryScore + expansionScore + peakScore + contractionScore;

  return {
    phase: maxPhase[0] as EconomicPhase,
    confidence: roundTo(maxPhase[1] / total, 2),
  };
}

// ── 行业评分 ──

export function scoreSector(sector: SectorData, phase: EconomicPhase): SectorHeatmap {
  // 动量评分 (0-100)
  let momentumScore = 50;
  momentumScore += sector.returns.week * 500;
  momentumScore += sector.returns.month * 200;
  if (sector.momentum.macdSignal === 'golden') momentumScore += 10;
  if (sector.momentum.trend === 'up') momentumScore += 10;
  if (sector.momentum.rsi > 70) momentumScore -= 10;
  if (sector.momentum.rsi < 30) momentumScore += 10;

  // 估值评分 (越低越好)
  let valuationScore = 100 - sector.valuation.pePercentile * 0.6 - sector.valuation.pbPercentile * 0.4;

  // 拥挤度评分 (越低越好)
  let crowdingScore = 100;
  crowdingScore -= sector.crowding.turnoverRate * 200;
  crowdingScore -= sector.crowding.fundAllocation * 0.5;
  if (sector.crowding.northboundChange > 0) crowdingScore += 5;
  else crowdingScore -= 5;

  // 政策评分
  let policyScore = 50 + sector.policy.supportLevel * 20;
  policyScore += sector.policy.recentPolicies.length * 5;

  // 经济周期加权
  let phaseBonus = 0;
  switch (phase) {
    case 'recovery':
      if (sector.fundamentals.earningsGrowth > 0) phaseBonus += 10;
      if (sector.valuation.pePercentile < 30) phaseBonus += 10;
      break;
    case 'expansion':
      if (sector.fundamentals.earningsGrowth > 0.15) phaseBonus += 15;
      if (sector.momentum.trend === 'up') phaseBonus += 5;
      break;
    case 'peak':
      if (sector.valuation.pePercentile > 70) phaseBonus -= 15;
      if (sector.crowding.turnoverRate > 0.03) phaseBonus -= 10;
      break;
    case 'contraction':
      if (sector.policy.supportLevel > 1) phaseBonus += 10;
      if (sector.valuation.pePercentile < 20) phaseBonus += 15;
      break;
  }

  // 综合评分
  const compositeScore = Math.min(100, Math.max(0,
    momentumScore * 0.3 + valuationScore * 0.25 + crowdingScore * 0.2 + policyScore * 0.15 + phaseBonus + 50 * 0.1
  ));

  let signal: SectorHeatmap['signal'];
  if (compositeScore >= 80) signal = 'strong_buy';
  else if (compositeScore >= 65) signal = 'buy';
  else if (compositeScore >= 45) signal = 'hold';
  else if (compositeScore >= 30) signal = 'sell';
  else signal = 'strong_sell';

  return {
    sector: sector.name,
    momentumScore: roundTo(Math.min(100, Math.max(0, momentumScore)), 1),
    valuationScore: roundTo(Math.min(100, Math.max(0, valuationScore)), 1),
    crowdingScore: roundTo(Math.min(100, Math.max(0, crowdingScore)), 1),
    policyScore: roundTo(Math.min(100, Math.max(0, policyScore)), 1),
    compositeScore: roundTo(compositeScore, 1),
    rank: 0,
    signal,
  };
}

// ── 轮动预测 ──

export function predictRotation(
  sectors: SectorData[],
  phase: EconomicPhase,
  phaseConfidence: number
): RotationPrediction {
  const heatmap = sectors.map(s => scoreSector(s, phase));
  heatmap.sort((a, b) => b.compositeScore - a.compositeScore);
  heatmap.forEach((h, i) => h.rank = i + 1);

  const topSectors: RotationSignal[] = heatmap.slice(0, 5).map(h => {
    const sector = sectors.find(s => s.name === h.sector)!;
    return {
      sector: h.sector,
      action: h.signal === 'strong_buy' || h.signal === 'buy' ? 'overweight' : 'neutral',
      score: h.compositeScore,
      phase: describePhaseFit(sector, phase),
      drivers: getDrivers(sector, phase),
      risks: getRisks(sector),
      expectedReturn: roundTo(sector.returns.week * 4 + sector.fundamentals.earningsGrowth * 0.5, 4),
      timeHorizon: '1-3个月',
      confidence: roundTo(phaseConfidence * (h.compositeScore / 100), 2),
    };
  });

  const bottomSectors: RotationSignal[] = heatmap.slice(-3).map(h => {
    return {
      sector: h.sector,
      action: h.signal === 'sell' || h.signal === 'strong_sell' ? 'underweight' : 'neutral',
      score: h.compositeScore,
      phase: '',
      drivers: [],
      risks: ['估值偏高', '动量转弱', '拥挤度上升'],
      expectedReturn: -0.05,
      timeHorizon: '1-3个月',
      confidence: 0.5,
    };
  });

  const rotationStrategy = getRotationStrategy(phase, heatmap);
  const nextRotationTiming = getNextRotationTiming(phase);

  // 简化的转换概率
  const transitions = [
    { fromPhase: 'recovery' as EconomicPhase, toPhase: 'expansion' as EconomicPhase, probability: 0.4 },
    { fromPhase: 'expansion' as EconomicPhase, toPhase: 'peak' as EconomicPhase, probability: 0.35 },
    { fromPhase: 'peak' as EconomicPhase, toPhase: 'contraction' as EconomicPhase, probability: 0.4 },
    { fromPhase: 'contraction' as EconomicPhase, toPhase: 'recovery' as EconomicPhase, probability: 0.35 },
  ];

  return {
    currentPhase: phase,
    phaseConfidence,
    topSectors,
    bottomSectors,
    transitionProbabilities: transitions,
    rotationStrategy,
    nextRotationTiming,
  };
}

// ── 行业风格轮动 ──

export function analyzeStyleRotation(sectors: SectorData[]) {
  const largeCapSectors = sectors.filter(s => ['银行', '保险', '白酒', '石油'].includes(s.name));
  const smallCapSectors = sectors.filter(s => ['半导体', '新能源', '医药', '军工'].includes(s.name));

  const largeCapAvgReturn = largeCapSectors.length > 0
    ? largeCapSectors.reduce((a, s) => a + s.returns.month, 0) / largeCapSectors.length : 0;
  const smallCapAvgReturn = smallCapSectors.length > 0
    ? smallCapSectors.reduce((a, s) => a + s.returns.month, 0) / smallCapSectors.length : 0;

  let style: 'large_cap' | 'small_cap' | 'balanced';
  if (largeCapAvgReturn > smallCapAvgReturn + 0.02) style = 'large_cap';
  else if (smallCapAvgReturn > largeCapAvgReturn + 0.02) style = 'small_cap';
  else style = 'balanced';

  return {
    style,
    largeCapReturn: roundTo(largeCapAvgReturn, 4),
    smallCapReturn: roundTo(smallCapAvgReturn, 4),
    spread: roundTo(smallCapAvgReturn - largeCapAvgReturn, 4),
    recommendation: style === 'small_cap' ? '偏好成长/小盘风格' : style === 'large_cap' ? '偏好价值/大盘风格' : '均衡配置',
  };
}

// ── Helper functions ──

function describePhaseFit(sector: SectorData, phase: EconomicPhase): string {
  switch (phase) {
    case 'recovery': return '复苏期：低估值+盈利改善的行业占优';
    case 'expansion': return '扩张期：高增长+强动量的行业占优';
    case 'peak': return '顶部期：防御性+低拥挤行业占优';
    case 'contraction': return '收缩期：政策支持+低估值行业占优';
  }
}

function getDrivers(sector: SectorData, phase: EconomicPhase): string[] {
  const drivers: string[] = [];
  if (sector.fundamentals.earningsGrowth > 0.1) drivers.push(`盈利增速${(sector.fundamentals.earningsGrowth * 100).toFixed(0)}%`);
  if (sector.valuation.pePercentile < 30) drivers.push('估值处于历史低位');
  if (sector.momentum.trend === 'up') drivers.push('技术面趋势向上');
  if (sector.policy.supportLevel > 1) drivers.push('政策利好密集');
  if (sector.crowding.northboundChange > 0) drivers.push('北向资金流入');
  return drivers;
}

function getRisks(sector: SectorData): string[] {
  const risks: string[] = [];
  if (sector.valuation.pePercentile > 70) risks.push('估值偏高');
  if (sector.crowding.turnoverRate > 0.03) risks.push('交易拥挤');
  if (sector.momentum.rsi > 70) risks.push('短期超买');
  if (sector.fundamentals.earningsGrowth < 0) risks.push('盈利下滑');
  return risks;
}

function getRotationStrategy(phase: EconomicPhase, heatmap: SectorHeatmap[]): string {
  const top = heatmap[0]?.sector || '未知';
  switch (phase) {
    case 'recovery': return `复苏初期重仓${top}等低估值行业，逐步增加周期股`;
    case 'expansion': return `扩张期加仓${top}等高弹性成长行业`;
    case 'peak': return `顶部区减仓高估值，增持${top}等防御板块`;
    case 'contraction': return `收缩期防御为主，关注${top}等政策受益板块`;
  }
}

function getNextRotationTiming(phase: EconomicPhase): string {
  switch (phase) {
    case 'recovery': return '预计3-6个月后进入扩张期，届时向成长板块轮动';
    case 'expansion': return '关注PMI拐点，扩张后期向防御板块切换';
    case 'peak': return '预计2-4个月后进入收缩期，提前布局防御';
    case 'contraction': return '关注信用扩张信号，收缩末期提前布局复苏板块';
  }
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
