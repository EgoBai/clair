/**
 * 利润操纵检测引擎
 * Beneish M-Score模型、异常指标检测
 */

export interface ManipulationInput {
  revenue: number;
  prevRevenue: number;
  cogs: number;
  prevCogs: number;
  currentAssets: number;
  totalAssets: number;
  currentLiabilities: number;
  depreciation: number;
  sgaExpense: number;
  longTermAssets: number;
  prevLongTermAssets: number;
  totalLiabilities: number;
  cashFromOperations: number;
  netIncome: number;
  accountsReceivable: number;
  prevAccountsReceivable: number;
  grossProfit: number;
  prevGrossProfit: number;
  intangibleAssets: number;
}

export interface ManipulationResult {
  mScore: number;
  manipulationProbability: 'low' | 'moderate' | 'high';
  dsri: number; // Days Sales in Receivables Index
  gmi: number;  // Gross Margin Index
  aqi: number;  // Asset Quality Index
  sgi: number;  // Sales Growth Index
  depi: number; // Depreciation Index
  sgai: number; // SGAI
  lvgi: number; // Leverage Index
  tata: number; // Total Accruals to Total Assets
  flags: { indicator: string; value: number; threshold: number; flagged: boolean }[];
}

/**
 * Beneish M-Score
 */
export function beneishMScore(input: ManipulationInput): ManipulationResult {
  const {
    revenue, prevRevenue, _cogs, _prevCogs, currentAssets, totalAssets,
    _currentLiabilities, depreciation, sgaExpense, longTermAssets,
    prevLongTermAssets, totalLiabilities, cashFromOperations, netIncome,
    accountsReceivable, prevAccountsReceivable, grossProfit, prevGrossProfit,
    _intangibleAssets,
  } = input;

  // Days Sales in Receivables Index
  const dsri = (prevRevenue > 0 && prevAccountsReceivable > 0)
    ? (accountsReceivable / revenue) / (prevAccountsReceivable / prevRevenue)
    : 1;

  // Gross Margin Index
  const gmi = (prevGrossProfit > 0 && grossProfit > 0)
    ? (prevGrossProfit / prevRevenue) / (grossProfit / revenue)
    : 1;

  // Asset Quality Index
  const aqi = totalAssets > 0
    ? (1 - (currentAssets + longTermAssets + depreciation) / totalAssets)
    : 0;

  // Sales Growth Index
  const sgi = prevRevenue > 0 ? revenue / prevRevenue : 1;

  // Depreciation Index
  const depi = prevLongTermAssets > 0 && longTermAssets > 0
    ? (1 - depreciation / prevLongTermAssets) / (1 - depreciation / longTermAssets)
    : 1;

  // SGAI
  const sgai = prevRevenue > 0 && revenue > 0
    ? (sgaExpense / revenue) / (sgaExpense / prevRevenue) // simplified
    : 1;

  // Leverage Index
  const lvgi = totalAssets > 0
    ? (totalLiabilities / totalAssets) / (totalLiabilities / (totalAssets * 0.95))
    : 1;

  // Total Accruals to Total Assets
  const tata = totalAssets > 0
    ? (netIncome - cashFromOperations) / totalAssets
    : 0;

  // M-Score calculation (Beneish 1999)
  const mScore = -4.84
    + 0.92 * dsri
    + 0.528 * gmi
    + 0.404 * aqi
    + 0.892 * sgi
    + 0.115 * depi
    - 0.172 * sgai
    + 4.679 * tata
    - 0.327 * lvgi;

  const flags = [
    { indicator: 'DSRI(应收增长)', value: dsri, threshold: 1.3, flagged: dsri > 1.3 },
    { indicator: 'GMI(毛利率下降)', value: gmi, threshold: 1, flagged: gmi > 1 },
    { indicator: 'AQI(资产质量)', value: aqi, threshold: 0.5, flagged: aqi > 0.5 },
    { indicator: 'SGI(收入增长)', value: sgi, threshold: 1.5, flagged: sgi > 1.5 },
    { indicator: 'DEPI(折旧减少)', value: depi, threshold: 1.2, flagged: depi > 1.2 },
    { indicator: 'TATA(应计比率)', value: tata, threshold: 0.05, flagged: tata > 0.05 },
  ];

  const manipulationProbability: ManipulationResult['manipulationProbability'] =
    mScore > -1.78 ? 'high' : mScore > -2.22 ? 'moderate' : 'low';

  return {
    mScore: Math.round(mScore * 1000) / 1000,
    manipulationProbability,
    dsri: Math.round(dsri * 1000) / 1000,
    gmi: Math.round(gmi * 1000) / 1000,
    aqi: Math.round(aqi * 1000) / 1000,
    sgi: Math.round(sgi * 1000) / 1000,
    depi: Math.round(depi * 1000) / 1000,
    sgai: Math.round(sgai * 1000) / 1000,
    lvgi: Math.round(lvgi * 1000) / 1000,
    tata: Math.round(tata * 1000) / 1000,
    flags,
  };
}
