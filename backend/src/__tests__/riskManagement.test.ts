/**
 * 影子测试迁移 27b：风险度量 / 仓位管理
 *
 * 本文件原先内联抄了一份风险指标实现，断言的是副本。现改为直接 import 生产实现，
 * 断言绑定真实行为；所有数值夹具均为确定性常量。
 *
 * 生产真源（行号以当前仓库为准）：
 * - frontend/src/utils/riskManagementEngine.ts
 *     calculatePortfolioRisk(...) L64-122：总市值、历史法 VaR/CVaR（内部 calculateVaR L261-279）、
 *     复利口径回撤（内部 calculateDrawdown L281-297）；calculateStopLoss(...) L127-148。
 * - frontend/src/utils/globalCorrelationEngine.ts calculateMaxDrawdown L334-353：
 *     返回 { maxDrawdown, peak: 下标, trough: 下标 }。
 * - backend/src/services/drawdownProtectionEngine.ts computeDrawdown L37-111 / calmarRatio L113-121：
 *     零回撤时 calmarRatio 返回 null。
 * - frontend/src/utils/positionSizingEngine.ts PositionSizingEngine.kellySize L37-54 /
 *     riskBudgetSize L81-89。
 * - frontend/src/utils/portfolioRiskBudgetEngine.ts buildCovarianceMatrix L41-55 /
 *     portfolioRisk L77-82 / riskContributionDecomposition L106-126。
 * - frontend/src/utils/riskScenarioEngine.ts runStressTest L61-96：入参为权重，输出 portfolioImpact。
 * - frontend/src/utils/monteCarloEngine.ts simulateGBMPaths L70-120：randomSeed 走确定性 RNG。
 * - frontend/src/utils/trendFollowingEngine.ts calculateStopLossTakeProfit L298-328：ATR 法 2x/3x。
 *
 * 与批次 11 的分工：riskMetricsEngine.test.ts 已绑定 portfolioRiskBudgetEngine 的参数法 VaR/CVaR 与
 * backtestPerformanceAnalyzer.calculateCalmarRatio（零回撤 Infinity）；本文件改用 riskManagementEngine 的
 * 历史法 VaR/CVaR 与 backend drawdownProtectionEngine 的 calmarRatio（零回撤 null），避免重复覆盖。
 *
 * 旧断言订正（旧内联 helper -> 生产口径）：
 * 1. VaR：旧 helper 直接取收益率分位、未乘组合市值；生产按 totalValue 折算，var95=1200、var99=2000。
 * 2. CVaR：旧 helper 只取 cutoff+1 单个尾点；生产取 var95Idx+1 个尾部样本均值，cvar95=1600。
 * 3. 最大回撤：旧 helper 只返回分数；生产 calculateMaxDrawdown 还返回 peak/trough 下标。
 * 4. Calmar：旧零回撤期望 0；backend 生产返回 null（drawdownProtectionEngine.ts:113-121）。
 * 5. Kelly：旧 helper 把 fKelly 夹到 [0,1]；生产保留负值 -0.4，仅 halfKelly 取 max(0,...)。
 * 6. 止损 ATR：旧 ATR 法以 entry 为基准；生产用 currentPrice - atr*value（riskManagementEngine.ts:127-148）。
 * 7. 止盈：旧 entry+(entry-stop)*3=130；生产 ATR 法 entry+3*atr=115（trendFollowingEngine.ts:298-328）。
 * 8. 仓位：旧仅断言 >0；生产可精确断言 400 股且为整百（positionSizingEngine.ts:81-89）。
 * 9. 组合波动：旧手写 w-sigma 相关性公式；生产走 buildCovarianceMatrix + portfolioRisk，sqrt(0.0325)。
 * 10. 压力测试：旧以金额返回 loss=-25000；生产 runStressTest 入参为权重、返回 portfolioImpact=-0.25
 *     （riskScenarioEngine.ts:61-96），单位订正为组合权重比例。
 * 11. 风险预算：旧 w_i*sigma_i 归一；生产 riskContributionDecomposition 用协方差 MRC/RC（pct 30.77/69.23）。
 * 12. 蒙特卡洛：旧 helper 用不可复现随机源；生产 randomSeed 固定 RNG，改为断言确定性与可复现性。
 *
 * 未迁移：无。calculateVaR / calculateDrawdown 未单独 export，但已通过 calculatePortfolioRisk 公共出口
 * 绑定其行为，故不保留内联副本。
 */

import { describe, it, expect } from 'vitest';

