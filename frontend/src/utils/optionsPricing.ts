/**
 * 期权定价引擎
 * 支持: Black-Scholes、二叉树模型、Greeks计算
 */

export type OptionType = 'call' | 'put';
export type ExerciseStyle = 'european' | 'american';

export interface OptionParams {
  spot: number; // 标的价格
  strike: number; // 行权价
  timeToExpiry: number; // 年化到期时间
  riskFreeRate: number; // 无风险利率
  volatility: number; // 波动率
  dividendYield?: number; // 股息率
}

export interface OptionPrice {
  price: number;
  intrinsic: number;
  timeValue: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface GreeksSurface {
  strikes: number[];
  expiries: number[];
  callPrices: number[][];
  putPrices: number[][];
  callDeltas: number[][];
  putDeltas: number[][];
  gammas: number[][];
  vegas: number[][];
}

/**
 * Black-Scholes 定价
 */
export function blackScholes(
  params: OptionParams,
  type: OptionType
): OptionPrice {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield = 0 } = params;

  if (timeToExpiry <= 0 || volatility <= 0 || spot <= 0 || strike <= 0) {
    const intrinsic = type === 'call'
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);
    return {
      price: intrinsic,
      intrinsic,
      timeValue: 0,
      delta: type === 'call' ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0
    };
  }

  const d1 = (Math.log(spot / strike) + (riskFreeRate - dividendYield + 0.5 * volatility ** 2) * timeToExpiry)
    / (volatility * Math.sqrt(timeToExpiry));
  const d2 = d1 - volatility * Math.sqrt(timeToExpiry);

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const NnegD1 = normalCDF(-d1);
  const NnegD2 = normalCDF(-d2);
  const nd1 = normalPDF(d1);

  const discountFactor = Math.exp(-riskFreeRate * timeToExpiry);
  const dividendFactor = Math.exp(-dividendYield * timeToExpiry);

  let price: number;
  let delta: number;

  if (type === 'call') {
    price = spot * dividendFactor * Nd1 - strike * discountFactor * Nd2;
    delta = dividendFactor * Nd1;
  } else {
    price = strike * discountFactor * NnegD2 - spot * dividendFactor * NnegD1;
    delta = -dividendFactor * NnegD1;
  }

  const intrinsic = type === 'call'
    ? Math.max(spot - strike, 0)
    : Math.max(strike - spot, 0);

  const gamma = dividendFactor * nd1 / (spot * volatility * Math.sqrt(timeToExpiry));
  const vega = spot * dividendFactor * nd1 * Math.sqrt(timeToExpiry) / 100;

  let theta: number;
  if (type === 'call') {
    theta = (-spot * dividendFactor * nd1 * volatility / (2 * Math.sqrt(timeToExpiry))
      - riskFreeRate * strike * discountFactor * Nd2
      + dividendYield * spot * dividendFactor * Nd1) / 365;
  } else {
    theta = (-spot * dividendFactor * nd1 * volatility / (2 * Math.sqrt(timeToExpiry))
      + riskFreeRate * strike * discountFactor * NnegD2
      - dividendYield * spot * dividendFactor * NnegD1) / 365;
  }

  const rho = type === 'call'
    ? strike * timeToExpiry * discountFactor * Nd2 / 100
    : -strike * timeToExpiry * discountFactor * NnegD2 / 100;

  return {
    price,
    intrinsic,
    timeValue: price - intrinsic,
    delta,
    gamma,
    theta,
    vega,
    rho
  };
}

/**
 * 二叉树定价 (支持美式期权)
 */
