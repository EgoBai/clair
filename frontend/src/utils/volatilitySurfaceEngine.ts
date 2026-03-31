/**
 * 波动率曲面引擎
 * 隐含波动率曲面构建/微笑偏度/期限结构/Greeks聚合/波动率套利信号
 */

export interface OptionQuote {
  strike: number;
  expiry: string;         // YYYY-MM-DD
  type: 'call' | 'put';
  bid: number;
  ask: number;
  iv: number;             // 隐含波动率
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  volume: number;
  openInterest: number;
}

export interface VolatilityPoint {
  strike: number;
  moneyness: number;      // strike / spot
  dte: number;            // days to expiry
  iv: number;
  ivRank: number;         // IV百分位 (0-100)
  ivPercentile: number;
}

export interface VolatilitySurface {
  underlying: string;
  spot: number;
  date: string;
  points: VolatilityPoint[];
  atmIV: number;          // ATM隐含波动率
  skew25d: number;        // 25 Delta偏度
  termStructure: { dte: number; iv: number }[];
  smile: { moneyness: number; iv: number }[];
}

export interface VolatilitySignal {
  type: 'high_iv' | 'low_iv' | 'skew_steep' | 'term_inversion' | 'pin_risk';
  strength: 'strong' | 'moderate' | 'weak';
  description: string;
  suggestedStrategy: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface GreeksAggregation {
  netDelta: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
  deltaExposure: number;  // 等效股票金额
  gammaRisk: number;      // 0-100
  charmEffect: number;    // delta随时间衰减速度
}

/**
 * 构建波动率曲面
 */
export function buildVolatilitySurface(
  underlying: string,
  spot: number,
  quotes: OptionQuote[],
  ivHistory: number[] = []
): VolatilitySurface {
  const date = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const points: VolatilityPoint[] = quotes.map(q => {
    const moneyness = q.strike / spot;
    const dte = Math.max(0, Math.round(
      (new Date(q.expiry).getTime() - now.getTime()) / 86400000
    ));

    // IV rank
    let ivRank = 50;
    if (ivHistory.length > 0) {
      const min = Math.min(...ivHistory);
      const max = Math.max(...ivHistory);
      ivRank = max > min ? ((q.iv - min) / (max - min)) * 100 : 50;
    }

    // IV percentile
    const ivPercentile = ivHistory.length > 0
      ? (ivHistory.filter(h => h < q.iv).length / ivHistory.length) * 100
      : 50;

    return { strike: q.strike, moneyness, dte, iv: q.iv, ivRank, ivPercentile };
  });

  // ATM IV (最接近1的moneyness)
  const atmPoint = points.reduce((best, p) =>
    Math.abs(p.moneyness - 1) < Math.abs(best.moneyness - 1) ? p : best
  , points[0] ?? { iv: 0, moneyness: 1, dte: 0, strike: spot, ivRank: 50, ivPercentile: 50 });
  const atmIV = atmPoint?.iv ?? 0;

  // 25D偏度: 25D put IV - 25D call IV
  const nearPoints = points.filter(p => p.dte > 0 && p.dte < 60);
  const otmPuts = nearPoints.filter(p => p.moneyness < 0.95);
  const otmCalls = nearPoints.filter(p => p.moneyness > 1.05);
  const putIV = otmPuts.length > 0
    ? otmPuts.reduce((s, p) => s + p.iv, 0) / otmPuts.length
    : atmIV;
  const callIV = otmCalls.length > 0
    ? otmCalls.reduce((s, p) => s + p.iv, 0) / otmCalls.length
    : atmIV;
  const skew25d = putIV - callIV;

  // 期限结构
  const byDte = new Map<number, number[]>();
  points.forEach(p => {
    const bucket = Math.round(p.dte / 30) * 30;
    const list = byDte.get(bucket) ?? [];
    list.push(p.iv);
    byDte.set(bucket, list);
  });
  const termStructure = Array.from(byDte.entries())
    .map(([dte, ivs]) => ({
      dte,
      iv: ivs.reduce((s, v) => s + v, 0) / ivs.length,
    }))
    .sort((a, b) => a.dte - b.dte);

  // 微笑曲线 (近月)
  const smile = nearPoints
    .map(p => ({ moneyness: p.moneyness, iv: p.iv }))
    .sort((a, b) => a.moneyness - b.moneyness);

  return { underlying, spot, date, points, atmIV, skew25d, termStructure, smile };
}

/**
 * 生成波动率信号
 */
export function generateVolSignals(
  surface: VolatilitySurface,
  historicalAtmIV: number[] = []
): VolatilitySignal[] {
  const signals: VolatilitySignal[] = [];

  // IV Rank信号
  if (historicalAtmIV.length > 10) {
    const sorted = [...historicalAtmIV].sort((a, b) => a - b);
    const rank = sorted.filter(v => v < surface.atmIV).length / sorted.length;

    if (rank > 0.8) {
      signals.push({
        type: 'high_iv',
        strength: rank > 0.9 ? 'strong' : 'moderate',
        description: `IV处于${(rank * 100).toFixed(0)}%百分位，历史偏高`,
        suggestedStrategy: '卖波动率策略(铁鹰/跨式卖出)',
        riskLevel: 'medium',
      });
    } else if (rank < 0.2) {
      signals.push({
        type: 'low_iv',
        strength: rank < 0.1 ? 'strong' : 'moderate',
        description: `IV处于${(rank * 100).toFixed(0)}%百分位，历史偏低`,
        suggestedStrategy: '买波动率策略(跨式买入/宽跨式)',
        riskLevel: 'medium',
      });
    }
  }

  // 偏度信号
  if (Math.abs(surface.skew25d) > 0.05) {
    signals.push({
      type: 'skew_steep',
      strength: Math.abs(surface.skew25d) > 0.1 ? 'strong' : 'moderate',
      description: `偏度异常: ${surface.skew25d > 0 ? 'Put端偏高' : 'Call端偏高'}`,
      suggestedStrategy: surface.skew25d > 0
        ? 'Put价差/风险逆转'
        : 'Call价差/备兑开仓',
      riskLevel: 'medium',
    });
  }

  // 期限结构倒挂
  if (surface.termStructure.length >= 2) {
    const near = surface.termStructure[0];
    const far = surface.termStructure[surface.termStructure.length - 1];
    if (near.iv > far.iv * 1.1) {
      signals.push({
        type: 'term_inversion',
        strength: near.iv > far.iv * 1.2 ? 'strong' : 'moderate',
        description: `近月IV(${(near.iv * 100).toFixed(1)}%)高于远月(${(far.iv * 100).toFixed(1)}%)`,
        suggestedStrategy: '日历价差(卖近买远)',
        riskLevel: 'low',
      });
    }
  }

  // Pin风险 (大量OI集中在某strike附近)
  // 简化检测
  if (surface.smile.length > 2) {
    const maxIv = Math.max(...surface.smile.map(s => s.iv));
    const minIv = Math.min(...surface.smile.map(s => s.iv));
    if (maxIv - minIv < 0.02) {
      signals.push({
        type: 'pin_risk',
        strength: 'weak',
        description: '波动率微笑平坦，可能有Pin风险',
        suggestedStrategy: '避免持有到期/提前平仓',
        riskLevel: 'high',
      });
    }
  }

  return signals;
}

/**
 * 聚合Greeks
 */
export function aggregateGreeks(
  positions: { quote: OptionQuote; quantity: number }[]
): GreeksAggregation {
  let netDelta = 0;
  let netGamma = 0;
  let netTheta = 0;
  let netVega = 0;

  for (const pos of positions) {
    const mult = pos.quantity * 100; // 每手100股
    netDelta += pos.quote.delta * mult;
    netGamma += pos.quote.gamma * mult;
    netTheta += pos.quote.theta * mult;
    netVega += pos.quote.vega * mult;
  }

  const deltaExposure = Math.abs(netDelta) * 100; // 假设均价100
  const gammaRisk = Math.min(100, Math.abs(netGamma) * 1000);

  // Charm: 简化为theta/delta比
  const charmEffect = netDelta !== 0 ? netTheta / netDelta : 0;

  return {
    netDelta,
    netGamma,
    netTheta,
    netVega,
    deltaExposure,
    gammaRisk,
    charmEffect,
  };
}

/**
 * 波动率套利机会检测
 */
export function findVolArbitrage(
  surface: VolatilitySurface
): { type: string; legs: string; expectedProfit: number; risk: string }[] {
  const opportunities: { type: string; legs: string; expectedProfit: number; risk: string }[] = [];

  // 检查日历套利: 近月IV > 远月IV + 交易成本
  if (surface.termStructure.length >= 2) {
    for (let i = 0; i < surface.termStructure.length - 1; i++) {
      const near = surface.termStructure[i];
      const far = surface.termStructure[i + 1];
      const spread = near.iv - far.iv;

      if (spread > 0.03) {
        opportunities.push({
          type: '日历套利',
          legs: `卖${near.dte}D / 买${far.dte}D`,
          expectedProfit: spread * 0.5, // 扣除交易成本
          risk: '时间衰减不对称/波动率跳变',
        });
      }
    }
  }

  // 检查垂直价差机会
  if (surface.smile.length >= 3) {
    for (let i = 1; i < surface.smile.length - 1; i++) {
      const prev = surface.smile[i - 1];
      const curr = surface.smile[i];
      const next = surface.smile[i + 1];

      // 凸性异常: 中间点IV低于两端线性插值
      const linearIV = (prev.iv + next.iv) / 2;
      if (curr.iv < linearIV - 0.02) {
        opportunities.push({
          type: '蝶式套利',
          legs: `Moneyness ${prev.moneyness.toFixed(2)}-${curr.moneyness.toFixed(2)}-${next.moneyness.toFixed(2)}`,
          expectedProfit: (linearIV - curr.iv) * 0.3,
          risk: '流动性不足/执行风险',
        });
      }
    }
  }

  return opportunities;
}
