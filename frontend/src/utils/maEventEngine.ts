/**
 * 并购重组事件引擎
 * 重组类型识别/估值分析/协同效应/交易结构/风险评估/事件驱动策略
 */

// ── 类型定义 ──

export type MAType =
  | 'acquisition'        // 收购
  | 'merger'             // 合并
  | 'restructuring'      // 重组
  | 'asset_injection'    // 资产注入
  | 'spin_off'           // 分拆
  | 'backdoor_listing'   // 借壳上市
  | 'privatization'      // 私有化
  | 'divestiture';       // 剥离

export interface MAEvent {
  id: string;
  announcementDate: string;
  acquirerCode: string;
  acquirerName: string;
  targetCode?: string;
  targetName: string;
  maType: MAType;
  transactionValue: number;    // 交易金额(亿元)
  paymentMethod: 'cash' | 'stock' | 'mixed';
  targetIndustry: string;
  targetRevenue: number;       // 目标营收(亿元)
  targetNetProfit: number;     // 目标净利润(亿元)
  targetPE: number;            // 目标估值PE
  industryAvgPE: number;
  premium: number;             // 溢价率
  status: 'proposed' | 'approved' | 'completed' | 'terminated';
  synergiesExpected: boolean;
  relatedParty: boolean;
}

export interface MAValuation {
  eventId: string;
  targetValuation: number;     // 目标估值(亿元)
  valuationMethod: string;
  peMultiple: number;
  psMultiple: number;
  premiumToMarket: number;     // 对市场价格的溢价
  premiumToNAV: number;        // 对净资产的溢价
  isReasonable: boolean;
  overpayRisk: number;         // 过度支付风险 0-1
  valuationOpinion: string;
}

export interface SynergyAnalysis {
  eventId: string;
  revenueSynergy: number;      // 营收协同预期(亿元)
  costSynergy: number;         // 成本协同预期(亿元)
  totalSynergy: number;
  synergyScore: number;        // 0-100
  synergyFactors: string[];
  riskFactors: string[];
  realizationProbability: number; // 协同实现概率
}

export interface MAImpactAnalysis {
  eventId: string;
  acquirerImpact: {
    epsDilution: number;       // EPS稀释率
    leverageChange: number;    // 杠杆变化
    revenueGrowth: number;     // 营收增厚
    marginImpact: number;      // 利润率影响
    roeImpact: number;         // ROE影响
  };
  shortTermSignal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  longTermSignal: 'positive' | 'neutral' | 'negative';
  expectedPriceMove: number;   // 预期价格变动幅度
  keyRisks: string[];
}

export interface MAStrategySignal {
  eventId: string;
  signalType: 'pre_announcement' | 'post_announcement' | 'approval_play' | 'completion_play';
  direction: 'long' | 'short' | 'neutral';
  confidence: number;          // 0-1
  entryTiming: string;
  targetReturn: number;
  stopLoss: number;
  holdingPeriod: string;
  reasoning: string;
}

export interface MARegulatoryRisk {
  eventId: string;
  antitrustRisk: number;       // 反垄断审查风险 0-1
  industryPolicyRisk: number;  // 产业政策风险
  approvalProbability: number; // 审批通过概率
  estimatedApprovalTime: string;
  regulatoryConcerns: string[];
}

export interface MAPortfolioAnalysis {
  events: MAEvent[];
  avgPremium: number;
  avgSynergy: number;
  successRate: number;
  avgReturn: number;
  sectorHeat: Map<string, number>;
  topOpportunities: { code: string; name: string; score: number }[];
}

// ── 重组类型识别 ──

export function classifyMAEvent(event: Partial<MAEvent>): MAType {
  if (event.maType) return event.maType;

  const name = (event.targetName || '').toLowerCase();
  if (name.includes('借壳') || name.includes('重组上市')) return 'backdoor_listing';
  if (name.includes('分拆') || name.includes('拆分')) return 'spin_off';
  if (name.includes('私有化')) return 'privatization';
  if (name.includes('剥离') || name.includes('出售')) return 'divestiture';
  if (name.includes('注入')) return 'asset_injection';
  if (name.includes('合并') || name.includes('吸收')) return 'merger';

  return 'acquisition';
}