import {
  calculatePortfolioRisk,
  calculateStopLoss,
} from '../../../frontend/src/utils/riskManagementEngine';
import { calculateMaxDrawdown } from '../../../frontend/src/utils/globalCorrelationEngine';
import { computeDrawdown, calmarRatio } from '../services/drawdownProtectionEngine';
import { PositionSizingEngine } from '../../../frontend/src/utils/positionSizingEngine';
import {
  buildCovarianceMatrix,
  portfolioRisk,
  riskContributionDecomposition,
} from '../../../frontend/src/utils/portfolioRiskBudgetEngine';
import { runStressTest } from '../../../frontend/src/utils/riskScenarioEngine';
import { simulateGBMPaths } from '../../../frontend/src/utils/monteCarloEngine';
import { calculateStopLossTakeProfit } from '../../../frontend/src/utils/trendFollowingEngine';

// 确定性夹具：1000 股、现价 20 -> 组合市值 20000；18 个正收益 + 2 个早期负收益。
const POSITION = {
  symbol: 'A',
  quantity: 1000,
  avgCost: 10,
  currentPrice: 20,
  sector: 'tech',
};

const MARKET_RETURNS = Array.from({ length: 20 }, (_, i) => 0.001 * (i - 5));

const PORTFOLIO_RETURNS = [
  -0.1,
  -0.06,
  ...Array.from({ length: 18 }, (_, i) => 0.002 * (i + 1)),
];

const EQUITY = [
  { date: '2024-01-01', nav: 100 },
  { date: '2024-01-02', nav: 120 },
  { date: '2024-01-03', nav: 108 },
];

const ASSETS = [
  { name: 'A', weight: 0.5, volatility: 0.2, expectedReturn: 0.1, beta: 1 },
  { name: 'B', weight: 0.5, volatility: 0.3, expectedReturn: 0.12, beta: 1.2 },
];

const riskOf = (portfolioReturns: number[], marketReturns: number[] = []) =>
  calculatePortfolioRisk([POSITION], marketReturns, portfolioReturns);

describe('风险度量 - 历史法 VaR / CVaR（calculatePortfolioRisk）', () => {
  it('按组合市值折算 95%/99% 历史 VaR，并给出复利口径最大回撤', () => {
    const risk = riskOf(PORTFOLIO_RETURNS, MARKET_RETURNS);

    expect(risk.totalValue).toBe(20000);
    expect(risk.var95).toBeCloseTo(1200, 10);
    expect(risk.var99).toBeCloseTo(2000, 10);
    expect(risk.maxDrawdown).toBeCloseTo(0.154, 12);
  });

  it('全部为正收益时历史 VaR 为负（预期盈利不构成损失）', () => {
    const risk = riskOf([0.01, 0.02, 0.03]);

    // 旧断言只要求 <= 0.01；生产按分位数取到 +1%，乘市值后为 -200。
    expect(risk.var95).toBeCloseTo(-200, 10);
    expect(risk.var95).toBeLessThan(0);
  });

  it('收益样本不足 2 条时 VaR / CVaR 归零', () => {
    const risk = riskOf([]);

    expect(risk.var95).toBe(0);
    expect(risk.var99).toBe(0);
    expect(risk.cvar95).toBe(0);
  });

  it('CVaR 取尾部样本均值，严格大于同分位 VaR', () => {
    const risk = riskOf(PORTFOLIO_RETURNS, MARKET_RETURNS);

    expect(risk.cvar95).toBeCloseTo(1600, 10);
    expect(risk.cvar95).toBeGreaterThan(risk.var95);
  });

  it('全正收益时 CVaR 同样为负值', () => {
    const risk = riskOf([0.01, 0.02, 0.03]);

    expect(risk.cvar95).toBeCloseTo(-200, 10);
  });
});

describe('最大回撤 - calculateMaxDrawdown', () => {
  it('返回回撤比例以及 peak/trough 下标', () => {
    expect(calculateMaxDrawdown([100, 120, 110, 90, 95, 130])).toEqual({
      maxDrawdown: 0.25,
      peak: 5,
      trough: 3,
    });
  });

  it('单调上涨时回撤为 0，peak 为末位下标', () => {
    expect(calculateMaxDrawdown([100, 110, 120, 130])).toEqual({
      maxDrawdown: 0,
      peak: 3,
      trough: 0,
    });
  });

  it('价格归零时回撤为 100%', () => {
    expect(calculateMaxDrawdown([100, 50, 0])).toEqual({
      maxDrawdown: 1,
      peak: 0,
      trough: 2,
    });
  });
});

