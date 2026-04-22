/**
 * IPO分析引擎
 * 分析新股发行、首日表现、打新收益、解禁影响
 */

export interface IPORecord {
  stockCode: string;
  stockName: string;
  ipoDate: string;
  issuePrice: number;
  firstDayOpen: number;
  firstDayClose: number;
  firstDayHigh: number;
  firstDayLow: number;
  peRatio: number; // 发行市盈率
  industryPE: number; // 行业市盈率
  totalRaise: number; // 募资总额(亿)
  oversubscriptionRate: number; // 超额认购倍数
  industry: string;
  lockUpShares?: number; // 解禁股数(万股)
}

export interface IPOAnalysis {
  stockCode: string;
  firstDayReturn: number; // 首日涨幅 %
  firstDayAmplitude: number; // 首日振幅 %
  peDiscount: number; // 市盈率折价 %
  hotDegree: 'hot' | 'warm' | 'cold';
  oneWeekReturn: number;
  oneMonthReturn: number;
  lockUpDate: string; // 解禁日期
  lockUpShares: number; // 解禁股数(万股)
  lockUpImpact: number; // 解禁影响评分 0-100
}

export interface IPOSentiment {
  date: string;
  ipoCount: number;
  avgFirstDayReturn: number;
  breakRate: number; // 破发率 %
  totalRaised: number;
  marketSentiment: 'frenzy' | 'active' | 'normal' | 'cold' | 'frozen';
}

export interface NewStockStrategy {
  strategy: string;
  avgReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  sampleSize: number;
}

export class IPOAnalysisEngine {
  /**
   * 分析单只IPO
   */
  analyzeIPO(ipo: IPORecord, oneWeekPrice: number = 0, oneMonthPrice: number = 0): IPOAnalysis {
    const firstDayReturn = ipo.issuePrice > 0 
      ? ((ipo.firstDayClose - ipo.issuePrice) / ipo.issuePrice) * 100 : 0;
    const firstDayAmplitude = ipo.firstDayOpen > 0 
      ? ((ipo.firstDayHigh - ipo.firstDayLow) / ipo.firstDayOpen) * 100 : 0;
    const peDiscount = ipo.industryPE > 0 
      ? ((ipo.industryPE - ipo.peRatio) / ipo.industryPE) * 100 : 0;

    let hotDegree: IPOAnalysis['hotDegree'] = 'warm';
    if (ipo.oversubscriptionRate > 500 || firstDayReturn > 100) hotDegree = 'hot';
    else if (ipo.oversubscriptionRate < 50 || firstDayReturn < 10) hotDegree = 'cold';

    const oneWeekReturn = ipo.firstDayClose > 0 && oneWeekPrice > 0 
      ? ((oneWeekPrice - ipo.firstDayClose) / ipo.firstDayClose) * 100 : 0;
    const oneMonthReturn = ipo.firstDayClose > 0 && oneMonthPrice > 0 
      ? ((oneMonthPrice - ipo.firstDayClose) / ipo.firstDayClose) * 100 : 0;

    // 解禁日期 (假设上市后1年)
    const ipoDateObj = new Date(ipo.ipoDate);
    const lockUpDate = new Date(ipoDateObj);
    lockUpDate.setFullYear(lockUpDate.getFullYear() + 1);

    // 解禁影响评分
    const lockUpImpact = Math.min(100, 
      (ipo.lockUpShares || 0) / 10000 * 10 + // 解禁量
      (firstDayReturn > 50 ? 30 : firstDayReturn > 0 ? 15 : 0) // 涨幅越大解禁压力越大
    );

    return {
      stockCode: ipo.stockCode,
      firstDayReturn,
      firstDayAmplitude,
      peDiscount,
      hotDegree,
      oneWeekReturn,
      oneMonthReturn,
      lockUpDate: lockUpDate.toISOString().split('T')[0],
      lockUpShares: ipo.lockUpShares || 0,
      lockUpImpact
    };
  }