// ── 估值分析 ──

export function analyzeMAValuation(event: MAEvent): MAValuation {
  const targetValuation = event.transactionValue;
  const peMultiple = event.targetNetProfit > 0
    ? targetValuation / event.targetNetProfit
    : 0;
  const psMultiple = event.targetRevenue > 0
    ? targetValuation / event.targetRevenue
    : 0;

  const premiumToMarket = event.premium;
  const premiumToNAV = peMultiple > 0
    ? (peMultiple - event.industryAvgPE) / event.industryAvgPE
    : 0;

  let overpayRisk = 0;
  if (peMultiple > event.industryAvgPE * 1.5) overpayRisk += 0.3;
  if (premiumToMarket > 0.5) overpayRisk += 0.3;
  if (event.relatedParty) overpayRisk += 0.2;
  if (event.targetPE > event.industryAvgPE * 2) overpayRisk += 0.2;
  overpayRisk = Math.min(1, overpayRisk);

  const isReasonable = overpayRisk < 0.5;

  let valuationOpinion = '';
  if (overpayRisk < 0.2) valuationOpinion = '估值合理，交易对价公允';
  else if (overpayRisk < 0.5) valuationOpinion = '估值略高，但可接受';
  else if (overpayRisk < 0.7) valuationOpinion = '估值偏高，需关注溢价合理性';
  else valuationOpinion = '估值严重偏高，存在利益输送风险';

  return {
    eventId: event.id || '',
    targetValuation,
    valuationMethod: peMultiple > 0 ? 'PE估值法' : 'PS估值法',
    peMultiple: roundTo(peMultiple, 2),
    psMultiple: roundTo(psMultiple, 2),
    premiumToMarket: roundTo(premiumToMarket, 4),
    premiumToNAV: roundTo(premiumToNAV, 4),
    isReasonable,
    overpayRisk: roundTo(overpayRisk, 2),
    valuationOpinion,
  };
}

// ── 协同效应分析 ──

export function analyzeSynergies(event: MAEvent): SynergyAnalysis {
  const synergyFactors: string[] = [];
  const riskFactors: string[] = [];

  // 营收协同
  let revenueSynergy = 0;
  if (event.targetRevenue > 10) {
    revenueSynergy = event.targetRevenue * 0.05; // 5%交叉销售
    synergyFactors.push('交叉销售机会，可拓展客户渠道');
  }
  if (event.acquirerName.includes('科技') || event.targetIndustry.includes('科技')) {
    revenueSynergy += event.targetRevenue * 0.03;
    synergyFactors.push('技术互补，提升产品竞争力');
  }

  // 成本协同
  let costSynergy = event.targetNetProfit * 0.15; // 15%成本节省
  if (event.maType === 'merger') {
    costSynergy *= 1.5;
    synergyFactors.push('合并重组可消除重叠部门');
  }
  synergyFactors.push('管理费用优化');
  synergyFactors.push('采购议价能力提升');

  const totalSynergy = revenueSynergy + costSynergy;

  // 风险因素
  if (event.relatedParty) riskFactors.push('关联交易，估值公允性存疑');
  if (event.premium > 0.3) riskFactors.push(`收购溢价${(event.premium * 100).toFixed(0)}%偏高`);
  if (event.targetIndustry !== '科技') riskFactors.push('传统行业整合难度大');

  const synergyScore = Math.min(100, Math.round(
    30 + revenueSynergy * 2 + costSynergy * 3 - (event.relatedParty ? 20 : 0)
  ));

  const realizationProbability = Math.max(0.2, Math.min(0.9,
    0.6 - (event.relatedParty ? 0.2 : 0) - (event.premium > 0.3 ? 0.1 : 0)
  ));

  return {
    eventId: event.id || '',
    revenueSynergy: roundTo(revenueSynergy, 2),
    costSynergy: roundTo(costSynergy, 2),
    totalSynergy: roundTo(totalSynergy, 2),
    synergyScore,
    synergyFactors,
    riskFactors,
    realizationProbability: roundTo(realizationProbability, 2),
  };
}

// ── 影响分析 ──

