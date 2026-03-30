/**
 * 市场宽度分析服务
 * 提供涨跌家数比、板块强弱分布、市场情绪指标
 */

import { EventEmitter } from 'events';

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
  sentimentScore: number; // -100 to 100
}

export interface SectorBreadth {
  sector: string;
  advancing: number;
  declining: number;
  avgChangePercent: number;
  strength: number; // 0-100
}

export interface BreadthHistory {
  data: BreadthData[];
  period: string;
}

class MarketBreadthService extends EventEmitter {
  private cache: Map<string, { data: BreadthData; expiry: number }> = new Map();
  private sectorCache: Map<string, { data: SectorBreadth[]; expiry: number }> = new Map();
  private historyCache: Map<string, { data: BreadthHistory; expiry: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  /**
   * 计算市场宽度数据
   */
  async calculateBreadth(): Promise<BreadthData> {
    const cacheKey = 'breadth:current';
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // 模拟市场宽度计算 (实际应从数据源获取)
    const advancing = Math.floor(Math.random() * 2000) + 1000;
    const declining = Math.floor(Math.random() * 1500) + 500;
    const unchanged = Math.floor(Math.random() * 200) + 50;
    const totalStocks = advancing + declining + unchanged;

    const advanceDeclineRatio = advancing / Math.max(declining, 1);
    const newHighs = Math.floor(Math.random() * 100) + 10;
    const newLows = Math.floor(Math.random() * 50) + 5;
    const upVolume = Math.random() * 5000000000 + 1000000000;
    const downVolume = Math.random() * 4000000000 + 800000000;
    const volumeRatio = upVolume / Math.max(downVolume, 1);

    // 计算情绪分数
    const ratioScore = Math.min(Math.max((advanceDeclineRatio - 1) * 30, -50), 50);
    const volumeScore = Math.min(Math.max((volumeRatio - 1) * 20, -30), 30);
    const highLowScore = Math.min(Math.max((newHighs - newLows) / 10, -20), 20);
    const sentimentScore = Math.round(ratioScore + volumeScore + highLowScore);

    let marketSentiment: 'bullish' | 'bearish' | 'neutral';
    if (sentimentScore > 20) marketSentiment = 'bullish';
    else if (sentimentScore < -20) marketSentiment = 'bearish';
    else marketSentiment = 'neutral';

    const data: BreadthData = {
      timestamp: Date.now(),
      advancing,
      declining,
      unchanged,
      totalStocks,
      advanceDeclineRatio: Math.round(advanceDeclineRatio * 100) / 100,
      newHighs,
      newLows,
      upVolume,
      downVolume,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      marketSentiment,
      sentimentScore: Math.max(-100, Math.min(100, sentimentScore)),
    };

    this.cache.set(cacheKey, { data, expiry: Date.now() + this.CACHE_TTL });
    this.emit('breadth:update', data);
    return data;
  }

  /**
   * 获取板块宽度分析
   */
  async getSectorBreadth(): Promise<SectorBreadth[]> {
    const cacheKey = 'sector:breadth';
    const cached = this.sectorCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const sectors = [
      '银行', '证券', '保险', '房地产', '医药', '电子', '计算机',
      '通信', '汽车', '食品饮料', '家电', '建材', '化工', '钢铁',
      '煤炭', '有色金属', '电力', '新能源', '军工', '传媒',
    ];

    const data: SectorBreadth[] = sectors.map(sector => {
      const advancing = Math.floor(Math.random() * 50) + 10;
      const declining = Math.floor(Math.random() * 40) + 5;
      const total = advancing + declining;
      return {
        sector,
        advancing,
        declining,
        avgChangePercent: Math.round((Math.random() * 6 - 3) * 100) / 100,
        strength: Math.round((advancing / total) * 100),
      };
    });

    // Sort by strength descending
    data.sort((a, b) => b.strength - a.strength);
    this.sectorCache.set(cacheKey, { data, expiry: Date.now() + this.CACHE_TTL });
    return data;
  }

  /**
   * 获取历史宽度数据
   */
  async getBreadthHistory(period: '1d' | '5d' | '1m' | '3m' = '5d'): Promise<BreadthHistory> {
    const cacheKey = `history:${period}`;
    const cached = this.historyCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const pointCounts: Record<string, number> = { '1d': 24, '5d': 5, '1m': 22, '3m': 66 };
    const count = pointCounts[period] || 5;
    const now = Date.now();
    const interval = period === '1d' ? 3600000 : 86400000;

    const data: BreadthData[] = Array.from({ length: count }, (_, i) => {
      const advancing = Math.floor(Math.random() * 2000) + 1000;
      const declining = Math.floor(Math.random() * 1500) + 500;
      const unchanged = Math.floor(Math.random() * 200) + 50;
      const ratio = advancing / Math.max(declining, 1);
      return {
        timestamp: now - (count - 1 - i) * interval,
        advancing,
        declining,
        unchanged,
        totalStocks: advancing + declining + unchanged,
        advanceDeclineRatio: Math.round(ratio * 100) / 100,
        newHighs: Math.floor(Math.random() * 100) + 10,
        newLows: Math.floor(Math.random() * 50) + 5,
        upVolume: Math.random() * 5000000000 + 1000000000,
        downVolume: Math.random() * 4000000000 + 800000000,
        volumeRatio: Math.round((Math.random() + 0.5) * 100) / 100,
        marketSentiment: ratio > 1.2 ? 'bullish' : ratio < 0.8 ? 'bearish' : 'neutral',
        sentimentScore: Math.round((ratio - 1) * 50),
      };
    });

    const result: BreadthHistory = { data, period };
    this.historyCache.set(cacheKey, { data: result, expiry: Date.now() + this.CACHE_TTL * 2 });
    return result;
  }

  /**
   * 获取McClellan振荡器 (市场广度动量指标)
   */
  async getMcClellanOscillator(): Promise<{ value: number; signal: 'overbought' | 'oversold' | 'neutral'; trend: string }> {
    const history = await this.getBreadthHistory('1m');
    const adValues = history.data.map(d => d.advancing - d.declining);

    // EMA19 - EMA39 简化计算
    const ema19 = this.calculateEMA(adValues, 19);
    const ema39 = this.calculateEMA(adValues, 39);
    const value = Math.round((ema19 - ema39) * 100) / 100;

    let signal: 'overbought' | 'oversold' | 'neutral';
    if (value > 100) signal = 'overbought';
    else if (value < -100) signal = 'oversold';
    else signal = 'neutral';

    const trend = value > 0 ? '上升趋势' : '下降趋势';
    return { value, signal, trend };
  }

  private calculateEMA(data: number[], period: number): number {
    if (data.length === 0) return 0;
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.sectorCache.clear();
    this.historyCache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { breadth: number; sectors: number; history: number } {
    return {
      breadth: this.cache.size,
      sectors: this.sectorCache.size,
      history: this.historyCache.size,
    };
  }
}

export const marketBreadthService = new MarketBreadthService();
export default marketBreadthService;
