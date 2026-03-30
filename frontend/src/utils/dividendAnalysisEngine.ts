/**
 * 分红送转分析引擎
 * 除权除息日计算, 股息率分析, 分红策略评估
 */

export interface DividendEvent {
  ticker: string;
  date: string;
  type: 'cash' | 'stock' | 'rights';
  ratio: number; // 每股派息 or 送转比例
  exDate: string;
  recordDate: string;
  payDate: string;
}

export interface DividendMetrics {
  ticker: string;
  dividendYield: number;
  payoutRatio: number;
  dividendGrowthRate: number;
  consecutiveYears: number;
  avgDividendFrequency: number;
  stability: number; // 0-1
}

export interface DividendCalendarEntry {
  date: string;
  ticker: string;
  name: string;
  type: '除息' | '除权' | '除权除息';
  cashDividend: number;
  stockDividend: number;
  estimatedImpact: number;
}

export interface DividendStrategy {
  name: string;
  stocks: string[];
  expectedYield: number;
  riskLevel: 'low' | 'medium' | 'high';
  holdingPeriod: number;
  taxEfficiency: number;
}

export function calculateDividendYield(
  annualDividend: number,
  currentPrice: number
): number {
  return currentPrice > 0 ? annualDividend / currentPrice : 0;
}

export function calculatePayoutRatio(
  totalDividend: number,
  netIncome: number
): number {
  return netIncome > 0 ? totalDividend / netIncome : 0;
}

export function calculateDividendGrowthRate(
  dividends: number[]
): number {
  if (dividends.length < 2) return 0;
  let totalGrowth = 0;
  let count = 0;
  for (let i = 1; i < dividends.length; i++) {
    if (dividends[i - 1] > 0) {
      totalGrowth += (dividends[i] - dividends[i - 1]) / dividends[i - 1];
      count++;
    }
  }
  return count > 0 ? totalGrowth / count : 0;
}

export function calculateDividendStability(dividends: number[]): number {
  if (dividends.length < 2) return 1;
  const mean = dividends.reduce((s, d) => s + d, 0) / dividends.length;
  if (mean === 0) return 0;
  const variance = dividends.reduce((s, d) => s + (d - mean) ** 2, 0) / dividends.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, 1 - cv);
}

export function calculateExDividendImpact(
  dividendPerShare: number,
  price: number,
  taxRate: number = 0.1
): { theoreticalDrop: number; actualDropEstimate: number; exPrice: number } {
  const theoreticalDrop = dividendPerShare;
  const actualDropEstimate = dividendPerShare * (1 - taxRate);
  const exPrice = price - actualDropEstimate;
  return { theoreticalDrop, actualDropEstimate, exPrice };
}

export function buildDividendCalendar(
  events: DividendEvent[],
  startDate: string,
  endDate: string
): DividendCalendarEntry[] {
  const calendar: DividendCalendarEntry[] = [];
  
  for (const event of events) {
    if (event.exDate >= startDate && event.exDate <= endDate) {
      let type: DividendCalendarEntry['type'];
      if (event.type === 'cash') type = '除息';
      else if (event.type === 'stock') type = '除权';
      else type = '除权除息';
      
      calendar.push({
        date: event.exDate,
        ticker: event.ticker,
        name: '',
        type,
        cashDividend: event.type === 'cash' ? event.ratio : 0,
        stockDividend: event.type === 'stock' ? event.ratio : 0,
        estimatedImpact: -event.ratio * 0.9,
      });
    }
  }
  
  return calendar.sort((a, b) => a.date.localeCompare(b.date));
}

export function analyzeDividendMetrics(
  ticker: string,
  dividends: number[],
  prices: number[],
  earnings: number[]
): DividendMetrics {
  const annualDividend = dividends.length > 0 ? dividends[dividends.length - 1] : 0;
  const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
  const currentEarnings = earnings.length > 0 ? earnings[earnings.length - 1] : 0;
  
  const dividendYield = calculateDividendYield(annualDividend, currentPrice);
  const payoutRatio = calculatePayoutRatio(annualDividend, currentEarnings);
  const dividendGrowthRate = calculateDividendGrowthRate(dividends);
  const stability = calculateDividendStability(dividends);
  
  // Count consecutive years with positive dividends
  let consecutiveYears = 0;
  for (let i = dividends.length - 1; i >= 0; i--) {
    if (dividends[i] > 0) consecutiveYears++;
    else break;
  }
  
  const avgDividendFrequency = dividends.length > 0 
    ? dividends.filter(d => d > 0).length / dividends.length 
    : 0;
  
  return {
    ticker,
    dividendYield,
    payoutRatio,
    dividendGrowthRate,
    consecutiveYears,
    avgDividendFrequency,
    stability,
  };
}

export function rankByDividendQuality(
  metrics: DividendMetrics[]
): { ticker: string; score: number; rank: number }[] {
  const scores = metrics.map(m => {
    let score = 0;
    score += Math.min(25, m.dividendYield * 100);
    score += Math.min(20, m.stability * 20);
    score += Math.min(20, m.consecutiveYears * 2);
    score += Math.min(20, m.dividendGrowthRate * 100);
    score += Math.min(15, m.payoutRatio < 0.8 ? 15 : m.payoutRatio < 1 ? 10 : 5);
    return { ticker: m.ticker, score: Math.min(100, score), rank: 0 };
  });
  
  scores.sort((a, b) => b.score - a.score);
  scores.forEach((s, i) => s.rank = i + 1);
  return scores;
}

export function suggestDividendStrategy(
  metrics: DividendMetrics[],
  riskTolerance: 'conservative' | 'moderate' | 'aggressive'
): DividendStrategy {
  const filtered = metrics.filter(m => {
    if (riskTolerance === 'conservative') return m.stability > 0.8 && m.dividendYield > 0.03;
    if (riskTolerance === 'moderate') return m.stability > 0.6 && m.dividendYield > 0.02;
    return m.dividendYield > 0.01;
  });
  
  const ranked = rankByDividendQuality(filtered);
  const stocks = ranked.slice(0, 10).map(s => s.ticker);
  const avgYield = filtered.reduce((s, m) => s + m.dividendYield, 0) / (filtered.length || 1);
  
  return {
    name: riskTolerance === 'conservative' ? '稳健股息策略' : riskTolerance === 'moderate' ? '均衡股息策略' : '成长股息策略',
    stocks,
    expectedYield: avgYield,
    riskLevel: riskTolerance === 'conservative' ? 'low' : riskTolerance === 'moderate' ? 'medium' : 'high',
    holdingPeriod: riskTolerance === 'conservative' ? 365 : 180,
    taxEfficiency: riskTolerance === 'conservative' ? 0.9 : 0.7,
  };
}
