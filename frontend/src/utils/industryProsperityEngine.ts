/**
 * 行业景气度引擎
 * 行业PMI/产能利用率/库存周期/景气度评分/轮动信号
 */

export interface IndustryIndicator {
  industry: string;
  date: string;
  pmi: number;              // 采购经理指数
  capacityUtilization: number; // 产能利用率 (0-1)
  inventoryCycle: 'passive_destocking' | 'active_restocking' | 'passive_restocking' | 'active_destocking';
  revenueGrowth: number;    // 营收增速
  profitGrowth: number;     // 利润增速
  marginTrend: 'expanding' | 'stable' | 'compressing';
  demandIndex: number;      // 需求指数 0-100
  supplyIndex: number;      // 供给指数 0-100
  priceIndex: number;       // 价格指数 0-100
}

export interface ProsperityScore {
  industry: string;
  score: number;            // 0-100 景气度评分
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  phase: 'expansion' | 'peak' | 'contraction' | 'trough' | 'recovery';
  trend: 'rising' | 'stable' | 'falling';
  confidence: number;       // 0-1
  drivers: string[];
  risks: string[];
}

export interface IndustryRotationSignal {
  industry: string;
  signal: 'overweight' | 'neutral' | 'underweight';
  momentum: number;
  valuation: number;
  prosperity: number;
  composite: number;
  reasoning: string;
}

export interface InventoryCycleState {
  industry: string;
  cycle: IndustryIndicator['inventoryCycle'];
  duration: number;         // 当前阶段持续月数
  typicalDuration: number;  // 历史平均持续月数
  nextPhase: string;
  nearTransition: boolean;
}

/**
 * 计算行业景气度评分
 */
export function calculateProsperityScore(
  indicator: IndustryIndicator,
  prevIndicator?: IndustryIndicator
): ProsperityScore {
  let score = 50; // 基准分
  const drivers: string[] = [];
  const risks: string[] = [];

  // PMI 贡献 (权重大)
  if (indicator.pmi > 52) {
    score += 15;
    drivers.push(`PMI扩张(${indicator.pmi.toFixed(1)})`);
  } else if (indicator.pmi > 50) {
    score += 8;
    drivers.push(`PMI温和扩张(${indicator.pmi.toFixed(1)})`);
  } else if (indicator.pmi > 48) {
    score -= 5;
    risks.push(`PMI接近收缩(${indicator.pmi.toFixed(1)})`);
  } else {
    score -= 15;
    risks.push(`PMI收缩(${indicator.pmi.toFixed(1)})`);
  }

  // 产能利用率
  if (indicator.capacityUtilization > 0.8) {
    score += 10;
    drivers.push('产能利用率高');
  } else if (indicator.capacityUtilization > 0.7) {
    score += 5;
  } else if (indicator.capacityUtilization < 0.6) {
    score -= 10;
    risks.push('产能闲置严重');
  }

  // 营收/利润增长
  if (indicator.profitGrowth > 20) {
    score += 12;
    drivers.push(`利润高增(${indicator.profitGrowth.toFixed(1)}%)`);
  } else if (indicator.profitGrowth > 10) {
    score += 6;
    drivers.push(`利润增长(${indicator.profitGrowth.toFixed(1)}%)`);
  } else if (indicator.profitGrowth < 0) {
    score -= 10;
    risks.push(`利润下滑(${indicator.profitGrowth.toFixed(1)}%)`);
  }

  // 利润率趋势
  if (indicator.marginTrend === 'expanding') {
    score += 8;
    drivers.push('利润率扩张');
  } else if (indicator.marginTrend === 'compressing') {
    score -= 8;
    risks.push('利润率压缩');
  }

  // 库存周期
  const inventoryBonus: Record<string, number> = {
    active_restocking: 8,
    passive_destocking: -3,
    active_destocking: -8,
    passive_restocking: 3,
  };
  score += inventoryBonus[indicator.inventoryCycle] ?? 0;

  // 供需平衡
  const demandSupplyGap = indicator.demandIndex - indicator.supplyIndex;
  if (demandSupplyGap > 10) {
    score += 5;
    drivers.push('供不应求');
  } else if (demandSupplyGap < -10) {
    score -= 5;
    risks.push('供过于求');
  }

  // 趋势: 与上期比较
  let trend: ProsperityScore['trend'] = 'stable';
  if (prevIndicator) {
    const prevScore = calculateProsperityScore(prevIndicator).score;
    if (score > prevScore + 5) trend = 'rising';
    else if (score < prevScore - 5) trend = 'falling';
  }

  score = Math.max(0, Math.min(100, score));

  // 等级
  let grade: ProsperityScore['grade'];
  if (score >= 80) grade = 'A';
  else if (score >= 65) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 35) grade = 'D';
  else grade = 'E';

  // 周期阶段
  let phase: ProsperityScore['phase'];
  if (indicator.pmi > 51 && indicator.profitGrowth > 10) phase = 'expansion';
  else if (indicator.pmi > 50 && indicator.profitGrowth > 0 && trend === 'falling') phase = 'peak';
  else if (indicator.pmi < 50 && indicator.profitGrowth < 0) phase = 'contraction';
  else if (indicator.pmi < 50 && trend === 'rising') phase = 'trough';
  else phase = 'recovery';

  const confidence = Math.min(1, 0.5 + (drivers.length - risks.length) * 0.1);

  return {
    industry: indicator.industry,
    score,
    grade,
    phase,
    trend,
    confidence: Math.max(0, Math.min(1, confidence)),
    drivers,
    risks,
  };
}

