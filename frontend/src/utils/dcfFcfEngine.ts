/**
 * 自由现金流估值引擎 (DCF/FCF)
 * DCF估值、FCF预测、终值计算
 */

export interface FCFForecast {
  year: number;
  revenue: number;
  growthRate: number;
  operatingMargin: number;
  taxRate: number;
  capex: number;
  deltaWorkingCapital: number;
  depreciation: number;
}

export interface DCFInput {
  forecasts: FCFForecast[];
  wacc: number;
  terminalGrowthRate: number;
  sharesOutstanding: number;
  netDebt: number;
}

export interface DCFResult {
  equityValue: number;
  valuePerShare: number;
  enterpriseValue: number;
  terminalValuePct: number;
  pvCashFlows: number[];
  terminalValue: number;
  marginOfSafety: number;
  sensitivity: { wacc: number; growth: number; value: number }[];
  yearBreakdown: { year: number; fcf: number; pv: number }[];
}

/**
 * 计算自由现金流
 */
export function calculateFCF(forecast: FCFForecast): number {
  const ebit = forecast.revenue * forecast.operatingMargin;
  const nopat = ebit * (1 - forecast.taxRate);
  return nopat + forecast.depreciation - forecast.capex - forecast.deltaWorkingCapital;
}

/**
 * DCF估值
 */
export function dcfValuation(input: DCFInput, currentPrice: number): DCFResult {
  const { forecasts, wacc, terminalGrowthRate, sharesOutstanding, netDebt } = input;

  if (forecasts.length === 0 || wacc <= 0 || sharesOutstanding <= 0) {
    return {
      equityValue: 0, valuePerShare: 0, enterpriseValue: 0,
      terminalValuePct: 0, pvCashFlows: [], terminalValue: 0,
      marginOfSafety: 0, sensitivity: [], yearBreakdown: [],
    };
  }

  // 预测期FCF
  const yearBreakdown = forecasts.map(f => {
    const fcf = calculateFCF(f);
    const pv = fcf / Math.pow(1 + wacc, f.year - forecasts[0].year + 1);
    return { year: f.year, fcf: Math.round(fcf * 100) / 100, pv: Math.round(pv * 100) / 100 };
  });

  const pvCashFlows = yearBreakdown.map(y => y.pv);
  const totalPV = pvCashFlows.reduce((a, b) => a + b, 0);

  // 终值 (Gordon增长模型)
  const lastFCF = yearBreakdown[yearBreakdown.length - 1].fcf;
  const finalYear = forecasts[forecasts.length - 1].year - forecasts[0].year + 1;
  let terminalValue = 0;
  if (wacc > terminalGrowthRate) {
    terminalValue = (lastFCF * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
  }
  const pvTerminal = terminalValue / Math.pow(1 + wacc, finalYear);

  const enterpriseValue = totalPV + pvTerminal;
  const equityValue = enterpriseValue - netDebt;
  const valuePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;
  const terminalValuePct = enterpriseValue > 0 ? pvTerminal / enterpriseValue : 0;
  const marginOfSafety = valuePerShare > 0 ? (valuePerShare - currentPrice) / valuePerShare : 0;

  // 敏感性分析
  const sensitivity: DCFResult['sensitivity'] = [];
  for (let w = wacc - 0.02; w <= wacc + 0.02; w += 0.01) {
    for (let g = terminalGrowthRate - 0.01; g <= terminalGrowthRate + 0.01; g += 0.005) {
      if (w > g && lastFCF > 0) {
        const tv = (lastFCF * (1 + g)) / (w - g);
        const pvtv = tv / Math.pow(1 + w, finalYear);
        const ev = totalPV + pvtv;
        const eq = ev - netDebt;
        sensitivity.push({
          wacc: Math.round(w * 10000) / 10000,
          growth: Math.round(g * 10000) / 10000,
          value: Math.round(eq / sharesOutstanding * 100) / 100,
        });
      }
    }
  }

  return {
    equityValue: Math.round(equityValue * 100) / 100,
    valuePerShare: Math.round(valuePerShare * 100) / 100,
    enterpriseValue: Math.round(enterpriseValue * 100) / 100,
    terminalValuePct: Math.round(terminalValuePct * 10000) / 10000,
    pvCashFlows,
    terminalValue: Math.round(pvTerminal * 100) / 100,
    marginOfSafety: Math.round(marginOfSafety * 10000) / 10000,
    sensitivity,
    yearBreakdown,
  };
}
