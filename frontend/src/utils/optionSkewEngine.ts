/**
 * 期权偏度分析引擎
 * - 看涨看跌比率(PC Ratio)
 * - 波动率微笑/偏斜
 * - 隐含波动率曲面
 * - 期权情绪指标
 * - 极端事件预警
 */
export interface OptionData {
  strike: number;
  callPrice: number;
  putPrice: number;
  callVolume: number;
  putVolume: number;
  callOI: number; // 持仓量
  putOI: number;
  iv: number; // 隐含波动率
  delta: number;
  gamma: number;
  expiry: string;
}

export interface OptionSkewResult {
  putCallRatio: number; // PC比率(成交量)
  putCallOIRatio: number; // PC比率(持仓量)
  skew: number; // 偏度(OTM put IV - OTM call IV)
  smileWidth: number; // 微笑宽度
  ivTermStructure: 'contango' | 'backwardation' | 'flat';
  sentiment: 'bearish' | 'neutral' | 'bullish';
  fearIndex: number; // 恐慌指数 0-100
  extremeEventProbability: number; // 极端事件概率
  maxPain: number; // 最大痛点
  keyInsights: string[];
}

export function analyzeOptionSkew(options: OptionData[], spotPrice: number): OptionSkewResult {
  if (options.length < 3) throw new Error('至少需要3个期权数据');
  const keyInsights: string[] = [];

  // PC比率
  const totalCallVol = options.reduce((s, o) => s + o.callVolume, 0);
  const totalPutVol = options.reduce((s, o) => s + o.putVolume, 0);
  const totalCallOI = options.reduce((s, o) => s + o.callOI, 0);
  const totalPutOI = options.reduce((s, o) => s + o.putOI, 0);

  const putCallRatio = totalCallVol > 0 ? totalPutVol / totalCallVol : 0;
  const putCallOIRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

  // 偏度 (OTM期权)
  const otmPuts = options.filter(o => o.strike < spotPrice * 0.95);
  const otmCalls = options.filter(o => o.strike > spotPrice * 1.05);
  const avgOtmPutIV = otmPuts.length > 0 ? otmPuts.reduce((s, o) => s + o.iv, 0) / otmPuts.length : 0;
  const avgOtmCallIV = otmCalls.length > 0 ? otmCalls.reduce((s, o) => s + o.iv, 0) / otmCalls.length : 0;
  const skew = avgOtmPutIV - avgOtmCallIV;

  // 微笑宽度
  const atm = options.filter(o => Math.abs(o.strike - spotPrice) / spotPrice < 0.03);
  const atmIV = atm.length > 0 ? atm.reduce((s, o) => s + o.iv, 0) / atm.length : 0;
  const smileWidth = avgOtmPutIV + avgOtmCallIV - 2 * atmIV;

  // 波动率期限结构
  const expiries = [...new Set(options.map(o => o.expiry))].sort();
  let ivTermStructure: OptionSkewResult['ivTermStructure'] = 'flat';
  if (expiries.length >= 2) {
    const nearIV = options.filter(o => o.expiry === expiries[0]).reduce((s, o) => s + o.iv, 0) / options.filter(o => o.expiry === expiries[0]).length;
    const farIV = options.filter(o => o.expiry === expiries[expiries.length - 1]).reduce((s, o) => s + o.iv, 0) / options.filter(o => o.expiry === expiries[expiries.length - 1]).length;
    if (nearIV > farIV + 0.02) ivTermStructure = 'backwardation';
    else if (farIV > nearIV + 0.02) ivTermStructure = 'contango';
  }

  // 情绪
  let sentiment: OptionSkewResult['sentiment'];
  if (putCallRatio > 1.2) { sentiment = 'bearish'; keyInsights.push('PC比率偏高，市场情绪偏空'); }
  else if (putCallRatio < 0.7) { sentiment = 'bullish'; keyInsights.push('PC比率偏低，市场情绪偏多'); }
  else sentiment = 'neutral';

  // 恐慌指数
  const fearIndex = Math.min(100, Math.max(0,
    skew * 200 + putCallRatio * 25 + (atmIV > 0.3 ? 20 : 0)
  ));

  // 极端事件概率
  const extremeEventProbability = Math.min(1, Math.max(0,
    (skew > 0.05 ? 0.3 : 0) + (putCallRatio > 1.5 ? 0.2 : 0) + (atmIV > 0.4 ? 0.3 : 0)
  ));

  // 最大痛点
  const maxPain = options.reduce((best, o) => {
    const painAtStrike = options.reduce((s, opt) => {
      return s + Math.abs(opt.strike - o.strike) * (opt.callOI + opt.putOI);
    }, 0);
    const painAtBest = options.reduce((s, opt) => {
      return s + Math.abs(opt.strike - best) * (opt.callOI + opt.putOI);
    }, 0);
    return painAtStrike < painAtBest ? o.strike : best;
  }, spotPrice);

  if (skew > 0.05) keyInsights.push('波动率偏斜显著，看跌保护需求高');
  if (extremeEventProbability > 0.5) keyInsights.push('极端事件风险上升');

  return {
    putCallRatio: Math.round(putCallRatio * 100) / 100,
    putCallOIRatio: Math.round(putCallOIRatio * 100) / 100,
    skew: Math.round(skew * 10000) / 10000,
    smileWidth: Math.round(smileWidth * 10000) / 10000,
    ivTermStructure,
    sentiment,
    fearIndex: Math.round(fearIndex),
    extremeEventProbability: Math.round(extremeEventProbability * 100) / 100,
    maxPain,
    keyInsights,
  };
}
