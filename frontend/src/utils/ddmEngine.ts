/**
 * 股息贴现模型引擎 (DDM)
 * Gordon增长模型、多阶段DDM、DDM敏感性分析
 */

export interface DDMInput {
  currentDividend: number;
  growthRate: number;
  requiredReturn: number;
  growthDuration?: number; // 高增长持续年数
  terminalGrowth?: number;  // 永续增长率
}

export interface DDMResult {
  intrinsicValue: number;
  currentYield: number;
  marginOfSafety: number;
  fairPE: number;
  sensitivity: { growth: number; required: number; value: number }[];
  stages: { name: string; years: number; growth: number; pvDividends: number }[];
  recommendation: 'undervalued' | 'fairly_valued' | 'overvalued';
}

/**
 * Gordon增长模型 (单阶段)
 */
export function gordonGrowthModel(dividend: number, growth: number, required: number): number {
  if (required <= growth) return Infinity;
  return dividend * (1 + growth) / (required - growth);
}

/**
 * 多阶段DDM
 */
export function multiStageDDM(input: DDMInput, currentPrice: number): DDMResult {
  const { currentDividend, growthRate, requiredReturn, growthDuration = 5, terminalGrowth = 0.03 } = input;

  if (requiredReturn <= 0) {
    return {
      intrinsicValue: 0, currentYield: 0, marginOfSafety: 0, fairPE: 0,
      sensitivity: [], stages: [], recommendation: 'fairly_valued',
    };
  }

  const stages: DDMResult['stages'] = [];
  let totalPV = 0;

  // 高增长阶段
  let div = currentDividend;
  let highGrowthPV = 0;
  for (let t = 1; t <= growthDuration; t++) {
    div *= (1 + growthRate);
    highGrowthPV += div / Math.pow(1 + requiredReturn, t);
  }
  stages.push({
    name: '高增长阶段',
    years: growthDuration,
    growth: growthRate,
    pvDividends: Math.round(highGrowthPV * 100) / 100,
  });
  totalPV += highGrowthPV;

  // 永续阶段
  const terminalDiv = div * (1 + terminalGrowth);
  let terminalPV = 0;
  if (requiredReturn > terminalGrowth) {
    const terminalValue = terminalDiv / (requiredReturn - terminalGrowth);
    terminalPV = terminalValue / Math.pow(1 + requiredReturn, growthDuration);
  }
  stages.push({
    name: '永续阶段',
    years: Infinity,
    growth: terminalGrowth,
    pvDividends: Math.round(terminalPV * 100) / 100,
  });
  totalPV += terminalPV;

  const intrinsicValue = Math.round(totalPV * 100) / 100;
  const currentYield = currentPrice > 0 ? currentDividend / currentPrice : 0;
  const marginOfSafety = intrinsicValue > 0 ? (intrinsicValue - currentPrice) / intrinsicValue : 0;
  const fairPE = currentDividend > 0 ? intrinsicValue / currentDividend : 0;

  // 敏感性分析
  const sensitivity: DDMResult['sensitivity'] = [];
  for (let g = growthRate - 0.03; g <= growthRate + 0.03; g += 0.01) {
    for (let r = requiredReturn - 0.02; r <= requiredReturn + 0.02; r += 0.01) {
      if (r > g + terminalGrowth) {
        const v = multiStageValue(currentDividend, g, r, growthDuration, terminalGrowth);
        sensitivity.push({ growth: Math.round(g * 100) / 100, required: Math.round(r * 100) / 100, value: Math.round(v * 100) / 100 });
      }
    }
  }

  const recommendation = marginOfSafety > 0.2 ? 'undervalued' : marginOfSafety < -0.2 ? 'overvalued' : 'fairly_valued';

  return {
    intrinsicValue,
    currentYield: Math.round(currentYield * 10000) / 10000,
    marginOfSafety: Math.round(marginOfSafety * 10000) / 10000,
    fairPE: Math.round(fairPE * 100) / 100,
    sensitivity,
    stages,
    recommendation,
  };
}

function multiStageValue(div: number, growth: number, required: number, years: number, terminal: number): number {
  let pv = 0, d = div;
  for (let t = 1; t <= years; t++) {
    d *= (1 + growth);
    pv += d / Math.pow(1 + required, t);
  }
  const td = d * (1 + terminal);
  if (required > terminal) {
    pv += (td / (required - terminal)) / Math.pow(1 + required, years);
  }
  return pv;
}
