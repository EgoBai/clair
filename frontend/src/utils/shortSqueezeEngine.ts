/**
 * 空头挤压概率引擎
 * - 做空比例分析
 * - 覆盖天数计算
 * - 挤压概率估计
 * - 催化剂识别
 * - 挤压潜力评分
 * - 历史挤压模式匹配
 */

export interface ShortInterestData {
  shortShares: number;
  totalShares: number;
  avgDailyVolume: number;
  borrowRate: number; // 年化融券费率
  daysToCover: number;
  shortRatio: number; // 做空比例
}

export interface SqueezeProbability {
  probability: number; // 0-1
  confidence: number;
  timeframe: 'imminent' | 'short_term' | 'medium_term' | 'unlikely';
  factors: string[];
}

export interface Catalyst {
  type: 'earnings' | 'news' | 'technical' | 'sector' | 'social';
  description: string;
  impact: number; // 0-100
  timing: 'immediate' | 'days' | 'weeks';
}

export interface SqueezeScore {
  overall: number; // 0-100
  shortPressure: number;
  volumeSignal: number;
  momentumSignal: number;
  catalystScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface HistoricalPattern {
  date: number;
  duration: number; // 天
  maxGain: number; // %
  peakDay: number;
  similar: boolean;
}

export class ShortSqueezeEngine {
  /**
   * 计算空头数据指标
   */
  calcShortMetrics(data: ShortInterestData) {
    const daysToCover = data.avgDailyVolume > 0 ? data.shortShares / data.avgDailyVolume : 999;
    const shortRatio = data.totalShares > 0 ? data.shortShares / data.totalShares : 0;

    return {
      daysToCover: Math.round(daysToCover * 10) / 10,
      shortRatio: Math.round(shortRatio * 10000) / 10000,
      borrowCostLevel: data.borrowRate > 0.5 ? 'high' : data.borrowRate > 0.2 ? 'medium' : 'low',
    };
  }

  /**
   * 估计挤压概率
   */
  estimateSqueezeProbability(
    data: ShortInterestData,
    recentReturns: number[],
    volumeSpike: number,
  ): SqueezeProbability {
    const metrics = this.calcShortMetrics(data);
    const factors: string[] = [];
    let score = 0;

    // 做空比例 > 20% 显著
    if (metrics.shortRatio > 0.2) { score += 25; factors.push('高做空比例'); }
    else if (metrics.shortRatio > 0.1) { score += 10; factors.push('中做空比例'); }

    // 覆盖天数 > 10 天
    if (metrics.daysToCover > 10) { score += 25; factors.push('长覆盖天数'); }
    else if (metrics.daysToCover > 5) { score += 10; factors.push('中覆盖天数'); }

    // 近期价格上涨
    const recentReturn = recentReturns.length >= 5 ? recentReturns.slice(-5).reduce((a, b) => a + b, 0) : 0;
    if (recentReturn > 0.05) { score += 20; factors.push('近期价格上涨'); }
    else if (recentReturn > 0.02) { score += 10; factors.push('价格企稳'); }

    // 成交量放大
    if (volumeSpike > 3) { score += 20; factors.push('成交量爆发'); }
    else if (volumeSpike > 2) { score += 10; factors.push('成交量放大'); }

    // 借贷成本高
    if (data.borrowRate > 0.5) { score += 10; factors.push('高借贷成本'); }

    const probability = Math.min(1, score / 100);
    const confidence = Math.min(1, 0.3 + factors.length * 0.15);

    let timeframe: SqueezeProbability['timeframe'];
    if (score > 70) timeframe = 'imminent';
    else if (score > 50) timeframe = 'short_term';
    else if (score > 30) timeframe = 'medium_term';
    else timeframe = 'unlikely';

    return {
      probability: Math.round(probability * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      timeframe,
      factors,
    };
  }

  /**
   * 识别催化剂
   */
  identifyCatalysts(
    upcomingEvents: Array<{ type: string; date: number; description: string }>,
    technicalSignals: string[],
    socialSentiment: number,
  ): Catalyst[] {
    const catalysts: Catalyst[] = [];

    for (const event of upcomingEvents) {
      catalysts.push({
        type: event.type as Catalyst['type'],
        description: event.description,
        impact: event.type === 'earnings' ? 80 : 50,
        timing: (event.date - Date.now()) < 86400000 * 3 ? 'immediate' : 'days',
      });
    }

    for (const signal of technicalSignals) {
      catalysts.push({
        type: 'technical',
        description: signal,
        impact: 40,
        timing: 'immediate',
      });
    }

    if (socialSentiment > 70) {
      catalysts.push({
        type: 'social',
        description: '社交媒体热度高涨',
        impact: 60,
        timing: 'immediate',
      });
    }

    return catalysts.sort((a, b) => b.impact - a.impact);
  }

  /**
   * 计算挤压潜力评分
   */
  calcSqueezeScore(
    data: ShortInterestData,
    recentReturns: number[],
    volumeSpike: number,
    catalysts: Catalyst[],
  ): SqueezeScore {
    const metrics = this.calcShortMetrics(data);

    // 做空压力(0-100)
    const shortPressure = Math.min(100, metrics.shortRatio * 300 + metrics.daysToCover * 5);

    // 成交量信号
    const volumeSignal = Math.min(100, volumeSpike * 25);

    // 动量信号
    const mom = recentReturns.length >= 10 ? recentReturns.slice(-10).reduce((a, b) => a + b, 0) : 0;
    const momentumSignal = Math.min(100, Math.max(0, 50 + mom * 500));

    // 催化剂评分
    const catalystScore = catalysts.length > 0
      ? Math.min(100, catalysts.reduce((s, c) => s + c.impact, 0) / catalysts.length)
      : 0;

    const overall = shortPressure * 0.35 + volumeSignal * 0.2 + momentumSignal * 0.2 + catalystScore * 0.25;

    let grade: SqueezeScore['grade'];
    if (overall > 80) grade = 'A';
    else if (overall > 60) grade = 'B';
    else if (overall > 40) grade = 'C';
    else if (overall > 20) grade = 'D';
    else grade = 'F';

    return {
      overall: Math.round(overall * 10) / 10,
      shortPressure: Math.round(shortPressure * 10) / 10,
      volumeSignal: Math.round(volumeSignal * 10) / 10,
      momentumSignal: Math.round(momentumSignal * 10) / 10,
      catalystScore: Math.round(catalystScore * 10) / 10,
      grade,
    };
  }

  /**
   * 匹配历史挤压模式
   */
  matchHistoricalPatterns(
    currentMetrics: ShortInterestData,
    historicalSqueezes: Array<{
      date: number;
      preShortRatio: number;
      preDaysToCover: number;
      duration: number;
      maxGain: number;
      peakDay: number;
    }>,
  ): HistoricalPattern[] {
    return historicalSqueezes.map(h => {
      const ratioSimilarity = 1 - Math.abs(currentMetrics.shortShares / currentMetrics.totalShares - h.preShortRatio);
      const dtcSimilarity = 1 - Math.abs(
        (currentMetrics.avgDailyVolume > 0 ? currentMetrics.shortShares / currentMetrics.avgDailyVolume : 0) - h.preDaysToCover
      ) / 10;
      const similarity = (ratioSimilarity + dtcSimilarity) / 2;

      return {
        date: h.date,
        duration: h.duration,
        maxGain: h.maxGain,
        peakDay: h.peakDay,
        similar: similarity > 0.7,
      };
    });
  }
}

export default new ShortSqueezeEngine();
