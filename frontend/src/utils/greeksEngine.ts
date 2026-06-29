/**
 * 期权希腊字母引擎
 * 精确计算期权Greeks: Delta, Gamma, Theta, Vega, Rho
 */

// ==================== 类型定义 ====================
export interface OptionParams {
  spotPrice: number;
  strikePrice: number;
  timeToExpiry: number; // 年
  riskFreeRate: number;
  volatility: number;
  optionType: 'call' | 'put';
  dividendYield?: number;
}

export interface GreeksResult {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  price: number;
  intrinsicValue: number;
  timeValue: number;
  impliedVolEstimate: number;
}

export interface GreeksSurface {
  strikes: number[];
  expiries: number[];
  deltaSurface: number[][];
  gammaSurface: number[][];
  thetaSurface: number[][];
  vegaSurface: number[][];
}

export interface GreeksRiskMetrics {
  deltaExposure: number;
  gammaExposure: number;
  vegaExposure: number;
  thetaExposure: number;
  netDelta: number;
  netGamma: number;
  hedgeRatio: number;
  maxProfit: number;
  maxLoss: number;
  breakevenPoints: number[];
}

export interface GreeksProfile {
  spotLevels: number[];
  pnlAtExpiry: number[];
  currentPnl: number[];
  deltaProfile: number[];
  gammaProfile: number[];
}

// ==================== 核心引擎 ====================
export class GreeksEngine {
  /**
   * 标准正态分布累积函数 (近似)
   */
  private normalCDF(x: number): number {
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

  /**
   * 标准正态分布概率密度函数
   */
  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * 计算d1和d2
   */
  private calcD1D2(params: OptionParams): { d1: number; d2: number } {
    const { spotPrice: S, strikePrice: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, dividendYield: q = 0 } = params;

    if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
      return { d1: 0, d2: 0 };
    }

    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    return { d1, d2 };
  }

  /**
   * Black-Scholes期权定价 + Greeks
   */
  calculateGreeks(params: OptionParams): GreeksResult {
    const { spotPrice: S, strikePrice: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, optionType, dividendYield: q = 0 } = params;

    // 到期或无波动
    if (T <= 0) {
      const intrinsic = optionType === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
      return {
        delta: optionType === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
        gamma: 0, theta: 0, vega: 0, rho: 0,
        price: intrinsic, intrinsicValue: intrinsic, timeValue: 0,
        impliedVolEstimate: 0
      };
    }

    if (sigma <= 0) {
      const intrinsic = optionType === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
      return {
        delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0,
        price: intrinsic, intrinsicValue: intrinsic, timeValue: 0,
        impliedVolEstimate: 0
      };
    }

    const { d1, d2 } = this.calcD1D2(params);
    const Nd1 = this.normalCDF(d1);
    const Nd2 = this.normalCDF(d2);
    const Nd1_neg = this.normalCDF(-d1);
    const Nd2_neg = this.normalCDF(-d2);
    const nd1 = this.normalPDF(d1);

    const discountFactor = Math.exp(-r * T);
    const dividendFactor = Math.exp(-q * T);

    // Price
    let price: number;
    let delta: number;
    let rho: number;

    if (optionType === 'call') {
      price = S * dividendFactor * Nd1 - K * discountFactor * Nd2;
      delta = dividendFactor * Nd1;
      rho = K * T * discountFactor * Nd2 / 100;
    } else {
      price = K * discountFactor * Nd2_neg - S * dividendFactor * Nd1_neg;
      delta = -dividendFactor * Nd1_neg;
      rho = -K * T * discountFactor * Nd2_neg / 100;
    }

    // Gamma (same for call and put)
    const gamma = dividendFactor * nd1 / (S * sigma * Math.sqrt(T));

    // Theta
    const commonTheta = -(S * dividendFactor * nd1 * sigma) / (2 * Math.sqrt(T));
    let theta: number;
    if (optionType === 'call') {
      theta = (commonTheta - r * K * discountFactor * Nd2 + q * S * dividendFactor * Nd1) / 365;
    } else {
      theta = (commonTheta + r * K * discountFactor * Nd2_neg - q * S * dividendFactor * Nd1_neg) / 365;
    }

    // Vega (per 1% change in vol)
    const vega = S * dividendFactor * nd1 * Math.sqrt(T) / 100;

    // Intrinsic and time value
    const intrinsicValue = optionType === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const timeValue = Math.max(0, price - intrinsicValue);

    return {
      delta: Math.round(delta * 10000) / 10000,
      gamma: Math.round(gamma * 10000) / 10000,
      theta: Math.round(theta * 10000) / 10000,
      vega: Math.round(vega * 10000) / 10000,
      rho: Math.round(rho * 10000) / 10000,
      price: Math.round(price * 10000) / 10000,
      intrinsicValue: Math.round(intrinsicValue * 10000) / 10000,
      timeValue: Math.round(timeValue * 10000) / 10000,
      impliedVolEstimate: sigma
    };
  }

