/**
 * 龙虎榜数据模型
 * 定义龙虎榜相关的数据结构
 */

export interface DragonTiger {
  id: number;
  stockId: number;
  stockSymbol: string;
  stockName: string;
  tradeDate: Date;
  reason: DragonTigerReason;  // 上榜原因
  closePrice: number;
  changePercent: number;
  turnover: number;
  volume: number;
  netBuy: number;             // 净买入
  netSell: number;            // 净卖出
  buySellRatio: number;       // 买卖比
  createdAt: Date;
}

export type DragonTigerReason =
  | 'daily_change'        // 日涨跌幅达到±7%
  | 'daily_amplitude'     // 日振幅达到15%
  | 'daily_turnover'      // 日换手率达到20%
  | '连续三日涨跌幅偏离值累计达到20%'
  | '无价格涨跌幅限制的证券'
  | 'ST连续三日涨跌幅偏离值累计达到15%'
  | '退市整理期';

export interface DragonTigerDetail {
  id: number;
  dragonTigerId: number;
  rank: number;               // 排名
  seatName: string;           // 营业部名称
  seatType: SeatType;         // 席位类型
  buyAmount: number;          // 买入金额
  sellAmount: number;         // 卖出金额
  netAmount: number;          // 净额
  buyTurnover: number;        // 买入占比
  sellTurnover: number;       // 卖出占比
  createdAt: Date;
}

export type SeatType = 
  | 'institution'    // 机构
  | 'hot_money'      // 游资
  | 'north_bound'    // 北向
  | 'securities'     // 券商
  | 'unknown';       // 未知

export interface DragonTigerSummary {
  stockSymbol: string;
  stockName: string;
  tradeDate: Date;
  reason: DragonTigerReason;
  changePercent: number;
  topBuySeats: DragonTigerDetail[];
  topSellSeats: DragonTigerDetail[];
  institutionNet: number;     // 机构净买入
  hotMoneyNet: number;        // 游资净买入
  northBoundNet: number;      // 北向净买入
}

export interface SeatActivity {
  seatName: string;
  seatType: SeatType;
  appearanceCount: number;    // 出现次数
  totalBuy: number;
  totalSell: number;
  netAmount: number;
  winRate: number;            // 胜率
  avgReturn: number;          // 平均收益
  recentStocks: string[];     // 近期参与的股票
}

export interface DragonTigerStats {
  date: Date;
  totalStocks: number;        // 上榜股票数
  avgChangePercent: number;
  totalTurnover: number;
  topInstitutionBuys: DragonTigerSummary[];
  topHotMoneyBuys: DragonTigerSummary[];
  mostActiveSeats: SeatActivity[];
}

// 验证函数
export function validateDragonTigerReason(reason: string): reason is DragonTigerReason {
  const validReasons: DragonTigerReason[] = [
    'daily_change',
    'daily_amplitude', 
    'daily_turnover',
    '连续三日涨跌幅偏离值累计达到20%',
    '无价格涨跌幅限制的证券',
    'ST连续三日涨跌幅偏离值累计达到15%',
    '退市整理期',
  ];
  return validReasons.includes(reason as DragonTigerReason);
}

export function getSeatTypeLabel(type: SeatType): string {
  const labels: Record<SeatType, string> = {
    institution: '机构',
    hot_money: '游资',
    north_bound: '北向',
    securities: '券商',
    unknown: '未知',
  };
  return labels[type] || type;
}

export function calculateBuySellRatio(buy: number, sell: number): number {
  if (sell === 0) return buy > 0 ? Infinity : 0;
  return buy / sell;
}