export function analyzeImpact(event: MAEvent, valuation: MAValuation): MAImpactAnalysis {
  // EPS影响
  const acquirerEPS = 1; // 假设基准
  const targetContribution = event.targetNetProfit * (1 - valuation.overpayRisk * 0.3);
  const sharesIssued = event.paymentMethod !== 'cash'
    ? event.transactionValue / 10 : 0;
  const epsDilution = sharesIssued > 0
    ? -sharesIssued / (100 + sharesIssued) : 0;

  const revenueGrowth = event.targetRevenue > 0 ? event.targetRevenue / 100 : 0; // 假设收购方营收100亿
  const marginImpact = event.targetNetProfit / Math.max(event.targetRevenue, 1) - 0.1;
  const leverageChange = event.paymentMethod === 'cash' ? 0.2 : -0.05;
  const roeImpact = targetContribution > 0 ? 0.02 : -0.02;

  // 短期信号
  let shortTermSignal: MAImpactAnalysis['shortTermSignal'];
  if (event.synergiesExpected && event.premium < 0.2) shortTermSignal = 'strong_buy';
  else if (event.synergiesExpected) shortTermSignal = 'buy';
  else if (event.relatedParty || event.premium > 0.5) shortTermSignal = 'sell';
  else shortTermSignal = 'hold';

  // 长期信号
  let longTermSignal: MAImpactAnalysis['longTermSignal'];
  if (event.synergiesExpected && !event.relatedParty) longTermSignal = 'positive';
  else if (event.relatedParty || event.premium > 0.5) longTermSignal = 'negative';
  else longTermSignal = 'neutral';

  const expectedPriceMove = event.synergiesExpected
    ? 0.05 + event.premium * 0.1
    : -0.05 - event.premium * 0.1;

  const keyRisks: string[] = [];
  if (event.paymentMethod === 'cash') keyRisks.push('现金收购增加负债');
  if (event.premium > 0.3) keyRisks.push('高溢价收购可能导致商誉减值');
  if (event.relatedParty) keyRisks.push('关联交易利益输送风险');
  if (valuation.overpayRisk > 0.5) keyRisks.push('过度支付风险');

  return {
    eventId: event.id || '',
    acquirerImpact: {
      epsDilution: roundTo(epsDilution, 4),
      leverageChange: roundTo(leverageChange, 4),
      revenueGrowth: roundTo(revenueGrowth, 4),
      marginImpact: roundTo(marginImpact, 4),
      roeImpact: roundTo(roeImpact, 4),
    },
    shortTermSignal,
    longTermSignal,
    expectedPriceMove: roundTo(expectedPriceMove, 4),
    keyRisks,
  };
}

// ── 策略信号 ──

export function generateStrategySignals(event: MAEvent, impact: MAImpactAnalysis): MAStrategySignal[] {
  const signals: MAStrategySignal[] = [];

  // 公告后交易
  if (event.status === 'proposed') {
    const confidence = event.synergiesExpected ? 0.7 : 0.4;
    signals.push({
      eventId: event.id,
      signalType: 'post_announcement',
      direction: event.synergiesExpected && event.premium < 0.3 ? 'long' : 'neutral',
      confidence,
      entryTiming: '公告次日低开时介入',
      targetReturn: Math.abs(impact.expectedPriceMove),
      stopLoss: -0.08,
      holdingPeriod: '1-3个月',
      reasoning: event.synergiesExpected
        ? '并购具备协同效应，市场需要时间充分反映价值'
        : '观望为主，等待审批进展',
    });
  }

  // 审批博弈
  if (event.status === 'proposed' && !event.relatedParty) {
    signals.push({
      eventId: event.id,
      signalType: 'approval_play',
      direction: 'long',
      confidence: 0.5,
      entryTiming: '审批流程推进至证监会阶段时',
      targetReturn: 0.1,
      stopLoss: -0.05,
      holdingPeriod: '2-6个月',
      reasoning: '非关联交易审批通过概率较高',
    });
  }

  // 完成后交易
  if (event.status === 'approved') {
    signals.push({
      eventId: event.id,
      signalType: 'completion_play',
      direction: event.synergiesExpected ? 'long' : 'neutral',
      confidence: 0.6,
      entryTiming: '过户完成确认后',
      targetReturn: 0.08,
      stopLoss: -0.06,
      holdingPeriod: '3-12个月',
      reasoning: '关注整合后协同效应释放',
    });
  }

  return signals;
}

