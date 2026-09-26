// 图表相关类型定义（leaf 模块：不依赖 components / pages / utils）
//
// IndicatorPoint 原定义在 components/Charts/IndicatorPanel.tsx，
// 因 utils/indicatorCalc.ts 需要复用该返回类型而产生 utils -> components 越层 import，
// 故搬迁至此层。原文件保留 re-export 以兼容既有消费方。

/** 单日技术指标数据点（MACD / KDJ / RSI / BOLL / VWAP / OBV / ADX / CCI / W%R / BIAS / ATR） */
export interface IndicatorPoint {
  date: string;
  // MACD
  dif?: number;
  dea?: number;
  macd?: number;
  // KDJ
  k?: number;
  d?: number;
  j?: number;
  // RSI
  rsi6?: number;
  rsi12?: number;
  rsi24?: number;
  // BOLL
  bollUpper?: number;
  bollMiddle?: number;
  bollLower?: number;
  // VWAP
  vwap?: number;
  // OBV
  obv?: number;
  // ADX / DMI
  adx?: number;
  pdi?: number;
  mdi?: number;
  // CCI
  cci?: number;
  // W%R
  wr?: number;
  // BIAS
  bias6?: number;
  bias12?: number;
  bias24?: number;
  // ATR
  atr?: number;
}
