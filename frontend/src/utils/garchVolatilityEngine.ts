/**
 * GARCH波动率预测引擎
 * - GARCH(1,1)模型
 * - 隐含波动率 vs 历史波动率
 * - 波动率预测
 * - 波动率状态(低波/正常/高波)
 * - VaR估计
 */
export interface GARCHInput {
  returns: number[]; // 日收益率序列
  confidence?: number; // 置信水平, 默认0.95
  forecastDays?: number; // 预测天数, 默认5
}

export interface GARCHResult {
  omega: number; // 长期方差权重
  alpha: number; // ARCH系数
  beta: number; // GARCH系数
  unconditionalVol: number; // 无条件波动率(年化)
  currentVol: number; // 当前波动率(年化)
  forecastVols: number[]; // 预测波动率
  volState: 'low' | 'normal' | 'high' | 'extreme';
  historicalVol: number; // 历史波动率(年化)
  volMean: number; // 波动率均值
  var95: number; // VaR(95%)
  persistence: number; // alpha + beta
  halfLife: number; // 波动率半衰期(天)
}

export function garchForecast(input: GARCHInput): GARCHResult {
  const { returns, confidence = 0.95, forecastDays = 5 } = input;
  if (returns.length < 30) throw new Error('至少需要30个收益率数据');

  // 计算历史波动率
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
  const historicalVol = Math.sqrt(variance * 252);

  // GARCH(1,1)参数估计 - 简化方法
  const longRunVariance = variance;
  const alpha = 0.1; // ARCH系数
  const beta = 0.85; // GARCH系数
  const omega = longRunVariance * (1 - alpha - beta);

  // 计算条件方差序列
  const n = returns.length;
  const conditionalVariances = new Array(n);
  conditionalVariances[0] = longRunVariance;

  for (let i = 1; i < n; i++) {
    conditionalVariances[i] = omega + alpha * returns[i - 1] ** 2 + beta * conditionalVariances[i - 1];
  }

  const currentVol = Math.sqrt(conditionalVariances[n - 1] * 252);
  const unconditionalVol = Math.sqrt(omega / (1 - alpha - beta) * 252);
  const persistence = alpha + beta;
  const halfLife = Math.log(0.5) / Math.log(persistence);

  // 波动率预测
  const forecastVols: number[] = [];
  let prevVar = conditionalVariances[n - 1];
  for (let i = 0; i < forecastDays; i++) {
    prevVar = omega + alpha * prevVar + beta * prevVar; // 均值回归
    forecastVols.push(Math.sqrt(prevVar * 252));
  }

  // 波动率状态
  let volState: GARCHResult['volState'];
  const volRatio = currentVol / unconditionalVol;
  if (volRatio < 0.7) volState = 'low';
  else if (volRatio < 1.3) volState = 'normal';
  else if (volRatio < 2.0) volState = 'high';
  else volState = 'extreme';

  // VaR估计
  const zScore = confidence === 0.95 ? 1.645 : confidence === 0.99 ? 2.326 : 1.645;
  const var95 = -(meanReturn - zScore * Math.sqrt(conditionalVariances[n - 1]));

  return {
    omega: Math.round(omega * 1e8) / 1e8,
    alpha,
    beta,
    unconditionalVol: Math.round(unconditionalVol * 10000) / 10000,
    currentVol: Math.round(currentVol * 10000) / 10000,
    forecastVols: forecastVols.map(v => Math.round(v * 10000) / 10000),
    volState,
    historicalVol: Math.round(historicalVol * 10000) / 10000,
    volMean: Math.round((unconditionalVol + currentVol) / 2 * 10000) / 10000,
    var95: Math.round(var95 * 10000) / 10000,
    persistence: Math.round(persistence * 1000) / 1000,
    halfLife: Math.round(halfLife * 10) / 10,
  };
}
