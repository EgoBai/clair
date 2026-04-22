/**
 * 强制平仓预警引擎 - 质押风险/两融预警/股权质押/大股东减持风险
 */

export interface PledgePosition {
  stockCode: string;
  shareholder: string;
  pledgedShares: number;
  totalShares: number;
  pledgee: string;
  pledgeDate: string;
  maturityDate: string;
  currentPrice: number;
  estimatedAlertPrice: number;
  estimatedLiquidationPrice: number;
}

export interface MarginPosition {
  stockCode: string;
  marginBalance: number;
  collateralValue: number;
  maintenanceRatio: number;
  currentRatio: number;
  alertLine: number;
  liquidationLine: number;
}

export interface LiquidationRisk {
  stockCode: string;
  riskType: 'pledge' | 'margin' | 'unlock' | 'reduction';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100
  description: string;
  triggerPrice: number;
  currentPrice: number;
  distanceToTrigger: number; // percentage
  estimatedImpact: number; // shares affected
}

export interface ReductionPlan {
  stockCode: string;
  shareholder: string;
  plannedShares: number;
  totalShares: number;
  percentOfFloat: number;
  method: '集中竞价' | '大宗交易' | '协议转让';
  startDate: string;
  endDate: string;
}

/**
 * 质押风险评估
 */
