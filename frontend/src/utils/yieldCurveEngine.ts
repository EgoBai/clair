/**
 * 收益率曲线分析引擎
 * - 曲线形态识别(正常/平坦/倒挂)
 * - 期限利差分析
 * - 曲线变动预测
 * - 利率周期判断
 * - 对股市的影响评估
 */
export interface YieldCurveData {
  m1: number;   // 1月期
  m3: number;   // 3月期
  m6: number;   // 6月期
  y1: number;   // 1年期
  y2: number;   // 2年期
  y5: number;   // 5年期
  y10: number;  // 10年期
  y30: number;  // 30年期
  history10y: { date: string; yield: number }[]; // 10年期历史
  history2y: { date: string; yield: number }[]; // 2年期历史
}

export interface YieldCurveResult {
  curveShape: 'steep' | 'normal' | 'flat' | 'inverted';
  spread10y2y: number; // 10Y-2Y利差
  spread10y3m: number; // 10Y-3M利差
  termPremium: number; // 期限溢价
  bullBearSignal: 'bullish' | 'bearish' | 'neutral';
  rateCycle: 'early_easing' | 'mid_easing' | 'late_easing' | 'early_tightening' | 'mid_tightening' | 'late_tightening';
  recessionProbability: number; // 0-1
  equityImpact: 'positive' | 'negative' | 'neutral';
  durationRisk: 'low' | 'moderate' | 'high';
  curveSlope: number;
  keyInsights: string[];
}

export function analyzeYieldCurve(data: YieldCurveData): YieldCurveResult {
  const keyInsights: string[] = [];
  const curve = [data.m1, data.m3, data.m6, data.y1, data.y2, data.y5, data.y10, data.y30];

  // 10Y-2Y利差
  const spread10y2y = data.y10 - data.y2;
  const spread10y3m = data.y10 - data.m3;

  // 曲线形态
  let curveShape: YieldCurveResult['curveShape'];
  if (spread10y2y < 0) {
    curveShape = 'inverted';
    keyInsights.push('收益率曲线倒挂，衰退信号');
  } else if (spread10y2y < 0.5) {
    curveShape = 'flat';
  } else if (spread10y2y > 1.5) {
    curveShape = 'steep';
  } else {
    curveShape = 'normal';
  }

  // 期限溢价
  const termPremium = data.y10 - data.y1;

  // 曲线斜率
  const curveSlope = (data.y30 - data.m1) / 29;

  // 利率周期判断
  const recent10y = data.history10y.slice(-60);
  const recent2y = data.history2y.slice(-60);
  let rateCycle: YieldCurveResult['rateCycle'] = 'mid_easing';

  if (recent10y.length >= 30) {
    const older10y = recent10y.slice(0, 15).reduce((s, d) => s + d.yield, 0) / 15;
    const newer10y = recent10y.slice(-15).reduce((s, d) => s + d.yield, 0) / 15;
    const older2y = recent2y.slice(0, 15).reduce((s, d) => s + d.yield, 0) / 15;
    const newer2y = recent2y.slice(-15).reduce((s, d) => s + d.yield, 0) / 15;

    const longTrend = newer10y - older10y;
    const shortTrend = newer2y - older2y;

    if (longTrend > 0.2 && shortTrend > 0.3) rateCycle = 'early_tightening';
    else if (longTrend > 0 && shortTrend > 0) rateCycle = 'mid_tightening';
    else if (longTrend < 0 && shortTrend > 0) rateCycle = 'late_tightening';
    else if (longTrend < -0.2 && shortTrend < -0.3) rateCycle = 'early_easing';
    else if (longTrend < 0 && shortTrend < 0) rateCycle = 'mid_easing';
    else rateCycle = 'late_easing';
  }

  // 衰退概率 (基于利差)
  let recessionProbability = 0;
  if (spread10y2y < -0.5) recessionProbability = 0.8;
  else if (spread10y2y < 0) recessionProbability = 0.5 + spread10y2y;
  else if (spread10y2y < 0.5) recessionProbability = 0.2;
  else recessionProbability = 0.05;
  recessionProbability = Math.max(0, Math.min(1, recessionProbability));

  // 牛熊信号
  let bullBearSignal: YieldCurveResult['bullBearSignal'];
  if (rateCycle.includes('easing') && spread10y2y > 0.5) bullBearSignal = 'bullish';
  else if (rateCycle.includes('tightening') && spread10y2y < 0.5) bullBearSignal = 'bearish';
  else bullBearSignal = 'neutral';

  // 对股市影响
  let equityImpact: YieldCurveResult['equityImpact'];
  if (rateCycle === 'early_easing') equityImpact = 'positive';
  else if (rateCycle === 'mid_tightening' || rateCycle === 'late_tightening') equityImpact = 'negative';
  else equityImpact = 'neutral';

  // 久期风险
  let durationRisk: YieldCurveResult['durationRisk'];
  if (data.y30 - data.y1 > 2) durationRisk = 'high';
  else if (data.y30 - data.y1 > 1) durationRisk = 'moderate';
  else durationRisk = 'low';

  return {
    curveShape,
    spread10y2y: Math.round(spread10y2y * 10000) / 10000,
    spread10y3m: Math.round(spread10y3m * 10000) / 10000,
    termPremium: Math.round(termPremium * 10000) / 10000,
    bullBearSignal,
    rateCycle,
    recessionProbability: Math.round(recessionProbability * 100) / 100,
    equityImpact,
    durationRisk,
    curveSlope: Math.round(curveSlope * 10000) / 10000,
    keyInsights,
  };
}
