/**
 * 季节性/日历效应分析引擎
 * - 月度效应 (January Effect, Sell in May)
 * - 星期效应 (Monday Effect)
 * - 节假日效应 (A股春节/国庆前后)
 * - 半年报/年报窗口效应
 * - 期权到期日效应
 * - 季节性模式识别
 */

export interface DailyReturn {
  date: string;  // YYYY-MM-DD
  return: number;
  volume?: number;
}

export interface MonthlyEffect {
  month: number;
  avgReturn: number;
  medianReturn: number;
  winRate: number;
  volatility: number;
  sharpeRatio: number;
  sampleSize: number;
  significant: boolean;
}

export interface WeekdayEffect {
  weekday: number;  // 0=Mon, 4=Fri
  avgReturn: number;
  medianReturn: number;
  winRate: number;
  volatility: number;
  significant: boolean;
}

export interface HolidayEffect {
  holiday: string;
  preHolidayReturn: number;   // 节前N天收益
  postHolidayReturn: number;  // 节后N天收益
  preHolidayWinRate: number;
  postHolidayWinRate: number;
  days: number;               // 统计天数
  significant: boolean;
}

export interface EarningsWindowEffect {
  window: 'pre_annual' | 'post_annual' | 'pre_semi' | 'post_semi';
  avgReturn: number;
  winRate: number;
  volatility: number;
  avgDuration: number; // 窗口长度
}

export interface SeasonalityPattern {
  month: number;
  weekOfMonth: number;
  avgReturn: number;
  winRate: number;
  consistency: number; // 连年一致性 0-1
  sampleSize: number;
}

export interface SeasonalityReport {
  symbol: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  monthlyEffects: MonthlyEffect[];
  weekdayEffects: WeekdayEffect[];
  holidayEffects: HolidayEffect[];
  earningsEffects: EarningsWindowEffect[];
  patterns: SeasonalityPattern[];
  bestMonth: number;
  worstMonth: number;
  bestWeekday: number;
  worstWeekday: number;
  currentMonthSignal: 'bullish' | 'bearish' | 'neutral';
  currentWeekdaySignal: 'bullish' | 'bearish' | 'neutral';
}

export class SeasonalityEngine {
  /**
   * A股主要节假日
   */
  private readonly A_STOCK_HOLIDAYS: Record<string, { start: string; end: string }> = {
    springFestival: { start: '01-20', end: '02-15' },   // 春节
    qingming: { start: '04-03', end: '04-06' },          // 清明
    laborDay: { start: '04-28', end: '05-05' },           // 五一
    dragonBoat: { start: '06-20', end: '06-24' },         // 端午
    midAutumn: { start: '09-15', end: '09-20' },          // 中秋
    nationalDay: { start: '09-28', end: '10-08' },        // 国庆
  };

  /**
   * 月度效应分析
   */
  analyzeMonthlyEffect(returns: DailyReturn[]): MonthlyEffect[] {
    const byMonth: Map<number, number[]> = new Map();

    for (const ret of returns) {
      const month = parseInt(ret.date.substring(5, 7), 10);
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month)!.push(ret.return);
    }

    const results: MonthlyEffect[] = [];

    for (let month = 1; month <= 12; month++) {
      const monthReturns = byMonth.get(month) || [];
      if (monthReturns.length < 5) {
        results.push({
          month, avgReturn: 0, medianReturn: 0, winRate: 0,
          volatility: 0, sharpeRatio: 0, sampleSize: monthReturns.length, significant: false
        });
        continue;
      }

      const avgReturn = monthReturns.reduce((a, b) => a + b, 0) / monthReturns.length;
      const sorted = [...monthReturns].sort((a, b) => a - b);
      const medianReturn = sorted[Math.floor(sorted.length / 2)];
      const winRate = monthReturns.filter(r => r > 0).length / monthReturns.length;
      const variance = monthReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / monthReturns.length;
      const volatility = Math.sqrt(variance);
      const sharpeRatio = volatility === 0 ? 0 : (avgReturn / volatility) * Math.sqrt(252);

      // T-test significance
      const tStat = volatility === 0 ? 0 : (avgReturn / volatility) * Math.sqrt(monthReturns.length);
      const significant = Math.abs(tStat) > 1.96;

      results.push({ month, avgReturn, medianReturn, winRate, volatility, sharpeRatio, sampleSize: monthReturns.length, significant });
    }

