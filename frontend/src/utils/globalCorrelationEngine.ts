/**
 * Global Market Correlation Engine
 * 全球市场关联分析引擎 - 分析A股与全球市场的联动关系
 */

export interface MarketIndex {
  code: string;
  name: string;
  nameEn: string;
  region: 'china' | 'us' | 'europe' | 'asia' | 'global';
  timezone: string;
  currency: string;
}

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CorrelationResult {
  index1: string;
  index2: string;
  correlation: number;
  period: number;
  lag: number;
  startDate: string;
  endDate: string;
  significance: number;
}

export interface LeadLagResult {
  leader: string;
  follower: string;
  optimalLag: number;
  correlation: number;
  direction: 'positive' | 'negative';
  confidence: number;
}

export interface MarketRegime {
  period: string;
  regime: 'risk-on' | 'risk-off' | 'neutral' | 'transitioning';
  indicators: {
    vix: number;
    usdCny: number;
    bondYield: number;
    goldOilRatio: number;
    creditSpread: number;
  };
  confidence: number;
}

export interface SpilloverEffect {
  sourceMarket: string;
  targetMarket: string;
  effect: number;
  volatility: number;
  period: string;
  direction: 'positive' | 'negative';
}

export interface DecouplingEvent {
  date: string;
  market1: string;
  market2: string;
  expectedDirection: 'up' | 'down';
  actualDirection: 'up' | 'down';
  magnitude: number;
  significance: number;
}

// Major global market indices
export const GLOBAL_INDICES: MarketIndex[] = [
  { code: '000001', name: '上证指数', nameEn: 'SSE Composite', region: 'china', timezone: 'Asia/Shanghai', currency: 'CNY' },
  { code: '399001', name: '深证成指', nameEn: 'SZSE Component', region: 'china', timezone: 'Asia/Shanghai', currency: 'CNY' },
  { code: '399006', name: '创业板指', nameEn: 'ChiNext', region: 'china', timezone: 'Asia/Shanghai', currency: 'CNY' },
  { code: '000016', name: '上证50', nameEn: 'SSE 50', region: 'china', timezone: 'Asia/Shanghai', currency: 'CNY' },
  { code: '000905', name: '中证500', nameEn: 'CSI 500', region: 'china', timezone: 'Asia/Shanghai', currency: 'CNY' },
  { code: '.SPX', name: '标普500', nameEn: 'S&P 500', region: 'us', timezone: 'America/New_York', currency: 'USD' },
  { code: '.DJI', name: '道琼斯', nameEn: 'Dow Jones', region: 'us', timezone: 'America/New_York', currency: 'USD' },
  { code: '.IXIC', name: '纳斯达克', nameEn: 'NASDAQ', region: 'us', timezone: 'America/New_York', currency: 'USD' },
  { code: '.RUT', name: '罗素2000', nameEn: 'Russell 2000', region: 'us', timezone: 'America/New_York', currency: 'USD' },
  { code: '.FTSE', name: '富时100', nameEn: 'FTSE 100', region: 'europe', timezone: 'Europe/London', currency: 'GBP' },
  { code: '.GDAXI', name: 'DAX', nameEn: 'DAX', region: 'europe', timezone: 'Europe/Berlin', currency: 'EUR' },
  { code: '.FCHI', name: 'CAC40', nameEn: 'CAC 40', region: 'europe', timezone: 'Europe/Paris', currency: 'EUR' },
  { code: '.N225', name: '日经225', nameEn: 'Nikkei 225', region: 'asia', timezone: 'Asia/Tokyo', currency: 'JPY' },
  { code: '.HSI', name: '恒生指数', nameEn: 'Hang Seng', region: 'asia', timezone: 'Asia/Hong_Kong', currency: 'HKD' },
  { code: '.KS11', name: '韩国KOSPI', nameEn: 'KOSPI', region: 'asia', timezone: 'Asia/Seoul', currency: 'KRW' },
  { code: '.TWII', name: '台湾加权', nameEn: 'TAIEX', region: 'asia', timezone: 'Asia/Taipei', currency: 'TWD' },
  { code: '.STI', name: '海峡指数', nameEn: 'Straits Times', region: 'asia', timezone: 'Asia/Singapore', currency: 'SGD' },
  { code: '.AXJO', name: '澳洲200', nameEn: 'ASX 200', region: 'asia', timezone: 'Australia/Sydney', currency: 'AUD' },
];

