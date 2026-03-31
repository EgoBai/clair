/**
 * 大宗交易数据模型
 * 定义大宗交易相关的数据结构
 */

export interface BlockTrade {
  id: number;
  stockId: number;
  stockSymbol: string;
  stockName: string;
  tradeDate: Date;
  tradePrice: number;       // 成交价
  closePrice: number;       // 收盘价
  premiumRate: number;      // 溢价率 (%)
  volume: number;           // 成交量 (股)
  turnover: number;         // 成交额 (元)
  buyerSeat?: string;       // 买方营业部
  sellerSeat?: string;      // 卖方营业部
  buyerType?: BlockTradeParty;
  sellerType?: BlockTradeParty;
  createdAt: Date;
}

export type BlockTradeParty = 
  | 'institution'    // 机构
  | 'securities'     // 券商
  | 'fund'           // 基金
  | 'insurance'      // 保险
  | 'qfii'           // QFII
  | 'hot_money'      // 游资
  | 'unknown';       // 未知

export interface BlockTradeSummary {
  date: Date;
  totalTrades: number;
  totalTurnover: number;
  avgPremiumRate: number;
  positivePremiumCount: number;
  negativePremiumCount: number;
  topByTurnover: BlockTrade[];
  topByPremium: BlockTrade[];
  byIndustry: IndustryBlockTrade[];
}

export interface IndustryBlockTrade {
  industry: string;
  tradeCount: number;
  totalTurnover: number;
  avgPremiumRate: number;
}

export interface BlockTradeAlert {
  id: number;
  stockId: number;
  stockSymbol: string;
  alertType: BlockTradeAlertType;
  threshold: number;
  currentValue: number;
  triggeredAt: Date;
  isRead: boolean;
}

export type BlockTradeAlertType =
  | 'large_turnover'      // 大额成交
  | 'high_premium'        // 高溢价
  | 'high_discount'       // 高折价
  | 'institution_buy'     // 机构买入
  | 'consecutive_trades'; // 连续交易

export interface BlockTradeStats {
  stockSymbol: string;
  stockName: string;
  totalTrades30d: number;
  totalTurnover30d: number;
  avgPremiumRate30d: number;
  lastTradeDate: Date;
  trend: 'increasing' | 'decreasing' | 'stable';
}

// 验证函数
export function validateBlockTradeParty(party: string): party is BlockTradeParty {
  return ['institution', 'securities', 'fund', 'insurance', 'qfii', 'hot_money', 'unknown'].includes(party);
}

export function calculatePremiumRate(tradePrice: number, closePrice: number): number {
  if (closePrice === 0) return 0;
  return ((tradePrice - closePrice) / closePrice) * 100;
}

export function classifyPremium(premiumRate: number): 'premium' | 'discount' | 'flat' {
  if (premiumRate > 0.5) return 'premium';
  if (premiumRate < -0.5) return 'discount';
  return 'flat';
}

export function formatBlockTradeAmount(turnover: number): string {
  if (turnover >= 100000000) return `${(turnover / 100000000).toFixed(2)}亿`;
  if (turnover >= 10000) return `${(turnover / 10000).toFixed(2)}万`;
  return turnover.toFixed(2);
}
