/**
 * Options Greeks Calculator Engine
 *
 * 期权希腊字母计算：Delta、Gamma、Theta、Vega、Rho
 * Black-Scholes模型
 */

// 标准正态分布累积分布函数
export function normalCDF(x: number): number {
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

// 标准正态分布概率密度函数
export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface OptionParams {
  spot: number;       // 标的价格
  strike: number;     // 行权价
  timeToExpiry: number; // 到期时间（年）
  riskFreeRate: number; // 无风险利率
  volatility: number;   // 波动率
  type: 'call' | 'put';
}

export interface OptionGreeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  intrinsicValue: number;
  timeValue: number;
  moneyness: number; // S/K
}

/**
 * Black-Scholes期权定价及希腊字母
 */
export function calculateGreeks(params: OptionParams): OptionGreeks {
  const { spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, type } = params;

  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const intrinsic = type === 'call'
      ? Math.max(0, S - K)
      : Math.max(0, K - S);
    return {
      price: intrinsic,
      delta: type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0, theta: 0, vega: 0, rho: 0,
      intrinsicValue: intrinsic, timeValue: 0,
      moneyness: S / K,
    };
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const Nnegd1 = normalCDF(-d1);
  const Nnegd2 = normalCDF(-d2);
  const nd1 = normalPDF(d1);

  let price: number, delta: number, theta: number, rho: number;

  if (type === 'call') {
    price = S * Nd1 - K * Math.exp(-r * T) * Nd2;
    delta = Nd1;
    theta = -(S * nd1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * Nd2;
    rho = K * T * Math.exp(-r * T) * Nd2;
  } else {
    price = K * Math.exp(-r * T) * Nnegd2 - S * Nnegd1;
    delta = Nd1 - 1;
    theta = -(S * nd1 * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * Nnegd2;
    rho = -K * T * Math.exp(-r * T) * Nnegd2;
  }

  const gamma = nd1 / (S * sigma * Math.sqrt(T));
  const vega = S * nd1 * Math.sqrt(T);

  const intrinsic = type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);

  return {
    price: Math.round(price * 10000) / 10000,
    delta: Math.round(delta * 10000) / 10000,
    gamma: Math.round(gamma * 1000000) / 1000000,
    theta: Math.round(theta / 365 * 10000) / 10000, // daily theta
    vega: Math.round(vega / 100 * 10000) / 10000, // vega per 1% vol change
    rho: Math.round(rho / 100 * 10000) / 10000, // rho per 1% rate change
    intrinsicValue: Math.round(intrinsic * 10000) / 10000,
    timeValue: Math.round((price - intrinsic) * 10000) / 10000,
    moneyness: Math.round((S / K) * 10000) / 10000,
  };
}

/**
 * 隐含波动率反算（二分法）
 */
export function impliedVolatility(
  marketPrice: number,
  params: Omit<OptionParams, 'volatility'>,
  precision: number = 0.0001,
  maxIterations: number = 100
): number | null {
  let low = 0.001;
  let high = 5.0;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const { price } = calculateGreeks({ ...params, volatility: mid });

    if (Math.abs(price - marketPrice) < precision) {
      return Math.round(mid * 10000) / 10000;
    }

    if (price < marketPrice) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return null;
}

/**
 * 期权组合希腊字母汇总
 */
export interface PortfolioPosition {
  params: OptionParams;
  quantity: number;
}

export function portfolioGreeks(positions: PortfolioPosition[]): OptionGreeks {
  const totals: OptionGreeks = {
    price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0,
    intrinsicValue: 0, timeValue: 0, moneyness: 0,
  };

  for (const pos of positions) {
    const greeks = calculateGreeks(pos.params);
    totals.price += greeks.price * pos.quantity;
    totals.delta += greeks.delta * pos.quantity;
    totals.gamma += greeks.gamma * pos.quantity;
    totals.theta += greeks.theta * pos.quantity;
    totals.vega += greeks.vega * pos.quantity;
    totals.rho += greeks.rho * pos.quantity;
    totals.intrinsicValue += greeks.intrinsicValue * pos.quantity;
    totals.timeValue += greeks.timeValue * pos.quantity;
  }

  return totals;
}
