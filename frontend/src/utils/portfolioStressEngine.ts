/**
 * 组合压力测试引擎
 * - 历史场景重演
 * - 假设场景
 * - 多资产联合压力
 * - 损失分布
 * - 恢复时间估计
 */
export interface PortfolioHolding {
  code: string;
  weight: number;
  returns: number[];
  beta: number;
}

export interface StressScenario {
  name: string;
  description: string;
  factorShocks: Record<string, number>; // 因子冲击
  marketReturn: number;
  volatilityMultiplier: number;
}

export interface StressTestResult {
  scenario: StressScenario;
  portfolioLoss: number;
  worstHoldings: Array<{ code: string; loss: number }>;
  varImpact: number;
  cvarImpact: number;
  estimatedRecoveryDays: number;
  liquidityImpact: number;
}

export interface PortfolioStressAnalysis {
  results: StressTestResult[];
  worstCase: StressTestResult;
  averageStressLoss: number;
  maxDrawdownUnderStress: number;
  diversificationBenefit: number;
  resilientScore: number; // 0-100
  recommendations: string[];
}

export function stressTestPortfolio(
  holdings: PortfolioHolding[],
  scenarios: StressScenario[]
): PortfolioStressAnalysis {
  if (holdings.length === 0 || scenarios.length === 0) throw new Error('输入数据不能为空');

  const results: StressTestResult[] = scenarios.map(scenario => {
    // 计算每只股票的损失
    const holdingLosses = holdings.map(h => {
      const marketImpact = h.beta * scenario.marketReturn;
      const idioShock = scenario.factorShocks[h.code] ?? 0;
      const totalReturn = marketImpact + idioShock;
      const loss = h.weight * totalReturn;
      return { code: h.code, loss, weight: h.weight };
    });

    const portfolioLoss = holdingLosses.reduce((s, h) => s + h.loss, 0);
    const worstHoldings = [...holdingLosses].sort((a, b) => a.loss - b.loss).slice(0, 5);

    // VaR/CVaR影响
    const baseVol = holdings.reduce((s, h) => {
      const vol = Math.sqrt(h.returns.reduce((ss, r) => ss + r * r, 0) / h.returns.length);
      return s + h.weight * vol;
    }, 0);
    const stressedVol = baseVol * scenario.volatilityMultiplier;
    const varImpact = -1.65 * stressedVol;
    const cvarImpact = varImpact * 1.3;

    // 恢复时间估计 (基于历史波动率)
    const avgDailyVol = stressedVol / Math.sqrt(252);
    const recoveryTarget = Math.abs(portfolioLoss);
    const estimatedRecoveryDays = avgDailyVol > 0
      ? Math.ceil(recoveryTarget / (avgDailyVol * 0.5))
      : 999;

    // 流动性冲击
    const illiquidHoldings = holdingLosses.filter(h => h.weight > 0.1);
    const liquidityImpact = illiquidHoldings.length / holdings.length * 0.3;

    return {
      scenario,
      portfolioLoss,
      worstHoldings,
      varImpact,
      cvarImpact,
      estimatedRecoveryDays,
      liquidityImpact,
    };
  });

  const worstCase = results.reduce((worst, r) => r.portfolioLoss < worst.portfolioLoss ? r : worst);
  const averageStressLoss = results.reduce((s, r) => s + r.portfolioLoss, 0) / results.length;
  const maxDrawdownUnderStress = worstCase.portfolioLoss;

  // 分散化收益
  const weightedLoss = holdings.reduce((s, h) => {
    const worstForHolding = scenarios.reduce((worst, sc) => {
      const loss = h.beta * sc.marketReturn + (sc.factorShocks[h.code] ?? 0);
      return Math.min(worst, loss);
    }, 0);
    return s + h.weight * worstForHolding;
  }, 0);
  const diversificationBenefit = weightedLoss - worstCase.portfolioLoss;

  // 韧性评分
  const resilientScore = Math.max(0, Math.min(100,
    100 + averageStressLoss * 100 - Math.abs(maxDrawdownUnderStress) * 50 + diversificationBenefit * 100
  ));

  const recommendations: string[] = [];
  if (Math.abs(averageStressLoss) > 0.1) recommendations.push('组合在压力下损失较大，考虑降低集中度');
  if (worstCase.liquidityImpact > 0.2) recommendations.push('增加高流动性资产配置');
  if (diversificationBenefit < 0.02) recommendations.push('分散化效果有限，考虑增加低相关资产');
  if (worstCase.estimatedRecoveryDays > 90) recommendations.push('恢复期过长，考虑增加防御性仓位');

  return { results, worstCase, averageStressLoss, maxDrawdownUnderStress, diversificationBenefit, resilientScore, recommendations };
}
