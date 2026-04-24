/**
 * 选股筛选器引擎
 * 支持: 多维度过滤、评分排序、技术形态筛选、估值筛选
 */

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  pe: number;
  pb: number;
  ps: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  debtToEquity: number;
  dividendYield: number;
  marketCap: number;
  volume: number;
  avgVolume: number;
  high52w: number;
  low52w: number;
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  atr: number;
  beta: number;
  sector: string;
  industry: string;
}

export interface ScreenerFilter {
  field: keyof StockData;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'in';
  value: number | string | number[] | string[];
}

export interface ScreenerResult {
  stock: StockData;
  matchScore: number;
  matchedFilters: string[];
  ranking: number;
}

export interface ScoreWeight {
  field: string;
  weight: number;
  direction: 'asc' | 'desc'; // asc=越高越好, desc=越低越好
  normalize: boolean;
}

/**
 * 基本筛选
 */
export function screenStocks(
  stocks: StockData[],
  filters: ScreenerFilter[]
): StockData[] {
  return stocks.filter(stock => {
    return filters.every(filter => applyFilter(stock, filter));
  });
}

/**
 * 带评分的筛选
 */
export function screenWithScoring(
  stocks: StockData[],
  filters: ScreenerFilter[],
  scoringWeights: ScoreWeight[]
): ScreenerResult[] {
  const filtered = screenStocks(stocks, filters);
  const results: ScreenerResult[] = [];

  for (const stock of filtered) {
    const matchScore = calculateStockScore(stock, scoringWeights);
    const matchedFilters = filters
      .filter(f => applyFilter(stock, f))
      .map(f => `${String(f.field)} ${f.operator} ${f.value}`);

    results.push({ stock, matchScore, matchedFilters, ranking: 0 });
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  results.forEach((r, i) => r.ranking = i + 1);

  return results;
}

/**
 * 技术形态筛选
 */
export function screenByPatterns(
  stocks: StockData[],
  pattern: 'golden_cross' | 'macd_bullish' | 'rsi_oversold' | 'rsi_overbought' |
           'breakout_52w' | 'near_support' | 'volume_surge' | 'ma_uptrend'
): StockData[] {
  return stocks.filter(stock => {
    switch (pattern) {
      case 'golden_cross':
        return stock.ma5 > stock.ma20 && stock.ma20 > stock.ma60;
      case 'macd_bullish':
        return stock.macd > stock.macdSignal && stock.macd > 0;
      case 'rsi_oversold':
        return stock.rsi < 30;
      case 'rsi_overbought':
        return stock.rsi > 70;
      case 'breakout_52w':
        return stock.price >= stock.high52w * 0.98;
      case 'near_support':
        return stock.price <= stock.low52w * 1.05;
      case 'volume_surge':
        return stock.volume > stock.avgVolume * 2;
      case 'ma_uptrend':
        return stock.price > stock.ma5 && stock.ma5 > stock.ma10 &&
               stock.ma10 > stock.ma20 && stock.ma20 > stock.ma60;
      default:
        return false;
    }
  });
}

/**
 * 估值筛选
 */
export function screenByValuation(
  stocks: StockData[],
  criteria: {
    maxPE?: number;
    minPE?: number;
    maxPB?: number;
    minPB?: number;
    maxPS?: number;
    minROE?: number;
    maxDebtToEquity?: number;
    minDividendYield?: number;
    minMarketCap?: number;
    maxMarketCap?: number;
  }
): StockData[] {
  return stocks.filter(stock => {
    if (criteria.maxPE !== undefined && stock.pe > criteria.maxPE) return false;
    if (criteria.minPE !== undefined && stock.pe < criteria.minPE) return false;
    if (criteria.maxPB !== undefined && stock.pb > criteria.maxPB) return false;
    if (criteria.minPB !== undefined && stock.pb < criteria.minPB) return false;
    if (criteria.maxPS !== undefined && stock.ps > criteria.maxPS) return false;
    if (criteria.minROE !== undefined && stock.roe < criteria.minROE) return false;
    if (criteria.maxDebtToEquity !== undefined && stock.debtToEquity > criteria.maxDebtToEquity) return false;
    if (criteria.minDividendYield !== undefined && stock.dividendYield < criteria.minDividendYield) return false;
    if (criteria.minMarketCap !== undefined && stock.marketCap < criteria.minMarketCap) return false;
    if (criteria.maxMarketCap !== undefined && stock.marketCap > criteria.maxMarketCap) return false;
    return true;
  });
}

/**
 * GARP筛选 (Growth at Reasonable Price)
 */
export function screenGARP(stocks: StockData[]): ScreenerResult[] {
  const filtered = stocks.filter(s =>
    s.pe > 0 && s.pe < 30 &&
    s.revenueGrowth > 0.1 &&
    s.profitGrowth > 0.1 &&
    s.roe > 0.15 &&
    s.debtToEquity < 1
  );

  // PEG排序
  return filtered.map(stock => {
    const growthRate = (stock.revenueGrowth + stock.profitGrowth) / 2;
    const peg = growthRate > 0 ? stock.pe / (growthRate * 100) : 100;
    const score = 100 - Math.min(100, peg * 20); // PEG越低越好

    return {
      stock,
      matchScore: score,
      matchedFilters: ['GARP criteria'],
      ranking: 0
    };
  }).sort((a, b) => b.matchScore - a.matchScore)
    .map((r, i) => ({ ...r, ranking: i + 1 }));
}

/**
 * 动量+质量筛选
 */
export function screenMomentumQuality(
  stocks: StockData[],
  minMomentumScore: number = 60
): ScreenerResult[] {
  return stocks
    .map(stock => {
      const momentumScore = calculateMomentumScore(stock);
      const qualityScore = calculateQualityScore(stock);
      const composite = momentumScore * 0.5 + qualityScore * 0.5;

      return {
        stock,
        matchScore: composite,
        matchedFilters: [],
        ranking: 0
      };
    })
    .filter(r => r.matchScore >= minMomentumScore)
    .sort((a, b) => b.matchScore - a.matchScore)
    .map((r, i) => ({ ...r, ranking: i + 1 }));
}

/**
 * 行业对比筛选
 */
export function screenRelativeStrength(
  stocks: StockData[],
  sectorAverages: Map<string, { pe: number; roe: number; growth: number }>
): ScreenerResult[] {
  return stocks
    .filter(stock => {
      const avg = sectorAverages.get(stock.sector);
      if (!avg) return false;
      return stock.roe > avg.roe * 1.2 &&
             stock.revenueGrowth > avg.growth * 1.2;
    })
    .map((stock, i) => ({
      stock,
      matchScore: stock.roe * 50 + stock.revenueGrowth * 50,
      matchedFilters: ['Sector outperformer'],
      ranking: i + 1
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .map((r, i) => ({ ...r, ranking: i + 1 }));
}

// ===== Internal Functions =====

function applyFilter(stock: StockData, filter: ScreenerFilter): boolean {
  const value = stock[filter.field];

  if (typeof value === 'number') {
    switch (filter.operator) {
      case 'gt': return value > (filter.value as number);
      case 'lt': return value < (filter.value as number);
      case 'gte': return value >= (filter.value as number);
      case 'lte': return value <= (filter.value as number);
      case 'eq': return value === filter.value;
      case 'between': {
        const [min, max] = filter.value as number[];
        return value >= min && value <= max;
      }
      case 'in': return (filter.value as number[]).includes(value);
    }
  }

  if (typeof value === 'string') {
    switch (filter.operator) {
      case 'eq': return value === filter.value;
      case 'in': return (filter.value as string[]).includes(value);
    }
  }

  return false;
}

function calculateStockScore(stock: StockData, weights: ScoreWeight[]): number {
  let totalScore = 0;
  let totalWeight = 0;

  for (const w of weights) {
    const value = (stock as unknown as Record<string, unknown>)[w.field];
    if (typeof value !== 'number') continue;

    let normalized = value;
    if (w.normalize) {
      // 简化归一化到0-100
      normalized = Math.max(0, Math.min(100, value));
    }

    const score = w.direction === 'asc' ? normalized : (100 - normalized);
    totalScore += score * w.weight;
    totalWeight += w.weight;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

function calculateMomentumScore(stock: StockData): number {
  let score = 50;

  // 价格相对均线位置
  if (stock.price > stock.ma5) score += 5;
  if (stock.price > stock.ma20) score += 10;
  if (stock.price > stock.ma60) score += 10;

  // 52周高位
  if (stock.high52w > 0) {
    const position = stock.price / stock.high52w;
    score += position * 15;
  }

  // MACD
  if (stock.macd > stock.macdSignal) score += 10;

  return Math.max(0, Math.min(100, score));
}

function calculateQualityScore(stock: StockData): number {
  let score = 50;

  if (stock.roe > 0.15) score += 15;
  if (stock.roe > 0.20) score += 10;
  if (stock.debtToEquity < 0.5) score += 10;
  if (stock.debtToEquity < 1) score += 5;
  if (stock.revenueGrowth > 0.1) score += 10;

  return Math.max(0, Math.min(100, score));
}