describe('Calmar 比率 - backend drawdownProtectionEngine', () => {
  it('用最大回撤归一化年化收益', () => {
    const dd = computeDrawdown(EQUITY);
    expect(dd).not.toBeNull();
    expect(dd!.maxDrawdown).toBeCloseTo(0.1, 12);
    expect(dd!.maxDrawdownDate).toBe('2024-01-03');
    expect(calmarRatio(EQUITY, 0.2)).toBeCloseTo(2, 12);
  });

  it('零回撤时返回 null（旧断言期望 0）', () => {
    const rising = [
      { date: '2024-01-01', nav: 100 },
      { date: '2024-01-02', nav: 110 },
      { date: '2024-01-03', nav: 120 },
    ];

    const dd = computeDrawdown(rising);
    expect(dd).not.toBeNull();
    expect(dd!.maxDrawdown).toBe(0);
    expect(calmarRatio(rising, 0.2)).toBeNull();
  });
});

describe('凯利公式 - PositionSizingEngine.kellySize', () => {
  const engine = new PositionSizingEngine();

  it('正期望时给出半凯利仓位', () => {
    const result = engine.kellySize({
      capital: 100000,
      entryPrice: 50,
      stopLoss: 45,
      winRate: 0.6,
      avgWin: 2,
      avgLoss: 1,
      atr: 1,
      maxRiskPct: 2,
    });

    expect(result).toEqual({ shares: 400, pct: 20, fKelly: 0.4 });
  });

  it('负期望时 fKelly 保留负值、实际仓位归零', () => {
    const result = engine.kellySize({
      capital: 100000,
      entryPrice: 50,
      stopLoss: 45,
      winRate: 0.3,
      avgWin: 1,
      avgLoss: 1,
      atr: 1,
      maxRiskPct: 2,
    });

    // 旧 helper 把 fKelly 夹到 0；生产保留 -0.4，仅 halfKelly 被 max(0,...) 截断。
    expect(result).toEqual({ shares: 0, pct: 0, fKelly: -0.4 });
  });
});

describe('止损 - calculateStopLoss', () => {
  it('ATR 止损以当前价为基准', () => {
    expect(calculateStopLoss(100, 100, 100, 5, { type: 'atr', value: 2 })).toBe(90);
  });

  it('固定百分比与移动止损', () => {
    expect(calculateStopLoss(100, 100, 100, 5, { type: 'fixed', value: 0.05 })).toBeCloseTo(95, 10);
    expect(calculateStopLoss(100, 100, 120, 5, { type: 'trailing', value: 0.1 })).toBeCloseTo(108, 10);
  });
});

describe('止盈 - calculateStopLossTakeProfit', () => {
  it('ATR 法止损 2x、止盈 3x，兼容百分比法', () => {
    const atr = calculateStopLossTakeProfit(100, 5, 'atr');
    expect(atr.stopLoss).toBe(90);
    expect(atr.takeProfit).toBe(115);
    expect(atr.riskReward).toBe(1.5);
    expect(atr.trailingStop).toBe(95);

    const pct = calculateStopLossTakeProfit(100, 5, 'percentage');
    expect(pct.stopLoss).toBe(95);
    expect(pct.takeProfit).toBeCloseTo(110, 10);
    expect(pct.riskReward).toBeCloseTo(2, 10);
    expect(pct.trailingStop).toBe(97.5);
  });
});

describe('仓位 - PositionSizingEngine.riskBudgetSize', () => {
  const engine = new PositionSizingEngine();

  it('按单笔风险预算计算整百股数', () => {
    expect(engine.riskBudgetSize(100000, 50, 45, 2)).toBe(400);
  });

  it('股数为 100 的整数倍', () => {
    const shares = engine.riskBudgetSize(100000, 50, 49, 1);
    expect(shares).toBe(1000);
    expect(shares % 100).toBe(0);
  });

  it('止损价不低于入场价时拒绝建仓', () => {
    expect(engine.riskBudgetSize(100000, 50, 50, 1)).toBe(0);
  });
});

describe('组合波动率 - portfolioRisk', () => {
  it('用协方差矩阵合成组合波动', () => {
    const cov = buildCovarianceMatrix(ASSETS, [
      [1, 0],
      [0, 1],
    ]);
    const vol = portfolioRisk([0.5, 0.5], cov);

    expect(vol).toBeCloseTo(Math.sqrt(0.0325), 12);
  });

  it('单资产等于自身波动率，正相关提高组合波动', () => {
    const covZero = buildCovarianceMatrix(ASSETS, [
      [1, 0],
      [0, 1],
    ]);
    const covPositive = buildCovarianceMatrix(ASSETS, [
      [1, 0.3],
      [0.3, 1],
    ]);

    const single = portfolioRisk([1, 0], covZero);
    expect(single).toBeCloseTo(0.2, 12);

    const correlated = portfolioRisk([0.5, 0.5], covPositive);
    expect(correlated).toBeCloseTo(0.20371549, 8);
    expect(correlated).toBeGreaterThan(portfolioRisk([0.5, 0.5], covZero));
  });
});