  /**
   * 计算Greeks曲面
   */
  calculateGreeksSurface(
    spotPrice: number,
    strikes: number[],
    expiries: number[],
    riskFreeRate: number,
    volatility: number,
    optionType: 'call' | 'put' = 'call'
  ): GreeksSurface {
    const deltaSurface: number[][] = [];
    const gammaSurface: number[][] = [];
    const thetaSurface: number[][] = [];
    const vegaSurface: number[][] = [];

    for (const expiry of expiries) {
      const deltaRow: number[] = [];
      const gammaRow: number[] = [];
      const thetaRow: number[] = [];
      const vegaRow: number[] = [];

      for (const strike of strikes) {
        const greeks = this.calculateGreeks({
          spotPrice, strikePrice: strike,
          timeToExpiry: expiry, riskFreeRate,
          volatility, optionType
        });

        deltaRow.push(greeks.delta);
        gammaRow.push(greeks.gamma);
        thetaRow.push(greeks.theta);
        vegaRow.push(greeks.vega);
      }

      deltaSurface.push(deltaRow);
      gammaSurface.push(gammaRow);
      thetaSurface.push(thetaRow);
      vegaSurface.push(vegaRow);
    }

    return { strikes, expiries, deltaSurface, gammaSurface, thetaSurface, vegaSurface };
  }

  /**
   * 投资组合Greeks风险分析
   */
  calculatePortfolioRisk(
    positions: { params: OptionParams; quantity: number }[]
  ): GreeksRiskMetrics {
    let netDelta = 0;
    let netGamma = 0;
    let netVega = 0;
    let netTheta = 0;
    let _totalNotional = 0;

    for (const pos of positions) {
      const greeks = this.calculateGreeks(pos.params);
      const multiplier = pos.quantity;

      netDelta += greeks.delta * multiplier;
      netGamma += greeks.gamma * multiplier;
      netVega += greeks.vega * multiplier;
      netTheta += greeks.theta * multiplier;
      _totalNotional += pos.params.spotPrice * Math.abs(multiplier);
    }

    // 对冲比率: 需要多少标的来对冲Delta
    const hedgeRatio = netDelta !== 0 ? -netDelta : 0;

    // 盈亏分析
    const prices = positions.map(p => {
      const greeks = this.calculateGreeks(p.params);
      return greeks.price * p.quantity;
    });
    const totalCost = prices.reduce((s, p) => s + p, 0);

    // 简化最大盈亏
    const maxProfit = positions.reduce((s, p) => {
      if (p.quantity > 0 && p.params.optionType === 'call') {
        return Infinity; // 买入call理论无限
      }
      return s + Math.abs(totalCost);
    }, Math.abs(totalCost));

    const maxLoss = positions.reduce((s, p) => {
      if (p.quantity < 0) return s + Math.abs(totalCost); // 卖出有限盈利无限亏损
      return s + Math.abs(greeksEngine_calcPrice(p.params) * p.quantity);
    }, 0);

    // 盈亏平衡点
    const breakevenPoints = positions.map(p => {
      const greeks = this.calculateGreeks(p.params);
      if (p.params.optionType === 'call') {
        return p.params.strikePrice + greeks.price;
      } else {
        return p.params.strikePrice - greeks.price;
      }
    });

    return {
      deltaExposure: Math.round(netDelta * 10000) / 10000,
      gammaExposure: Math.round(netGamma * 10000) / 10000,
      vegaExposure: Math.round(netVega * 10000) / 10000,
      thetaExposure: Math.round(netTheta * 10000) / 10000,
      netDelta: Math.round(netDelta * 10000) / 10000,
      netGamma: Math.round(netGamma * 10000) / 10000,
      hedgeRatio: Math.round(hedgeRatio * 10000) / 10000,
      maxProfit: Math.round(maxProfit * 100) / 100,
      maxLoss: Math.round(maxLoss * 100) / 100,
      breakevenPoints: breakevenPoints.map(bp => Math.round(bp * 100) / 100)
    };
  }

