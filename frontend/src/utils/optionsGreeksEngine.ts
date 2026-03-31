/**
 * 期权希腊字母计算引擎
 * - Delta/Gamma/Theta/Vega/Rho计算
 * - Black-Scholes定价
 * - 隐含波动率反算
 * - Greeks敏感度分析
 */

export interface OptionParams {
  type: 'call' | 'put';
  spot: number;       // 标的价格
  strike: number;     // 行权价
  timeToExpiry: number; // 到期时间(年)
  riskFreeRate: number; // 无风险利率
  volatility: number;   // 波动率
}

export interface GreeksResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  intrinsicValue: number;
  timeValue: number;
}

export interface GreeksSensitivity {
  spotChange: { delta: number; gamma: number };
  volChange: { vega: number; vomma: number };
  timeDecay: { theta: number; charm: number };
}

// 标准正态分布CDF近似
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

// 标准正态分布PDF
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export class OptionsGreeksEngine {
  /**
   * Black-Scholes计算d1, d2
   */
  private calcD1D2(params: OptionParams): { d1: number; d2: number } {
    const { spot, strike, timeToExpiry, riskFreeRate, volatility } = params;
    const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility ** 2) * timeToExpiry) / (volatility * Math.sqrt(timeToExpiry));
    const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
    return { d1, d2 };
  }

  /**
   * 计算期权价格和全部Greeks
   */
  calculateGreeks(params: OptionParams): GreeksResult {
    const { type, spot, strike, timeToExpiry, riskFreeRate, volatility } = params;

    if (timeToExpiry <= 0) {
      const intrinsic = type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
      return { price: intrinsic, delta: type === 'call' ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0), gamma: 0, theta: 0, vega: 0, rho: 0, intrinsicValue: intrinsic, timeValue: 0 };
    }

    const { d1, d2 } = this.calcD1D2(params);
    const Nd1 = normalCDF(d1);
    const Nd2 = normalCDF(d2);
    const Nd1n = normalCDF(-d1);
    const Nd2n = normalCDF(-d2);
    const nd1 = normalPDF(d1);

    let price: number, delta: number, rho: number;

    if (type === 'call') {
      price = spot * Nd1 - strike * Math.exp(-riskFreeRate * timeToExpiry) * Nd2;
      delta = Nd1;
      rho = strike * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * Nd2 / 100;
    } else {
      price = strike * Math.exp(-riskFreeRate * timeToExpiry) * Nd2n - spot * Nd1n;
      delta = Nd1 - 1;
      rho = -strike * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * Nd2n / 100;
    }

    const gamma = nd1 / (spot * volatility * Math.sqrt(timeToExpiry));
    const vega = spot * nd1 * Math.sqrt(timeToExpiry) / 100;

    let theta: number;
    if (type === 'call') {
      theta = (-(spot * nd1 * volatility) / (2 * Math.sqrt(timeToExpiry)) - riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry) * Nd2) / 365;
    } else {
      theta = (-(spot * nd1 * volatility) / (2 * Math.sqrt(timeToExpiry)) + riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry) * Nd2n) / 365;
    }

    const intrinsicValue = type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    const timeValue = price - intrinsicValue;

    return {
      price: Math.round(price * 10000) / 10000,
      delta: Math.round(delta * 10000) / 10000,
      gamma: Math.round(gamma * 1000000) / 1000000,
      theta: Math.round(theta * 10000) / 10000,
      vega: Math.round(vega * 10000) / 10000,
      rho: Math.round(rho * 10000) / 10000,
      intrinsicValue: Math.round(intrinsicValue * 10000) / 10000,
      timeValue: Math.round(Math.max(0, timeValue) * 10000) / 10000,
    };
  }

  /**
   * 反算隐含波动率(牛顿迭代法)
   */
  impliedVolatility(targetPrice: number, params: Omit<OptionParams, 'volatility'>, maxIter = 100, tolerance = 0.0001): number {
    let vol = 0.3; // 初始猜测
    for (let i = 0; i < maxIter; i++) {
      const greeks = this.calculateGreeks({ ...params, volatility: vol });
      const diff = greeks.price - targetPrice;
      if (Math.abs(diff) < tolerance) return Math.round(vol * 10000) / 10000;

      const vega = greeks.vega * 100; // vega是以百分比为单位的
      if (vega === 0) break;
      vol = vol - diff / vega;
      vol = Math.max(0.01, Math.min(5, vol)); // 限制范围
    }
    return Math.round(vol * 10000) / 10000;
  }

  /**
   * Greeks敏感度分析
   */
  calculateSensitivity(params: OptionParams): GreeksSensitivity {
    const base = this.calculateGreeks(params);
    const dSpot = 0.01;
    const dVol = 0.01;
    const dTime = 1 / 365;

    const upSpot = this.calculateGreeks({ ...params, spot: params.spot * (1 + dSpot) });
    const dnSpot = this.calculateGreeks({ ...params, spot: params.spot * (1 - dSpot) });

    const upVol = this.calculateGreeks({ ...params, volatility: params.volatility + dVol });
    const lessTime = this.calculateGreeks({ ...params, timeToExpiry: Math.max(0.001, params.timeToExpiry - dTime) });

    return {
      spotChange: {
        delta: base.delta,
        gamma: (upSpot.delta - dnSpot.delta) / (2 * params.spot * dSpot),
      },
      volChange: {
        vega: base.vega,
        vomma: (upVol.vega - base.vega) / dVol,
      },
      timeDecay: {
        theta: base.theta,
        charm: (lessTime.delta - base.delta) / (-dTime),
      },
    };
  }

  /**
   * 组合Greeks汇总
   */
  portfolioGreeks(positions: Array<{ params: OptionParams; quantity: number }>): GreeksResult {
    const totals: GreeksResult = { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, intrinsicValue: 0, timeValue: 0 };

    for (const pos of positions) {
      const greeks = this.calculateGreeks(pos.params);
      totals.price += greeks.price * pos.quantity;
      totals.delta += greeks.delta * pos.quantity;
      totals.gamma += greeks.gamma * pos.quantity;
      totals.theta += greeks.theta * pos.quantity;
      totals.vega += greeks.vega * pos.quantity;
      totals.rho += greeks.rho * pos.quantity;
      totals.intrinsicValue += greeks.intrinsicValue * pos.quantity;
      totals.timeValue += greeks.timeValue * pos.quantity;
    }

    Object.keys(totals).forEach(k => {
      (totals as any)[k] = Math.round((totals as any)[k] * 10000) / 10000;
    });

    return totals;
  }
}

export default new OptionsGreeksEngine();
