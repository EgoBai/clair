/**
 * 市场宽度服务
 */

import { apiService } from './api';

export interface BreadthData {
  timestamp: number;
  advancing: number;
  declining: number;
  unchanged: number;
  totalStocks: number;
  advanceDeclineRatio: number;
  /**
   * 创新高家数。腾讯行情源不提供历史新高统计，取不到时后端诚实返回 null。
   * null = 「不可用」，**不等于 0 家**；参与算术/比较前必须判空。
   */
  newHighs: number | null;
  /** 创新低家数。同 newHighs，null 表示不可用而非 0。 */
  newLows: number | null;
  upVolume: number;
  downVolume: number;
  volumeRatio: number;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number;
  /** 涨跌停家数（按交易所涨跌停价判定的真实口径） */
  limitUp?: number;
  limitDown?: number;
  /** 全市场成交额（元） */
  turnover?: number;
  /** 行情源标识（真实源名，非 'real'/'live' 这类泛化标签） */
  dataSource?: string;
  /** 涨跌停判定口径说明，供用户核对，避免误读 */
  caliber?: string;
  /** 请求了但源侧无报价的标的数（退市/停牌/不在行情库） */
  uncoveredSymbols?: number;
  /** 无真实源的字段名清单，如 ['newHighs','newLows'] */
  unavailableFields?: string[];
  /** 诚实降级说明（中文），可直接展示给用户 */
  message?: string;
}

export interface SectorBreadth {
  sector: string;
  advancing: number;
  declining: number;
  avgChangePercent: number;
  strength: number;
}

export interface BreadthHistory {
  data: BreadthData[];
  period: string;
}

export interface McClellanData {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  trend: string;
}

export const breadthService = {
  getCurrent: () => apiService.get<BreadthData>('/breadth/current').then(r => r.data),
  getSectors: () => apiService.get<SectorBreadth[]>('/breadth/sectors').then(r => r.data),
  getHistory: (period: string = '5d') => apiService.get<BreadthHistory>(`/breadth/history?period=${period}`).then(r => r.data),
  getMcClellan: () => apiService.get<McClellanData>('/breadth/mcclellan').then(r => r.data),
  getCacheStats: () => apiService.get<{ breadth: number; sectors: number; history: number }>('/breadth/cache-stats').then(r => r.data),
};

export default breadthService;
