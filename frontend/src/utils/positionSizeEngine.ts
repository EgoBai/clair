/**
 * 仓位规模引擎
 * - Kelly准则
 * - 固定比例法
 * - ATR止损仓位
 * - 波动率调整
 * - 最大回撤约束
 */
export interface PositionInput {
  code: string;
  currentPrice: number;
  atr: number; // ATR
  winRate: number;
  avgWin: number;
  avgLoss: number;
  volatility: number;
  correlation: number; // 与组合相关性
}

export interface PositionConstraint {
  maxPositionPct: number; // 单只最大仓位比
  maxTotalExposure: number; // 最大总暴露
  maxDrawdownLimit: number; // 最大回撤限制
  riskPerTrade: number; // 每笔风险
  accountSize: number;
}

export interface PositionSize {
  code: string;
  kellySize: number;
  fixedFractionalSize: number;
  atrBasedSize: number;
  volAdjustedSize: number;
  recommendedSize: number;
  shares: number;
  dollarAmount: number;
  riskAmount: number;
  riskPct: number;
}

export interface PositionSizingResult {
  positions: PositionSize[];
  totalExposure: number;
  totalRisk: number;
  leverageRatio: number;
  diversificationScore: number;
  kellyFraction: number;
}

export function calculatePositionSizes(
  inputs: PositionInput[],
  constraints: PositionConstraint
): PositionSizingResult {
  if (inputs.length === 0) throw new Error('仓位输入不能为空');

  const positions: PositionSize[] = inputs.map(input => {
    // Kelly准则
    const winP = input.winRate;
    const lossP = 1 - winP;
    const b = input.avgWin / Math.max(Math.abs(input.avgLoss), 0.001);
    const kellyRaw = (b * winP - lossP) / b;
    const kellyFraction = Math.max(0, Math.min(0.25, kellyRaw * 0.25)); // 25% Kelly
    const kellySize = kellyFraction * constraints.accountSize / input.currentPrice;

    // 固定比例法
    const riskAmount = constraints.accountSize * constraints.riskPerTrade;
    const fixedFractionalSize = riskAmount / (input.currentPrice * input.volatility);

    // ATR止损仓位
    const atrStopDistance = input.atr * 2;
    const atrBasedSize = riskAmount / atrStopDistance;

    // 波动率调整
    const avgVol = inputs.reduce((s, i) => s + i.volatility, 0) / inputs.length;
    const volRatio = avgVol / Math.max(input.volatility, 0.001);
    const volAdjustedSize = (constraints.accountSize * constraints.maxPositionPct / input.currentPrice) * volRatio;

    // 取最小值作为推荐
    const recommendedSize = Math.min(kellySize, fixedFractionalSize, atrBasedSize, volAdjustedSize);
    const shares = Math.max(0, Math.floor(recommendedSize));
    const dollarAmount = shares * input.currentPrice;
    const risk = dollarAmount * input.volatility;
    const riskPct = risk / constraints.accountSize;

    return {
      code: input.code,
      kellySize,
      fixedFractionalSize,
      atrBasedSize,
      volAdjustedSize,
      recommendedSize,
      shares,
      dollarAmount,
      riskAmount: risk,
      riskPct,
    };
  });

  // 约束检查
  let totalExposure = positions.reduce((s, p) => s + p.dollarAmount, 0);
  if (totalExposure > constraints.accountSize * constraints.maxTotalExposure) {
    const scale = (constraints.accountSize * constraints.maxTotalExposure) / totalExposure;
    for (const p of positions) {
      const input = inputs.find(i => i.code === p.code)!;
      p.shares = Math.floor(p.shares * scale);
      p.dollarAmount = p.shares * input.currentPrice;
      p.recommendedSize = p.shares;
      p.riskAmount = p.dollarAmount * input.volatility;
      p.riskPct = p.riskAmount / constraints.accountSize;
    }
    totalExposure = positions.reduce((s, p) => s + p.dollarAmount, 0);
  }

  // 单只约束
  for (const p of positions) {
    const input = inputs.find(i => i.code === p.code)!;
    const maxDollar = constraints.accountSize * constraints.maxPositionPct;
    if (p.dollarAmount > maxDollar) {
      p.shares = Math.floor(maxDollar / input.currentPrice);
      p.dollarAmount = p.shares * input.currentPrice;
    }
  }

  const totalRisk = positions.reduce((s, p) => s + p.riskAmount, 0);
  const leverageRatio = totalExposure / constraints.accountSize;
  const avgCorrelation = inputs.reduce((s, i) => s + i.correlation, 0) / inputs.length;
  const diversificationScore = 1 - avgCorrelation;
  const avgKelly = positions.reduce((s, p) => s + p.kellySize, 0) / positions.length;

  return {
    positions,
    totalExposure,
    totalRisk,
    leverageRatio,
    diversificationScore,
    kellyFraction: avgKelly * inputs[0].currentPrice / constraints.accountSize,
  };
}
