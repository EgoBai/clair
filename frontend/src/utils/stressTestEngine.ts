/**
 * 压力测试引擎 - 历史情景/假设情景/蒙特卡洛压力测试
 */

export interface StressScenario {
  id: string;
  name: string;
  type: 'historical' | 'hypothetical' | 'monte_carlo';
  description: string;
  marketShock: number; // 市场整体冲击 (%)
  sectorShocks?: Record<string, number>; // 行业冲击
  factorShocks?: Record<string, number>; // 因子冲击
  volatilityMultiplier?: number; // 波动率乘数
  correlationShift?: number; // 相关性变化
}

export interface PortfolioPosition {
  ticker: string;
  sector: string;
  weight: number;
  beta: number;
  currentPrice: number;
  shares: number;
}

export interface StressTestResult {
  scenario: StressScenario;
  portfolioImpact: number; // 组合冲击 (%)
  positionImpacts: Array<{
    ticker: string;
    impact: number;
    impactAmount: number;
    newPrice: number;
  }>;
  var95: number;
  var99: number;
  expectedShortfall: number;
  maxDrawdown: number;
  recoveryDays?: number;
}

export interface MultiScenarioResult {
  results: StressTestResult[];
  worstCase: StressTestResult;
  bestCase: StressTestResult;
  averageImpact: number;
  tailRisk: number; // 尾部风险
  recommendations: string[];
}

const HISTORICAL_SCENARIOS: StressScenario[] = [
  {
    id: 'gfc_2008',
    name: '2008金融危机',
    type: 'historical',
    description: '次贷危机引发的全球金融危机',
    marketShock: -56,
    sectorShocks: { '金融': -75, '地产': -65, '能源': -55, '消费': -40, '医药': -25 },
    factorShocks: { 'momentum': -30, 'value': -45, 'size': 20 },
    volatilityMultiplier: 3.5,
    correlationShift: 0.3,
  },
  {
    id: 'covid_2020',
    name: '2020新冠疫情',
    type: 'historical',
    description: 'COVID-19疫情冲击',
    marketShock: -33,
    sectorShocks: { '旅游': -60, '航空': -55, '消费': -35, '医药': 15, '科技': -10 },
    volatilityMultiplier: 2.8,
    correlationShift: 0.25,
  },
  {
    id: 'rate_hike',
    name: '激进加息周期',
    type: 'hypothetical',
    description: '美联储激进加息300bp',
    marketShock: -20,
    sectorShocks: { '地产': -40, '银行': -15, '科技': -35, '公用': -25, '消费': -10 },
    factorShocks: { 'growth': -30, 'value': 10, 'duration': -25 },
    volatilityMultiplier: 1.8,
  },
  {
    id: 'trade_war',
    name: '贸易战升级',
    type: 'hypothetical',
    description: '中美贸易战全面升级',
    marketShock: -25,
    sectorShocks: { '出口': -45, '科技': -35, '农业': -20, '军工': 10, '内需': -10 },
    volatilityMultiplier: 2.0,
  },
  {
    id: 'liquidity_crisis',
    name: '流动性危机',
    type: 'hypothetical',
    description: '市场流动性骤然收紧',
    marketShock: -30,
    sectorShocks: { '小盘': -50, '金融': -35, '地产': -40, '大盘蓝筹': -15 },
    factorShocks: { 'liquidity': -60, 'size': 30 },
    volatilityMultiplier: 2.5,
    correlationShift: 0.35,
  },
];

/**
 * 运行单个压力测试
 */