export function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

export function calculateLogReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  return returns;
}

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
  const meanY = ySlice.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : numerator / denom;
}

export function spearmanCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  function rank(arr: number[]): number[] {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    for (let i = 0; i < sorted.length; i++) {
      ranks[sorted[i].i] = i + 1;
    }
    return ranks;
  }

  return pearsonCorrelation(rank(x.slice(0, n)), rank(y.slice(0, n)));
}

export function rollingCorrelation(
  x: number[],
  y: number[],
  window: number
): number[] {
  const result: number[] = [];
  const n = Math.min(x.length, y.length);
  for (let i = window - 1; i < n; i++) {
    const xWindow = x.slice(i - window + 1, i + 1);
    const yWindow = y.slice(i - window + 1, i + 1);
    result.push(pearsonCorrelation(xWindow, yWindow));
  }
  return result;
}

export function calculateLaggedCorrelation(
  x: number[],
  y: number[],
  maxLag: number = 10
): { lag: number; correlation: number }[] {
  const results: { lag: number; correlation: number }[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let xSlice: number[], ySlice: number[];
    if (lag > 0) {
      xSlice = x.slice(lag);
      ySlice = y.slice(0, y.length - lag);
    } else if (lag < 0) {
      xSlice = x.slice(0, x.length + lag);
      ySlice = y.slice(-lag);
    } else {
      xSlice = x;
      ySlice = y;
    }
    results.push({ lag, correlation: pearsonCorrelation(xSlice, ySlice) });
  }
  return results;
}

export function findLeadLag(
  series1: number[],
  series2: number[],
  name1: string,
  name2: string,
  maxLag: number = 5
): LeadLagResult {
  const lagCorr = calculateLaggedCorrelation(series1, series2, maxLag);
  let bestLag = 0;
  let bestCorr = 0;

  for (const { lag, correlation } of lagCorr) {
    if (Math.abs(correlation) > Math.abs(bestCorr)) {
      bestCorr = correlation;
      bestLag = lag;
    }
  }

  return {
    leader: bestLag > 0 ? name2 : bestLag < 0 ? name1 : 'none',
    follower: bestLag > 0 ? name1 : bestLag < 0 ? name2 : 'none',
    optimalLag: Math.abs(bestLag),
    correlation: bestCorr,
    direction: bestCorr >= 0 ? 'positive' : 'negative',
    confidence: Math.min(Math.abs(bestCorr) * 100, 100),
  };
}

export function calculateBeta(marketReturns: number[], stockReturns: number[]): number {
  const n = Math.min(marketReturns.length, stockReturns.length);
  if (n < 2) return 1;

  const mkt = marketReturns.slice(0, n);
  const stk = stockReturns.slice(0, n);

  const cov = pearsonCorrelation(mkt, stk);
  const mktVariance = mkt.reduce((s, v) => s + v * v, 0) / n;
  const stkVariance = stk.reduce((s, v) => s + v * v, 0) / n;

  if (mktVariance === 0) return 1;
  return (cov * Math.sqrt(stkVariance)) / Math.sqrt(mktVariance);
}

export function detectDecoupling(
  prices1: number[],
  prices2: number[],
  name1: string,
  name2: string,
  window: number = 20,
  threshold: number = 0.5
): DecouplingEvent[] {
  const events: DecouplingEvent[] = [];
  const rollingCorr = rollingCorrelation(prices1, prices2, window);
  const returns1 = calculateReturns(prices1);
  const returns2 = calculateReturns(prices2);

  for (let i = 0; i < rollingCorr.length; i++) {
    if (rollingCorr[i] < -threshold) {
      const idx = i + window;
      events.push({
        date: `day_${idx}`,
        market1: name1,
        market2: name2,
        expectedDirection: returns2[idx] > 0 ? 'up' : 'down',
        actualDirection: returns1[idx] > 0 ? 'up' : 'down',
        magnitude: Math.abs(returns1[idx] - returns2[idx]),
        significance: Math.abs(rollingCorr[i]),
      });
    }
  }

  return events;
}

