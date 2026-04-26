/**
 * OptionsSkewEngine - 期权偏度引擎
 * 计算波动率曲面偏度和风险中性偏度指标
 */

export interface OptionIV {
  strike: number;
  iv: number;
  delta: number;
}

export interface SkewResult {
  skewness: number;        // 偏度系数
  smirk: number;           // 微笑曲线斜率
  putCallSkew: number;     // Put/Call IV比
  tailRisk: number;        // 尾部风险指标
  riskReversal: number;    // 风险逆转
  butterfly: number;       // 蝶式价差
}

export function analyzeSkew(options: OptionIV[], atmStrike: number): SkewResult | null {
  if (options.length < 3) return null;
  const sorted = [...options].sort((a, b) => a.strike - b.strike);
  const ivs = sorted.map(o => o.iv);

  const mean = ivs.reduce((s, v) => s + v, 0) / ivs.length;
  const std = Math.sqrt(ivs.reduce((s, v) => s + (v - mean) ** 2, 0) / (ivs.length - 1));
  const skewness = std > 0 ? ivs.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / (ivs.length - 1) : 0;

  const atm = sorted.reduce((prev, curr) => Math.abs(curr.strike - atmStrike) < Math.abs(prev.strike - atmStrike) ? curr : prev);
  const otm = sorted.filter(o => o.delta < 0 && o.delta > -0.5);
  const itm = sorted.filter(o => o.delta > 0 && o.delta < 0.5);

  const avgOtm = otm.length ? otm.reduce((s, o) => s + o.iv, 0) / otm.length : atm.iv;
  const avgItm = itm.length ? itm.reduce((s, o) => s + o.iv, 0) / itm.length : atm.iv;

  const smirk = sorted.length >= 2 ? (sorted[sorted.length - 1].iv - sorted[0].iv) / (sorted[sorted.length - 1].strike - sorted[0].strike) : 0;
  const putCallSkew = avgItm > 0 ? avgOtm / avgItm : 1;
  const tailRisk = avgOtm - atm.iv;
  const riskReversal = avgOtm - avgItm;
  const butterfly = (avgOtm + avgItm) / 2 - atm.iv;

  return { skewness: Math.round(skewness * 100) / 100, smirk: Math.round(smirk * 10000) / 10000, putCallSkew: Math.round(putCallSkew * 10000) / 10000, tailRisk: Math.round(tailRisk * 10000) / 10000, riskReversal: Math.round(riskReversal * 10000) / 10000, butterfly: Math.round(butterfly * 10000) / 10000 };
}
