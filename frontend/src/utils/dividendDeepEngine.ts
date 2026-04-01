/**
 * 股息分析引擎
 * 分析股息收益率、股息增长、派息率、股息可持续性
 */

export interface DividendRecord {
  stockCode: string;
  stockName: string;
  exDate: string; // 除权除息日
  payDate: string; // 派息日
  cashDividend: number; // 每股派息(元)
  stockDividend: number; // 每股送股
  bonusShares: number; // 每股转增
  year: number;
  period: 'annual' | 'interim' | 'special';
}

export interface DividendAnalysis {
  stockCode: string;
  currentYield: number; // %
  avgYield3Y: number;
  avgYield5Y: number;
  payoutRatio: number; // %
  dividendGrowthRate: number; // %
  consecutiveYears: number; // 连续分红年数
  dividendScore: number; // 0-100
  sustainability: 'sustainable' | 'at_risk' | 'unsustainable';
}

export interface DividendAristocrat {
  stockCode: string;
  stockName: string;
  yearsOfGrowth: number;
  cagr: number; // 股息复合增长率
  currentYield: number;
  payoutRatio: number;
  quality: 'aristocrat' | 'contender' | 'challenger';
}

export interface DividendCalendar {
  date: string;
  events: {
    stockCode: string;
    stockName: string;
    type: 'ex_dividend' | 'pay_date' | 'record_date';
    dividend: number;
    yieldAtEvent: number;
  }[];
}

export class DividendAnalysisEngine {
  /**
   * 计算股息分析
   */
  analyzeDividends(
    dividends: DividendRecord[],
    currentPrice: number,
    eps: number
  ): DividendAnalysis {
    if (dividends.length === 0) {
      return {
        stockCode: '',
        currentYield: 0,
        avgYield3Y: 0,
        avgYield5Y: 0,
        payoutRatio: 0,
        dividendGrowthRate: 0,
        consecutiveYears: 0,
        dividendScore: 0,
        sustainability: 'unsustainable'
      };
    }

    const stockCode = dividends[0].stockCode;
    const sorted = [...dividends].sort((a, b) => a.exDate.localeCompare(b.exDate));

    // 按年汇总
    const yearlyDividends = new Map<number, number>();
    for (const d of sorted) {
      yearlyDividends.set(d.year, (yearlyDividends.get(d.year) || 0) + d.cashDividend);
    }

    const years = Array.from(yearlyDividends.keys()).sort((a, b) => b - a);
    const latestDividend = yearlyDividends.get(years[0]) || 0;
    const currentYield = currentPrice > 0 ? (latestDividend / currentPrice) * 100 : 0;

    // 3年和5年平均
    const last3 = years.slice(0, 3).map(y => yearlyDividends.get(y) || 0);
    const last5 = years.slice(0, 5).map(y => yearlyDividends.get(y) || 0);
    const avgYield3Y = currentPrice > 0 
      ? (last3.reduce((a, b) => a + b, 0) / last3.length / currentPrice) * 100 : 0;
    const avgYield5Y = currentPrice > 0 
      ? (last5.reduce((a, b) => a + b, 0) / last5.length / currentPrice) * 100 : 0;

    // 派息率
    const payoutRatio = eps > 0 ? (latestDividend / eps) * 100 : 0;

    // 股息增长率
    let dividendGrowthRate = 0;
    if (years.length >= 2) {
      const current = yearlyDividends.get(years[0]) || 0;
      const previous = yearlyDividends.get(years[1]) || 0;
      dividendGrowthRate = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    }

    // 连续分红年数
    let consecutiveYears = 0;
    const sortedYears = Array.from(yearlyDividends.keys()).sort((a, b) => b - a);
    for (const year of sortedYears) {
      if ((yearlyDividends.get(year) || 0) > 0) {
        consecutiveYears++;
      } else {
        break;
      }
    }

    // 可持续性
    let sustainability: DividendAnalysis['sustainability'] = 'sustainable';
    if (payoutRatio > 100) sustainability = 'unsustainable';
    else if (payoutRatio > 80 || dividendGrowthRate < -20) sustainability = 'at_risk';

    // 股息评分
    let dividendScore = 0;
    dividendScore += Math.min(25, currentYield * 5); // 收益率最高25分
    dividendScore += Math.min(25, consecutiveYears * 2); // 连续年数最高25分
    dividendScore += Math.min(25, Math.max(0, dividendGrowthRate / 2)); // 增长率最高25分
    dividendScore += payoutRatio > 0 && payoutRatio < 80 ? 25 : payoutRatio < 100 ? 15 : 0; // 派息率合理25分

    return {
      stockCode,
      currentYield,
      avgYield3Y,
      avgYield5Y,
      payoutRatio,
      dividendGrowthRate,
      consecutiveYears,
      dividendScore: Math.min(100, dividendScore),
      sustainability
    };
  }

