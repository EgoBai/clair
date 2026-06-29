/**
 * ST/退市风险预警引擎
 * ST触发条件/退市指标监控/风险评分/预警信号/脱帽分析
 */

// ── 类型定义 ──

export interface STStockInfo {
  code: string;
  name: string;
  currentStatus: 'normal' | 'ST' | '*ST' | 'delisted' | 'suspend';
  stDate?: string;
  industry: string;
  marketCap: number;         // 亿元
  stockPrice: number;
  consecutiveLossYears: number;
  latestFinancials: FinancialData;
}

export interface FinancialData {
  revenue: number;           // 营收(亿元)
  netProfit: number;         // 净利润(亿元)
  totalAssets: number;       // 总资产(亿元)
  totalLiabilities: number;  // 总负债(亿元)
  auditOpinion: 'unqualified' | 'qualified' | 'disclaimer' | 'adverse';
  hasFraudRisk: boolean;
  relatedPartyTransactions: number; // 关联交易金额(亿元)
  operatingCashFlow: number; // 经营现金流(亿元)
}

export interface STRiskIndicator {
  indicator: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isTriggered: boolean;
  description: string;
}

export interface STRiskReport {
  code: string;
  name: string;
  overallRiskScore: number;   // 0-100, 越高越危险
  riskLevel: 'safe' | 'attention' | 'warning' | 'danger' | 'critical';
  triggerProbability: number; // 被ST的概率 0-1
  indicators: STRiskIndicator[];
  delistingRisk: DelistingRisk;
  recoveryAnalysis: RecoveryAnalysis;
  alertSignals: AlertSignal[];
  recommendation: string;
}

export interface DelistingRisk {
  financialDelistingRisk: number;    // 财务退市风险 0-1
  transactionDelistingRisk: number;  // 交易退市风险 0-1
  complianceDelistingRisk: number;   // 合规退市风险 0-1
  overallDelistingRisk: number;
  estimatedTimeline: string;
  canRecover: boolean;
}

export interface RecoveryAnalysis {
  canRemoveST: boolean;
  conditions: string[];      // 需要满足的条件
  probability: number;
  estimatedTime: string;
  keyMetrics: { metric: string; current: number; required: number; met: boolean }[];
}

export interface AlertSignal {
  type: 'financial' | 'price' | 'audit' | 'governance' | 'market';
  severity: 'info' | 'warning' | 'danger';
  message: string;
  timestamp: string;
}

// ── ST触发条件检测 ──

const ST_THRESHOLDS = {
  netProfitWarning: 0,            // 净利润为负
  revenueWarning: 1,              // 营收低于1亿
  netAssetsWarning: 0,            // 净资产为负
  stockPriceWarning: 1,           // 股价低于1元
  auditDisclaimer: true,          // 审计报告非标
  consecutiveLossYears: 2,        // 连续亏损年数
  marketCapWarning: 3,            // 市值低于3亿
  fraudRiskScore: 0.6,            // 财务造假风险
};

export function assessSTRisk(stock: STStockInfo): STRiskReport {
  const indicators = evaluateIndicators(stock);
  const delistingRisk = evaluateDelistingRisk(stock, indicators);
  const recoveryAnalysis = evaluateRecoveryPotential(stock);
  const alertSignals = generateAlertSignals(stock, indicators);
  const { overallScore, riskLevel, triggerProb } = computeOverallRisk(indicators, stock);
  const recommendation = generateRecommendation(riskLevel, delistingRisk, recoveryAnalysis);

  return {
    code: stock.code,
    name: stock.name,
    overallRiskScore: overallScore,
    riskLevel,
    triggerProbability: triggerProb,
    indicators,
    delistingRisk,
    recoveryAnalysis,
    alertSignals,
    recommendation,
  };
}

