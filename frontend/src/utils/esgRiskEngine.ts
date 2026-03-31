/**
 * ESG风险评估引擎
 * - 环境(E)评分: 碳排放/能耗/废物管理
 * - 社会(S)评分: 员工/供应链/社区
 * - 治理(G)评分: 董事会/薪酬/透明度
 * - 综合ESG风险评分
 * - 行业调整后的风险排名
 */
export interface ESGMetrics {
  // 环境
  carbonEmission: number; // 吨CO2当量
  energyConsumption: number; // MWh
  wasteGenerated: number; // 吨
  renewableEnergyRatio: number; // 0-1
  waterUsage: number; // 立方米

  // 社会
  employeeCount: number;
  turnoverRate: number; // 0-1
  safetyIncidents: number;
  diversityRatio: number; // 0-1
  communityInvestment: number; // 万元

  // 治理
  boardSize: number;
  independentDirectorRatio: number; // 0-1
  femaleDirectorRatio: number; // 0-1
  ceoPayRatio: number; // CEO薪酬/员工平均薪酬
  auditIssues: number;
  relatedPartyTransactions: number; // 万元
  revenue: number; // 万元
}

export interface ESGResult {
  environmentScore: number; // 0-100
  socialScore: number; // 0-100
  governanceScore: number; // 0-100
  totalScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  esgGrade: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC';
  keyRisks: string[];
  carbonIntensity: number;
  disclosureCompleteness: number; // 0-1
}

export function assessESGRisk(metrics: ESGMetrics): ESGResult {
  const keyRisks: string[] = [];

  // 环境评分
  let envScore = 100;
  const revenueMillions = Math.max(metrics.revenue, 1);
  const carbonIntensity = metrics.carbonEmission / revenueMillions;

  if (carbonIntensity > 100) { envScore -= 30; keyRisks.push('碳排放强度极高'); }
  else if (carbonIntensity > 50) { envScore -= 15; }
  if (metrics.renewableEnergyRatio < 0.1) { envScore -= 15; keyRisks.push('可再生能源占比极低'); }
  else if (metrics.renewableEnergyRatio < 0.3) { envScore -= 8; }
  if (metrics.wasteGenerated / revenueMillions > 0.5) { envScore -= 15; keyRisks.push('废弃物产生量高'); }
  envScore = Math.max(0, envScore);

  // 社会评分
  let socScore = 100;
  if (metrics.turnoverRate > 0.3) { socScore -= 20; keyRisks.push('员工流失率过高'); }
  else if (metrics.turnoverRate > 0.15) { socScore -= 10; }
  if (metrics.safetyIncidents > 5) { socScore -= 25; keyRisks.push('安全事故频发'); }
  else if (metrics.safetyIncidents > 2) { socScore -= 10; }
  if (metrics.diversityRatio < 0.2) { socScore -= 15; keyRisks.push('多样性比例偏低'); }
  if (metrics.communityInvestment / revenueMillions < 0.001) { socScore -= 10; }
  socScore = Math.max(0, socScore);

  // 治理评分
  let govScore = 100;
  if (metrics.independentDirectorRatio < 0.33) { govScore -= 20; keyRisks.push('独立董事比例不达标'); }
  if (metrics.femaleDirectorRatio < 0.1) { govScore -= 10; }
  if (metrics.ceoPayRatio > 100) { govScore -= 15; keyRisks.push('CEO薪酬差距过大'); }
  else if (metrics.ceoPayRatio > 50) { govScore -= 8; }
  if (metrics.auditIssues > 0) { govScore -= 20; keyRisks.push('存在审计问题'); }
  if (metrics.relatedPartyTransactions / revenueMillions > 0.1) {
    govScore -= 15; keyRisks.push('关联交易占比偏高');
  }
  if (metrics.boardSize < 5) { govScore -= 10; keyRisks.push('董事会规模偏小'); }
  govScore = Math.max(0, govScore);

  const total = Math.round((envScore * 0.35 + socScore * 0.3 + govScore * 0.35));

  let riskLevel: ESGResult['riskLevel'];
  if (total >= 75) riskLevel = 'low';
  else if (total >= 55) riskLevel = 'medium';
  else if (total >= 35) riskLevel = 'high';
  else riskLevel = 'critical';

  let grade: ESGResult['esgGrade'];
  if (total >= 90) grade = 'AAA';
  else if (total >= 80) grade = 'AA';
  else if (total >= 70) grade = 'A';
  else if (total >= 55) grade = 'BBB';
  else if (total >= 40) grade = 'BB';
  else if (total >= 25) grade = 'B';
  else grade = 'CCC';

  const disclosureFields = [
    metrics.carbonEmission, metrics.energyConsumption, metrics.wasteGenerated,
    metrics.employeeCount, metrics.turnoverRate, metrics.boardSize,
  ];
  const disclosureCompleteness = disclosureFields.filter(f => f > 0).length / disclosureFields.length;

  return {
    environmentScore: envScore,
    socialScore: socScore,
    governanceScore: govScore,
    totalScore: total,
    riskLevel,
    esgGrade: grade,
    keyRisks,
    carbonIntensity: Math.round(carbonIntensity * 100) / 100,
    disclosureCompleteness: Math.round(disclosureCompleteness * 100) / 100,
  };
}