export function assessPledgeRisk(positions: PledgePosition[]): LiquidationRisk[] {
  return positions.map(pos => {
    const pledgeRatio = pos.pledgedShares / pos.totalShares;
    const priceDistance = (pos.currentPrice - pos.estimatedLiquidationPrice) / pos.currentPrice;

    let riskLevel: LiquidationRisk['riskLevel'];
    let score: number;

    if (pos.currentPrice <= pos.estimatedLiquidationPrice) {
      riskLevel = 'critical';
      score = 95;
    } else if (pos.currentPrice <= pos.estimatedAlertPrice) {
      riskLevel = 'high';
      score = 75;
    } else if (priceDistance < 0.15) {
      riskLevel = 'medium';
      score = 50;
    } else {
      riskLevel = 'low';
      score = 20;
    }

    // Adjust for high pledge ratio
    if (pledgeRatio > 0.7) score = Math.min(100, score + 15);
    else if (pledgeRatio > 0.5) score = Math.min(100, score + 8);

    return {
      stockCode: pos.stockCode,
      riskType: 'pledge' as const,
      riskLevel,
      score,
      description: `${pos.shareholder}质押${(pledgeRatio * 100).toFixed(1)}%，距平仓线${(priceDistance * 100).toFixed(1)}%`,
      triggerPrice: pos.estimatedLiquidationPrice,
      currentPrice: pos.currentPrice,
      distanceToTrigger: Math.round(priceDistance * 10000) / 100,
      estimatedImpact: pos.pledgedShares,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * 两融预警
 */
export function assessMarginRisk(positions: MarginPosition[]): LiquidationRisk[] {
  return positions.map(pos => {
    const distanceToAlert = (pos.currentRatio - pos.alertLine) / pos.alertLine;
    const distanceToLiquidation = (pos.currentRatio - pos.liquidationLine) / pos.liquidationLine;

    let riskLevel: LiquidationRisk['riskLevel'];
    let score: number;

    if (pos.currentRatio <= pos.liquidationLine) {
      riskLevel = 'critical';
      score = 95;
    } else if (pos.currentRatio <= pos.alertLine) {
      riskLevel = 'high';
      score = 75;
    } else if (distanceToAlert < 0.1) {
      riskLevel = 'medium';
      score = 50;
    } else {
      riskLevel = 'low';
      score = 20;
    }

    return {
      stockCode: pos.stockCode,
      riskType: 'margin' as const,
      riskLevel,
      score,
      description: `维保比例${(pos.currentRatio * 100).toFixed(1)}%，警戒线${(pos.alertLine * 100).toFixed(1)}%`,
      triggerPrice: 0,
      currentPrice: 0,
      distanceToTrigger: Math.round(distanceToAlert * 10000) / 100,
      estimatedImpact: pos.marginBalance,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * 解禁风险分析
 */
export function assessUnlockRisk(
  unlocks: Array<{
    stockCode: string;
    unlockDate: string;
    unlockShares: number;
    totalFloat: number;
    costPrice: number;
    currentPrice: number;
    holderType: 'institutional' | 'insider' | 'strategic';
  }>,
): LiquidationRisk[] {
  return unlocks.map(u => {
    const percentOfFloat = u.unlockShares / u.totalFloat;
    const profitRatio = (u.currentPrice - u.costPrice) / u.costPrice;

    // Higher risk if: large portion, profitable, insider holder
    let score = 0;
    score += percentOfFloat * 100; // size factor
    if (profitRatio > 0.3) score += 20; // profitable = more likely to sell
    if (profitRatio > 1) score += 15;
    if (u.holderType === 'insider') score += 15;
    else if (u.holderType === 'strategic') score += 5;

    score = Math.min(100, score);

    let riskLevel: LiquidationRisk['riskLevel'];
    if (score > 70) riskLevel = 'critical';
    else if (score > 50) riskLevel = 'high';
    else if (score > 30) riskLevel = 'medium';
    else riskLevel = 'low';

    return {
      stockCode: u.stockCode,
      riskType: 'unlock' as const,
      riskLevel,
      score: Math.round(score),
      description: `${u.unlockDate}解禁${(percentOfFloat * 100).toFixed(1)}%流通盘，浮盈${(profitRatio * 100).toFixed(1)}%`,
      triggerPrice: u.costPrice,
      currentPrice: u.currentPrice,
      distanceToTrigger: Math.round(profitRatio * 10000) / 100,
      estimatedImpact: u.unlockShares,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * 大股东减持风险
 */
export function assessReductionRisk(plans: ReductionPlan[]): LiquidationRisk[] {
  return plans.map(plan => {
    const percentOfFloat = plan.percentOfFloat;

    let score = percentOfFloat * 80;
    if (plan.method === '集中竞价') score += 15; // More market impact
    if (plan.method === '协议转让') score -= 10;

    score = Math.max(0, Math.min(100, score));

    let riskLevel: LiquidationRisk['riskLevel'];
    if (score > 60) riskLevel = 'high';
    else if (score > 40) riskLevel = 'medium';
    else riskLevel = 'low';

    return {
      stockCode: plan.stockCode,
      riskType: 'reduction' as const,
      riskLevel,
      score: Math.round(score),
      description: `${plan.shareholder}拟通过${plan.method}减持${(percentOfFloat * 100).toFixed(2)}%`,
      triggerPrice: 0,
      currentPrice: 0,
      distanceToTrigger: 0,
      estimatedImpact: plan.plannedShares,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * 综合风险评分
 */
export function compositeRiskScore(
  risks: LiquidationRisk[],
): {
  overallScore: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  topRisks: LiquidationRisk[];
  byType: Record<string, { count: number; avgScore: number }>;
} {
  if (risks.length === 0) {
    return { overallScore: 0, level: 'low', topRisks: [], byType: {} };
  }

  // Weighted average of top 5 risks
  const top5 = risks.slice(0, 5);
  const weights = [0.35, 0.25, 0.2, 0.12, 0.08];
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < top5.length; i++) {
    weightedSum += top5[i].score * weights[i];
    totalWeight += weights[i];
  }
  const overallScore = Math.round(weightedSum / totalWeight);

  let level: 'low' | 'medium' | 'high' | 'critical';
  if (overallScore > 70) level = 'critical';
  else if (overallScore > 50) level = 'high';
  else if (overallScore > 30) level = 'medium';
  else level = 'low';

  const byType: Record<string, { count: number; totalScore: number; avgScore: number }> = {};
  for (const r of risks) {
    if (!byType[r.riskType]) byType[r.riskType] = { count: 0, totalScore: 0, avgScore: 0 };
    byType[r.riskType].count++;
    byType[r.riskType].totalScore += r.score;
  }
  for (const t of Object.values(byType)) {
    t.avgScore = Math.round(t.totalScore / t.count);
    delete (t as Record<string, unknown>).totalScore;
  }

  return {
    overallScore,
    level,
    topRisks: risks.slice(0, 10),
    byType: byType as Record<string, { count: number; avgScore: number }>,
  };
}