export function binomialTree(
  params: OptionParams,
  type: OptionType,
  style: ExerciseStyle = 'european',
  steps: number = 100
): number {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield = 0 } = params;

  if (timeToExpiry <= 0 || steps <= 0) {
    return type === 'call'
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);
  }

  const dt = timeToExpiry / steps;
  const u = Math.exp(volatility * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp((riskFreeRate - dividendYield) * dt) - d) / (u - d);
  const disc = Math.exp(-riskFreeRate * dt);

  // 期权价值树
  const optionValues: number[] = [];

  // 终端节点
  for (let i = 0; i <= steps; i++) {
    const stockPrice = spot * Math.pow(u, steps - i) * Math.pow(d, i);
    optionValues[i] = type === 'call'
      ? Math.max(stockPrice - strike, 0)
      : Math.max(strike - stockPrice, 0);
  }

  // 回溯
  for (let j = steps - 1; j >= 0; j--) {
    for (let i = 0; i <= j; i++) {
      const holdValue = disc * (p * optionValues[i] + (1 - p) * optionValues[i + 1]);

      if (style === 'american') {
        const stockPrice = spot * Math.pow(u, j - i) * Math.pow(d, i);
        const exerciseValue = type === 'call'
          ? Math.max(stockPrice - strike, 0)
          : Math.max(strike - stockPrice, 0);
        optionValues[i] = Math.max(holdValue, exerciseValue);
      } else {
        optionValues[i] = holdValue;
      }
    }
  }

  return optionValues[0];
}

/**
 * 计算隐含波动率 (二分法)
 */
export function impliedVolatility(
  marketPrice: number,
  params: Omit<OptionParams, 'volatility'>,
  type: OptionType,
  tolerance: number = 1e-6,
  maxIterations: number = 100
): number | null {
  let low = 0.001;
  let high = 5.0;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const { price } = blackScholes({ ...params, volatility: mid }, type);

    if (Math.abs(price - marketPrice) < tolerance) {
      return mid;
    }

    if (price > marketPrice) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return (low + high) / 2;
}

/**
 * 波动率微笑/偏斜拟合
 * SABR模型简化版
 */
export function volatilitySmile(
  spot: number,
  strikes: number[],
  timeToExpiry: number,
  atmVol: number,
  riskSkew: number = -0.1,
  smileCurvature: number = 0.1
): number[] {
  return strikes.map(k => {
    const logMoneyness = Math.log(spot / k);
    // 简化SABR: σ(K) = ATM_vol + skew * log(S/K) + smile * log(S/K)²
    const vol = atmVol + riskSkew * logMoneyness + smileCurvature * logMoneyness ** 2;
    return Math.max(0.01, vol);
  });
}

/**
 * 生成Greeks曲面
 */
export function generateGreeksSurface(
  spot: number,
  strikes: number[],
  expiries: number[],
  riskFreeRate: number,
  atmVol: number,
  riskSkew: number = -0.1
): GreeksSurface {
  const callPrices: number[][] = [];
  const putPrices: number[][] = [];
  const callDeltas: number[][] = [];
  const putDeltas: number[][] = [];
  const gammas: number[][] = [];
  const vegas: number[][] = [];

  for (const expiry of expiries) {
    const callRow: number[] = [];
    const putRow: number[] = [];
    const callDeltaRow: number[] = [];
    const putDeltaRow: number[] = [];
    const gammaRow: number[] = [];
    const vegaRow: number[] = [];

    const vols = volatilitySmile(spot, strikes, expiry, atmVol, riskSkew);

    for (let i = 0; i < strikes.length; i++) {
      const params: OptionParams = {
        spot,
        strike: strikes[i],
        timeToExpiry: expiry,
        riskFreeRate,
        volatility: vols[i]
      };

      const call = blackScholes(params, 'call');
      const put = blackScholes(params, 'put');

      callRow.push(call.price);
      putRow.push(put.price);
      callDeltaRow.push(call.delta);
      putDeltaRow.push(put.delta);
      gammaRow.push(call.gamma);
      vegaRow.push(call.vega);
    }

    callPrices.push(callRow);
    putPrices.push(putRow);
    callDeltas.push(callDeltaRow);
    putDeltas.push(putDeltaRow);
    gammas.push(gammaRow);
    vegas.push(vegaRow);
  }

  return {
    strikes,
    expiries,
    callPrices,
    putPrices,
    callDeltas,
    putDeltas,
    gammas,
    vegas
  };
}

// ===== Math Utilities =====

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