    return results;
  }

  /**
   * 星期效应分析
   */
  analyzeWeekdayEffect(returns: DailyReturn[]): WeekdayEffect[] {
    const byWeekday: Map<number, number[]> = new Map();
    for (let i = 0; i < 5; i++) byWeekday.set(i, []);

    for (const ret of returns) {
      const date = new Date(ret.date);
      const day = date.getDay();
      if (day >= 1 && day <= 5) {
        byWeekday.get(day - 1)!.push(ret.return);
      }
    }

    const results: WeekdayEffect[] = [];

    for (let weekday = 0; weekday < 5; weekday++) {
      const dayReturns = byWeekday.get(weekday) || [];
      if (dayReturns.length < 5) {
        results.push({ weekday, avgReturn: 0, medianReturn: 0, winRate: 0, volatility: 0, significant: false });
        continue;
      }

      const avgReturn = dayReturns.reduce((a, b) => a + b, 0) / dayReturns.length;
      const sorted = [...dayReturns].sort((a, b) => a - b);
      const medianReturn = sorted[Math.floor(sorted.length / 2)];
      const winRate = dayReturns.filter(r => r > 0).length / dayReturns.length;
      const variance = dayReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / dayReturns.length;
      const volatility = Math.sqrt(variance);
      const tStat = volatility === 0 ? 0 : (avgReturn / volatility) * Math.sqrt(dayReturns.length);

      results.push({
        weekday,
        avgReturn,
        medianReturn,
        winRate,
        volatility,
        significant: Math.abs(tStat) > 1.96
      });
    }

    return results;
  }

  /**
   * A股节假日效应
   */
  analyzeHolidayEffect(returns: DailyReturn[]): HolidayEffect[] {
    const results: HolidayEffect[] = [];
    const returnMap = new Map(returns.map(r => [r.date, r.return]));

    for (const [holiday, range] of Object.entries(this.A_STOCK_HOLIDAYS)) {
      const preReturns: number[] = [];
      const postReturns: number[] = [];

      for (const ret of returns) {
        const mmdd = ret.date.substring(5);

        // Pre-holiday: 5 trading days before
        if (mmdd >= this.subtractDays(range.start, 10) && mmdd < range.start) {
          preReturns.push(ret.return);
        }

        // Post-holiday: 5 trading days after
        if (mmdd > range.end && mmdd <= this.addDays(range.end, 10)) {
          postReturns.push(ret.return);
        }
      }

      const preAvg = preReturns.length > 0 ? preReturns.reduce((a, b) => a + b, 0) / preReturns.length : 0;
      const postAvg = postReturns.length > 0 ? postReturns.reduce((a, b) => a + b, 0) / postReturns.length : 0;
      const preWin = preReturns.length > 0 ? preReturns.filter(r => r > 0).length / preReturns.length : 0;
      const postWin = postReturns.length > 0 ? postReturns.filter(r => r > 0).length / postReturns.length : 0;

      const preStd = this.std(preReturns);
      const postStd = this.std(postReturns);
      const preT = preStd === 0 ? 0 : (preAvg / preStd) * Math.sqrt(preReturns.length);
      const postT = postStd === 0 ? 0 : (postAvg / postStd) * Math.sqrt(postReturns.length);

      results.push({
        holiday,
        preHolidayReturn: preAvg,
        postHolidayReturn: postAvg,
        preHolidayWinRate: preWin,
        postHolidayWinRate: postWin,
        days: Math.max(preReturns.length, postReturns.length),
        significant: Math.abs(preT) > 1.96 || Math.abs(postT) > 1.96
      });
    }

    return results;
  }

  /**
   * 财报窗口效应
   */
  analyzeEarningsWindowEffect(returns: DailyReturn[]): EarningsWindowEffect[] {
    const results: EarningsWindowEffect[] = [];

    const windows = [
      { key: 'pre_annual' as const, startMonth: 3, endMonth: 4 },     // 年报前(1-3月)
      { key: 'post_annual' as const, startMonth: 4, endMonth: 5 },    // 年报后(4-5月)
      { key: 'pre_semi' as const, startMonth: 7, endMonth: 8 },       // 半年报前(7-8月)
      { key: 'post_semi' as const, startMonth: 8, endMonth: 9 },      // 半年报后(8-9月)
    ];

    for (const w of windows) {
      const windowReturns = returns.filter(r => {
        const month = parseInt(r.date.substring(5, 7), 10);
        return month >= w.startMonth && month < w.endMonth;
      });

      if (windowReturns.length < 10) {
        results.push({ window: w.key, avgReturn: 0, winRate: 0, volatility: 0, avgDuration: 0 });
        continue;
      }

      const avgReturn = windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length;
      const winRate = windowReturns.filter(r => r > 0).length / windowReturns.length;
      const volatility = this.std(windowReturns.map(r => r.return));

      results.push({ window: w.key, avgReturn, winRate, volatility, avgDuration: windowReturns.length });
    }

    return results;
  }

  /**
   * 细粒度季节性模式 (月×周)
   */
  findPatterns(returns: DailyReturn[]): SeasonalityPattern[] {
    const byPattern: Map<string, { returns: number[]; years: Set<number> }> = new Map();

    for (const ret of returns) {
      const month = parseInt(ret.date.substring(5, 7), 10);
      const day = parseInt(ret.date.substring(8, 10), 10);
      const weekOfMonth = Math.ceil(day / 7);
      const year = parseInt(ret.date.substring(0, 4), 10);
      const key = `${month}-${weekOfMonth}`;

      if (!byPattern.has(key)) byPattern.set(key, { returns: [], years: new Set() });
      byPattern.get(key)!.returns.push(ret.return);
      byPattern.get(key)!.years.add(year);
    }

    const patterns: SeasonalityPattern[] = [];

    for (const [key, data] of byPattern) {
      const [month, weekOfMonth] = key.split('-').map(Number);
      if (data.returns.length < 10) continue;

      const avgReturn = data.returns.reduce((a, b) => a + b, 0) / data.returns.length;
      const winRate = data.returns.filter(r => r > 0).length / data.returns.length;

      // Consistency: how many years had positive return in this pattern
      const yearlyReturns: Map<number, number[]> = new Map();
      for (const ret of returns) {
        const m = parseInt(ret.date.substring(5, 7), 10);
        const d = parseInt(ret.date.substring(8, 10), 10);
        const w = Math.ceil(d / 7);
        const y = parseInt(ret.date.substring(0, 4), 10);
        if (m === month && w === weekOfMonth) {
          if (!yearlyReturns.has(y)) yearlyReturns.set(y, []);
          yearlyReturns.get(y)!.push(ret.return);
        }
      }

      let consistentYears = 0;
      for (const [, yearRets] of yearlyReturns) {
        const yearAvg = yearRets.reduce((a, b) => a + b, 0) / yearRets.length;
        if ((avgReturn > 0 && yearAvg > 0) || (avgReturn < 0 && yearAvg < 0)) consistentYears++;
      }
      const consistency = yearlyReturns.size === 0 ? 0 : consistentYears / yearlyReturns.size;

      patterns.push({ month, weekOfMonth, avgReturn, winRate, consistency, sampleSize: data.returns.length });
    }

    return patterns.sort((a, b) => Math.abs(b.avgReturn) - Math.abs(a.avgReturn));
  }

  /**
   * 生成完整季节性报告
   */
  generateReport(symbol: string, returns: DailyReturn[]): SeasonalityReport {
    const monthlyEffects = this.analyzeMonthlyEffect(returns);
    const weekdayEffects = this.analyzeWeekdayEffect(returns);
    const holidayEffects = this.analyzeHolidayEffect(returns);
    const earningsEffects = this.analyzeEarningsWindowEffect(returns);
    const patterns = this.findPatterns(returns);

    const sortedByReturn = [...monthlyEffects].sort((a, b) => b.avgReturn - a.avgReturn);
    const bestMonth = sortedByReturn[0]?.month || 1;
    const worstMonth = sortedByReturn[sortedByReturn.length - 1]?.month || 12;

    const sortedByWeekday = [...weekdayEffects].sort((a, b) => b.avgReturn - a.avgReturn);
    const bestWeekday = sortedByWeekday[0]?.weekday || 0;
    const worstWeekday = sortedByWeekday[sortedByWeekday.length - 1]?.weekday || 4;

    const currentMonth = new Date().getMonth() + 1;
    const currentWeekday = new Date().getDay() - 1;
    const currentMonthEffect = monthlyEffects.find(m => m.month === currentMonth);
    const currentWeekdayEffect = weekdayEffects.find(w => w.weekday === currentWeekday);

    let currentMonthSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (currentMonthEffect?.significant && currentMonthEffect.avgReturn > 0.001) currentMonthSignal = 'bullish';
    else if (currentMonthEffect?.significant && currentMonthEffect.avgReturn < -0.001) currentMonthSignal = 'bearish';

    let currentWeekdaySignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (currentWeekdayEffect?.significant && currentWeekdayEffect.avgReturn > 0.0005) currentWeekdaySignal = 'bullish';
    else if (currentWeekdayEffect?.significant && currentWeekdayEffect.avgReturn < -0.0005) currentWeekdaySignal = 'bearish';

    return {
      symbol,
      startDate: returns[0]?.date || '',
      endDate: returns[returns.length - 1]?.date || '',
      totalDays: returns.length,
      monthlyEffects,
      weekdayEffects,
      holidayEffects,
      earningsEffects,
      patterns,
      bestMonth,
      worstMonth,
      bestWeekday,
      worstWeekday,
      currentMonthSignal,
      currentWeekdaySignal
    };
  }

  // --- Utility ---

  private std(data: number[]): number {
    if (data.length === 0) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length);
  }

  private subtractDays(mmdd: string, days: number): string {
    const [m, d] = mmdd.split('-').map(Number);
    let day = d - days;
    let month = m;
    if (day <= 0) { month--; day += 30; }
    if (month <= 0) month = 12;
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private addDays(mmdd: string, days: number): string {
    const [m, d] = mmdd.split('-').map(Number);
    let day = d + days;
    let month = m;
    if (day > 30) { month++; day -= 30; }
    if (month > 12) month = 12;
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}

export default new SeasonalityEngine();
