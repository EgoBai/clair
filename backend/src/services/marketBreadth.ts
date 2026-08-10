/**
 * 市场宽度分析服务
 * 提供涨跌家数比、板块强弱分布、市场情绪指标
 */

import { EventEmitter } from 'events';
import { getRealMarketData } from './realMarketData';

/**
 * 真实涨跌分布源不可用时抛出，供路由层降级为「诚实空」（绝不回填模拟数据）。
 */
export class BreadthUnavailableError extends Error {
  constructor(msg = '涨跌分布真实源暂不可用（后端未接入或网络受限）') {
    super(msg);
    this.name = 'BreadthUnavailableError';
  }
}

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

    // 真实市场宽度：来自东方财富 push2 全市场涨跌分布（见 realMarketData.fetchBreadth）。
    // 遵守「诚实数据」红线：源不可用时直接抛错，由路由层降级为诚实空，绝不回填模拟数据。
    const real = await getRealMarketData();
    const b = real.breadth;
    if (!b) {
      throw new BreadthUnavailableError();
    }

    const advancing = b.up;
    const declining = b.down;
    const unchanged = b.flat;
    const totalStocks = advancing + declining + unchanged;

    const advanceDeclineRatio = declining > 0 ? +(advancing / declining).toFixed(2) : advancing > 0 ? 999 : 0;
    const volumeRatio = b.volumeRatio || 0;

    // 情绪低落分：仅基于真实可推导的涨跌比 + 量能比（不依赖缺失字段）
    const ratioScore = Math.min(Math.max((advanceDeclineRatio - 1) * 30, -50), 50);
    const volumeScore = volumeRatio ? Math.min(Math.max((volumeRatio - 1) * 20, -30), 30) : 0;
    const sentimentScore = Math.round(ratioScore + volumeScore);

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
      advanceDeclineRatio,
      // 免费行情源不提供“新高/新低”统计，诚实置默认值（非“今日无新高”的市场结论，
      // 仅作为占位，前端风险计算对其不敏感）。
      newHighs: 0,
      newLows: 0,
      upVolume: b.upVolume,
      downVolume: b.downVolume,
      volumeRatio: +volumeRatio.toFixed(2),
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

    // 诚实数据：板块宽度需要“申万/东财行业板块实时涨跌家数”真实源，目前尚未接入。
    // 返回空数组（前端按“未接入”处理），绝不回填随机板块数据。
    const data: SectorBreadth[] = [];
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

    // 诚实数据：历史宽度时序需要持久化的盘中快照，目前后端未落库，无法回填真实序列。
    // 返回空序列（前端按“未接入”处理），绝不生成随机历史曲线。
    const result: BreadthHistory = { data: [], period };
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
