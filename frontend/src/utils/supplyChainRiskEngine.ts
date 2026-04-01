/**
 * 供应链风险引擎
 * 分析供应链依赖、集中度、替代性和韧性
 */

export interface SupplyNode {
  id: string;
  name: string;
  type: 'supplier' | 'customer' | 'peer';
  tier: number; // 供应链层级
  revenueShare: number; // 收入占比 %
  country: string;
  industry: string;
  isExclusive: boolean; // 是否独家供应
}

export interface SupplyChain {
  companyId: string;
  companyName: string;
  suppliers: SupplyNode[];
  customers: SupplyNode[];
  createdAt: string;
}

export interface ConcentrationRisk {
  companyId: string;
  supplierHHI: number; // 赫芬达尔指数
  customerHHI: number;
  geographicHHI: number;
  topSupplierShare: number; // 前5大供应商占比
  topCustomerShare: number;
  singleSourceRisk: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SupplyDisruption {
  nodeId: string;
  nodeName: string;
  disruptionType: 'natural_disaster' | 'geopolitical' | 'financial' | 'regulatory' | 'pandemic' | 'cyber';
  probability: number; // 0-1
  impact: number; // 0-100
  expectedLoss: number; // 预期损失金额
  mitigationOptions: string[];
  timeToRecover: number; // 天
}

export interface SupplyChainResilience {
  companyId: string;
  diversificationScore: number; // 0-100
  flexibilityScore: number;
  visibilityScore: number;
  redundancyScore: number;
  overallScore: number;
  recommendations: string[];
}

export class SupplyChainRiskEngine {
  /**
   * 计算集中度风险
   */
  calculateConcentrationRisk(chain: SupplyChain): ConcentrationRisk {
    // 供应商HHI
    const supplierShares = chain.suppliers.map(s => s.revenueShare);
    const supplierHHI = this.calculateHHI(supplierShares);

    // 客户HHI
    const customerShares = chain.customers.map(c => c.revenueShare);
    const customerHHI = this.calculateHHI(customerShares);

    // 地理集中度
    const countryShares = new Map<string, number>();
    for (const s of chain.suppliers) {
      countryShares.set(s.country, (countryShares.get(s.country) || 0) + s.revenueShare);
    }
    const geographicHHI = this.calculateHHI(Array.from(countryShares.values()));

    // 前5大占比
    const topSupplierShare = supplierShares.sort((a, b) => b - a).slice(0, 5)
      .reduce((a, b) => a + b, 0);
    const topCustomerShare = customerShares.sort((a, b) => b - a).slice(0, 5)
      .reduce((a, b) => a + b, 0);

    // 独家供应风险
    const exclusiveSuppliers = chain.suppliers.filter(s => s.isExclusive);
    const singleSourceRisk = exclusiveSuppliers.reduce((sum, s) => sum + s.revenueShare, 0);

    // 综合风险评级
    let riskLevel: ConcentrationRisk['riskLevel'] = 'low';
    const riskScore = (supplierHHI + customerHHI + geographicHHI) / 3 + singleSourceRisk;
    if (riskScore > 6000) riskLevel = 'critical';
    else if (riskScore > 4000) riskLevel = 'high';
    else if (riskScore > 2500) riskLevel = 'medium';

    return {
      companyId: chain.companyId,
      supplierHHI,
      customerHHI,
      geographicHHI,
      topSupplierShare,
      topCustomerShare,
      singleSourceRisk,
      riskLevel
    };
  }

  /**
   * HHI计算
   */
  private calculateHHI(shares: number[]): number {
    const total = shares.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    return shares.reduce((sum, s) => sum + Math.pow((s / total) * 100, 2), 0);
  }

  /**
   * 中断风险评估
   */
  assessDisruptionRisk(
    node: SupplyNode,
    externalFactors: { type: string; probability: number; region: string }[]
  ): SupplyDisruption[] {
    const disruptions: SupplyDisruption[] = [];

    for (const factor of externalFactors) {
      if (factor.region !== node.country && factor.region !== 'global') continue;

      const impact = node.revenueShare * (node.isExclusive ? 1.5 : 0.7);
      const probability = factor.probability * (node.isExclusive ? 1.3 : 1);
      
      const mitigationOptions: string[] = [];
      if (node.isExclusive) mitigationOptions.push('寻找替代供应商');
      if (impact > 20) mitigationOptions.push('建立安全库存');
      if (factor.type === 'geopolitical') mitigationOptions.push('多元化生产基地');
      mitigationOptions.push('签订长期供应合同');

      disruptions.push({
        nodeId: node.id,
        nodeName: node.name,
        disruptionType: factor.type as SupplyDisruption['disruptionType'],
        probability: Math.min(1, probability),
        impact: Math.min(100, impact),
        expectedLoss: impact * probability * 1000000,
        mitigationOptions,
        timeToRecover: node.isExclusive ? 90 : 30
      });
    }

    return disruptions;
  }

