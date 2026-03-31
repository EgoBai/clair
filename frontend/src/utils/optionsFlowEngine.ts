/**
 * 期权资金流引擎
 * 期权资金流分析：Put/Call比率、大额期权交易、隐含波动率曲面异常检测
 */

export interface OptionsFlow {
  timestamp: string;
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  price: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  underlyingPrice: number;
  side: 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close' | 'unknown';
}

export interface PCRAnalysis {
  date: string;
  volumePCR: number; // Put/Call 成交量比
  oiPCR: number; // Put/Call 持仓量比
  premiumPCR: number; // Put/Call 成交额比
  sentiment: 'bullish' | 'bearish' | 'neutral';
  historicalPercentile: number;
}

export interface UnusualActivity {
  flow: OptionsFlow;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  score: number;
}

export interface IVSurfacePoint {
  strike: number;
  expiry: string;
  iv: number;
  moneyness: number; // K/S
  dte: number; // Days to expiry
}

export interface IVSurfaceAnalysis {
  skew: number; // 偏度
  termStructure: number; // 期限结构斜率
  atmIV: number;
  putIVAvg: number;
  callIVAvg: number;
  ivRank: number; // 0-100
  anomalies: { strike: number; expiry: string; expectedIV: number; actualIV: number; zScore: number }[];
}

export interface SmartMoneyFlow {
  date: string;
  netCallPremium: number;
  netPutPremium: number;
  netDelta: number;
  netGamma: number;
  estimatedDirection: 'bullish' | 'bearish' | 'hedging';
  conviction: number; // 0-100
}

/**
 * 计算 Put/Call 比率分析
 */
