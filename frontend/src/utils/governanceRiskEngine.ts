/**
 * 公司治理风险引擎
 * - 股权结构分析
 * - 管理层风险
 * - 关联交易风险
 * - 信息披露质量
 * - 治理风险综合评分
 */
export interface GovernanceData {
  // 股权结构
  largestShareholder: number; // 第一大股东持股比
  top5Shareholders: number; // 前五大股东持股比
  managementHolding: number; // 管理层持股比
  pledgeRatio: number; // 质押比例
  isStateOwned: boolean;

  // 管理层
  ceoTenure: number; // CEO任期(年)
  boardSize: number;
  independentDirectorRatio: number;
  femaleDirectorRatio: number;
  ceoDuality: boolean; // 董事长总经理兼任
  boardMeetingAttendance: number; // 董事会出席率

  // 关联交易
  relatedPartyTransactionRatio: number; // 关联交易/收入
  insiderTradingIncidents: number; // 内部交易事件

  // 信息披露
  lateDisclosures: number; // 延迟披露次数
  correctionNotices: number; // 更正公告数
  regulatoryPenalties: number; // 监管处罚数
  auditOpinion: 'unqualified' | 'qualified' | 'adverse' | 'disclaimer';

  revenue: number;
}

export interface GovernanceResult {
  ownershipScore: number; // 0-100
  managementScore: number; // 0-100
  relatedPartyScore: number; // 0-100
  disclosureScore: number; // 0-100
  overallScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  governanceGrade: 'A' | 'B' | 'C' | 'D';
  redFlags: string[];
  recommendations: string[];
}

export function assessGovernance(data: GovernanceData): GovernanceResult {
  const redFlags: string[] = [];
  const recommendations: string[] = [];

  // 股权结构评分
  let ownershipScore = 100;
  if (data.largestShareholder > 0.5) { ownershipScore -= 15; }
  if (data.pledgeRatio > 0.5) { ownershipScore -= 25; redFlags.push('控股股东质押比例超50%'); }
  else if (data.pledgeRatio > 0.3) { ownershipScore -= 15; }
  if (data.managementHolding < 0.01) { ownershipScore -= 10; recommendations.push('建议管理层持股绑定利益'); }
  if (data.top5Shareholders < 0.3) { ownershipScore -= 15; redFlags.push('股权过于分散'); }
  ownershipScore = Math.max(0, ownershipScore);

  // 管理层评分
  let managementScore = 100;
  if (data.ceoTenure < 1) { managementScore -= 15; redFlags.push('CEO任期过短'); }
  if (data.boardSize < 5 || data.boardSize > 15) { managementScore -= 10; }
  if (data.independentDirectorRatio < 0.33) { managementScore -= 20; redFlags.push('独立董事比例不达标'); }
  if (data.femaleDirectorRatio < 0.1) { managementScore -= 10; }
  if (data.ceoDuality) { managementScore -= 15; redFlags.push('董事长与总经理兼任'); }
  if (data.boardMeetingAttendance < 0.8) { managementScore -= 10; }
  managementScore = Math.max(0, managementScore);

  // 关联交易评分
  let relatedPartyScore = 100;
  if (data.relatedPartyTransactionRatio > 0.2) { relatedPartyScore -= 30; redFlags.push('关联交易占比过高'); }
  else if (data.relatedPartyTransactionRatio > 0.1) { relatedPartyScore -= 15; }
  if (data.insiderTradingIncidents > 0) { relatedPartyScore -= 25; redFlags.push('存在内部交易事件'); }
  relatedPartyScore = Math.max(0, relatedPartyScore);

  // 信息披露评分
  let disclosureScore = 100;
  if (data.lateDisclosures > 3) { disclosureScore -= 20; redFlags.push('延迟披露频繁'); }
  if (data.correctionNotices > 2) { disclosureScore -= 15; }
  if (data.regulatoryPenalties > 0) { disclosureScore -= 25; redFlags.push('存在监管处罚'); }
  if (data.auditOpinion === 'qualified') { disclosureScore -= 15; redFlags.push('审计报告有保留意见'); }
  else if (data.auditOpinion === 'adverse' || data.auditOpinion === 'disclaimer') {
    disclosureScore -= 40; redFlags.push('审计报告有严重问题');
  }
  disclosureScore = Math.max(0, disclosureScore);

  // 综合评分
  const overallScore = Math.round(ownershipScore * 0.25 + managementScore * 0.3 + relatedPartyScore * 0.2 + disclosureScore * 0.25);

  let riskLevel: GovernanceResult['riskLevel'];
  if (overallScore >= 75) riskLevel = 'low';
  else if (overallScore >= 55) riskLevel = 'medium';
  else if (overallScore >= 35) riskLevel = 'high';
  else riskLevel = 'critical';

  let grade: GovernanceResult['governanceGrade'];
  if (overallScore >= 80) grade = 'A';
  else if (overallScore >= 60) grade = 'B';
  else if (overallScore >= 40) grade = 'C';
  else grade = 'D';

  return {
    ownershipScore,
    managementScore,
    relatedPartyScore,
    disclosureScore,
    overallScore,
    riskLevel,
    governanceGrade: grade,
    redFlags,
    recommendations,
  };
}
