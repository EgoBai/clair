/**
 * Options Greeks & Derivatives Pricing Engine
 * 期权希腊字母及衍生品定价引擎
 */

export interface OptionParams {
  spot: number;
  strike: number;
  timeToExpiry: number; // years
  riskFreeRate: number;
  volatility: number;
  dividendYield?: number;
  type: 'call' | 'put';
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  lambda: number; // leverage
  vanna: number; // dDelta/dVol
  charm: number; // dDelta/dTime
  volga: number; // dVega/dVol
  speed: number; // dGamma/dSpot
}

export interface PricingResult {
  price: number;
  intrinsicValue: number;
  timeValue: number;
  greeks: Greeks;
  impliedVolatility?: number;
}

export interface VolatilitySurface {
  strikes: number[];
  expiries: number[];
  impliedVols: number[][];
}

export interface RiskMetrics {
  var95: number;
  var99: number;
  cvar95: number;
  maxLoss: number;
  maxGain: number;
  breakeven: number[];
  probabilityOfProfit: number;
}

// Standard normal CDF (Abramowitz & Stegun approximation)
export function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  // A&S approximation is for erf(x), but we need erf(x/sqrt(2))
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1.0 - poly * Math.exp(-z * z);

  return x >= 0 ? 0.5 * (1.0 + erf) : 0.5 * (1.0 - erf);
}

// Standard normal PDF
export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Inverse normal CDF (Peter Acklam's approximation)
export function inverseNormalCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Rational approximation coefficients
  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00,
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 1.0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1));
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1));
  }
}

function d1(params: OptionParams): number {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield = 0 } = params;
  if (timeToExpiry <= 0 || volatility <= 0) return 0;
  return (Math.log(spot / strike) + (riskFreeRate - dividendYield + 0.5 * volatility ** 2) * timeToExpiry) /
    (volatility * Math.sqrt(timeToExpiry));
}

function d2(params: OptionParams): number {
  return d1(params) - params.volatility * Math.sqrt(params.timeToExpiry);
}

// Black-Scholes price
export function blackScholesPrice(params: OptionParams): number {
  const { spot, strike, timeToExpiry, riskFreeRate, _volatility, dividendYield = 0, type } = params;

  if (timeToExpiry <= 0) {
    return type === 'call'
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);
  }

  const nd1 = normalCDF(d1(params));
  const nd2 = normalCDF(d2(params));
  const discountFactor = Math.exp(-riskFreeRate * timeToExpiry);
  const dividendFactor = Math.exp(-dividendYield * timeToExpiry);

  if (type === 'call') {
    return spot * dividendFactor * nd1 - strike * discountFactor * nd2;
  } else {
    return strike * discountFactor * normalCDF(-d2(params)) - spot * dividendFactor * normalCDF(-d1(params));
  }
}