  /**
   * 筛选股息贵族
   */
  findDividendAristocrats(
    stocks: { code: string; name: string; dividends: DividendRecord[]; price: number; eps: number }[],
    minYears: number = 10,
    minYield: number = 2
  ): DividendAristocrat[] {
    return stocks
      .map(stock => {
        const analysis = this.analyzeDividends(stock.dividends, stock.price, stock.eps);
        const yearlyGrowth = this.calculateYearlyGrowth(stock.dividends);
        const cagr = this.calculateCAGR(stock.dividends);

        let quality: DividendAristocrat['quality'] = 'challenger';
        if (analysis.consecutiveYears >= 25 && cagr > 5) quality = 'aristocrat';
        else if (analysis.consecutiveYears >= 10 && cagr > 0) quality = 'contender';

        return {
          stockCode: stock.code,
          stockName: stock.name,
          yearsOfGrowth: yearlyGrowth,
          cagr,
          currentYield: analysis.currentYield,
          payoutRatio: analysis.payoutRatio,
          quality
        };
      })
      .filter(a => a.yearsOfGrowth >= minYears && a.currentYield >= minYield)
      .sort((a, b) => b.yearsOfGrowth - a.yearsOfGrowth);
  }

  /**
   * 股息日历
   */
  buildDividendCalendar(
    dividends: DividendRecord[],
    startDate: string,
    endDate: string
  ): DividendCalendar[] {
    const calendarMap = new Map<string, DividendCalendar['events']>();

    for (const d of dividends) {
      // 除权除息日
      if (d.exDate >= startDate && d.exDate <= endDate) {
        const events = calendarMap.get(d.exDate) || [];
        events.push({
          stockCode: d.stockCode,
          stockName: d.stockName,
          type: 'ex_dividend',
          dividend: d.cashDividend,
          yieldAtEvent: 0
        });
        calendarMap.set(d.exDate, events);
      }

      // 派息日
      if (d.payDate >= startDate && d.payDate <= endDate) {
        const events = calendarMap.get(d.payDate) || [];
        events.push({
          stockCode: d.stockCode,
          stockName: d.stockName,
          type: 'pay_date',
          dividend: d.cashDividend,
          yieldAtEvent: 0
        });
        calendarMap.set(d.payDate, events);
      }
    }

    return Array.from(calendarMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, events]) => ({ date, events }));
  }

  /**
   * 股息增长一致性
   */
  private calculateYearlyGrowth(dividends: DividendRecord[]): number {
    const yearly = new Map<number, number>();
    for (const d of dividends) {
      yearly.set(d.year, (yearly.get(d.year) || 0) + d.cashDividend);
    }

    const years = Array.from(yearly.keys()).sort((a, b) => a - b);
    let growthYears = 0;
    let consecutive = 0;

    for (let i = 1; i < years.length; i++) {
      const current = yearly.get(years[i]) || 0;
      const previous = yearly.get(years[i - 1]) || 0;
      if (current > previous) {
        consecutive++;
        growthYears = Math.max(growthYears, consecutive);
      } else {
        consecutive = 0;
      }
    }

    return growthYears;
  }

  /**
   * CAGR计算
   */
  private calculateCAGR(dividends: DividendRecord[]): number {
    const yearly = new Map<number, number>();
    for (const d of dividends) {
      yearly.set(d.year, (yearly.get(d.year) || 0) + d.cashDividend);
    }

    const years = Array.from(yearly.keys()).sort((a, b) => a - b);
    if (years.length < 2) return 0;

    const startValue = yearly.get(years[0]) || 0;
    const endValue = yearly.get(years[years.length - 1]) || 0;
    const n = years[years.length - 1] - years[0];

    if (startValue <= 0 || n <= 0) return 0;
    return (Math.pow(endValue / startValue, 1 / n) - 1) * 100;
  }

  /**
   * 股息再投资回报计算
   */
  calculateDRIPReturn(
    initialShares: number,
    initialPrice: number,
    dividends: DividendRecord[],
    currentPrice: number
  ): {
    totalReturn: number;
    capitalGain: number;
    dividendIncome: number;
    dripShares: number;
    finalValue: number;
  } {
    let shares = initialShares;
    let totalDividendIncome = 0;

    const sorted = [...dividends].sort((a, b) => a.exDate.localeCompare(b.exDate));

    for (const d of sorted) {
      const dividendAmount = shares * d.cashDividend;
      totalDividendIncome += dividendAmount;

      // 再投资买入更多股份 (简化)
      if (d.cashDividend > 0 && currentPrice > 0) {
        const newShares = dividendAmount / currentPrice;
        shares += newShares;
      }
    }

    const finalValue = shares * currentPrice;
    const initialValue = initialShares * initialPrice;
    const totalReturn = initialValue > 0 ? ((finalValue - initialValue) / initialValue) * 100 : 0;
    const capitalGain = initialValue > 0 ? ((currentPrice - initialPrice) / initialPrice) * 100 : 0;

    return {
      totalReturn,
      capitalGain,
      dividendIncome: totalDividendIncome,
      dripShares: shares - initialShares,
      finalValue
    };
  }
}
