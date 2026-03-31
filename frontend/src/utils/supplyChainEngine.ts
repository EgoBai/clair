/**
 * 供应链风险分析引擎
 * - 供应商集中度
 * - 应付账款周转
 * - 存货周转
 * - 上下游议价能力
 * - 供应链韧性评分
 */
export interface SupplyChainData {
  suppliers: { name: string; share: number }[]; // 供应商采购占比
  customers: { name: string; share: number }[]; // 客户收入占比
  totalPurchases: number; // 总采购额
  totalRevenue: number; // 总收入
  inventory: number; // 存货
  cogs: number; // 营业成本
  accountsPayable: number; // 应付账款
  accountsReceivable: number; // 应收账款
  inventoryTurnover: number; // 存货周转次数
  payableTurnover: number; // 应付账款周转次数
  industryAvgInventoryTurnover: number; // 行业平均存货周转
  geopoliticalRisk: number; // 0-1 地缘风险
  singleSourceParts: number; // 单一来源零件数
  totalParts: number; // 总零件数
}

export interface SupplyChainResult {
  supplierConcentration: number; // HHI指数
  customerConcentration: number; // HHI指数
  inventoryHealth: 'excellent' | 'good' | 'warning' | 'critical';
  bargainingPower: 'strong' | 'moderate' | 'weak';
  supplyChainResilience: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  supplyDays: number; // 供应天数
  collectionDays: number; // 回款天数
  keyRisks: string[];
  singleSourceRisk: number;
  recommendations: string[];
}

export function analyzeSupplyChain(data: SupplyChainData): SupplyChainResult {
  const keyRisks: string[] = [];

  // 供应商HHI
  const supplierHHI = data.suppliers.reduce((s, p) => s + (p.share) ** 2, 0);
  const customerHHI = data.customers.reduce((s, c) => s + (c.share) ** 2, 0);

  if (supplierHHI > 0.25) keyRisks.push('供应商过于集中');
  if (customerHHI > 0.25) keyRisks.push('客户过于集中');

  // 存货健康度
  let inventoryHealth: SupplyChainResult['inventoryHealth'];
  const turnoverRatio = data.inventoryTurnover / Math.max(data.industryAvgInventoryTurnover, 0.01);
  if (turnoverRatio > 1.2) inventoryHealth = 'excellent';
  else if (turnoverRatio > 0.8) inventoryHealth = 'good';
  else if (turnoverRatio > 0.5) { inventoryHealth = 'warning'; keyRisks.push('存货周转低于行业平均'); }
  else { inventoryHealth = 'critical'; keyRisks.push('存货周转严重偏低'); }

  // 议价能力
  let bargainingPower: SupplyChainResult['bargainingPower'];
  const payReceivRatio = data.accountsPayable / Math.max(data.accountsReceivable, 1);
  if (payReceivRatio > 1.2 && supplierHHI < 0.15) bargainingPower = 'strong';
  else if (payReceivRatio > 0.8) bargainingPower = 'moderate';
  else { bargainingPower = 'weak'; keyRisks.push('议价能力偏弱'); }

  // 供应天数 & 回款天数
  const supplyDays = Math.round(data.accountsPayable / Math.max(data.totalPurchases, 1) * 365);
  const collectionDays = Math.round(data.accountsReceivable / Math.max(data.totalRevenue, 1) * 365);

  if (supplyDays < 30) keyRisks.push('账期过短');
  if (collectionDays > 90) keyRisks.push('回款周期过长');

  // 单一来源风险
  const singleSourceRisk = data.totalParts > 0 ? data.singleSourceParts / data.totalParts : 0;
  if (singleSourceRisk > 0.2) keyRisks.push(`${(singleSourceRisk * 100).toFixed(0)}%零件依赖单一来源`);

  // 韧性评分
  let resilience = 100;
  resilience -= supplierHHI * 50;
  resilience -= customerHHI * 50;
  if (inventoryHealth === 'critical') resilience -= 25;
  else if (inventoryHealth === 'warning') resilience -= 15;
  if (bargainingPower === 'weak') resilience -= 15;
  resilience -= singleSourceRisk * 30;
  resilience -= data.geopoliticalRisk * 20;
  resilience = Math.max(0, Math.min(100, Math.round(resilience)));

  let riskLevel: SupplyChainResult['riskLevel'];
  if (resilience >= 75) riskLevel = 'low';
  else if (resilience >= 55) riskLevel = 'medium';
  else if (resilience >= 35) riskLevel = 'high';
  else riskLevel = 'critical';

  const recommendations: string[] = [];
  if (supplierHHI > 0.2) recommendations.push('建议拓展更多供应商以分散风险');
  if (customerHHI > 0.2) recommendations.push('建议降低客户集中度');
  if (singleSourceRisk > 0.15) recommendations.push('建议关键零件建立备选供应商');
  if (collectionDays > 60) recommendations.push('建议加强应收账款管理');

  return {
    supplierConcentration: Math.round(supplierHHI * 10000) / 10000,
    customerConcentration: Math.round(customerHHI * 10000) / 10000,
    inventoryHealth,
    bargainingPower,
    supplyChainResilience: resilience,
    riskLevel,
    supplyDays,
    collectionDays,
    keyRisks,
    singleSourceRisk: Math.round(singleSourceRisk * 10000) / 10000,
    recommendations,
  };
}