// ── 监管风险评估 ──

export function assessRegulatoryRisk(event: MAEvent): MARegulatoryRisk {
  let antitrustRisk = 0;
  if (event.transactionValue > 50) antitrustRisk += 0.3;
  if (event.transactionValue > 200) antitrustRisk += 0.2;
  if (event.maType === 'merger') antitrustRisk += 0.2;
  antitrustRisk = Math.min(1, antitrustRisk);

  let industryPolicyRisk = 0;
  const restrictedIndustries = ['房地产', '金融', '教育', '互联网'];
  if (restrictedIndustries.includes(event.targetIndustry)) {
    industryPolicyRisk = 0.5;
  }

  const approvalProbability = Math.max(0.1, 0.9 - antitrustRisk * 0.3 - industryPolicyRisk * 0.4);

  const regulatoryConcerns: string[] = [];
  if (antitrustRisk > 0.3) regulatoryConcerns.push('触发经营者集中审查');
  if (industryPolicyRisk > 0.3) regulatoryConcerns.push('涉及行业监管政策限制');
  if (event.relatedParty) regulatoryConcerns.push('关联交易需特别审议');

  let estimatedApprovalTime = '2-3个月';
  if (antitrustRisk > 0.5) estimatedApprovalTime = '4-6个月';
  if (event.transactionValue > 100) estimatedApprovalTime = '3-6个月';

  return {
    eventId: event.id,
    antitrustRisk: roundTo(antitrustRisk, 2),
    industryPolicyRisk: roundTo(industryPolicyRisk, 2),
    approvalProbability: roundTo(approvalProbability, 2),
    estimatedApprovalTime,
    regulatoryConcerns,
  };
}

// ── 组合分析 ──

export function analyzeMAPortfolio(events: MAEvent[]): MAPortfolioAnalysis {
  if (events.length === 0) {
    return {
      events: [],
      avgPremium: 0,
      avgSynergy: 0,
      successRate: 0,
      avgReturn: 0,
      sectorHeat: new Map(),
      topOpportunities: [],
    };
  }

  const avgPremium = events.reduce((a, e) => a + e.premium, 0) / events.length;

  const synergies = events.map(e => analyzeSynergies(e));
  const avgSynergy = synergies.reduce((a, s) => a + s.totalSynergy, 0) / synergies.length;

  const completed = events.filter(e => e.status === 'completed').length;
  const successRate = completed / events.length;

  // 行业热度
  const sectorHeat = new Map<string, number>();
  for (const e of events) {
    sectorHeat.set(e.targetIndustry, (sectorHeat.get(e.targetIndustry) || 0) + 1);
  }

  // 综合评分排序
  const scored = events.map((e, i) => {
    const synergy = synergies[i];
    let score = synergy.synergyScore;
    if (e.synergiesExpected) score += 10;
    if (!e.relatedParty) score += 10;
    if (e.premium < 0.2) score += 5;
    return { code: e.acquirerCode, name: e.acquirerName, score };
  }).sort((a, b) => b.score - a.score);

  return {
    events,
    avgPremium: roundTo(avgPremium, 4),
    avgSynergy: roundTo(avgSynergy, 2),
    successRate: roundTo(successRate, 4),
    avgReturn: 0.08,
    sectorHeat,
    topOpportunities: scored.slice(0, 10),
  };
}

// ── 完整分析流程 ──

export function runMAAnalysis(event: MAEvent) {
  const valuation = analyzeMAValuation(event);
  const synergies = analyzeSynergies(event);
  const impact = analyzeImpact(event, valuation);
  const signals = generateStrategySignals(event, impact);
  const regulatory = assessRegulatoryRisk(event);

  return {
    event,
    valuation,
    synergies,
    impact,
    signals,
    regulatory,
    summary: {
      overallRating: synergies.synergyScore > 70 ? 'positive' : synergies.synergyScore > 40 ? 'neutral' : 'negative',
      topSignal: signals[0] || null,
      keyConcerns: [...impact.keyRisks, ...regulatory.regulatoryConcerns],
    },
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
