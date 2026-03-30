/**
 * 市场宽度服务
 */

const API_BASE = '/api/breadth';

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

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Unknown error');
  return json.data;
}

export const breadthService = {
  getCurrent: () => fetchApi<BreadthData>('/current'),
  getSectors: () => fetchApi<SectorBreadth[]>('/sectors'),
  getHistory: (period: string = '5d') => fetchApi<BreadthHistory>(`/history?period=${period}`),
  getMcClellan: () => fetchApi<McClellanData>('/mcclellan'),
  getCacheStats: () => fetchApi<{ breadth: number; sectors: number; history: number }>('/cache-stats'),
};

export default breadthService;
