/**
 * 回购分析引擎
 * 分析股票回购计划、执行进度、市场影响
 */

export interface BuybackPlan {
  stockCode: string;
  stockName: string;
  announceDate: string;
  planAmount: number; // 计划回购金额(万元)
  minPrice: number; // 回购价格下限
  maxPrice: number; // 回购价格上限
  purpose: 'employee_incentive' | 'equity_transfer' | 'reduce_capital' | 'stabilize_price';
  duration: number; // 回购期限(月)
  actualAmount: number; // 已回购金额(万元)
  actualShares: number; // 已回购股数(万股)
  avgBuybackPrice: number;
  status: 'pending' | 'in_progress' | 'completed' | 'terminated';
}

export interface BuybackAnalysis {
  stockCode: string;
  completionRate: number; // 完成率 %
  progressEfficiency: number; // 进度效率
  priceAttractiveness: number; // 当前价格吸引力 0-100
  signalStrength: number; // 回购信号强度 0-100
  estimatedCompletion: string; // 预计完成日期
  marketImpact: 'positive' | 'neutral' | 'negative';
  valuationSignal: 'undervalued' | 'fair' | 'overvalued';
}

export interface BuybackMarket {
  date: string;
  totalPlans: number;
  totalAmount: number; // 亿元
  avgCompletion: number;
  newAnnouncements: number;
  completedCount: number;
  sentiment: 'bullish' | 'neutral' | 'bearish';
}

export class BuybackEngine {
  /**
   * 分析单只回购
   */
  analyzeBuyback(plan: BuybackPlan, currentPrice: number): BuybackAnalysis {
    const completionRate = plan.planAmount > 0 
      ? (plan.actualAmount / plan.planAmount) * 100 : 0;

    // 进度效率 (实际完成率 vs 时间进度)
    const startDate = new Date(plan.announceDate);
    const monthsPassed = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    const timeProgress = plan.duration > 0 ? (monthsPassed / plan.duration) * 100 : 0;
    const progressEfficiency = timeProgress > 0 ? completionRate / timeProgress : 0;

    // 价格吸引力
    let priceAttractiveness = 50;
    if (currentPrice > 0 && plan.maxPrice > 0) {
      if (currentPrice < plan.minPrice) priceAttractiveness = 100; // 低于下限，公司应积极回购
      else if (currentPrice > plan.maxPrice) priceAttractiveness = 10; // 高于上限，不会回购
      else {
        const range = plan.maxPrice - plan.minPrice;
        priceAttractiveness = range > 0 
          ? ((plan.maxPrice - currentPrice) / range) * 100 : 50;
      }
    }

    // 信号强度
    const amountScore = Math.min(40, plan.planAmount / 10000 * 5);
    const completionScore = Math.min(30, completionRate / 3);
    const purposeScore = plan.purpose === 'stabilize_price' ? 30 : 
      plan.purpose === 'reduce_capital' ? 25 : 
      plan.purpose === 'employee_incentive' ? 15 : 10;
    const signalStrength = amountScore + completionScore + purposeScore;

    // 预计完成日期
    const remainingAmount = plan.planAmount - plan.actualAmount;
    const monthlyRate = monthsPassed > 0 ? plan.actualAmount / monthsPassed : 0;
    const remainingMonths = monthlyRate > 0 ? remainingAmount / monthlyRate : plan.duration;
    const estimatedDate = new Date();
    estimatedDate.setMonth(estimatedDate.getMonth() + Math.ceil(remainingMonths));
    const estimatedCompletion = estimatedDate.toISOString().split('T')[0];

    // 市场影响
    let marketImpact: BuybackAnalysis['marketImpact'] = 'neutral';
    if (completionRate > 50 && currentPrice < plan.maxPrice) marketImpact = 'positive';
    else if (completionRate < 10 && monthsPassed > 3) marketImpact = 'negative';

    // 估值信号
    let valuationSignal: BuybackAnalysis['valuationSignal'] = 'fair';
    if (currentPrice < plan.minPrice * 1.1) valuationSignal = 'undervalued';
    else if (currentPrice > plan.maxPrice * 0.9) valuationSignal = 'overvalued';

    return {
      stockCode: plan.stockCode,
      completionRate,
      progressEfficiency,
      priceAttractiveness,
      signalStrength,
      estimatedCompletion,
      marketImpact,
      valuationSignal
    };
  }

