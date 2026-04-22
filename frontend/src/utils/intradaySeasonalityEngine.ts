/**
 * 日内季节性引擎
 * - 开盘/午盘/尾盘模式
 * - 时间段收益率分析
 * - 日内波动率曲线
 * - 成交量时间分布
 * - 最佳入场/出场时段
 * - 季节性强度评分
 */

export interface TimeSlotReturn {
  slot: string; // '09:30-10:00' etc.
  avgReturn: number;
  winRate: number;
  volatility: number;
  avgVolume: number;
  sharpe: number;
}

export interface IntradayPattern {
  openingPattern: 'gap_up' | 'gap_down' | 'flat' | 'volatile';
  middayPattern: 'quiet' | 'trending' | 'reversal';
  closingPattern: 'rally' | 'sell_off' | 'flat' | 'surge';
  intradayHighTime: string;
  intradayLowTime: string;
}

export interface VolumeProfile {
  slot: string;
  relativeVolume: number; // 相对全天均量
  dominance: 'high' | 'normal' | 'low';
}

export interface OptimalTiming {
  bestEntrySlot: string;
  bestExitSlot: string;
  avoidSlots: string[];
  reasoning: string;
}

export interface SeasonalityStrength {
  overallScore: number; // 0-100
  consistency: number; // 模式一致性
  predictability: number; // 可预测性
  profitability: number; // 盈利能力
}

export class IntradaySeasonalityEngine {
  private timeSlots: string[];

  constructor() {
    // A股交易时段(30分钟为单位)
    this.timeSlots = [
      '09:30-10:00', '10:00-10:30', '10:30-11:00', '11:00-11:30',
      '13:00-13:30', '13:30-14:00', '14:00-14:30', '14:30-15:00',
    ];
  }