// Calculate all Greeks
export function calculateGreeks(params: OptionParams): Greeks {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield = 0, type } = params;

  if (timeToExpiry <= 0 || volatility <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, lambda: 0, vanna: 0, charm: 0, volga: 0, speed: 0 };
  }

  const d1Val = d1(params);
  const d2Val = d2(params);
  const sqrtT = Math.sqrt(timeToExpiry);
  const nd1 = normalPDF(d1Val);
  const discountFactor = Math.exp(-riskFreeRate * timeToExpiry);
  const dividendFactor = Math.exp(-dividendYield * timeToExpiry);

  // Delta
  let delta: number;
  if (type === 'call') {
    delta = dividendFactor * normalCDF(d1Val);
  } else {
    delta = dividendFactor * (normalCDF(d1Val) - 1);
  }

  // Gamma
  const gamma = (dividendFactor * nd1) / (spot * volatility * sqrtT);

  // Theta
  let theta: number;
  const commonTheta = -(spot * dividendFactor * nd1 * volatility) / (2 * sqrtT);
  if (type === 'call') {
    theta = (commonTheta - riskFreeRate * strike * discountFactor * normalCDF(d2Val) + dividendYield * spot * dividendFactor * normalCDF(d1Val)) / 365;
  } else {
    theta = (commonTheta + riskFreeRate * strike * discountFactor * normalCDF(-d2Val) - dividendYield * spot * dividendFactor * normalCDF(-d1Val)) / 365;
  }

  // Vega (per 1% change in vol)
  const vega = (spot * dividendFactor * nd1 * sqrtT) / 100;

  // Rho (per 1% change in rate)
  let rho: number;
  if (type === 'call') {
    rho = (strike * timeToExpiry * discountFactor * normalCDF(d2Val)) / 100;
  } else {
    rho = (-strike * timeToExpiry * discountFactor * normalCDF(-d2Val)) / 100;
  }

  // Lambda (leverage)
  const price = blackScholesPrice(params);
  const lambda = price > 0 ? (delta * spot) / price : 0;

  // Vanna (dDelta/dVol)
  const vanna = -dividendFactor * nd1 * d2Val / volatility;

  // Charm (dDelta/dTime)
  let charm: number;
  if (type === 'call') {
    charm = dividendFactor * (nd1 * (riskFreeRate - dividendYield) / (volatility * sqrtT) + nd1 * d1Val / (2 * timeToExpiry));
  } else {
    charm = -dividendFactor * (nd1 * (riskFreeRate - dividendYield) / (volatility * sqrtT) - nd1 * d1Val / (2 * timeToExpiry));
  }

  // Volga (dVega/dVol)
  const volga = vega * (d1Val * d2Val) / volatility * 100;

  // Speed (dGamma/dSpot)
  const speed = -gamma / spot * (1 + d1Val / (volatility * sqrtT));

  return { delta, gamma, theta, vega, rho, lambda, vanna, charm, volga, speed };
}

// Full pricing result
export function priceOption(params: OptionParams): PricingResult {
  const price = blackScholesPrice(params);
  const intrinsicValue = params.type === 'call'
    ? Math.max(params.spot - params.strike, 0)
    : Math.max(params.strike - params.spot, 0);
  const timeValue = price - intrinsicValue;
  const greeks = calculateGreeks(params);

  return { price, intrinsicValue, timeValue, greeks };
}

// Implied volatility via Newton-Raphson
export function calculateImpliedVolatility(
  marketPrice: number,
  params: Omit<OptionParams, 'volatility'>,
  tolerance: number = 0.0001,
  maxIterations: number = 100
): number {
  let vol = 0.3; // initial guess

  for (let i = 0; i < maxIterations; i++) {
    const fullParams = { ...params, volatility: vol };
    const price = blackScholesPrice(fullParams);
    const vega = calculateGreeks(fullParams).vega * 100; // convert back

    const diff = price - marketPrice;
    if (Math.abs(diff) < tolerance) return vol;

    if (vega === 0) break;
    vol -= diff / vega;
    vol = Math.max(0.001, Math.min(vol, 10));
  }

  return vol;
}

// Binomial tree pricing (American options)
export function binomialTreePrice(
  params: OptionParams,
  steps: number = 100
): number {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, type } = params;
  const dt = timeToExpiry / steps;
  const u = Math.exp(volatility * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp(riskFreeRate * dt) - d) / (u - d);
  const discount = Math.exp(-riskFreeRate * dt);

  // Asset prices at maturity
  const assetPrices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    assetPrices.push(spot * Math.pow(u, steps - i) * Math.pow(d, i));
  }

  // Option values at maturity
  let optionValues: number[] = assetPrices.map(s =>
    type === 'call' ? Math.max(s - strike, 0) : Math.max(strike - s, 0)
  );

  // Backward induction
  for (let step = steps - 1; step >= 0; step--) {
    const newValues: number[] = [];
    for (let i = 0; i <= step; i++) {
      const expected = discount * (p * optionValues[i] + (1 - p) * optionValues[i + 1]);
      // American exercise check
      const assetPrice = spot * Math.pow(u, step - i) * Math.pow(d, i);
      const intrinsic = type === 'call' ? Math.max(assetPrice - strike, 0) : Math.max(strike - assetPrice, 0);
      newValues.push(Math.max(expected, intrinsic));
    }
    optionValues = newValues;
  }

  return optionValues[0];
}

