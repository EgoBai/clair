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
  newHighs: number;
  newLows: number;
  upVolume: number;
  downVolume: number;
  volumeRatio: number;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number;
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