export function calculatePCR(
  flows: OptionsFlow[],
  historicalPCRs: number[] = []
): PCRAnalysis[] {
  // 按日期分组
  const byDate = new Map<string, OptionsFlow[]>();
  for (const flow of flows) {
    const date = flow.timestamp.split('T')[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(flow);
  }

  const results: PCRAnalysis[] = [];

  for (const [date, dayFlows] of byDate) {
    const callFlows = dayFlows.filter(f => f.type === 'call');
    const putFlows = dayFlows.filter(f => f.type === 'put');

    const callVolume = callFlows.reduce((a, f) => a + f.volume, 0);
    const putVolume = putFlows.reduce((a, f) => a + f.volume, 0);
    const callOI = callFlows.reduce((a, f) => a + f.openInterest, 0);
    const putOI = putFlows.reduce((a, f) => a + f.openInterest, 0);
    const callPremium = callFlows.reduce((a, f) => a + f.price * f.volume * 100, 0);
    const putPremium = putFlows.reduce((a, f) => a + f.price * f.volume * 100, 0);

    const volumePCR = callVolume > 0 ? putVolume / callVolume : 0;
    const oiPCR = callOI > 0 ? putOI / callOI : 0;
    const premiumPCR = callPremium > 0 ? putPremium / callPremium : 0;

    // 历史百分位
    const allPCRs = [...historicalPCRs, volumePCR].sort((a, b) => a - b);
    const idx = allPCRs.indexOf(volumePCR);
    const historicalPercentile = (idx / allPCRs.length) * 100;

    // 情绪判断
    let sentiment: PCRAnalysis['sentiment'] = 'neutral';
    if (volumePCR > 1.2) sentiment = 'bearish'; // Put 成交多 → 看跌
    else if (volumePCR < 0.7) sentiment = 'bullish'; // Call 成交多 → 看涨

    results.push({
      date,
      volumePCR: Math.round(volumePCR * 100) / 100,
      oiPCR: Math.round(oiPCR * 100) / 100,
      premiumPCR: Math.round(premiumPCR * 100) / 100,
      sentiment,
      historicalPercentile: Math.round(historicalPercentile * 10) / 10,
    });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 检测异常期权活动
 */
export function detectUnusualActivity(
  flows: OptionsFlow[],
  config: {
    volumeMultiplier?: number;
    oiRatioThreshold?: number;
    premiumThreshold?: number;
    ivPercentileThreshold?: number;
  } = {}
): UnusualActivity[] {
  const {
    volumeMultiplier = 5,
    oiRatioThreshold = 0.5,
    premiumThreshold = 100000,
    ivPercentileThreshold = 90,
  } = config;

  const unusual: UnusualActivity[] = [];

  // 计算各标的的平均成交量
  const symbolVolumes = new Map<string, number[]>();
  for (const flow of flows) {
    if (!symbolVolumes.has(flow.symbol)) symbolVolumes.set(flow.symbol, []);
    symbolVolumes.get(flow.symbol)!.push(flow.volume);
  }
  const avgVolumes = new Map<string, number>();
  for (const [sym, vols] of symbolVolumes) {
    avgVolumes.set(sym, vols.reduce((a, b) => a + b, 0) / vols.length);
  }

  // 计算 IV 百分位
  const ivs = flows.map(f => f.impliedVolatility).sort((a, b) => a - b);

  for (const flow of flows) {
    let score = 0;
    const reasons: string[] = [];

    // 成交量异常
    const avgVol = avgVolumes.get(flow.symbol) || 0;
    if (avgVol > 0 && flow.volume > avgVol * volumeMultiplier) {
      score += 30;
      reasons.push(`成交量 ${flow.volume} 是平均 ${Math.round(avgVol)} 的 ${(flow.volume / avgVol).toFixed(1)} 倍`);
    }

    // 成交量 > 持仓量 → 新开仓活跃
    if (flow.openInterest > 0 && flow.volume / flow.openInterest > oiRatioThreshold) {
      score += 20;
      reasons.push(`成交量/持仓量比 ${(flow.volume / flow.openInterest).toFixed(2)} 超过阈值`);
    }

    // 大额权利金
    const premium = flow.price * flow.volume * 100;
    if (premium > premiumThreshold) {
      score += 25;
      reasons.push(`权利金 $${Math.round(premium).toLocaleString()} 超过阈值`);
    }

    // IV 极端
    const ivIdx = ivs.indexOf(flow.impliedVolatility);
    const ivPercentile = (ivIdx / ivs.length) * 100;
    if (ivPercentile > ivPercentileThreshold) {
      score += 15;
      reasons.push(`IV 百分位 ${ivPercentile.toFixed(0)}% 处于极端高位`);
    }

    // 深度虚值大单
    const moneyness = flow.type === 'call'
      ? flow.strike / flow.underlyingPrice
      : flow.underlyingPrice / flow.strike;
    if (moneyness > 1.15 && flow.volume > avgVol * 2) {
      score += 10;
      reasons.push(`深度虚值期权大单 (moneyness: ${moneyness.toFixed(3)})`);
    }

    if (score > 0) {
      unusual.push({
        flow,
        reason: reasons.join('; '),
        severity: score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low',
        score,
      });
    }
  }

  return unusual.sort((a, b) => b.score - a.score);
}

/**
 * 分析隐含波动率曲面
 */
export function analyzeIVSurface(
  surface: IVSurfacePoint[],
  underlyingPrice: number
): IVSurfaceAnalysis {
  if (surface.length < 3) {
    return {
      skew: 0, termStructure: 0, atmIV: 0,
      putIVAvg: 0, callIVAvg: 0, ivRank: 0, anomalies: [],
    };
  }

  // ATM IV: 最接近平值的 IV
  const sortedByStrike = [...surface].sort((a, b) =>
    Math.abs(a.moneyness - 1) - Math.abs(b.moneyness - 1)
  );
  const atmIV = sortedByStrike[0].iv;

  // 偏度: 虚值Put IV - 虚值Call IV
  const otmPuts = surface.filter(p => p.moneyness < 0.95);
  const otmCalls = surface.filter(p => p.moneyness > 1.05);
  const putIVAvg = otmPuts.length > 0
    ? otmPuts.reduce((a, p) => a + p.iv, 0) / otmPuts.length
    : atmIV;
  const callIVAvg = otmCalls.length > 0
    ? otmCalls.reduce((a, p) => a + p.iv, 0) / otmCalls.length
    : atmIV;
  const skew = putIVAvg - callIVAvg;

  // 期限结构: 远期 IV - 近期 IV
  const nearTerm = surface.filter(p => p.dte <= 30);
  const farTerm = surface.filter(p => p.dte > 60);
  const nearIV = nearTerm.length > 0
    ? nearTerm.reduce((a, p) => a + p.iv, 0) / nearTerm.length
    : atmIV;
  const farIV = farTerm.length > 0
    ? farTerm.reduce((a, p) => a + p.iv, 0) / farTerm.length
    : atmIV;
  const termStructure = farIV - nearIV;

  // IV Rank
  const allIVs = surface.map(p => p.iv);
  const minIV = Math.min(...allIVs);
  const maxIV = Math.max(...allIVs);
  const ivRank = maxIV > minIV ? ((atmIV - minIV) / (maxIV - minIV)) * 100 : 50;

  // 异常检测: 使用简单插值找偏离
  const anomalies: IVSurfaceAnalysis['anomalies'] = [];
  for (const point of surface) {
    // 找最近的两个点插值
    const sameDte = surface
      .filter(p => Math.abs(p.dte - point.dte) <= 5 && p !== point)
      .sort((a, b) => Math.abs(a.moneyness - point.moneyness) - Math.abs(b.moneyness - point.moneyness));

    if (sameDte.length >= 2) {
      const expectedIV = (sameDte[0].iv + sameDte[1].iv) / 2;
      const diff = point.iv - expectedIV;
      const localStd = Math.sqrt(
        sameDte.reduce((a, p) => a + (p.iv - expectedIV) ** 2, 0) / sameDte.length
      );
      const zScore = localStd > 0 ? diff / localStd : 0;

      if (Math.abs(zScore) > 2) {
        anomalies.push({
          strike: point.strike,
          expiry: point.expiry,
          expectedIV: Math.round(expectedIV * 10000) / 10000,
          actualIV: Math.round(point.iv * 10000) / 10000,
          zScore: Math.round(zScore * 100) / 100,
        });
      }
    }
  }

  return {
    skew: Math.round(skew * 10000) / 10000,
    termStructure: Math.round(termStructure * 10000) / 10000,
    atmIV: Math.round(atmIV * 10000) / 10000,
    putIVAvg: Math.round(putIVAvg * 10000) / 10000,
    callIVAvg: Math.round(callIVAvg * 10000) / 10000,
    ivRank: Math.round(ivRank * 10) / 10,
    anomalies,
  };
}

/**
 * 追踪聪明钱（Smart Money）期权流向
 */
export function trackSmartMoney(flows: OptionsFlow[]): SmartMoneyFlow[] {
  // 按日期分组
  const byDate = new Map<string, OptionsFlow[]>();
  for (const flow of flows) {
    const date = flow.timestamp.split('T')[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(flow);
  }

  const results: SmartMoneyFlow[] = [];

  for (const [date, dayFlows] of byDate) {
    // 只看大单（成交量 > 100）
    const largeFlows = dayFlows.filter(f => f.volume >= 100);

    let netCallPremium = 0;
    let netPutPremium = 0;
    let netDelta = 0;
    let netGamma = 0;

    for (const flow of largeFlows) {
      const premium = flow.price * flow.volume * 100;
      const signedVolume = flow.side === 'buy_to_open' || flow.side === 'sell_to_close'
        ? flow.volume
        : -flow.volume;

      if (flow.type === 'call') {
        netCallPremium += signedVolume > 0 ? premium : -premium;
      } else {
        netPutPremium += signedVolume > 0 ? premium : -premium;
      }

      netDelta += flow.delta * signedVolume * 100;
      netGamma += flow.gamma * signedVolume * 100;
    }

    // 判断方向
    const totalPremium = Math.abs(netCallPremium) + Math.abs(netPutPremium);
    const premiumRatio = totalPremium > 0 ? netCallPremium / totalPremium : 0;

    let estimatedDirection: SmartMoneyFlow['estimatedDirection'] = 'hedging';
    if (premiumRatio > 0.6 && netDelta > 0) estimatedDirection = 'bullish';
    else if (premiumRatio < 0.4 && netDelta < 0) estimatedDirection = 'bearish';

    // 信心度
    const conviction = Math.min(100, Math.abs(premiumRatio - 0.5) * 200 + largeFlows.length * 5);

    results.push({
      date,
      netCallPremium: Math.round(netCallPremium),
      netPutPremium: Math.round(netPutPremium),
      netDelta: Math.round(netDelta),
      netGamma: Math.round(netGamma * 100) / 100,
      estimatedDirection,
      conviction: Math.round(conviction),
    });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 计算最大痛苦价格（Max Pain）
 * 使所有期权持有者总损失最大的价格
 */
export function calculateMaxPain(
  options: { strike: number; callOI: number; putOI: number }[]
): { maxPain: number; painByStrike: { strike: number; totalPain: number }[] } {
  if (options.length === 0) {
    return { maxPain: 0, painByStrike: [] };
  }

  const strikes = [...new Set(options.map(o => o.strike))].sort((a, b) => a - b);
  const painByStrike: { strike: number; totalPain: number }[] = [];

  for (const testStrike of strikes) {
    let totalPain = 0;

    for (const opt of options) {
      // Call 持有者的痛苦
      if (testStrike > opt.strike) {
        totalPain += (testStrike - opt.strike) * opt.callOI * 100;
      }
      // Put 持有者的痛苦
      if (testStrike < opt.strike) {
        totalPain += (opt.strike - testStrike) * opt.putOI * 100;
      }
    }

    painByStrike.push({ strike: testStrike, totalPain });
  }

  const maxPainEntry = painByStrike.reduce((min, p) => p.totalPain < min.totalPain ? p : min);
  return { maxPain: maxPainEntry.strike, painByStrike };
}

/**
 * Gamma 敞口分析
 * 分析做市商的 Gamma 对冲压力
 */
export function analyzeGammaExposure(
  options: { strike: number; gamma: number; oi: number; type: 'call' | 'put' }[],
  underlyingPrice: number
): {
  totalGamma: number;
  gammaByStrike: { strike: number; netGamma: number }[];
  flipPoint: number; // Gamma 翻转点
  hedgingPressure: 'positive' | 'negative' | 'neutral';
} {
  const byStrike = new Map<number, number>();

  for (const opt of options) {
    const signedGamma = opt.type === 'call' ? opt.gamma : -opt.gamma;
    const current = byStrike.get(opt.strike) || 0;
    byStrike.set(opt.strike, current + signedGamma * opt.oi * 100);
  }

  const gammaByStrike = Array.from(byStrike.entries())
    .map(([strike, netGamma]) => ({ strike, netGamma: Math.round(netGamma * 100) / 100 }))
    .sort((a, b) => a.strike - b.strike);

  const totalGamma = gammaByStrike.reduce((a, g) => a + g.netGamma, 0);

  // Gamma 翻转点: 从负变正的价格
  let flipPoint = underlyingPrice;
  for (let i = 1; i < gammaByStrike.length; i++) {
    if (gammaByStrike[i - 1].netGamma < 0 && gammaByStrike[i].netGamma >= 0) {
      flipPoint = gammaByStrike[i].strike;
      break;
    }
  }

  // 对冲压力
  const nearGamma = gammaByStrike
    .filter(g => Math.abs(g.strike - underlyingPrice) / underlyingPrice < 0.05)
    .reduce((a, g) => a + g.netGamma, 0);

  let hedgingPressure: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (nearGamma > 0) hedgingPressure = 'positive'; // 正Gamma → 低买高卖 → 波动率降低
  else if (nearGamma < 0) hedgingPressure = 'negative'; // 负Gamma → 高买低卖 → 波动率放大

  return {
    totalGamma: Math.round(totalGamma * 100) / 100,
    gammaByStrike,
    flipPoint,
    hedgingPressure,
  };
}

/**
 * 期权交易策略推荐
 */
export function recommendStrategies(
  ivRank: number,
  skew: number,
  termStructure: number,
  directionalView: 'bullish' | 'bearish' | 'neutral',
  ivView: 'expanding' | 'contracting' | 'neutral'
): { strategy: string; reason: string; confidence: number }[] {
  const recommendations: { strategy: string; reason: string; confidence: number }[] = [];

  // IV 策略
  if (ivRank > 80) {
    recommendations.push({
      strategy: 'Iron Condor',
      reason: `IV Rank ${ivRank.toFixed(0)}% 极高，适合卖波动率`,
      confidence: 80,
    });
    recommendations.push({
      strategy: 'Short Straddle',
      reason: `高 IV 环境，时间价值衰减有利`,
      confidence: 70,
    });
  } else if (ivRank < 20) {
    recommendations.push({
      strategy: 'Long Straddle',
      reason: `IV Rank ${ivRank.toFixed(0)}% 极低，波动率有上升空间`,
      confidence: 75,
    });
    recommendations.push({
      strategy: 'Calendar Spread',
      reason: `低 IV 环境适合买入远期、卖出近期`,
      confidence: 65,
    });
  }

  // 方向策略
  if (directionalView === 'bullish' && ivRank < 50) {
    recommendations.push({
      strategy: 'Bull Call Spread',
      reason: `看涨观点 + 低 IV → 借贷式看涨价差`,
      confidence: 70,
    });
  } else if (directionalView === 'bearish' && ivRank < 50) {
    recommendations.push({
      strategy: 'Bear Put Spread',
      reason: `看跌观点 + 低 IV → 借贷式看跌价差`,
      confidence: 70,
    });
  }

  // 偏度策略
  if (skew > 0.05) {
    recommendations.push({
      strategy: 'Risk Reversal (Sell Put / Buy Call)',
      reason: `正偏度 ${skew.toFixed(3)} 表示 Put 相对昂贵`,
      confidence: 60,
    });
  } else if (skew < -0.05) {
    recommendations.push({
      strategy: 'Risk Reversal (Sell Call / Buy Put)',
      reason: `负偏度 ${skew.toFixed(3)} 表示 Call 相对昂贵`,
      confidence: 60,
    });
  }

  // 期限结构策略
  if (termStructure > 0.03) {
    recommendations.push({
      strategy: 'Calendar Spread',
      reason: `正期限结构（远期IV高于近期），适合日历价差`,
      confidence: 65,
    });
  }

  return recommendations.sort((a, b) => b.confidence - a.confidence);
}
