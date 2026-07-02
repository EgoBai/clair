/**
 * 多维估值模型引擎
 * 综合PE/PB/PS/PEG/DCF估值，自动生成估值区间
 */

export interface ValuationInput {
  symbol: string;
  name: string;
  currentPrice: number;
  eps: number;
  bookValue: number;
  revenue: number;
  sharesOutstanding: number;
  netIncome: number;
  growthRate: number;
  industryPE: number;
  industryPB: number;
  historicalPE: number[];
  historicalPB: number[];
}

export interface ValuationResult {
  symbol: string;
  name: string;
  pe: number;
  pb: number;
  ps: number;
  peg: number;
  fairValuePE: number;
  fairValuePB: number;
  fairValuePS: number;
  fairValuePEG: number;
  compositeFairValue: number;
  currentValue: number;
  marginOfSafety: number;
  valuationBand: { low: number; mid: number; high: number };
  verdict: 'deep_undervalue' | 'undervalue' | 'fair' | 'overvalue' | 'deep_overvalue';
  confidence: number;
}

/**
 * 计算多维估值
 */
export function multiDimensionalValuation(input: ValuationInput): ValuationResult {
  const { currentPrice, eps, bookValue, revenue, sharesOutstanding, netIncome, growthRate, industryPE, industryPB, historicalPE, historicalPB } = input;

  // 基础比率
  const pe = eps > 0 ? currentPrice / eps : Infinity;
  const pb = bookValue > 0 ? currentPrice / bookValue : Infinity;
  const ps = sharesOutstanding > 0 && revenue > 0 ? (currentPrice * sharesOutstanding) / revenue : Infinity;
  const peg = growthRate > 0 && pe !== Infinity ? pe / (growthRate * 100) : Infinity;

  // 历史PE中位数
  const sortedPE = [...historicalPE].sort((a, b) => a - b);
  const sortedPB = [...historicalPB].sort((a, b) => a - b);
  const medianPE = sortedPE.length > 0 ? sortedPE[Math.floor(sortedPE.length / 2)] : industryPE || 15;
  const medianPB = sortedPB.length > 0 ? sortedPB[Math.floor(sortedPB.length / 2)] : industryPB || 1.5;

  // 公允价值
  const fairValuePE = eps > 0 ? eps * medianPE : 0;
  const fairValuePB = bookValue > 0 ? bookValue * medianPB : 0;
  const fairValuePS = sharesOutstanding > 0 ? (revenue / sharesOutstanding) * (industryPE || 15) * 0.1 : 0;
  const fairValuePEG = growthRate > 0 && eps > 0 ? eps * (growthRate * 100) * 1 : 0; // PEG=1

  // 综合公允价值 (加权平均)
  const values = [fairValuePE, fairValuePB, fairValuePS, fairValuePEG].filter(v => v > 0 && isFinite(v));
  const weights = [0.35, 0.25, 0.15, 0.25];
  let compositeFairValue = 0, totalWeight = 0;
  [fairValuePE, fairValuePB, fairValuePS, fairValuePEG].forEach((v, i) => {
    if (v > 0 && isFinite(v)) {
      compositeFairValue += v * weights[i];
      totalWeight += weights[i];
    }
  });
  compositeFairValue = totalWeight > 0 ? compositeFairValue / totalWeight : 0;

  // 安全边际
  const marginOfSafety = compositeFairValue > 0 ? (compositeFairValue - currentPrice) / compositeFairValue : 0;

  // 估值区间
  const valuationBand = {
    low: Math.round(compositeFairValue * 0.7 * 100) / 100,
    mid: Math.round(compositeFairValue * 100) / 100,
    high: Math.round(compositeFairValue * 1.3 * 100) / 100,
  };

  // 判断
  const verdict: ValuationResult['verdict'] =
    marginOfSafety > 0.4 ? 'deep_undervalue' :
    marginOfSafety > 0.15 ? 'undervalue' :
    marginOfSafety > -0.15 ? 'fair' :
    marginOfSafety > -0.3 ? 'overvalue' : 'deep_overvalue';

  // 置信度
  const confidence = Math.min(1, values.length / 4) * (historicalPE.length > 20 ? 0.9 : historicalPE.length > 5 ? 0.7 : 0.5);

  return {
    symbol: input.symbol,
    name: input.name,
    pe: pe === Infinity ? 999 : Math.round(pe * 100) / 100,
    pb: pb === Infinity ? 999 : Math.round(pb * 100) / 100,
    ps: ps === Infinity ? 999 : Math.round(ps * 100) / 100,
    peg: peg === Infinity ? 999 : Math.round(peg * 100) / 100,
    fairValuePE: Math.round(fairValuePE * 100) / 100,
    fairValuePB: Math.round(fairValuePB * 100) / 100,
    fairValuePS: Math.round(fairValuePS * 100) / 100,
    fairValuePEG: Math.round(fairValuePEG * 100) / 100,
    compositeFairValue: Math.round(compositeFairValue * 100) / 100,
    currentValue: currentPrice,
    marginOfSafety: Math.round(marginOfSafety * 10000) / 10000,
    valuationBand,
    verdict,
    confidence: Math.round(confidence * 100) / 100,
  };
}
