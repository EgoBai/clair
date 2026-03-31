/**
 * 指数服务
 * 处理指数相关的业务逻辑
 */

import { 
  MarketIndexData, 
  IndexQuote, 
  IndexComponent,
  IndexPerformance,
  IndexComparison,
  MAJOR_INDICES,
  validateIndexSymbol,
  isCompositeIndex,
  getIndexCategoryLabel,
} from '../models/MarketIndex';

export class MarketIndexService {
  private indices: Map<string, MarketIndexData> = new Map();
  private quotes: Map<string, IndexQuote[]> = new Map();
  private components: Map<number, IndexComponent[]> = new Map();

  constructor() {
    this.initializeMajorIndices();
  }

  private initializeMajorIndices(): void {
    Object.entries(MAJOR_INDICES).forEach(([symbol, data]) => {
      const index: MarketIndexData = {
        id: this.indices.size + 1,
        symbol,
        name: data.name!,
        category: data.category!,
        componentCount: data.componentCount!,
        exchange: data.exchange!,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.indices.set(symbol, index);
    });
  }

  // 获取所有指数
  getAllIndices(): MarketIndexData[] {
    return Array.from(this.indices.values());
  }

  // 根据代码获取指数
  getIndexBySymbol(symbol: string): MarketIndexData | undefined {
    return this.indices.get(symbol);
  }

  // 按分类获取指数
  getIndicesByCategory(category: string): MarketIndexData[] {
    return this.getAllIndices().filter(idx => idx.category === category);
  }

  // 获取主要综合指数
  getCompositeIndices(): MarketIndexData[] {
    return this.getAllIndices().filter(idx => isCompositeIndex(idx.symbol));
  }

  // 添加指数行情
  addQuote(symbol: string, quote: Omit<IndexQuote, 'id' | 'createdAt'>): IndexQuote | null {
    if (!validateIndexSymbol(symbol)) return null;
    
    const index = this.indices.get(symbol);
    if (!index) return null;

    const newQuote: IndexQuote = {
      ...quote,
      id: Date.now(),
      createdAt: new Date(),
    };

    const existingQuotes = this.quotes.get(symbol) || [];
    existingQuotes.push(newQuote);
    this.quotes.set(symbol, existingQuotes);

    return newQuote;
  }

  // 获取指数最新行情
  getLatestQuote(symbol: string): IndexQuote | undefined {
    const quotes = this.quotes.get(symbol);
    if (!quotes || quotes.length === 0) return undefined;
    return quotes[quotes.length - 1];
  }

  // 获取指数历史行情
  getQuoteHistory(symbol: string, limit: number = 30): IndexQuote[] {
    const quotes = this.quotes.get(symbol) || [];
    return quotes.slice(-limit);
  }

  // 计算指数表现
  calculatePerformance(symbol: string): IndexPerformance | null {
    const index = this.indices.get(symbol);
    if (!index) return null;

    const quotes = this.quotes.get(symbol) || [];
    if (quotes.length === 0) return null;

    const latest = quotes[quotes.length - 1];
    
    // 计算各周期收益
    const ytdReturn = this.calculatePeriodReturn(quotes, 'ytd');
    const weekReturn = this.calculatePeriodReturn(quotes, 'week');
    const monthReturn = this.calculatePeriodReturn(quotes, 'month');
    const quarterReturn = this.calculatePeriodReturn(quotes, 'quarter');
    const yearReturn = this.calculatePeriodReturn(quotes, 'year');

    return {
      symbol,
      name: index.name,
      current: latest.close,
      change: latest.change,
      changePercent: latest.changePercent,
      ytdReturn,
      weekReturn,
      monthReturn,
      quarterReturn,
      yearReturn,
    };
  }

  // 比较多只指数
  compareIndices(symbols: string[]): IndexComparison {
    const performances: IndexPerformance[] = [];
    
    symbols.forEach(symbol => {
      const perf = this.calculatePerformance(symbol);
      if (perf) performances.push(perf);
    });

    return {
      indices: performances,
      timestamp: new Date(),
    };
  }

  // 添加指数成分股
  addComponent(indexId: number, component: Omit<IndexComponent, 'id'>): IndexComponent {
    const newComponent: IndexComponent = {
      ...component,
      id: Date.now(),
    };

    const existing = this.components.get(indexId) || [];
    existing.push(newComponent);
    this.components.set(indexId, existing);

    return newComponent;
  }

  // 获取指数成分股
  getComponents(indexId: number): IndexComponent[] {
    return (this.components.get(indexId) || []).filter(c => c.isActive);
  }

  // 计算指数涨幅排名
  getTopGainers(limit: number = 10): IndexPerformance[] {
    return this.getAllIndices()
      .map(idx => this.calculatePerformance(idx.symbol))
      .filter((perf): perf is IndexPerformance => perf !== null)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, limit);
  }

  // 计算指数跌幅排名
  getTopLosers(limit: number = 10): IndexPerformance[] {
    return this.getAllIndices()
      .map(idx => this.calculatePerformance(idx.symbol))
      .filter((perf): perf is IndexPerformance => perf !== null)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, limit);
  }

  // 市场情绪指标
  getMarketSentiment(): {
    bullish: number;
    bearish: number;
    neutral: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
  } {
    const composites = this.getCompositeIndices();
    let bullish = 0;
    let bearish = 0;
    let neutral = 0;

    composites.forEach(idx => {
      const quote = this.getLatestQuote(idx.symbol);
      if (!quote) return;
      
      if (quote.changePercent > 0.5) bullish++;
      else if (quote.changePercent < -0.5) bearish++;
      else neutral++;
    });

    const total = bullish + bearish + neutral;
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (bullish > bearish + neutral) sentiment = 'bullish';
    else if (bearish > bullish + neutral) sentiment = 'bearish';

    return { bullish, bearish, neutral, sentiment };
  }

  // 内部方法：计算周期收益
  private calculatePeriodReturn(
    quotes: IndexQuote[], 
    period: 'ytd' | 'week' | 'month' | 'quarter' | 'year'
  ): number {
    if (quotes.length < 2) return 0;

    const latest = quotes[quotes.length - 1];
    let targetDate: Date;

    switch (period) {
      case 'ytd':
        targetDate = new Date(latest.tradeDate.getFullYear(), 0, 1);
        break;
      case 'week':
        targetDate = new Date(latest.tradeDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        targetDate = new Date(latest.tradeDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        targetDate = new Date(latest.tradeDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        targetDate = new Date(latest.tradeDate.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    const startQuote = quotes.find(q => q.tradeDate >= targetDate);
    if (!startQuote) return 0;

    return ((latest.close - startQuote.close) / startQuote.close) * 100;
  }
}

export default new MarketIndexService();
