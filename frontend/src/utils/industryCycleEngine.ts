/**
 * 行业景气度跟踪引擎
 * 行业PMI、产能利用率、库存周期、景气度评分
 */

export interface IndustryCycleData {
  industry: string;
  pmi: number;
  capacityUtilization: number;
  profitGrowth: number;
  revenueGrowth: number;
  inventoryRatio: number;
  prevInventoryRatio: number;
  orderIndex: number;
  exportRatio: number;
}

export interface CycleResult {
  industry: string;
  prosperityScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  cyclePhase: 'expansion' | 'peak' | 'contraction' | 'trough' | 'recovery';
  momentum: number;
  inventoryPhase: 'destocking' | 'restocking' | 'passive_destocking' | 'passive_restocking';
  rotationSignal: 'overweight' | 'neutral' | 'underweight';
  details: {
    pmiScore: number;
    capacityScore: number;
    profitScore: number;
    inventoryScore: number;
    demandScore: number;
  };
  warnings: string[];
}

/**
 * 行业景气度分析
 */
export function analyzeIndustryCycle(data: IndustryCycleData): CycleResult {
  const { pmi, capacityUtilization, profitGrowth, revenueGrowth, inventoryRatio, prevInventoryRatio, orderIndex, exportRatio } = data;

  // 子项评分
  const pmiScore = Math.min(100, Math.max(0, (pmi - 45) * 10));
  const capacityScore = Math.min(100, capacityUtilization * 100);
  const profitScore = Math.min(100, Math.max(0, profitGrowth * 2 + 50));
  const inventoryScore = inventoryRatio < prevInventoryRatio ? 70 : inventoryRatio > prevInventoryRatio * 1.1 ? 30 : 50;
  const demandScore = Math.min(100, Math.max(0, orderIndex * 10 + revenueGrowth * 50));

  // 景气度评分
  const prosperityScore = Math.round((pmiScore * 0.25 + capacityScore * 0.2 + profitScore * 0.25 + inventoryScore * 0.15 + demandScore * 0.15) * 10) / 10;

  // 等级
  const grade: CycleResult['grade'] =
    prosperityScore >= 80 ? 'A' : prosperityScore >= 65 ? 'B' : prosperityScore >= 50 ? 'C' : prosperityScore >= 35 ? 'D' : 'E';

  // 周期阶段
  let cyclePhase: CycleResult['cyclePhase'];
  if (pmi > 52 && profitGrowth > 10 && capacityUtilization > 0.8) cyclePhase = 'peak';
  else if (pmi > 50 && profitGrowth > 0) cyclePhase = 'expansion';
  else if (pmi < 48 && profitGrowth < 0 && capacityUtilization < 0.7) cyclePhase = 'trough';
  else if (pmi < 50 && profitGrowth < 0) cyclePhase = 'contraction';
  else cyclePhase = 'recovery';

  // 动量
  const momentum = (pmi - 50) + profitGrowth * 0.5 + (capacityUtilization - 0.75) * 20;

  // 库存周期
  const inventoryChange = inventoryRatio - prevInventoryRatio;
  const revenueActive = revenueGrowth > 0;
  let inventoryPhase: CycleResult['inventoryPhase'];
  if (inventoryChange < 0 && revenueActive) inventoryPhase = 'destocking';
  else if (inventoryChange > 0 && revenueActive) inventoryPhase = 'restocking';
  else if (inventoryChange < 0 && !revenueActive) inventoryPhase = 'passive_destocking';
  else inventoryPhase = 'passive_restocking';

  // 轮动信号
  const rotationSignal: CycleResult['rotationSignal'] =
    prosperityScore >= 70 && momentum > 0 ? 'overweight' :
    prosperityScore < 40 || momentum < -5 ? 'underweight' : 'neutral';

  // 警告
  const warnings: string[] = [];
  if (pmi < 48) warnings.push('PMI低于荣枯线');
  if (capacityUtilization < 0.6) warnings.push('产能利用率过低');
  if (profitGrowth < -20) warnings.push('利润大幅下滑');
  if (inventoryRatio > prevInventoryRatio * 1.2) warnings.push('库存积压严重');

  return {
    industry: data.industry,
    prosperityScore,
    grade,
    cyclePhase,
    momentum: Math.round(momentum * 100) / 100,
    inventoryPhase,
    rotationSignal,
    details: {
      pmiScore: Math.round(pmiScore * 10) / 10,
      capacityScore: Math.round(capacityScore * 10) / 10,
      profitScore: Math.round(profitScore * 10) / 10,
      inventoryScore: Math.round(inventoryScore * 10) / 10,
      demandScore: Math.round(demandScore * 10) / 10,
    },
    warnings,
  };
}
