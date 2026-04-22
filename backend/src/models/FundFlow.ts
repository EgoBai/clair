/**
 * 资金流向数据模型
 * 定义资金流向相关的数据结构
 */

export interface FundFlow {
  id: number;
  stockId: number;
  stockSymbol: string;
  tradeDate: Date;
  timeframe: FlowTimeframe;
  mainInflow: number;       // 主力流入
  mainOutflow: number;      // 主力流出
  mainNetFlow: number;      // 主力净流入
  retailInflow: number;     // 散户流入
  retailOutflow: number;    // 散户流出
  retailNetFlow: number;    // 散户净流入
  superLargeInflow: number; // 超大单流入
  superLargeOutflow: number;// 超大单流出
  largeInflow: number;      // 大单流入
  largeOutflow: number;     // 大单流出
  mediumInflow: number;     // 中单流入
  mediumOutflow: number;    // 中单流出
  smallInflow: number;      // 小单流入
  smallOutflow: number;     // 小单流出
  createdAt: Date;
}

export type FlowTimeframe = 'realtime' | 'daily' | 'weekly' | 'monthly';

export interface SectorFundFlow {
  id: number;
  sectorId: number;
  sectorName: string;
  tradeDate: Date;
  mainNetFlow: number;
  mainInflow: number;
  mainOutflow: number;
  changePercent: number;
  stockCount: number;
  leadingInflowStock: string;
  leadingOutflowStock: string;
  createdAt: Date;
}

export interface MarketFundFlow {
  id: number;
  tradeDate: Date;
  shMainNetFlow: number;    // 沪市主力净流入
  szMainNetFlow: number;    // 深市主力净流入
  northBoundNetFlow: number;// 北向净流入
  southBoundNetFlow: number;// 南向净流入
  marginBalance: number;    // 融资融券余额
  marginBuy: number;        // 融资买入
  marginSell: number;       // 融券卖出
  createdAt: Date;
}

export interface FlowSummary {
  symbol: string;
  name: string;
  mainNetFlow: number;
  mainNetFlowPercent: number;
  changePercent: number;
  trend: 'inflow' | 'outflow' | 'neutral';
  consecutiveDays: number;  // 连续流入/流出天数
}

export interface FlowRanking {
  date: Date;
  topInflow: FlowSummary[];  // 净流入排行
  topOutflow: FlowSummary[]; // 净流出排行
  bySector: SectorFlowRanking[];
}

export interface SectorFlowRanking {
  sectorName: string;
  mainNetFlow: number;
  changePercent: number;
  stockCount: number;
}

export interface FlowAlert {
  id: number;
  stockId: number;
  stockSymbol: string;
  alertType: FlowAlertType;
  threshold: number;
  currentValue: number;
  triggeredAt: Date;
  isRead: boolean;
  isActive: boolean;
}

export type FlowAlertType = 
  | 'main_inflow_surge'     // 主力大幅流入
  | 'main_outflow_surge'    // 主力大幅流出
  | 'north_bound_surge'     // 北向大幅流入
  | 'margin_surge'          // 融资融券激增
  | 'consecutive_inflow'    // 连续流入
  | 'consecutive_outflow';  // 连续流出

// 资金流向分级标准
export const FLOW_THRESHOLDS = {
  superLarge: 100000000,    // 超大单: 1亿以上
  large: 50000000,          // 大单: 5000万以上
  medium: 10000000,         // 中单: 1000万以上
  small: 1000000,           // 小单: 100万以上
};

// 验证函数
export function validateFlowTimeframe(tf: string): tf is FlowTimeframe {
  return ['realtime', 'daily', 'weekly', 'monthly'].includes(tf);
}

export function classifyFlowDirection(netFlow: number): 'inflow' | 'outflow' | 'neutral' {
  if (netFlow > 0) return 'inflow';
  if (netFlow < 0) return 'outflow';
  return 'neutral';
}

export function calculateFlowIntensity(
  mainNetFlow: number,
  turnover: number
): 'strong' | 'moderate' | 'weak' {
  if (turnover === 0) return 'weak';
  const ratio = Math.abs(mainNetFlow) / turnover;
  if (ratio > 0.1) return 'strong';
  if (ratio > 0.05) return 'moderate';
  return 'weak';
}

export function formatFlowAmount(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount >= 0 ? '+' : '-';
  if (abs >= 100000000) return `${sign}${(abs / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(2)}万`;
  return `${sign}${abs.toFixed(2)}`;
}