  /**
   * 回购市场情绪
   */
  calculateMarketSentiment(plans: BuybackPlan[]): BuybackMarket[] {
    const dateMap = new Map<string, BuybackPlan[]>();
    for (const p of plans) {
      const existing = dateMap.get(p.announceDate) || [];
      existing.push(p);
      dateMap.set(p.announceDate, existing);
    }

    return Array.from(dateMap.entries()).map(([date, dayPlans]) => {
      const totalAmount = dayPlans.reduce((s, p) => s + p.planAmount, 0) / 10000; // 转亿
      const completions = dayPlans.map(p => p.planAmount > 0 ? p.actualAmount / p.planAmount * 100 : 0);
      const avgCompletion = completions.reduce((a, b) => a + b, 0) / completions.length;
      const completedCount = dayPlans.filter(p => p.status === 'completed').length;

      let sentiment: BuybackMarket['sentiment'] = 'neutral';
      if (totalAmount > 50 && avgCompletion > 30) sentiment = 'bullish';
      else if (totalAmount < 5 || avgCompletion < 5) sentiment = 'bearish';

      return {
        date,
        totalPlans: dayPlans.length,
        totalAmount,
        avgCompletion,
        newAnnouncements: dayPlans.length,
        completedCount,
        sentiment
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 回购筛选器
   */
  screenBuybacks(
    plans: BuybackPlan[],
    currentPrices: Map<string, number>,
    filters: {
      minAmount?: number;
      minCompletion?: number;
      purpose?: string;
      priceNearMax?: boolean;
    }
  ): { plan: BuybackPlan; analysis: BuybackAnalysis }[] {
    return plans
      .filter(p => {
        if (filters.minAmount && p.planAmount < filters.minAmount) return false;
        if (filters.purpose && p.purpose !== filters.purpose) return false;
        if (filters.minCompletion) {
          const completion = p.planAmount > 0 ? p.actualAmount / p.planAmount * 100 : 0;
          if (completion < filters.minCompletion) return false;
        }
        if (filters.priceNearMax) {
          const price = currentPrices.get(p.stockCode) || 0;
          if (price > 0 && p.maxPrice > 0 && price > p.maxPrice * 0.95) return false;
        }
        return true;
      })
      .map(p => ({
        plan: p,
        analysis: this.analyzeBuyback(p, currentPrices.get(p.stockCode) || 0)
      }))
      .sort((a, b) => b.analysis.signalStrength - a.analysis.signalStrength);
  }

  /**
   * 回购 vs 股价相关性
   */
  analyzePriceCorrelation(
    buybackDates: string[],
    prices: { date: string; close: number }[]
  ): {
    avgReturnAfter30D: number;
    avgReturnAfter90D: number;
    outperformanceRate: number;
    bestTiming: string;
  } {
    const priceMap = new Map(prices.map(p => [p.date, p.close]));
    const returns30: number[] = [];
    const returns90: number[] = [];

    for (const date of buybackDates) {
      const startPrice = priceMap.get(date);
      if (!startPrice) continue;

      // 找30天后和90天后的价格
      const dateObj = new Date(date);
      for (const p of prices) {
        const pDate = new Date(p.date);
        const daysDiff = Math.round((pDate.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 30 && startPrice > 0) {
          returns30.push((p.close - startPrice) / startPrice * 100);
        }
        if (daysDiff === 90 && startPrice > 0) {
          returns90.push((p.close - startPrice) / startPrice * 100);
        }
      }
    }

    const avg30 = returns30.length > 0 ? returns30.reduce((a, b) => a + b, 0) / returns30.length : 0;
    const avg90 = returns90.length > 0 ? returns90.reduce((a, b) => a + b, 0) / returns90.length : 0;
    const outperform = returns30.filter(r => r > 0).length;
    const outperformanceRate = returns30.length > 0 ? (outperform / returns30.length) * 100 : 0;

    let bestTiming = 'announce_day';
    if (avg30 > avg90) bestTiming = 'announce_day';
    else bestTiming = 'hold_90d';

    return { avgReturnAfter30D: avg30, avgReturnAfter90D: avg90, outperformanceRate, bestTiming };
  }
}
