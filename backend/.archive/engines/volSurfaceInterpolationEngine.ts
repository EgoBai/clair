/**
 * 波动率曲面插值引擎
 * 期权隐含波动率曲面构建与插值
 */

export interface VolSurfacePoint {
  strike: number;
  expiry: number;       // 到期天数
  impliedVol: number;
  delta?: number;
  gamma?: number;
  vega?: number;
}

export interface VolSurfaceConfig {
  minStrike: number;
  maxStrike: number;
  minExpiry: number;
  maxExpiry: number;
  interpolationMethod: 'linear' | 'cubic' | 'svi';
}

export interface SmileSlice {
  expiry: number;
  strikes: number[];
  impliedVols: number[];
  atmVol: number;
  skew: number;
  convexity: number;
}

export interface TermStructure {
  strike: number;
  expiries: number[];
  impliedVols: number[];
  contangoRatio: number;   // 近月/远月波动率比
}

export interface SVIParams {
  a: number;  // 水平
  b: number;  // 斜率
  rho: number; // 偏度
  m: number;  // 最小值位置
  sigma: number; // 曲率
}

/**
 * 线性插值
 */
export function linearInterpolate(x: number[], y: number[], target: number): number {
  if (x.length === 0 || y.length === 0) return 0;
  if (target <= x[0]) return y[0];
  if (target >= x[x.length - 1]) return y[y.length - 1];

  for (let i = 0; i < x.length - 1; i++) {
    if (target >= x[i] && target <= x[i + 1]) {
      const t = (target - x[i]) / (x[i + 1] - x[i]);
      return y[i] + t * (y[i + 1] - y[i]);
    }
  }
  return y[y.length - 1];
}

/**
 * 三次样条插值系数计算
 */
export function cubicSplineCoefficients(x: number[], y: number[]): number[] {
  const n = x.length;
  if (n < 2) return [];

  const h: number[] = [];
  for (let i = 0; i < n - 1; i++) h.push(x[i + 1] - x[i]);

  // Tridiagonal system
  const alpha: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (y[i + 1] - y[i]) - (3 / h[i - 1]) * (y[i] - y[i - 1]);
  }

  const l: number[] = new Array(n).fill(0);
  const mu: number[] = new Array(n).fill(0);
  const z: number[] = new Array(n).fill(0);
  l[0] = 1;

  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  l[n - 1] = 1;

  const c: number[] = new Array(n).fill(0);
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
  }

  return c;
}

/**
 * 三次样条插值
 */
export function cubicSplineInterpolate(x: number[], y: number[], target: number): number {
  if (x.length < 2) return y[0] || 0;
  if (target <= x[0]) return y[0];
  if (target >= x[x.length - 1]) return y[y.length - 1];

  const c = cubicSplineCoefficients(x, y);
  const n = x.length;

  let i = 0;
  for (let j = 0; j < n - 1; j++) {
    if (target >= x[j] && target <= x[j + 1]) { i = j; break; }
  }

  const h = x[i + 1] - x[i];
  const t = (target - x[i]) / h;
  const a = y[i];
  const b = (y[i + 1] - y[i]) / h - h / 3 * (2 * c[i] + c[i + 1]);
  const d = (c[i + 1] - c[i]) / (3 * h);

  return a + b * t + c[i] * t * t + d * t * t * t;
}

/**
 * SVI (Stochastic Volatility Inspired) 模型拟合
 */
export function fitSVI(k: number[], totalVariance: number[]): SVIParams {
  const n = k.length;
  if (n < 3) return { a: 0, b: 0.1, rho: 0, m: 0, sigma: 0.1 };

  // 简化拟合：使用初始猜测
  const meanK = k.reduce((s, v) => s + v, 0) / n;
  const meanTV = totalVariance.reduce((s, v) => s + v, 0) / n;

  // 简单最小二乘
  let bestA = meanTV;
  let bestB = 0.1;
  let bestRho = 0;
  let bestM = meanK;
  let bestSigma = 0.1;

  let bestError = Infinity;

  for (const rho of [-0.5, -0.3, 0, 0.3, 0.5]) {
    for (const b of [0.05, 0.1, 0.2, 0.3]) {
      for (const sigma of [0.05, 0.1, 0.2]) {
        let error = 0;
        for (let i = 0; i < n; i++) {
          const ki = k[i] - meanK;
          const w = bestA + b * (rho * ki + Math.sqrt(ki * ki + sigma * sigma));
          error += (w - totalVariance[i]) ** 2;
        }
        if (error < bestError) {
          bestError = error;
          bestRho = rho;
          bestB = b;
          bestSigma = sigma;
          bestA = meanTV - bestB * bestSigma * Math.sqrt(1 - bestRho * bestRho);
        }
      }
    }
  }

  return { a: bestA, b: bestB, rho: bestRho, m: bestM, sigma: bestSigma };
}

/**
 * SVI模型计算波动率
 */
export function sviVol(params: SVIParams, k: number): number {
  const { a, b, rho, m, sigma } = params;
  const ki = k - m;
  const totalVar = a + b * (rho * ki + Math.sqrt(ki * ki + sigma * sigma));
  return Math.sqrt(Math.max(0, totalVar));
}

/**
 * 提取微笑切片
 */
