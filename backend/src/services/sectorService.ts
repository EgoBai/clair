/**
 * 板块服务
 * 处理行业/概念板块的业务逻辑
 */

import {
  Sector,
  SectorQuote,
  SectorHeatmap,
  SectorRotation,
  SectorPerformance,
  SectorStreak,
  SW_L1_INDUSTRIES,
  HOT_CONCEPTS,
  validateSectorCode,
  getSectorTypeLabel,
  calculateSectorHeatmap,
} from '../models/Sector';

export class SectorService {
  private sectors: Map<string, Sector> = new Map();
  private quotes: Map<number, SectorQuote[]> = new Map();
  private stocks: Map<number, string[]> = new Map(); // sectorId -> stock symbols

  constructor() {
    this.initializeIndustries();
    this.initializeConcepts();
  }

  private initializeIndustries(): void {
    SW_L1_INDUSTRIES.forEach((name, index) => {
      const sector: Sector = {
        id: index + 1,
        code: `SWL1_${String(index + 1).padStart(3, '0')}`,
        name,
        type: 'industry',
        level: 1,
        stockCount: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.sectors.set(sector.code, sector);
    });
  }

  private initializeConcepts(): void {
    let id = SW_L1_INDUSTRIES.length + 1;
    HOT_CONCEPTS.forEach(name => {
      const sector: Sector = {
        id: id++,
        code: `GN_${name}`,
        name,
        type: 'concept',
        level: 1,
        stockCount: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.sectors.set(sector.code, sector);
    });
  }

  // 获取所有板块
  getAllSectors(): Sector[] {
    return Array.from(this.sectors.values());
  }

  // 按类型获取板块
  getSectorsByType(type: 'industry' | 'concept' | 'region' | 'style'): Sector[] {
    return this.getAllSectors().filter(s => s.type === type);
  }

  // 获取行业板块
  getIndustrySectors(): Sector[] {
    return this.getSectorsByType('industry');
  }

  // 获取概念板块
  getConceptSectors(): Sector[] {
    return this.getSectorsByType('concept');
  }

  // 根据代码获取板块
  getSectorByCode(code: string): Sector | undefined {
    return this.sectors.get(code);
  }

  // 搜索板块
  searchSectors(keyword: string): Sector[] {
    const lower = keyword.toLowerCase();
    return this.getAllSectors().filter(s => 
      s.name.toLowerCase().includes(lower) || 
      s.code.toLowerCase().includes(lower)
    );
  }

  // 添加板块行情
  addQuote(sectorId: number, quote: Omit<SectorQuote, 'id' | 'createdAt'>): SectorQuote {
    const newQuote: SectorQuote = {
      ...quote,
      id: Date.now(),
      createdAt: new Date(),
    };

    const existing = this.quotes.get(sectorId) || [];
    existing.push(newQuote);
    this.quotes.set(sectorId, existing);

    return newQuote;
  }

  // 获取板块最新行情
  getLatestQuote(sectorId: number): SectorQuote | undefined {
    const quotes = this.quotes.get(sectorId);
    if (!quotes || quotes.length === 0) return undefined;
    return quotes[quotes.length - 1];
  }

  // 获取板块热力图数据
  getHeatmap(): SectorHeatmap[] {
    const result: SectorHeatmap[] = [];

    this.getAllSectors().forEach(sector => {
      const quote = this.getLatestQuote(sector.id);
      if (!quote) return;

      const stockSymbols = this.stocks.get(sector.id) || [];
      
      result.push({
        sectorId: sector.id,
        sectorName: sector.name,
        changePercent: quote.changePercent,
        volume: quote.volume,
        turnover: quote.turnover,
        netInflow: quote.netInflow,
        stockCount: stockSymbols.length,
        risingRatio: quote.risingCount / (quote.risingCount + quote.fallingCount) || 0,
      });
    });

    return result.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  }

  // 获取板块轮动分析
  getSectorRotation(): SectorRotation {
    const allQuotes = this.getAllSectorPerformances();
    
    // 热门板块：涨幅前5
    const hotSectors = allQuotes
      .filter(q => q.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);

    // 冷门板块：跌幅前5
    const coldSectors = allQuotes
      .filter(q => q.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5);

    // 连续上涨板块
    const consecutiveRising = this.getConsecutiveStreaks('rising');
    
    // 连续下跌板块
    const consecutiveFalling = this.getConsecutiveStreaks('falling');

    return {
      date: new Date(),
      hotSectors,
      coldSectors,
      consecutiveRising,
      consecutiveFalling,
    };
  }

  // 获取板块涨幅排行
  getTopGainingSectors(limit: number = 10): SectorPerformance[] {
    return this.getAllSectorPerformances()
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, limit);
  }

  // 获取板块跌幅排行
  getTopLosingSectors(limit: number = 10): SectorPerformance[] {
    return this.getAllSectorPerformances()
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, limit);
  }