function evaluateIndicators(stock: STStockInfo): STRiskIndicator[] {
  const f = stock.latestFinancials;
  const indicators: STRiskIndicator[] = [];

  // 1. 净利润指标
  indicators.push({
    indicator: '净利润',
    value: f.netProfit,
    threshold: ST_THRESHOLDS.netProfitWarning,
    severity: f.netProfit < -1 ? 'critical' : f.netProfit < 0 ? 'high' : 'low',
    isTriggered: f.netProfit < 0,
    description: f.netProfit < 0 ? `净利润亏损${Math.abs(f.netProfit).toFixed(2)}亿` : '净利润为正',
  });

  // 2. 营收指标
  indicators.push({
    indicator: '营业收入',
    value: f.revenue,
    threshold: ST_THRESHOLDS.revenueWarning,
    severity: f.revenue < 0.5 ? 'critical' : f.revenue < 1 ? 'high' : 'low',
    isTriggered: f.revenue < 1,
    description: f.revenue < 1 ? `营收仅${f.revenue.toFixed(2)}亿，低于1亿退市线` : '营收正常',
  });

  // 3. 净资产指标
  const netAssets = f.totalAssets - f.totalLiabilities;
  indicators.push({
    indicator: '净资产',
    value: netAssets,
    threshold: ST_THRESHOLDS.netAssetsWarning,
    severity: netAssets < 0 ? 'critical' : netAssets < 1 ? 'medium' : 'low',
    isTriggered: netAssets < 0,
    description: netAssets < 0 ? `净资产为负${netAssets.toFixed(2)}亿` : '净资产为正',
  });

  // 4. 连续亏损年数
  indicators.push({
    indicator: '连续亏损年数',
    value: stock.consecutiveLossYears,
    threshold: ST_THRESHOLDS.consecutiveLossYears,
    severity: stock.consecutiveLossYears >= 3 ? 'critical' : stock.consecutiveLossYears >= 2 ? 'high' : 'low',
    isTriggered: stock.consecutiveLossYears >= 2,
    description: stock.consecutiveLossYears >= 2
      ? `连续${stock.consecutiveLossYears}年亏损，触发ST`
      : `连续亏损${stock.consecutiveLossYears}年`,
  });

  // 5. 股价指标
  indicators.push({
    indicator: '股价',
    value: stock.stockPrice,
    threshold: ST_THRESHOLDS.stockPriceWarning,
    severity: stock.stockPrice < 0.8 ? 'critical' : stock.stockPrice < 1 ? 'high' : 'low',
    isTriggered: stock.stockPrice < 1,
    description: stock.stockPrice < 1
      ? `股价${stock.stockPrice.toFixed(2)}元，低于1元面值退市线`
      : '股价正常',
  });

  // 6. 审计意见
  const auditBad = f.auditOpinion !== 'unqualified';
  indicators.push({
    indicator: '审计意见',
    value: auditBad ? 1 : 0,
    threshold: 1,
    severity: f.auditOpinion === 'disclaimer' || f.auditOpinion === 'adverse' ? 'critical' : 'medium',
    isTriggered: auditBad,
    description: auditBad ? `审计意见为${translateAudit(f.auditOpinion)}` : '审计意见标准无保留',
  });

  // 7. 财务造假风险
  indicators.push({
    indicator: '财务造假风险',
    value: f.hasFraudRisk ? 0.8 : 0.1,
    threshold: ST_THRESHOLDS.fraudRiskScore,
    severity: f.hasFraudRisk ? 'critical' : 'low',
    isTriggered: f.hasFraudRisk,
    description: f.hasFraudRisk ? '存在财务造假嫌疑' : '无明显造假风险',
  });

  // 8. 经营现金流
  indicators.push({
    indicator: '经营现金流',
    value: f.operatingCashFlow,
    threshold: 0,
    severity: f.operatingCashFlow < -1 ? 'high' : f.operatingCashFlow < 0 ? 'medium' : 'low',
    isTriggered: f.operatingCashFlow < 0 && f.netProfit > 0, // 利润正但现金流负 = 异常
    description: f.operatingCashFlow < 0
      ? `经营现金流为负${Math.abs(f.operatingCashFlow).toFixed(2)}亿，利润质量存疑`
      : '经营现金流正常',
  });

  // 9. 市值
  indicators.push({
    indicator: '总市值',
    value: stock.marketCap,
    threshold: ST_THRESHOLDS.marketCapWarning,
    severity: stock.marketCap < 2 ? 'critical' : stock.marketCap < 3 ? 'high' : 'low',
    isTriggered: stock.marketCap < 3,
    description: stock.marketCap < 3
      ? `市值仅${stock.marketCap.toFixed(1)}亿，低于3亿退市线`
      : '市值正常',
  });

  // 10. 关联交易占比
  const relatedRatio = f.revenue > 0 ? f.relatedPartyTransactions / f.revenue : 0;
  indicators.push({
    indicator: '关联交易占比',
    value: relatedRatio,
    threshold: 0.3,
    severity: relatedRatio > 0.5 ? 'high' : relatedRatio > 0.3 ? 'medium' : 'low',
    isTriggered: relatedRatio > 0.3,
    description: relatedRatio > 0.3
      ? `关联交易占比${(relatedRatio * 100).toFixed(1)}%，存在利益输送风险`
      : '关联交易占比正常',
  });

  return indicators;
}

