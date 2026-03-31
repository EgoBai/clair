/**
 * 组合压力测试引擎 v2
 * 更细粒度的压力测试: 场景分析 + 敏感性分析
 */

// ==================== 类型定义 ====================
export interface StressScenario {
  name: string;
  description: string;
  shocks: Map<string, number>; // asset -> return shock
  correlationShift: number; // 相关性变化
  volatilityMultiplier: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  currentPrice: number;
  sector: string;
  beta: number;
}

export interface StressTestResult {
  scenario: string;
  portfolioPnl: number;
  portfolioPnlPercent: number;
  positionPnls: Map<string, number>;
  maxDrawdown: number;
  marginCallRisk: number; // 0-1
  liquidationRisk: number;
}

export interface SensitivityAnalysis {
  factor: string;
  impact1bps: number; // 因子变动1bp的影响
  impact100bps: number;
  impact500bps: number;
  elasticity: number;
  nonlinearEffect: number; // 非线性效应
}

export interface ReverseStressTest {
  targetLoss: number;
  requiredShock: Map<string, number>;
  probability: number;
  scenario: string;
}

export interface PortfolioGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  portfolioBeta: number;
  concentrationRisk: number;
}

// ==================== 核心引擎 ====================
export class StressTestEngineV2 {
  /**
   * 预定义压力场景
   */
  static getPredefinedScenarios(): StressScenario[] {
    return [
      {
        name: '市场崩盘',
        description: '股票市场下跌30%',
        shocks: new Map([['equity', -0.30], ['bond', 0.05], ['commodity', -0.20]]),
        correlationShift: 0.3,
        volatilityMultiplier: 2.5
      },
      {
        name: '利率飙升',
        description: '利率上升200bp',
        shocks: new Map([['equity', -0.10], ['bond', -0.15], ['commodity', -0.05]]),
        correlationShift: 0.1,
        volatilityMultiplier: 1.5
      },
      {
        name: '流动性危机',
        description: '市场流动性枯竭',
        shocks: new Map([['equity', -0.20], ['bond', 0.02], ['commodity', -0.15]]),
        correlationShift: 0.4,
        volatilityMultiplier: 3.0
      },
      {
        name: '地缘政治冲击',
        description: '重大地缘事件',
        shocks: new Map([['equity', -0.15], ['bond', 0.08], ['commodity', 0.25]]),
        correlationShift: 0.2,
        volatilityMultiplier: 2.0
      },
      {
        name: '通胀超预期',
        description: 'CPI大幅超预期',
        shocks: new Map([['equity', -0.08], ['bond', -0.12], ['commodity', 0.15]]),
        correlationShift: 0.15,
        volatilityMultiplier: 1.8
      },
      {
        name: '温和调整',
        description: '市场正常回调5-10%',
        shocks: new Map([['equity', -0.08], ['bond', 0.01], ['commodity', -0.03]]),
        correlationShift: 0.05,
        volatilityMultiplier: 1.2
      }
    ];
  }

  /**
   * 执行压力测试
   */
  runStressTest(
    positions: Position[],
    scenario: StressScenario,
    sectorMapping: Map<string, string> // sector -> shock category
  ): StressTestResult {
    const positionPnls = new Map<string, number>();
    let totalValue = 0;
    let totalPnl = 0;

    for (const pos of positions) {
      const value = pos.quantity * pos.currentPrice;
      totalValue += value;

      // 找到对应的冲击
      const shockCategory = sectorMapping.get(pos.sector) || 'equity';
      const shock = scenario.shocks.get(shockCategory) || scenario.shocks.get('equity') || -0.1;

      // Beta调整
      const adjustedShock = shock * pos.beta;
      const pnl = value * adjustedShock;
      positionPnls.set(pos.symbol, pnl);
      totalPnl += pnl;
    }

    const pnlPercent = totalValue > 0 ? (totalPnl / totalValue) * 100 : 0;

    // 最大回撤估算
    const maxDrawdown = Math.abs(Math.min(0, pnlPercent));

    // 保证金追缴风险
    const marginCallRisk = Math.min(1, Math.max(0, (Math.abs(pnlPercent) - 20) / 30));

    // 平仓风险
    const liquidationRisk = Math.min(1, Math.max(0, (Math.abs(pnlPercent) - 40) / 30));

    return {
      scenario: scenario.name,
      portfolioPnl: Math.round(totalPnl * 100) / 100,
      portfolioPnlPercent: Math.round(pnlPercent * 100) / 100,
      positionPnls,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      marginCallRisk: Math.round(marginCallRisk * 10000) / 10000,
      liquidationRisk: Math.round(liquidationRisk * 10000) / 10000
    };
  }