  /**
   * 生成期权持仓的Greeks轮廓
   */
  generateGreeksProfile(
    params: OptionParams,
    spotRange: number = 0.2, // ±20%
    steps: number = 20
  ): GreeksProfile {
    const { spotPrice } = params;
    const minSpot = spotPrice * (1 - spotRange);
    const maxSpot = spotPrice * (1 + spotRange);
    const step = (maxSpot - minSpot) / steps;

    const spotLevels: number[] = [];
    const pnlAtExpiry: number[] = [];
    const currentPnl: number[] = [];
    const deltaProfile: number[] = [];
    const gammaProfile: number[] = [];

    const currentGreeks = this.calculateGreeks(params);

    for (let i = 0; i <= steps; i++) {
      const spot = minSpot + i * step;
      spotLevels.push(Math.round(spot * 100) / 100);

      // 到期PnL
      const intrinsic = params.optionType === 'call'
        ? Math.max(spot - params.strikePrice, 0)
        : Math.max(params.strikePrice - spot, 0);
      pnlAtExpiry.push(Math.round((intrinsic - currentGreeks.price) * 100) / 100);

      // 当前PnL (用新spot重算价格)
      const newGreeks = this.calculateGreeks({ ...params, spotPrice: spot });
      currentPnl.push(Math.round((newGreeks.price - currentGreeks.price) * 100) / 100);

      deltaProfile.push(Math.round(newGreeks.delta * 10000) / 10000);
      gammaProfile.push(Math.round(newGreeks.gamma * 10000) / 10000);
    }

    return { spotLevels, pnlAtExpiry, currentPnl, deltaProfile, gammaProfile };
  }

  /**
   * 隐含波动率反算 (Newton-Raphson)
   */
  impliedVolatility(
    marketPrice: number,
    params: Omit<OptionParams, 'volatility'>,
    tolerance: number = 0.0001,
    maxIterations: number = 100
  ): number {
    let vol = 0.3; // 初始猜测

    for (let i = 0; i < maxIterations; i++) {
      const greeks = this.calculateGreeks({ ...params, volatility: vol });
      const priceDiff = greeks.price - marketPrice;

      if (Math.abs(priceDiff) < tolerance) return vol;

      // Vega作为导数
      const vegaRaw = greeks.vega * 100; // 转回原始vega
      if (Math.abs(vegaRaw) < 1e-10) break;

      vol = vol - priceDiff / vegaRaw;
      vol = Math.max(0.01, Math.min(vol, 5)); // 限制范围
    }

    return Math.round(vol * 10000) / 10000;
  }
}

// 辅助函数
function greeksEngine_calcPrice(params: OptionParams): number {
  const engine = new GreeksEngine();
  return engine.calculateGreeks(params).price;
}

export default GreeksEngine;