  /**
   * 分析各时段收益率
   */
  analyzeSlotReturns(
    slotReturns: Record<string, number[]>,
  ): TimeSlotReturn[] {
    return this.timeSlots.map(slot => {
      const returns = slotReturns[slot] || [];
      if (returns.length === 0) {
        return { slot, avgReturn: 0, winRate: 0, volatility: 0, avgVolume: 0, sharpe: 0 };
      }

      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const winRate = returns.filter(r => r > 0).length / returns.length;
      const std = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length);
      const sharpe = std > 0 ? (avgReturn / std) * Math.sqrt(252) : 0;

      return {
        slot,
        avgReturn: Math.round(avgReturn * 10000) / 10000,
        winRate: Math.round(winRate * 100) / 100,
        volatility: Math.round(std * 10000) / 10000,
        avgVolume: 0,
        sharpe: Math.round(sharpe * 100) / 100,
      };
    });
  }

  /**
   * 检测日内模式
   */
  detectIntradayPattern(
    openPrices: number[],
    closePrices: number[],
    highPrices: number[],
    lowPrices: number[],
    intradayPrices: number[][],
  ): IntradayPattern {
    if (openPrices.length < 5) {
      return { openingPattern: 'flat', middayPattern: 'quiet', closingPattern: 'flat', intradayHighTime: '10:00', intradayLowTime: '14:00' };
    }

    // 开盘模式: 开盘价相对前收盘的变动
    const gaps = openPrices.slice(1).map((o, i) => (o - closePrices[i]) / closePrices[i]);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const gapVol = Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length);

    let openingPattern: IntradayPattern['openingPattern'];
    if (gapVol > 0.01) openingPattern = 'volatile';
    else if (avgGap > 0.002) openingPattern = 'gap_up';
    else if (avgGap < -0.002) openingPattern = 'gap_down';
    else openingPattern = 'flat';

    // 午盘模式
    const midReturns = closePrices.map((c, i) => {
      const midPrice = (highPrices[i] + lowPrices[i]) / 2;
      return (c - midPrice) / midPrice;
    });
    const midVol = Math.sqrt(midReturns.reduce((s, r) => s + r * r, 0) / midReturns.length);

    let middayPattern: IntradayPattern['middayPattern'];
    if (Math.abs(midReturns.reduce((a, b) => a + b, 0) / midReturns.length) > 0.005) {
      middayPattern = 'trending';
    } else if (midVol > 0.008) {
      middayPattern = 'reversal';
    } else {
      middayPattern = 'quiet';
    }

    // 尾盘模式
    const closingMoves = closePrices.map((c, i) => {
      const lastThird = (highPrices[i] + lowPrices[i]) / 2;
      return (c - lastThird) / lastThird;
    });
    const avgClosing = closingMoves.reduce((a, b) => a + b, 0) / closingMoves.length;

    let closingPattern: IntradayPattern['closingPattern'];
    if (avgClosing > 0.003) closingPattern = 'rally';
    else if (avgClosing < -0.003) closingPattern = 'sell_off';
    else if (closingMoves.some(v => Math.abs(v) > 0.01)) closingPattern = 'surge';
    else closingPattern = 'flat';

    return {
      openingPattern,
      middayPattern,
      closingPattern,
      intradayHighTime: this.timeSlots[1],
      intradayLowTime: this.timeSlots[6],
    };
  }

  /**
   * 成交量时间分布
   */
  calcVolumeProfile(
    slotVolumes: Record<string, number[]>,
  ): VolumeProfile[] {
    const avgVolumes: Record<string, number> = {};
    let totalAvg = 0;

    for (const slot of this.timeSlots) {
      const vols = slotVolumes[slot] || [];
      avgVolumes[slot] = vols.length > 0 ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
      totalAvg += avgVolumes[slot];
    }

    const grandAvg = totalAvg / this.timeSlots.length;

    return this.timeSlots.map(slot => {
      const relativeVolume = grandAvg > 0 ? avgVolumes[slot] / grandAvg : 1;
      let dominance: VolumeProfile['dominance'];
      if (relativeVolume > 1.3) dominance = 'high';
      else if (relativeVolume < 0.7) dominance = 'low';
      else dominance = 'normal';

      return {
        slot,
        relativeVolume: Math.round(relativeVolume * 100) / 100,
        dominance,
      };
    });
  }

  /**
   * 最佳入场出场时段
   */
  findOptimalTiming(slotReturns: TimeSlotReturn[]): OptimalTiming {
    if (slotReturns.length === 0) {
      return { bestEntrySlot: '09:30-10:00', bestExitSlot: '14:30-15:00', avoidSlots: [], reasoning: '无数据' };
    }

    const sorted = [...slotReturns].sort((a, b) => b.sharpe - a.sharpe);
    const worst = [...slotReturns].sort((a, b) => a.sharpe - b.sharpe);

    const bestEntrySlot = sorted[0].slot;
    const bestExitSlot = sorted[sorted.length - 1].slot;
    const avoidSlots = worst.filter(s => s.sharpe < -0.5).map(s => s.slot);

    return {
      bestEntrySlot,
      bestExitSlot,
      avoidSlots,
      reasoning: `最佳入场${bestEntrySlot}(Sharpe=${sorted[0].sharpe}), 避开${avoidSlots.join(', ')}`,
    };
  }

  /**
   * 季节性强度评分
   */
  calcSeasonalityStrength(slotReturns: TimeSlotReturn[]): SeasonalityStrength {
    if (slotReturns.length === 0) {
      return { overallScore: 0, consistency: 0, predictability: 0, profitability: 0 };
    }

    // 一致性: 各时段Sharpe的标准差(越小越一致)
    const sharpes = slotReturns.map(s => s.sharpe);
    const meanSharpe = sharpes.reduce((a, b) => a + b, 0) / sharpes.length;
    const stdSharpe = Math.sqrt(sharpes.reduce((s, sh) => s + (sh - meanSharpe) ** 2, 0) / sharpes.length);
    const consistency = Math.max(0, 100 - stdSharpe * 50);

    // 可预测性: 胜率偏离0.5的程度
    const winRates = slotReturns.map(s => s.winRate);
    const avgWinRate = winRates.reduce((a, b) => a + b, 0) / winRates.length;
    const predictability = Math.abs(avgWinRate - 0.5) * 200;

    // 盈利能力: 平均Sharpe
    const profitability = Math.min(100, Math.max(0, meanSharpe * 20 + 50));

    const overallScore = consistency * 0.3 + predictability * 0.3 + profitability * 0.4;

    return {
      overallScore: Math.round(overallScore * 10) / 10,
      consistency: Math.round(consistency * 10) / 10,
      predictability: Math.round(predictability * 10) / 10,
      profitability: Math.round(profitability * 10) / 10,
    };
  }

  getTimeSlots(): string[] {
    return [...this.timeSlots];
  }
}

export default new IntradaySeasonalityEngine();