  /**
   * 供应链韧性评分
   */
  calculateResilience(chain: SupplyChain): SupplyChainResilience {
    // 多样化评分
    const supplierCountries = new Set(chain.suppliers.map(s => s.country));
    const supplierIndustries = new Set(chain.suppliers.map(s => s.industry));
    const diversificationScore = Math.min(100, 
      (supplierCountries.size * 15) + (supplierIndustries.size * 10) + 
      (chain.suppliers.length > 5 ? 20 : chain.suppliers.length * 4)
    );

    // 灵活性评分
    const exclusiveRatio = chain.suppliers.filter(s => s.isExclusive).length / Math.max(1, chain.suppliers.length);
    const flexibilityScore = Math.max(0, 100 - exclusiveRatio * 100);

    // 可见性评分 (假设基于层级深度)
    const maxTier = Math.max(...chain.suppliers.map(s => s.tier), 1);
    const visibilityScore = Math.max(0, 100 - maxTier * 20);

    // 冗余评分
    const tierCounts = new Map<number, number>();
    for (const s of chain.suppliers) {
      tierCounts.set(s.tier, (tierCounts.get(s.tier) || 0) + 1);
    }
    const avgRedundancy = Array.from(tierCounts.values()).reduce((a, b) => a + b, 0) / Math.max(1, tierCounts.size);
    const redundancyScore = Math.min(100, avgRedundancy * 25);

    const overallScore = (diversificationScore + flexibilityScore + visibilityScore + redundancyScore) / 4;

    const recommendations: string[] = [];
    if (diversificationScore < 50) recommendations.push('增加供应商地理和行业多样性');
    if (flexibilityScore < 50) recommendations.push('减少独家供应依赖');
    if (visibilityScore < 50) recommendations.push('加强对二级、三级供应商的监控');
    if (redundancyScore < 50) recommendations.push('为关键零部件建立备选供应商');

    return {
      companyId: chain.companyId,
      diversificationScore,
      flexibilityScore,
      visibilityScore,
      redundancyScore,
      overallScore,
      recommendations
    };
  }

  /**
   * 供应链压力测试
   */
  stressTest(
    chain: SupplyChain,
    scenarios: { name: string; affectedNodes: string[]; severity: number }[]
  ): { scenario: string; revenueImpact: number; recoveryDays: number; mitigated: boolean }[] {
    return scenarios.map(scenario => {
      const affectedSuppliers = chain.suppliers.filter(s => scenario.affectedNodes.includes(s.id));
      const totalShare = affectedSuppliers.reduce((sum, s) => sum + s.revenueShare, 0);
      const revenueImpact = totalShare * scenario.severity / 100;
      const maxTier = Math.max(...affectedSuppliers.map(s => s.tier), 1);
      const recoveryDays = maxTier * 30 * scenario.severity / 100;

      return {
        scenario: scenario.name,
        revenueImpact,
        recoveryDays,
        mitigated: revenueImpact < 5
      };
    });
  }

  /**
   * 供应商替代分析
   */
  findAlternatives(
    node: SupplyNode,
    allSuppliers: SupplyNode[]
  ): { supplier: SupplyNode; matchScore: number }[] {
    return allSuppliers
      .filter(s => s.id !== node.id && s.type === node.type)
      .map(s => {
        let matchScore = 0;
        if (s.industry === node.industry) matchScore += 40;
        if (s.country === node.country) matchScore += 20;
        if (s.tier === node.tier) matchScore += 20;
        if (!s.isExclusive) matchScore += 10;
        matchScore += Math.min(10, s.revenueShare);

        return { supplier: s, matchScore };
      })
      .filter(a => a.matchScore > 30)
      .sort((a, b) => b.matchScore - a.matchScore);
  }
}