function evaluateDelistingRisk(stock: STStockInfo, _indicators: STRiskIndicator[]): DelistingRisk {
  const f = stock.latestFinancials;
  const netAssets = f.totalAssets - f.totalLiabilities;

  // 财务退市风险
  let financialRisk = 0;
  if (f.netProfit < 0 && f.revenue < 1) financialRisk += 0.4;
  if (netAssets < 0) financialRisk += 0.3;
  if (f.auditOpinion !== 'unqualified') financialRisk += 0.2;
  if (stock.consecutiveLossYears >= 3) financialRisk += 0.1;
  financialRisk = Math.min(1, financialRisk);

  // 交易退市风险
  let transactionRisk = 0;
  if (stock.stockPrice < 1) transactionRisk += 0.5;
  if (stock.marketCap < 3) transactionRisk += 0.3;
  if (stock.stockPrice < 0.5) transactionRisk += 0.2;
  transactionRisk = Math.min(1, transactionRisk);

  // 合规退市风险
  let complianceRisk = 0;
  if (f.hasFraudRisk) complianceRisk += 0.5;
  if (f.auditOpinion === 'disclaimer') complianceRisk += 0.3;
  if (f.auditOpinion === 'adverse') complianceRisk += 0.2;
  complianceRisk = Math.min(1, complianceRisk);

  const overall = financialRisk * 0.5 + transactionRisk * 0.3 + complianceRisk * 0.2;

  let timeline = '暂无退市风险';
  if (overall > 0.8) timeline = '6-12个月内可能退市';
  else if (overall > 0.6) timeline = '1-2年内需密切关注';
  else if (overall > 0.4) timeline = '存在中长期退市风险';

  const canRecover = financialRisk < 0.6 && complianceRisk < 0.3;

  return {
    financialDelistingRisk: roundTo(financialRisk, 2),
    transactionDelistingRisk: roundTo(transactionRisk, 2),
    complianceDelistingRisk: roundTo(complianceRisk, 2),
    overallDelistingRisk: roundTo(overall, 2),
    estimatedTimeline: timeline,
    canRecover,
  };
}

function evaluateRecoveryPotential(stock: STStockInfo): RecoveryAnalysis {
  const f = stock.latestFinancials;
  const netAssets = f.totalAssets - f.totalLiabilities;
  const conditions: string[] = [];
  const keyMetrics: { metric: string; current: number; required: number; met: boolean }[] = [];

  // 脱帽条件检查
  const profitMet = f.netProfit > 0;
  keyMetrics.push({ metric: '净利润为正', current: f.netProfit, required: 0, met: profitMet });
  if (!profitMet) conditions.push('需实现净利润转正');

  const revenueMet = f.revenue >= 1;
  keyMetrics.push({ metric: '营收≥1亿', current: f.revenue, required: 1, met: revenueMet });
  if (!revenueMet) conditions.push('需将营收提升至1亿以上');

  const assetsMet = netAssets > 0;
  keyMetrics.push({ metric: '净资产为正', current: netAssets, required: 0, met: assetsMet });
  if (!assetsMet) conditions.push('需将净资产转正');

  const auditMet = f.auditOpinion === 'unqualified';
  keyMetrics.push({ metric: '审计意见无保留', current: auditMet ? 1 : 0, required: 1, met: auditMet });
  if (!auditMet) conditions.push('需获得标准无保留审计意见');

  const cashFlowMet = f.operatingCashFlow > 0;
  keyMetrics.push({ metric: '经营现金流为正', current: f.operatingCashFlow, required: 0, met: cashFlowMet });
  if (!cashFlowMet) conditions.push('需改善经营现金流');

  const metCount = keyMetrics.filter(k => k.met).length;
  const canRemoveST = metCount >= 3 && profitMet && revenueMet;

  let estimatedTime = '暂无脱帽可能';
  if (canRemoveST) estimatedTime = '下一报告期可能脱帽';
  else if (metCount >= 3) estimatedTime = '6-12个月后有机会脱帽';
  else if (metCount >= 2) estimatedTime = '需1-2年改善';
  else estimatedTime = '脱帽难度较大';

  return {
    canRemoveST,
    conditions,
    probability: metCount / keyMetrics.length,
    estimatedTime,
    keyMetrics,
  };
}

