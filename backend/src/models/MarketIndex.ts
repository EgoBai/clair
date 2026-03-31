/**
 * 指数数据模型
 * 定义A股主要指数的数据结构
 */

export interface MarketIndexData {
  id: number;
  symbol: string;           // 指数代码 (如: 000001.SH)
  name: string;             // 指数名称
  nameEn?: string;          // 英文名称
  category: IndexCategory;  // 指数分类
  baseDate?: Date;          // 基日
  basePoint?: number;       // 基点
  componentCount: number;   // 成分股数量
  exchange: 'SSE' | 'SZSE' | 'BSE'; // 交易所
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IndexCategory = 
  | 'composite'     // 综合指数
  | 'sector'        // 行业指数
  | 'theme'         // 主题指数
  | 'style'         // 风格指数
  | 'strategy'      // 策略指数
  | 'bond'          // 债券指数
  | 'commodity'     // 商品指数
  | 'cross_market'; // 跨市场指数

export interface IndexQuote {
  id: number;
  indexId: number;
  tradeDate: Date;
  open: number;
  close: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume: number;           // 成交量
  turnover: number;         // 成交额
  amplitude: number;        // 振幅
  risingCount?: number;     // 上涨家数
  fallingCount?: number;    // 下跌家数
  flatCount?: number;       // 平盘家数
  createdAt: Date;
}

export interface IndexComponent {
  id: number;
  indexId: number;
  stockId: number;
  stockSymbol: string;
  weight?: number;          // 权重
  addedDate: Date;
  removedDate?: Date;
  isActive: boolean;
}

export interface IndexPerformance {
  symbol: string;
  name: string;
  current: number;
  change: number;
  changePercent: number;
  ytdReturn?: number;       // 年初至今收益
  weekReturn?: number;      // 周收益
  monthReturn?: number;     // 月收益
  quarterReturn?: number;   // 季度收益
  yearReturn?: number;      // 年收益
  pe?: number;
  pb?: number;
  dividendYield?: number;
}

export interface IndexComparison {
  indices: IndexPerformance[];
  correlation?: number[][]; // 相关系数矩阵
  timestamp: Date;
}

// 预定义指数
export const MAJOR_INDICES: Record<string, Partial<MarketIndexData>> = {
  '000001.SH': { name: '上证综指', category: 'composite', exchange: 'SSE', componentCount: 2000 },
  '399001.SZ': { name: '深证成指', category: 'composite', exchange: 'SZSE', componentCount: 500 },
  '399006.SZ': { name: '创业板指', category: 'composite', exchange: 'SZSE', componentCount: 100 },
  '000016.SH': { name: '上证50', category: 'style', exchange: 'SSE', componentCount: 50 },
  '000300.SH': { name: '沪深300', category: 'composite', exchange: 'SSE', componentCount: 300 },
  '000905.SH': { name: '中证500', category: 'style', exchange: 'SSE', componentCount: 500 },
  '000852.SH': { name: '中证1000', category: 'style', exchange: 'SSE', componentCount: 1000 },
  '899050.BJ': { name: '北证50', category: 'style', exchange: 'BSE', componentCount: 50 },
};

// 验证函数
export function validateIndexSymbol(symbol: string): boolean {
  return /^\d{6}\.(SH|SZ|BJ)$/.test(symbol);
}

export function isCompositeIndex(symbol: string): boolean {
  return MAJOR_INDICES[symbol]?.category === 'composite';
}

export function getIndexCategoryLabel(category: IndexCategory): string {
  const labels: Record<IndexCategory, string> = {
    composite: '综合指数',
    sector: '行业指数',
    theme: '主题指数',
    style: '风格指数',
    strategy: '策略指数',
    bond: '债券指数',
    commodity: '商品指数',
    cross_market: '跨市场指数',
  };
  return labels[category] || category;
}
