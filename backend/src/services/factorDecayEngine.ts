/**
 * FactorDecayEngine - 因子衰减引擎
 * 量化因子的半衰期、衰减权重和有效性跟踪
 */

export interface FactorReturn {
  date: string;
  factorValue: number;
  forwardReturn: number;
}

export interface DecayResult {
  halfLife: number;
  decayWeights: number[];
  icSeries: number[];
  meanIC: number;
  icStd: number;
  icIR: number;           // IC信息比率
  isEffective: boolean;
  decaySpeed: 'fast' | 'medium' | 'slow';
  optimalLag: number;
}

export interface DecayConfig {
  maxLag: number;
  effectiveICThreshold: number;
  icIRThreshold: number;
}

const DEFAULT_CONFIG: DecayConfig = {
  maxLag: 20,
  effectiveICThreshold: 0.03,
  icIRThreshold: 0.5,
};

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const sx = x.slice(0, n), sy = y.slice(0, n);
  const mx = sx.reduce((s, v) => s + v, 0) / n;
  const my = sy.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (sx[i] - mx) * (sy[i] - my);
    dx += (sx[i] - mx) ** 2;
    dy += (sy[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

function computeHalfLifeAutoCorrelation(series: number[]): number {
  const n = series.length;
  if (n < 4) return n;
  const mean = series.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 1; i < n; i++) {
    num += (series[i - 1] - mean) * (series[i] - mean);
    den += (series[i - 1] - mean) ** 2;
  }
  const ar1 = den === 0 ? 0 : num / den;
  if (ar1 <= 0 || ar1 >= 1) return n;
  return Math.max(1, Math.round(-Math.log(2) / Math.log(ar1)));
}

export function analyzeFactorDecay(
  factorReturns: FactorReturn[],
  config: Partial<DecayConfig> = {}
): DecayResult | null {
  if (factorReturns.length < 10) return null;
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const factorValues = factorReturns.map(f => f.factorValue);
  const forwardReturns = factorReturns.map(f => f.forwardReturn);

  // 计算不同滞后期的IC
  const icSeries: number[] = [];
  for (let lag = 0; lag < Math.min(cfg.maxLag, factorReturns.length - 5); lag++) {
    const fv = factorValues.slice(0, factorValues.length - lag);
    const fr = forwardReturns.slice(lag);
    icSeries.push(pearsonCorrelation(fv, fr));
  }

  const meanIC = icSeries.reduce((s, v) => s + v, 0) / icSeries.length;
  const icStd = Math.sqrt(icSeries.reduce((s, v) => s + (v - meanIC) ** 2, 0) / icSeries.length);
  const icIR = icStd > 0 ? meanIC / icStd : 0;

  const halfLife = computeHalfLifeAutoCorrelation(factorValues);

  // 衰减权重 (指数衰减)
  const decayWeights: number[] = [];
  for (let i = 0; i < cfg.maxLag; i++) {
    decayWeights.push(Math.exp(-0.693 * i / halfLife));
  }

  // 最优滞后期
  let optimalLag = 0;
  let maxAbsIC = 0;
  icSeries.forEach((ic, lag) => {
    if (Math.abs(ic) > maxAbsIC) {
      maxAbsIC = Math.abs(ic);
      optimalLag = lag;
    }
  });

  const isEffective = Math.abs(meanIC) > cfg.effectiveICThreshold && Math.abs(icIR) > cfg.icIRThreshold;

  let decaySpeed: DecayResult['decaySpeed'];
  if (halfLife <= 5) decaySpeed = 'fast';
  else if (halfLife <= 15) decaySpeed = 'medium';
  else decaySpeed = 'slow';

  return { halfLife, decayWeights, icSeries, meanIC, icStd, icIR, isEffective, decaySpeed, optimalLag };
}

export function computeWeightedFactor(
  factorReturns: FactorReturn[],
  config: Partial<DecayConfig> = {}
): number[] {
  const decay = analyzeFactorDecay(factorReturns, config);
  if (!decay) return factorReturns.map(f => f.factorValue);

  const values = factorReturns.map(f => f.factorValue);
  const weights = decay.decayWeights;
  const weighted: number[] = [];

  for (let i = 0; i < values.length; i++) {
    let wSum = 0, vSum = 0;
    for (let j = 0; j < Math.min(weights.length, i + 1); j++) {
      wSum += weights[j];
      vSum += values[i - j] * weights[j];
    }
    weighted.push(wSum > 0 ? vSum / wSum : values[i]);
  }
  return weighted;
}