  // 添加股票到板块
  addStockToSector(sectorId: number, stockSymbol: string): void {
    const stocks = this.stocks.get(sectorId) || [];
    if (!stocks.includes(stockSymbol)) {
      stocks.push(stockSymbol);
      this.stocks.set(sectorId, stocks);
      
      // 更新板块股票数量
      const sector = Array.from(this.sectors.values()).find(s => s.id === sectorId);
      if (sector) {
        sector.stockCount = stocks.length;
      }
    }
  }

  // 获取板块内股票
  getStocksInSector(sectorId: number): string[] {
    return this.stocks.get(sectorId) || [];
  }

  // 资金流向分析
  getFundFlowAnalysis(): {
    topInflow: SectorPerformance[];
    topOutflow: SectorPerformance[];
  } {
    const performances = this.getAllSectorPerformances();

    return {
      topInflow: performances
        .filter(p => p.netInflow > 0)
        .sort((a, b) => b.netInflow - a.netInflow)
        .slice(0, 5),
      topOutflow: performances
        .filter(p => p.netInflow < 0)
        .sort((a, b) => a.netInflow - b.netInflow)
        .slice(0, 5),
    };
  }

  // 获取板块分类统计
  getCategoryStats(): {
    industry: number;
    concept: number;
    region: number;
    style: number;
  } {
    const stats = { industry: 0, concept: 0, region: 0, style: 0 };
    this.getAllSectors().forEach(s => stats[s.type]++);
    return stats;
  }

  // 内部方法：获取所有板块表现
  private getAllSectorPerformances(): SectorPerformance[] {
    const result: SectorPerformance[] = [];

    this.getAllSectors().forEach(sector => {
      const quote = this.getLatestQuote(sector.id);
      if (!quote) return;

      result.push({
        sectorId: sector.id,
        sectorName: sector.name,
        changePercent: quote.changePercent,
        turnover: quote.turnover,
        netInflow: quote.netInflow,
        leadingStock: {
          symbol: quote.leadingStock || '',
          name: '',
          changePercent: 0,
        },
      });
    });

    return result;
  }

  // 内部方法：获取连续涨跌板块
  private getConsecutiveStreaks(type: 'rising' | 'falling'): SectorStreak[] {
    const streaks: SectorStreak[] = [];

    this.getAllSectors().forEach(sector => {
      const quotes = this.quotes.get(sector.id) || [];
      if (quotes.length < 3) return;

      let days = 0;
      let totalChange = 0;

      // 从最新往回查
      for (let i = quotes.length - 1; i >= 0; i--) {
        const q = quotes[i];
        if (type === 'rising' && q.changePercent > 0) {
          days++;
          totalChange += q.changePercent;
        } else if (type === 'falling' && q.changePercent < 0) {
          days++;
          totalChange += q.changePercent;
        } else {
          break;
        }
      }

      if (days >= 3) {
        streaks.push({
          sectorId: sector.id,
          sectorName: sector.name,
          days,
          totalChange,
        });
      }
    });

    return streaks.sort((a, b) => b.days - a.days);
  }
}

export default new SectorService();