export function calculateCorrelationMatrix(
  series: Record<string, number[]>,
  window?: number
): Record<string, Record<string, number>> {
  const keys = Object.keys(series);
  const matrix: Record<string, Record<string, number>> = {};

  for (const k1 of keys) {
    matrix[k1] = {};
    for (const k2 of keys) {
      if (k1 === k2) {
        matrix[k1][k2] = 1;
      } else if (window) {
        const rolling = rollingCorrelation(series[k1], series[k2], window);
        matrix[k1][k2] = rolling.length > 0 ? rolling[rolling.length - 1] : 0;
      } else {
        matrix[k1][k2] = pearsonCorrelation(series[k1], series[k2]);
      }
    }
  }

  return matrix;
}

export function calculateDiversificationRatio(
  weights: number[],
  correlationMatrix: number[][]
): number {
  const n = weights.length;
  let portfolioVariance = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      portfolioVariance += weights[i] * weights[j] * (correlationMatrix[i]?.[j] ?? 0);
    }
  }

  const weightedAvgCorr = portfolioVariance / (weights.reduce((a, b) => a + b, 0) ** 2);
  return 1 - weightedAvgCorr;
}

export function calculateRollingBeta(
  marketReturns: number[],
  stockReturns: number[],
  window: number = 60
): number[] {
  const result: number[] = [];
  const n = Math.min(marketReturns.length, stockReturns.length);

  for (let i = window - 1; i < n; i++) {
    const mktWindow = marketReturns.slice(i - window + 1, i + 1);
    const stkWindow = stockReturns.slice(i - window + 1, i + 1);
    result.push(calculateBeta(mktWindow, stkWindow));
  }

  return result;
}

export function calculateVolatility(returns: number[], annualize: boolean = true): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);
  return annualize ? dailyVol * Math.sqrt(252) : dailyVol;
}

export function calculateMaxDrawdown(prices: number[]): { maxDrawdown: number; peak: number; trough: number } {
  let peak = prices[0];
  let maxDrawdown = 0;
  let peakIdx = 0;
  let troughIdx = 0;

  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > peak) {
      peak = prices[i];
      peakIdx = i;
    }
    const drawdown = (peak - prices[i]) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      troughIdx = i;
    }
  }

  return { maxDrawdown, peak: peakIdx, trough: troughIdx };
}

export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number = 0.03,
  annualize: boolean = true
): number {
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualizedReturn = annualize ? mean * 252 : mean;
  const vol = calculateVolatility(returns, annualize);
  if (vol === 0) return 0;
  return (annualizedReturn - riskFreeRate) / vol;
}

export function calculateInformationRatio(
  portfolioReturns: number[],
  benchmarkReturns: number[]
): number {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;

  const excessReturns: number[] = [];
  for (let i = 0; i < n; i++) {
    excessReturns.push(portfolioReturns[i] - benchmarkReturns[i]);
  }

  const meanExcess = excessReturns.reduce((a, b) => a + b, 0) / n;
  const trackingError = Math.sqrt(
    excessReturns.reduce((s, r) => s + (r - meanExcess) ** 2, 0) / (n - 1)
  );

  return trackingError === 0 ? 0 : meanExcess / trackingError;
}

export function getTimezoneOffset(market: MarketIndex): number {
  const offsets: Record<string, number> = {
    'Asia/Shanghai': 8,
    'America/New_York': -5,
    'Europe/London': 0,
    'Europe/Berlin': 1,
    'Europe/Paris': 1,
    'Asia/Tokyo': 9,
    'Asia/Hong_Kong': 8,
    'Asia/Seoul': 9,
    'Asia/Taipei': 8,
    'Asia/Singapore': 8,
    'Australia/Sydney': 11,
  };
  return offsets[market.timezone] ?? 0;
}

