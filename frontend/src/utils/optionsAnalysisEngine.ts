/**
 * 期权分析引擎
 * Greeks计算、隐含波动率、期权链分析
 */

export interface OptionData {
  ticker: string;
  underlying: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  price: number;
  underlyingPrice: number;
  iv: number; // 隐含波动率
  volume: number;
  openInterest: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  moneyness?: 'ITM' | 'ATM' | 'OTM';
}

export interface OptionChain {
  calls: OptionData[];
  puts: OptionData[];
  spotPrice: number;
  maxPain: number;
  pcr: number; // Put/Call Ratio
}

export interface IVSurface {
  strike: number;
  expiry: string;
  iv: number;
  moneyness: number; // 实值/虚值程度
  dte: number; // 到期天数
}

/**
 * Black-Scholes 期权定价
 */
export function blackScholes(
  S: number,   // 标的价格
  K: number,   // 行权价
  T: number,   // 到期时间(年)
  r: number,   // 无风险利率
  sigma: number, // 波动率
  type: 'call' | 'put'
): { price: number; delta: number; gamma: number; theta: number; vega: number } {
  if (T <= 0) {
    const intrinsic = type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    return { price: intrinsic, delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const NnegD1 = normalCDF(-d1);
  const NnegD2 = normalCDF(-d2);
  const nd1 = normalPDF(d1);

  let price: number, delta: number, theta: number;
  if (type === 'call') {
    price = S * Nd1 - K * Math.exp(-r * T) * Nd2;
    delta = Nd1;
    theta = -(S * nd1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * Nd2;
  } else {
    price = K * Math.exp(-r * T) * NnegD2 - S * NnegD1;
    delta = Nd1 - 1;
    theta = -(S * nd1 * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * NnegD2;
  }

  const gamma = nd1 / (S * sigma * Math.sqrt(T));
  const vega = S * nd1 * Math.sqrt(T) / 100;

  return {
    price: Math.round(price * 100) / 100,
    delta: Math.round(delta * 10000) / 10000,
    gamma: Math.round(gamma * 100000) / 100000,
    theta: Math.round(theta / 365 * 100) / 100,
    vega: Math.round(vega * 100) / 100,
  };
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Max Pain 计算
 */
export function calculateMaxPain(chain: OptionChain): number {
  const strikes = [...new Set([...chain.calls.map((c) => c.strike), ...chain.puts.map((p) => p.strike)])].sort((a, b) => a - b);

  let minPain = Infinity;
  let maxPainStrike = strikes[0] ?? chain.spotPrice;

  for (const strike of strikes) {
    let pain = 0;
    for (const call of chain.calls) {
      if (strike > call.strike) {
        pain += (strike - call.strike) * call.openInterest;
      }
    }
    for (const put of chain.puts) {
      if (strike < put.strike) {
        pain += (put.strike - strike) * put.openInterest;
      }
    }
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = strike;
    }
  }

  return maxPainStrike;
}

/**
 * PCR (Put/Call Ratio) 分析
 */
export function analyzePCR(chain: OptionChain): {
  volumePCR: number;
  oiPCR: number;
  signal: 'bullish' | 'bearish' | 'neutral';
} {
  const callVolume = chain.calls.reduce((s, c) => s + c.volume, 0);
  const putVolume = chain.puts.reduce((s, p) => s + p.volume, 0);
  const callOI = chain.calls.reduce((s, c) => s + c.openInterest, 0);
  const putOI = chain.puts.reduce((s, p) => s + p.openInterest, 0);

  const volumePCR = callVolume > 0 ? Math.round((putVolume / callVolume) * 100) / 100 : 0;
  const oiPCR = callOI > 0 ? Math.round((putOI / callOI) * 100) / 100 : 0;

  let signal: 'bullish' | 'bearish' | 'neutral';
  if (volumePCR > 1.2) signal = 'bullish'; // 过度看跌反而看涨
  else if (volumePCR < 0.6) signal = 'bearish'; // 过度看涨反而看跌
  else signal = 'neutral';

  return { volumePCR, oiPCR, signal };
}

/**
 * 隐含波动率偏度分析
 */
export function analyzeIVSkew(options: OptionData[]): {
  skew: number;
  smile: 'smirk' | 'smile' | 'flat';
  direction: 'bullish' | 'bearish' | 'neutral';
} {
  const getMoneyness = (o: OptionData) => o.strike / o.underlyingPrice - 1;
  const atmOptions = options.filter((o) => Math.abs(getMoneyness(o)) < 0.02);
  const otmPuts = options.filter((o) => o.type === 'put' && getMoneyness(o) < -0.05);
  const otmCalls = options.filter((o) => o.type === 'call' && getMoneyness(o) > 0.05);

  const avgATM = atmOptions.length > 0 ? atmOptions.reduce((s, o) => s + o.iv, 0) / atmOptions.length : 0.2;
  const avgPutIV = otmPuts.length > 0 ? otmPuts.reduce((s, o) => s + o.iv, 0) / otmPuts.length : avgATM;
  const avgCallIV = otmCalls.length > 0 ? otmCalls.reduce((s, o) => s + o.iv, 0) / otmCalls.length : avgATM;

  const skew = Math.round((avgPutIV - avgCallIV) * 10000) / 10000;

  let smile: 'smirk' | 'smile' | 'flat';
  if (skew > 0.03) smile = 'smirk'; // 左偏，看跌恐慌
  else if (skew < -0.03) smile = 'smile'; // 右偏
  else smile = 'flat';

  let direction: 'bullish' | 'bearish' | 'neutral';
  if (skew > 0.05) direction = 'bearish';
  else if (skew < -0.03) direction = 'bullish';
  else direction = 'neutral';

  return { skew, smile, direction };
}