/**
 * 生成行业轮动信号
 */
export function generateRotationSignals(
  indicators: IndustryIndicator[],
  valuations: Map<string, number> // 行业PE百分位
): IndustryRotationSignal[] {
  return indicators.map(indicator => {
    const prosperity = calculateProsperityScore(indicator);
    const valuation = valuations.get(indicator.industry) ?? 50;

    // 动量: 利润增长 + PMI偏离
    const momentum = (indicator.profitGrowth / 2) + (indicator.pmi - 50) * 2;

    // 估值: 低估值为正
    const valuationScore = (100 - valuation) / 10;

    // 综合分
    const composite = prosperity.score * 0.5 + momentum * 0.3 + valuationScore * 0.2;

    let signal: IndustryRotationSignal['signal'];
    if (composite > 65) signal = 'overweight';
    else if (composite < 40) signal = 'underweight';
    else signal = 'neutral';

    const reasons: string[] = [];
    if (prosperity.grade === 'A' || prosperity.grade === 'B') reasons.push('景气度高');
    if (valuation < 30) reasons.push('估值偏低');
    if (momentum > 5) reasons.push('动量向上');
    if (prosperity.risks.length > 0) reasons.push(`风险: ${prosperity.risks[0]}`);

    return {
      industry: indicator.industry,
      signal,
      momentum,
      valuation: valuationScore,
      prosperity: prosperity.score,
      composite,
      reasoning: reasons.join('; '),
    };
  }).sort((a, b) => b.composite - a.composite);
}

/**
 * 库存周期状态分析
 */
export function analyzeInventoryCycle(
  indicator: IndustryIndicator,
  historyMonths: number = 6
): InventoryCycleState {
  const _cycleNames: Record<string, string> = {
    active_restocking: '主动补库存',
    passive_destocking: '被动去库存',
    active_destocking: '主动去库存',
    passive_restocking: '被动补库存',
  };

  const nextPhases: Record<string, string> = {
    active_restocking: '被动补库存 (需求转弱)',
    passive_restocking: '主动去库存 (减产)',
    active_destocking: '被动去库存 (需求回暖)',
    passive_destocking: '主动补库存 (加产)',
  };

  // 典型周期长度
  const typicalDurations: Record<string, number> = {
    active_restocking: 8,
    passive_restocking: 4,
    active_destocking: 6,
    passive_destocking: 4,
  };

  return {
    industry: indicator.industry,
    cycle: indicator.inventoryCycle,
    duration: historyMonths,
    typicalDuration: typicalDurations[indicator.inventoryCycle] ?? 6,
    nextPhase: nextPhases[indicator.inventoryCycle] ?? '未知',
    nearTransition: historyMonths >= (typicalDurations[indicator.inventoryCycle] ?? 6) * 0.8,
  };
}

/**
 * 行业比较排序
 */
export function rankIndustries(
  indicators: IndustryIndicator[]
): { industry: string; rank: number; score: number; highlights: string[] }[] {
  const scored = indicators.map(ind => {
    const prosperity = calculateProsperityScore(ind);
    const highlights: string[] = [];
    if (ind.profitGrowth > 15) highlights.push('利润高增');
    if (ind.pmi > 52) highlights.push('PMI强势');
    if (ind.capacityUtilization > 0.8) highlights.push('产能饱满');
    if (ind.demandIndex > 70) highlights.push('需求旺盛');
    return {
      industry: ind.industry,
      score: prosperity.score,
      highlights,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}