export function isOverlappingTradingHours(
  market1: MarketIndex,
  market2: MarketIndex,
  hour: number = 10
): boolean {
  const offset1 = getTimezoneOffset(market1);
  const offset2 = getTimezoneOffset(market2);
  const diff = Math.abs(offset1 - offset2);

  // A-share: 9:30-11:30, 13:00-15:00 (UTC+8)
  // US: 9:30-16:00 (UTC-5)
  // Overlap depends on time difference
  return diff <= 13; // simplified check
}

export class GlobalCorrelationEngine {
  private priceData: Map<string, number[]> = new Map();
  private returnData: Map<string, number[]> = new Map();

  addIndexData(code: string, prices: number[]): void {
    this.priceData.set(code, prices);
    this.returnData.set(code, calculateReturns(prices));
  }

  getCorrelation(code1: string, code2: string): number {
    const r1 = this.returnData.get(code1);
    const r2 = this.returnData.get(code2);
    if (!r1 || !r2) return 0;
    return pearsonCorrelation(r1, r2);
  }

  getRollingCorrelation(code1: string, code2: string, window: number = 60): number[] {
    const r1 = this.returnData.get(code1);
    const r2 = this.returnData.get(code2);
    if (!r1 || !r2) return [];
    return rollingCorrelation(r1, r2, window);
  }

  getFullCorrelationMatrix(): Record<string, Record<string, number>> {
    const series: Record<string, number[]> = {};
    for (const [code, returns] of this.returnData) {
      series[code] = returns;
    }
    return calculateCorrelationMatrix(series);
  }

  findLeadLagPairs(maxLag: number = 5): LeadLagResult[] {
    const results: LeadLagResult[] = [];
    const codes = Array.from(this.returnData.keys());

    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        const r1 = this.returnData.get(codes[i])!;
        const r2 = this.returnData.get(codes[j])!;
        const idx1 = GLOBAL_INDICES.find(idx => idx.code === codes[i]);
        const idx2 = GLOBAL_INDICES.find(idx => idx.code === codes[j]);
        if (idx1 && idx2) {
          results.push(findLeadLag(r1, r2, idx1.name, idx2.name, maxLag));
        }
      }
    }

    return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  detectRegimeShifts(window: number = 60, threshold: number = 0.3): { date: string; from: number; to: number }[] {
    const shifts: { date: string; from: number; to: number }[] = [];
    const codes = Array.from(this.returnData.keys());
    if (codes.length < 2) return shifts;

    const rolling = this.getRollingCorrelation(codes[0], codes[1], window);
    for (let i = 1; i < rolling.length; i++) {
      if (Math.abs(rolling[i] - rolling[i - 1]) > threshold) {
        shifts.push({
          date: `day_${i + window}`,
          from: rolling[i - 1],
          to: rolling[i],
        });
      }
    }

    return shifts;
  }

  getMostCorrelatedPairs(limit: number = 5): { code1: string; code2: string; correlation: number }[] {
    const pairs: { code1: string; code2: string; correlation: number }[] = [];
    const codes = Array.from(this.returnData.keys());

    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        pairs.push({
          code1: codes[i],
          code2: codes[j],
          correlation: this.getCorrelation(codes[i], codes[j]),
        });
      }
    }

    return pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, limit);
  }

  getLeastCorrelatedPairs(limit: number = 5): { code1: string; code2: string; correlation: number }[] {
    const pairs: { code1: string; code2: string; correlation: number }[] = [];
    const codes = Array.from(this.returnData.keys());

    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        pairs.push({
          code1: codes[i],
          code2: codes[j],
          correlation: this.getCorrelation(codes[i], codes[j]),
        });
      }
    }

    return pairs.sort((a, b) => Math.abs(a.correlation) - Math.abs(b.correlation)).slice(0, limit);
  }
}