// Put-Call Parity check
export function putCallParity(
  callPrice: number,
  putPrice: number,
  spot: number,
  strike: number,
  riskFreeRate: number,
  timeToExpiry: number
): { lhs: number; rhs: number; difference: number; isValid: boolean } {
  const discountFactor = Math.exp(-riskFreeRate * timeToExpiry);
  const lhs = callPrice - putPrice;
  const rhs = spot - strike * discountFactor;
  return {
    lhs,
    rhs,
    difference: Math.abs(lhs - rhs),
    isValid: Math.abs(lhs - rhs) < 0.01,
  };
}

// Portfolio Greeks aggregation
export function aggregateGreeks(
  positions: { params: OptionParams; quantity: number }[]
): Greeks {
  const total: Greeks = {
    delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0,
    lambda: 0, vanna: 0, charm: 0, volga: 0, speed: 0,
  };

  for (const pos of positions) {
    const greeks = calculateGreeks(pos.params);
    total.delta += greeks.delta * pos.quantity;
    total.gamma += greeks.gamma * pos.quantity;
    total.theta += greeks.theta * pos.quantity;
    total.vega += greeks.vega * pos.quantity;
    total.rho += greeks.rho * pos.quantity;
    total.vanna += greeks.vanna * pos.quantity;
    total.charm += greeks.charm * pos.quantity;
    total.volga += greeks.volga * pos.quantity;
    total.speed += greeks.speed * pos.quantity;
  }

  // Lambda is position-level
  total.lambda = 0;

  return total;
}

// Straddle/Strangle/Butterfly/Condor pricing
export function priceStrategy(
  legs: { params: OptionParams; quantity: number }[]
): { totalCost: number; maxProfit: number; maxLoss: number; breakeven: number[] } {
  let totalCost = 0;
  for (const leg of legs) {
    const price = blackScholesPrice(leg.params);
    totalCost += price * leg.quantity;
  }

  // Simplified: find breakeven by scanning
  const spotRange = legs[0].params.spot;
  const breakeven: number[] = [];
  const scanPoints = 200;
  const range = spotRange * 0.3;

  let prevPnl = 0;
  for (let i = 0; i <= scanPoints; i++) {
    const testSpot = spotRange - range + (2 * range * i) / scanPoints;
    let pnl = -totalCost;
    for (const leg of legs) {
      const testParams = { ...leg.params, spot: testSpot, timeToExpiry: 0.001 };
      const payoff = blackScholesPrice(testParams);
      pnl += payoff * leg.quantity;
    }
    if (i > 0 && prevPnl * pnl < 0) {
      breakeven.push(testSpot);
    }
    prevPnl = pnl;
  }

  return { totalCost, maxProfit: 0, maxLoss: 0, breakeven };
}

// Vega-weighted IV for a volatility surface
export function interpolateVolatilitySurface(
  surface: VolatilitySurface,
  targetStrike: number,
  targetExpiry: number
): number {
  const { strikes, expiries, impliedVols } = surface;

  // Bilinear interpolation
  let kIdx = strikes.findIndex(k => k >= targetStrike);
  if (kIdx === -1) kIdx = strikes.length - 1;
  if (kIdx === 0) kIdx = 1;

  let tIdx = expiries.findIndex(t => t >= targetExpiry);
  if (tIdx === -1) tIdx = expiries.length - 1;
  if (tIdx === 0) tIdx = 1;

  const k0 = strikes[kIdx - 1], k1 = strikes[kIdx];
  const t0 = expiries[tIdx - 1], t1 = expiries[tIdx];

  const wk = k1 !== k0 ? (targetStrike - k0) / (k1 - k0) : 0;
  const wt = t1 !== t0 ? (targetExpiry - t0) / (t1 - t0) : 0;

  const v00 = impliedVols[tIdx - 1]?.[kIdx - 1] ?? 0.3;
  const v01 = impliedVols[tIdx - 1]?.[kIdx] ?? 0.3;
  const v10 = impliedVols[tIdx]?.[kIdx - 1] ?? 0.3;
  const v11 = impliedVols[tIdx]?.[kIdx] ?? 0.3;

  const v0 = v00 * (1 - wk) + v01 * wk;
  const v1 = v10 * (1 - wk) + v11 * wk;

  return v0 * (1 - wt) + v1 * wt;
}
