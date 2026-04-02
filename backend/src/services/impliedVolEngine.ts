/**
 * ImpliedVolEngine - 隐含波动率引擎
 * Newton-Raphson法求解BSM隐含波动率
 */

export function normCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export function bsmPrice(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, isCall ? S - K : K - S);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return isCall
    ? S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    : K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

export function impliedVol(price: number, S: number, K: number, T: number, r: number, isCall: boolean, tol: number = 1e-6, maxIter: number = 100): number {
  let sigma = 0.3;
  for (let i = 0; i < maxIter; i++) {
    const p = bsmPrice(S, K, T, r, sigma, isCall);
    const diff = p - price;
    if (Math.abs(diff) < tol) return sigma;
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const vega = S * Math.sqrt(T) * Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
    if (vega < 1e-10) break;
    sigma -= diff / vega;
    if (sigma <= 0) sigma = 0.001;
  }
  return sigma;
}

export function volatilitySmile(strikes: number[], marketPrices: number[], S: number, T: number, r: number, isCall: boolean): number[] {
  return strikes.map((K, i) => {
    try { return impliedVol(marketPrices[i], S, K, T, r, isCall); }
    catch { return 0; }
  });
}