  /**
   * IPO市场情绪
   */
  calculateMarketSentiment(
    ipos: IPORecord[]
  ): IPOSentiment[] {
    const dateMap = new Map<string, IPORecord[]>();
    for (const ipo of ipos) {
      const existing = dateMap.get(ipo.ipoDate) || [];
      existing.push(ipo);
      dateMap.set(ipo.ipoDate, existing);
    }

    return Array.from(dateMap.entries()).map(([date, dayIPOs]) => {
      const returns = dayIPOs.map(i => 
        i.issuePrice > 0 ? ((i.firstDayClose - i.issuePrice) / i.issuePrice) * 100 : 0
      );
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const breakCount = returns.filter(r => r < 0).length;
      const breakRate = (breakCount / returns.length) * 100;
      const totalRaised = dayIPOs.reduce((s, i) => s + i.totalRaise, 0);

      let sentiment: IPOSentiment['marketSentiment'] = 'normal';
      if (avgReturn > 100 && breakRate < 5) sentiment = 'frenzy';
      else if (avgReturn > 40) sentiment = 'active';
      else if (avgReturn < 0 || breakRate > 50) sentiment = 'cold';
      else if (breakRate > 80) sentiment = 'frozen';

      return { date, ipoCount: dayIPOs.length, avgFirstDayReturn: avgReturn, breakRate, totalRaised, marketSentiment: sentiment };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 打新策略回测
   */
  backtestNewStockStrategy(
    ipos: IPORecord[],
    strategy: 'all' | 'low_pe' | 'high_oversubscription' | 'small_raise'
  ): NewStockStrategy {
    let filtered = ipos;

    switch (strategy) {
      case 'low_pe':
        filtered = ipos.filter(i => i.peRatio > 0 && i.peRatio < i.industryPE);
        break;
      case 'high_oversubscription':
        filtered = ipos.filter(i => i.oversubscriptionRate > 200);
        break;
      case 'small_raise':
        filtered = ipos.filter(i => i.totalRaise < 10);
        break;
    }

    const returns = filtered.map(i => 
      i.issuePrice > 0 ? ((i.firstDayClose - i.issuePrice) / i.issuePrice) * 100 : 0
    );

    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const winCount = returns.filter(r => r > 0).length;
    const winRate = returns.length > 0 ? (winCount / returns.length) * 100 : 0;

    // 简化的夏普比率
    const std = returns.length > 1 
      ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length) 
      : 1;
    const sharpeRatio = std > 0 ? avgReturn / std : 0;

    // 最大回撤
    let maxDrawdown = 0;
    let peak = returns[0] || 0;
    for (const r of returns) {
      if (r > peak) peak = r;
      const dd = peak - r;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }

    const strategyNames: Record<string, string> = {
      all: '全部打新',
      low_pe: '低市盈率打新',
      high_oversubscription: '高认购倍数打新',
      small_raise: '小募资额打新'
    };

    return {
      strategy: strategyNames[strategy],
      avgReturn,
      winRate,
      sharpeRatio,
      maxDrawdown,
      sampleSize: filtered.length
    };
  }

  /**
   * 解禁影响预测
   */
  predictLockUpImpact(
    ipo: IPORecord,
    currentPrice: number,
    lockUpShares: number,
    avgDailyVolume: number
  ): {
    daysToAbsorb: number;
    priceImpact: number; // 预计价格影响 %
    riskLevel: 'low' | 'medium' | 'high';
    recommendation: string;
  } {
    const daysToAbsorb = avgDailyVolume > 0 ? Math.ceil(lockUpShares / avgDailyVolume * 0.1) : 999;
    const supplyPressure = lockUpShares / Math.max(1, avgDailyVolume);
    const priceImpact = Math.min(30, supplyPressure * 5);

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (supplyPressure > 5) riskLevel = 'high';
    else if (supplyPressure > 2) riskLevel = 'medium';

    let recommendation = '';
    if (riskLevel === 'high') recommendation = '建议减持，解禁压力大';
    else if (riskLevel === 'medium') recommendation = '关注解禁日，适当控制仓位';
    else recommendation = '解禁影响有限，可持有';

    return { daysToAbsorb, priceImpact, riskLevel, recommendation };
  }
}