export function extractSmileSlice(points: VolSurfacePoint[], expiry: number): SmileSlice {
  const filtered = points
    .filter(p => Math.abs(p.expiry - expiry) < 1)
    .sort((a, b) => a.strike - b.strike);

  if (filtered.length === 0) {
    return { expiry, strikes: [], impliedVols: [], atmVol: 0, skew: 0, convexity: 0 };
  }

  const strikes = filtered.map(p => p.strike);
  const impliedVols = filtered.map(p => p.impliedVol);

  // ATM波动率（中间strike附近）
  const midIdx = Math.floor(strikes.length / 2);
  const atmVol = impliedVols[midIdx];

  // 偏度（左端-右端波动率差）
  const skew = impliedVols[0] - impliedVols[impliedVols.length - 1];

  // 凸度
  const leftSlope = midIdx > 0 ? (impliedVols[midIdx] - impliedVols[0]) / midIdx : 0;
  const rightSlope = midIdx < impliedVols.length - 1
    ? (impliedVols[impliedVols.length - 1] - impliedVols[midIdx]) / (impliedVols.length - 1 - midIdx) : 0;
  const convexity = rightSlope - leftSlope;

  return { expiry, strikes, impliedVols, atmVol, skew, convexity };
}

/**
 * 提取期限结构
 */
export function extractTermStructure(points: VolSurfacePoint[], strike: number): TermStructure {
  const filtered = points
    .filter(p => Math.abs(p.strike - strike) < strike * 0.02)
    .sort((a, b) => a.expiry - b.expiry);

  if (filtered.length === 0) {
    return { strike, expiries: [], impliedVols: [], contangoRatio: 1 };
  }

  const expiries = filtered.map(p => p.expiry);
  const impliedVols = filtered.map(p => p.impliedVol);
  const contangoRatio = impliedVols.length >= 2
    ? impliedVols[0] / impliedVols[impliedVols.length - 1] : 1;

  return { strike, expiries, impliedVols, contangoRatio };
}

/**
 * 双线性插值（strike + expiry）
 */
export function bilinearInterpolate(
  points: VolSurfacePoint[],
  targetStrike: number,
  targetExpiry: number,
): number {
  // 先按expiry插值，再按strike插值
  const expiries = [...new Set(points.map(p => p.expiry))].sort((a, b) => a - b);

  if (expiries.length === 0) return 0;
  if (expiries.length === 1) {
    const slice = points.filter(p => p.expiry === expiries[0]);
    return linearInterpolate(
      slice.map(p => p.strike),
      slice.map(p => p.impliedVol),
      targetStrike,
    );
  }

  const expiryVols: number[] = [];
  for (const exp of expiries) {
    const slice = points.filter(p => p.expiry === exp);
    expiryVols.push(linearInterpolate(
      slice.map(p => p.strike),
      slice.map(p => p.impliedVol),
      targetStrike,
    ));
  }

  return linearInterpolate(expiries, expiryVols, targetExpiry);
}

/**
 * 波动率曲面平滑（中值滤波）
 */
export function smoothVolSurface(points: VolSurfacePoint[], window = 3): VolSurfacePoint[] {
  const sorted = [...points].sort((a, b) => a.expiry - b.expiry || a.strike - b.strike);
  const smoothed: VolSurfacePoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const neighbors = sorted
      .filter(p =>
        Math.abs(p.expiry - sorted[i].expiry) <= window &&
        Math.abs(p.strike - sorted[i].strike) <= sorted[i].strike * 0.05 * window
      )
      .map(p => p.impliedVol)
      .sort((a, b) => a - b);

    const medianVol = neighbors[Math.floor(neighbors.length / 2)] || sorted[i].impliedVol;
    smoothed.push({ ...sorted[i], impliedVol: medianVol });
  }

  return smoothed;
}

/**
 * 计算波动率曲面无套利检验
 */
export function checkNoArbitrageConditions(points: VolSurfacePoint[]): {
  butterflyArbitrage: boolean;
  calendarArbitrage: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const expiries = [...new Set(points.map(p => p.expiry))].sort((a, b) => a - b);

  // 蝶式套利：微笑凸度必须为正
  let butterflyArbitrage = false;
  for (const exp of expiries) {
    const slice = points
      .filter(p => p.expiry === exp)
      .sort((a, b) => a.strike - b.strike);

    for (let i = 1; i < slice.length - 1; i++) {
      const convexity = slice[i - 1].impliedVol + slice[i + 1].impliedVol - 2 * slice[i].impliedVol;
      if (convexity < -0.01) {
        butterflyArbitrage = true;
        violations.push(`Butterfly arb at expiry=${exp}, strike=${slice[i].strike}`);
      }
    }
  }

  // 日历套利：远月波动率不应低于近月（对ATM）
  let calendarArbitrage = false;
  for (let i = 0; i < expiries.length - 1; i++) {
    const nearSlice = points.filter(p => p.expiry === expiries[i]);
    const farSlice = points.filter(p => p.expiry === expiries[i + 1]);

    for (const near of nearSlice) {
      const far = farSlice.find(f => Math.abs(f.strike - near.strike) < near.strike * 0.02);
      if (far && near.impliedVol * near.expiry > far.impliedVol * far.expiry * 1.01) {
        calendarArbitrage = true;
        violations.push(`Calendar arb at strike=${near.strike}`);
      }
    }
  }

  return { butterflyArbitrage, calendarArbitrage, violations };
}