export function runStressTest(
  positions: PortfolioPosition[],
  scenario: StressScenario,
): StressTestResult {
  const totalValue = positions.reduce((s, p) => s + p.shares * p.currentPrice, 0);

  const positionImpacts = positions.map(pos => {
    let shockPct = scenario.marketShock;

    // 行业冲击
    if (scenario.sectorShocks && scenario.sectorShocks[pos.sector]) {
      shockPct = scenario.sectorShocks[pos.sector];
    }

    // Beta调整
    const adjustedShock = shockPct * (1 + (pos.beta - 1) * 0.3);

    const newPrice = pos.currentPrice * (1 + adjustedShock / 100);
    const impactAmount = (newPrice - pos.currentPrice) * pos.shares;

    return {
      ticker: pos.ticker,
      impact: adjustedShock,
      impactAmount,
      newPrice: Math.max(0, newPrice),
    };
  });

  const totalImpactAmount = positionImpacts.reduce((s, p) => s + p.impactAmount, 0);
  const portfolioImpact = (totalImpactAmount / totalValue) * 100;

  // VaR估算 (基于冲击分布)
  const volMultiplier = scenario.volatilityMultiplier || 1;
  const dailyVol = Math.abs(portfolioImpact) / 2.58; // 假设冲击为2.58个标准差事件
  const var95 = -(dailyVol * 1.645);
  const var99 = -(dailyVol * 2.326);
  const expectedShortfall = var99 * 1.3; // ES约为VaR的1.3倍

  // 最大回撤估算
  const maxDrawdown = portfolioImpact * 1.15; // 压力期回撤通常比冲击大15%

  // 恢复天数估算
  const recoveryDays = Math.abs(portfolioImpact) > 20
    ? Math.round(Math.abs(portfolioImpact) * 5)
    : Math.round(Math.abs(portfolioImpact) * 3);

  return {
    scenario,
    portfolioImpact: Math.round(portfolioImpact * 100) / 100,
    positionImpacts,
    var95: Math.round(var95 * 100) / 100,
    var99: Math.round(var99 * 100) / 100,
    expectedShortfall: Math.round(expectedShortfall * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    recoveryDays,
  };
}

/**
 * 多情景压力测试
 */
export function runMultiScenarioStressTest(
  positions: PortfolioPosition[],
  scenarios?: StressScenario[],
): MultiScenarioResult {
  const scenList = scenarios || HISTORICAL_SCENARIOS;
  const results = scenList.map(s => runStressTest(positions, s));

  const sorted = [...results].sort((a, b) => a.portfolioImpact - b.portfolioImpact);
  const worstCase = sorted[0];
  const bestCase = sorted[sorted.length - 1];
  const averageImpact = results.reduce((s, r) => s + r.portfolioImpact, 0) / results.length;

  // 尾部风险 = 最差情景冲击 * 1.5
  const tailRisk = worstCase.portfolioImpact * 1.5;

  // 生成建议
  const recommendations: string[] = [];
  if (worstCase.portfolioImpact < -30) {
    recommendations.push('组合在极端情景下损失超过30%，建议增加防御性资产');
  }
  if (worstCase.maxDrawdown < -40) {
    recommendations.push('最大回撤超过40%，建议设置止损机制');
  }

  // 检查行业集中度
  const sectorWeights: Record<string, number> = {};
  positions.forEach(p => {
    sectorWeights[p.sector] = (sectorWeights[p.sector] || 0) + p.weight;
  });
  const maxSectorWeight = Math.max(...Object.values(sectorWeights));
  if (maxSectorWeight > 40) {
    recommendations.push(`单一行业权重${maxSectorWeight.toFixed(1)}%过高，建议分散配置`);
  }

  // 检查高Beta暴露
  const avgBeta = positions.reduce((s, p) => s + p.beta * p.weight, 0) / 100;
  if (avgBeta > 1.3) {
    recommendations.push(`组合Beta为${avgBeta.toFixed(2)}，在市场下行时风险较大`);
  }

  if (recommendations.length === 0) {
    recommendations.push('组合压力测试表现良好，风险可控');
  }

  return {
    results,
    worstCase,
    bestCase,
    averageImpact: Math.round(averageImpact * 100) / 100,
    tailRisk: Math.round(tailRisk * 100) / 100,
    recommendations,
  };
}

/**
 * 获取预设情景列表
 */
export function getPredefinedScenarios(): StressScenario[] {
  return [...HISTORICAL_SCENARIOS];
}

/**
 * 创建自定义情景
 */
export function createCustomScenario(
  name: string,
  marketShock: number,
  options: Partial<StressScenario> = {},
): StressScenario {
  return {
    id: `custom_${Date.now()}`,
    name,
    type: 'hypothetical',
    description: options.description || `自定义情景: ${name}`,
    marketShock,
    sectorShocks: options.sectorShocks,
    factorShocks: options.factorShocks,
    volatilityMultiplier: options.volatilityMultiplier || 1.5,
    correlationShift: options.correlationShift,
  };
}

/**
 * 敏感性分析 - 各持仓对组合风险的贡献
 */
export function sensitivityAnalysis(
  positions: PortfolioPosition[],
  scenario: StressScenario,
): Array<{ ticker: string; riskContribution: number; marginalVar: number; componentVar: number }> {
  const totalValue = positions.reduce((s, p) => s + p.shares * p.currentPrice, 0);

  return positions.map(pos => {
    const posValue = pos.shares * pos.currentPrice;
    const weight = posValue / totalValue;

    // 风险贡献 = 权重 * Beta * 波动率乘数
    let shockPct = scenario.marketShock;
    if (scenario.sectorShocks && scenario.sectorShocks[pos.sector]) {
      shockPct = scenario.sectorShocks[pos.sector];
    }

    const riskContribution = weight * pos.beta * Math.abs(shockPct) / 100;
    const marginalVar = pos.beta * Math.abs(shockPct) / 100 * 1.645;
    const componentVar = riskContribution * 1.645;

    return {
      ticker: pos.ticker,
      riskContribution: Math.round(riskContribution * 10000) / 10000,
      marginalVar: Math.round(marginalVar * 10000) / 10000,
      componentVar: Math.round(componentVar * 10000) / 10000,
    };
  }).sort((a, b) => b.riskContribution - a.riskContribution);
}