describe('压力测试 - runStressTest', () => {
  const scenarios = [
    {
      name: 'crash',
      description: '同步下跌',
      shocks: { stock1: -0.3, stock2: -0.2 },
      probability: 0.05,
    },
    {
      name: 'recovery',
      description: '同步反弹',
      shocks: { stock1: 0.1, stock2: 0.05 },
      probability: 0.3,
    },
  ];

  it('按权重汇总冲击，输出损益比例而非金额', () => {
    const results = runStressTest({ stock1: 0.5, stock2: 0.5 }, scenarios);
    const crash = results.find((r) => r.scenario === 'crash')!;

    // 旧 helper 返回金额 loss=-25000；生产返回权重口径 -0.25（等权 0.5*-0.3 + 0.5*-0.2）。
    expect(crash.portfolioImpact).toBeCloseTo(-0.25, 10);
    expect(crash.maxDrawdown).toBeCloseTo(0.25, 10);
    expect(crash.marginCall).toBe(false);
    expect(crash.worstPosition.symbol).toBe('stock1');
    expect(crash.worstPosition.loss).toBeCloseTo(-0.15, 10);
    expect(crash.bestPosition.symbol).toBe('stock2');
    expect(crash.bestPosition.gain).toBeCloseTo(-0.1, 10);
  });

  it('极端冲击触发追加保证金', () => {
    const results = runStressTest({ stock1: 0.5, stock2: 0.5 }, [
      {
        name: 'extreme',
        description: '极端下跌',
        shocks: { stock1: -0.8, stock2: -0.6 },
        probability: 0.01,
      },
    ]);

    expect(results[0].portfolioImpact).toBeCloseTo(-0.7, 10);
    expect(results[0].maxDrawdown).toBeCloseTo(0.7, 10);
    expect(results[0].marginCall).toBe(true);

    const recovery = runStressTest({ stock1: 0.5, stock2: 0.5 }, [scenarios[1]])[0];
    expect(recovery.portfolioImpact).toBeCloseTo(0.075, 10);
    expect(recovery.worstPosition.loss).toBe(0);
    expect(recovery.bestPosition.symbol).toBe('stock1');
    expect(recovery.bestPosition.gain).toBeCloseTo(0.05, 10);
  });
});

describe('风险贡献分解 - riskContributionDecomposition', () => {
  it('按协方差分解各资产风险贡献，占比合计 100%', () => {
    const cov = buildCovarianceMatrix(ASSETS, [
      [1, 0],
      [0, 1],
    ]);
    const [a, b] = riskContributionDecomposition(ASSETS, cov);

    expect(a.asset).toBe('A');
    expect(a.weight).toBe(0.5);
    expect(a.marginalRisk).toBeCloseTo(0.1109, 10);
    expect(a.riskContribution).toBeCloseTo(0.0555, 10);
    expect(a.riskContributionPct).toBeCloseTo(30.77, 10);

    expect(b.asset).toBe('B');
    expect(b.marginalRisk).toBeCloseTo(0.2496, 10);
    expect(b.riskContribution).toBeCloseTo(0.1248, 10);
    expect(b.riskContributionPct).toBeCloseTo(69.23, 10);

    // 旧 helper 用 w_i*sigma_i 归一，会得到 40/60；生产按协方差边际风险分解。
    expect(b.riskContributionPct).toBeGreaterThan(a.riskContributionPct);
    expect(a.riskContributionPct + b.riskContributionPct).toBeCloseTo(100, 10);
  });
});

describe('蒙特卡洛 - simulateGBMPaths', () => {
  it('固定随机种子时路径可复现，且路径结构自洽', () => {
    const config = {
      numSimulations: 100,
      numSteps: 252,
      initialValue: 100000,
      drift: 0.1,
      volatility: 0.2,
      randomSeed: 42,
    };

    const paths = simulateGBMPaths(config);
    expect(paths).toHaveLength(100);
    expect(paths[0].values).toHaveLength(253);
    expect(paths[0].values[0]).toBe(100000);
    expect(paths[0].finalValue).toBe(paths[0].values[252]);

    for (const path of paths) {
      expect(Number.isFinite(path.finalValue)).toBe(true);
      expect(path.finalValue).toBeGreaterThan(0);
      expect(path.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(path.maxDrawdown).toBeLessThanOrEqual(1);
    }

    // 同一 seed 两次完全一致；不同 seed 路径不同。
    expect(simulateGBMPaths(config)).toEqual(paths);
    expect(simulateGBMPaths({ ...config, randomSeed: 7 })).not.toEqual(paths);

    const sortedFinals = paths.map((p) => p.finalValue).sort((x, y) => x - y);
    expect(sortedFinals[0]).toBeLessThanOrEqual(sortedFinals[sortedFinals.length - 1]);
  });
});
