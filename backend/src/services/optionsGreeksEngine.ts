/**
 * OptionsGreeksEngine - 期权希腊字母引擎
 * Delta, Gamma, Theta, Vega, Rho计算
 */

import { normCDF } from './impliedVolEngine';

export function d1(S: number, K: number, T: number, r: number, sigma: number): number {
  return (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
}

export function delta(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
  if (T <= 0 || sigma <= 0) return isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const nd1 = normCDF(d1(S, K, T, r, sigma));
  return isCall ? nd1 : nd1 - 1;
}

export function gamma(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  const d = d1(S, K, T, r, sigma);
  return Math.exp(-d * d / 2) / (S * sigma * Math.sqrt(T) * Math.sqrt(2 * Math.PI));
}

export function theta(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
  if (T <= 0) return 0;
  const d1v = d1(S, K, T, r, sigma);
  const d2v = d1v - sigma * Math.sqrt(T);
  const common = -(S * sigma * Math.exp(-d1v * d1v / 2)) / (2 * Math.sqrt(T) * Math.sqrt(2 * Math.PI));
  if (isCall) return common / 365 - r * K * Math.exp(-r * T) * normCDF(d2v) / 365;
  return common / 365 + r * K * Math.exp(-r * T) * normCDF(-d2v) / 365;
}

export function vega(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0) return 0;
  const d1v = d1(S, K, T, r, sigma);
  return S * Math.sqrt(T) * Math.exp(-d1v * d1v / 2) / Math.sqrt(2 * Math.PI) / 100;
}

export function rho(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
  if (T <= 0) return 0;
  const d2v = d1(S, K, T, r, sigma) - sigma * Math.sqrt(T);
  if (isCall) return K * T * Math.exp(-r * T) * normCDF(d2v) / 100;
  return -K * T * Math.exp(-r * T) * normCDF(-d2v) / 100;
}