function generateAlertSignals(stock: STStockInfo, indicators: STRiskIndicator[]): AlertSignal[] {
  const signals: AlertSignal[] = [];
  const now = new Date().toISOString().split('T')[0];

  for (const ind of indicators) {
    if (ind.isTriggered) {
      let type: AlertSignal['type'] = 'financial';
      if (ind.indicator === '股价' || ind.indicator === '总市值') type = 'price';
      if (ind.indicator === '审计意见' || ind.indicator === '财务造假风险') type = 'audit';

      signals.push({
        type,
        severity: ind.severity === 'critical' ? 'danger' : ind.severity === 'high' ? 'warning' : 'info',
        message: `${ind.indicator}预警: ${ind.description}`,
        timestamp: now,
      });
    }
  }

  // 综合预警
  const triggeredCount = indicators.filter(i => i.isTriggered).length;
  if (triggeredCount >= 3) {
    signals.unshift({
      type: 'financial',
      severity: 'danger',
      message: `多项指标同时预警(${triggeredCount}项)，高度关注ST/退市风险`,
      timestamp: now,
    });
  }

  return signals;
}

function computeOverallRisk(
  indicators: STRiskIndicator[],
  stock: STStockInfo
): { overallScore: number; riskLevel: STRiskReport['riskLevel']; triggerProb: number } {
  const triggered = indicators.filter(i => i.isTriggered);
  const criticalCount = triggered.filter(i => i.severity === 'critical').length;
  const highCount = triggered.filter(i => i.severity === 'high').length;

  let score = 0;
  score += criticalCount * 20;
  score += highCount * 10;
  score += (triggered.length - criticalCount - highCount) * 5;
  if (stock.currentStatus === 'ST') score += 15;
  if (stock.currentStatus === '*ST') score += 30;
  score = Math.min(100, score);

  let riskLevel: STRiskReport['riskLevel'];
  if (score >= 80) riskLevel = 'critical';
  else if (score >= 60) riskLevel = 'danger';
  else if (score >= 40) riskLevel = 'warning';
  else if (score >= 20) riskLevel = 'attention';
  else riskLevel = 'safe';

  const triggerProb = Math.min(1, score / 100);

  return { overallScore: score, riskLevel, triggerProb };
}

function generateRecommendation(
  riskLevel: STRiskReport['riskLevel'],
  delistingRisk: DelistingRisk,
  recovery: RecoveryAnalysis
): string {
  if (riskLevel === 'critical') {
    return '极度危险！建议立即卖出，规避退市风险。';
  }
  if (riskLevel === 'danger') {
    if (recovery.canRemoveST) {
      return '风险较高但存在脱帽机会，轻仓博弈脱帽行情，严格止损。';
    }
    return '风险较高，建议减仓或清仓，不建议新增投资。';
  }
  if (riskLevel === 'warning') {
    return '存在一定风险，密切关注财务指标变化，控制仓位在5%以内。';
  }
  if (riskLevel === 'attention') {
    return '少量风险指标触发，持续关注，无需立即操作。';
  }
  return '风险较低，正常关注即可。';
}

function translateAudit(opinion: string): string {
  const map: Record<string, string> = {
    unqualified: '标准无保留',
    qualified: '保留意见',
    disclaimer: '无法表示意见',
    adverse: '否定意见',
  };
  return map[opinion] || opinion;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ── 批量扫描 ──

export function batchAssessSTRisk(stocks: STStockInfo[]): STRiskReport[] {
  return stocks
    .map(s => assessSTRisk(s))
    .sort((a, b) => b.overallRiskScore - a.overallRiskScore);
}

// ── 历史ST股票统计 ──

export function calculateSTStatistics(reports: STRiskReport[]) {
  const total = reports.length;
  const byLevel = {
    critical: reports.filter(r => r.riskLevel === 'critical').length,
    danger: reports.filter(r => r.riskLevel === 'danger').length,
    warning: reports.filter(r => r.riskLevel === 'warning').length,
    attention: reports.filter(r => r.riskLevel === 'attention').length,
    safe: reports.filter(r => r.riskLevel === 'safe').length,
  };

  const highRiskRatio = (byLevel.critical + byLevel.danger) / Math.max(total, 1);
  const avgRiskScore = total > 0
    ? reports.reduce((a, r) => a + r.overallRiskScore, 0) / total : 0;

  return {
    totalStocks: total,
    riskDistribution: byLevel,
    highRiskRatio: roundTo(highRiskRatio, 4),
    avgRiskScore: roundTo(avgRiskScore, 1),
    topRiskStocks: reports.slice(0, 10).map(r => ({ code: r.code, name: r.name, score: r.overallRiskScore })),
  };
}