  /**
   * 敏感性分析
   */
  analyzeSensitivity(
    positions: Position[],
    factor: string,
    factorBeta: Map<string, number> // symbol -> beta to factor
  ): SensitivityAnalysis {
    let totalValue = 0;
    let weightedBeta = 0;

    for (const pos of positions) {
      const value = pos.quantity * pos.currentPrice;
      totalValue += value;
      const beta = factorBeta.get(pos.symbol) || pos.beta;
      weightedBeta += value * beta;
    }

    const portfolioBeta = totalValue > 0 ? weightedBeta / totalValue : 0;

    const impact1bps = totalValue * portfolioBeta * 0.0001;
    const impact100bps = totalValue * portfolioBeta * 0.01;
    const impact500bps = totalValue * portfolioBeta * 0.05;

    // 非线性效应 (Gamma): 大幅变动时的二阶效应
    const nonlinearEffect = totalValue * portfolioBeta * 0.05 * 0.05 * 0.5; // 简化Gamma

    return {
      factor,
      impact1bps: Math.round(impact1bps * 100) / 100,
      impact100bps: Math.round(impact100bps * 100) / 100,
      impact500bps: Math.round(impact500bps * 100) / 100,
      elasticity: Math.round(portfolioBeta * 10000) / 10000,
      nonlinearEffect: Math.round(nonlinearEffect * 100) / 100
    };
  }

  /**
   * 反向压力测试
   */
  reverseStressTest(
    positions: Position[],
    targetLossPercent: number,
    sectorMapping: Map<string, string>
  ): ReverseStressTest {
    const totalValue = positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
    const targetLoss = totalValue * targetLossPercent / 100;

    // 计算需要的均匀冲击
    let totalBeta = 0;
    for (const pos of positions) {
      totalBeta += (pos.quantity * pos.currentPrice) * pos.beta;
    }
    const avgBeta = totalValue > 0 ? totalBeta / totalValue : 1;
    const requiredEquityShock = avgBeta !== 0 ? -targetLossPercent / 100 / avgBeta : 0;

    const requiredShock = new Map<string, number>();
    requiredShock.set('equity', requiredEquityShock);
    requiredShock.set('bond', requiredEquityShock * 0.3);
    requiredShock.set('commodity', requiredEquityShock * 0.7);

    // 估算概率 (基于历史分布假设)
    const shockMagnitude = Math.abs(requiredEquityShock);
    let probability: number;
    if (shockMagnitude < 0.05) probability = 0.3;
    else if (shockMagnitude < 0.1) probability = 0.1;
    else if (shockMagnitude < 0.2) probability = 0.03;
    else if (shockMagnitude < 0.3) probability = 0.01;
    else probability = 0.001;

    const scenario = `市场需下跌${(shockMagnitude * 100).toFixed(1)}%才能达到${targetLossPercent}%的组合损失`;

    return {
      targetLoss: Math.round(targetLoss * 100) / 100,
      requiredShock,
      probability: Math.round(probability * 10000) / 10000,
      scenario
    };
  }

  /**
   * 组合Greeks分析
   */
  calculatePortfolioGreeks(positions: Position[]): PortfolioGreeks {
    let totalValue = 0;
    let totalDelta = 0;
    let totalBeta = 0;
    const sectorValues = new Map<string, number>();

    for (const pos of positions) {
      const value = pos.quantity * pos.currentPrice;
      totalValue += value;
      totalDelta += value; // 股票Delta=1
      totalBeta += value * pos.beta;

      const sectorVal = sectorValues.get(pos.sector) || 0;
      sectorValues.set(pos.sector, sectorVal + value);
    }

    const portfolioBeta = totalValue > 0 ? totalBeta / totalValue : 0;

    // 集中度风险: 最大单一sector占比
    let maxSectorPct = 0;
    for (const [, value] of sectorValues) {
      const pct = totalValue > 0 ? value / totalValue : 0;
      if (pct > maxSectorPct) maxSectorPct = pct;
    }
    const concentrationRisk = maxSectorPct;

    return {
      delta: Math.round(totalDelta * 100) / 100,
      gamma: 0, // 股票Gamma=0
      vega: 0,  // 股票Vega=0
      theta: 0, // 股票Theta=0
      rho: 0,
      portfolioBeta: Math.round(portfolioBeta * 10000) / 10000,
      concentrationRisk: Math.round(concentrationRisk * 10000) / 10000
    };
  }

  /**
   * 批量压力测试
   */
  runBatchStressTest(
    positions: Position[],
    sectorMapping: Map<string, string>
  ): StressTestResult[] {
    const scenarios = StressTestEngineV2.getPredefinedScenarios();
    return scenarios.map(s => this.runStressTest(positions, s, sectorMapping));
  }
}

export default StressTestEngineV2;
