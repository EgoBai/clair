/**
 * 多时间框架分析引擎
 * 跨时间周期的趋势一致性、信号共振、动量分析
 */

// ==================== 类型定义 ====================
export type TimeFrame = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

export interface TimeFrameData {
  timeframe: TimeFrame;
  bars: { open: number; high: number; low: number; close: number; volume: number; timestamp: number }[];
}

export interface TimeFrameTrend {
  timeframe: TimeFrame;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1
  ma20: number;
  ma50: number;
  maTrend: 'up' | 'down' | 'flat';
  priceVsMA: number; // 价格相对MA20偏离(%)
  volumeConfirmation: boolean;
  momentum: number; // ROC
  rsi: number;
}

export interface MultiTimeFrameAlignment {
  overallTrend: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  alignmentScore: number; // 0-100
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  dominantTimeFrame: TimeFrame;
  timeFrameTrends: TimeFrameTrend[];
  confluenceSignals: ConfluenceSignal[];
}

export interface ConfluenceSignal {
  type: 'trend_alignment' | 'momentum_surge' | 'reversal' | 'breakout' | 'divergence';
  strength: number;
  timeFrames: TimeFrame[];
  description: string;
}

export interface TimeFrameMomentum {
  timeframe: TimeFrame;
  roc: number; // Rate of Change
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  macdHistogram: number;
  volumeMomentum: number;
  acceleration: number; // 动量加速度
}

export interface HigherTimeframeContext {
  bias: 'long' | 'short' | 'neutral';
  keyLevels: { price: number; type: 'support' | 'resistance'; strength: number }[];
  trendAge: number; // 趋势持续的bar数
  pullbackDepth: number; // 回撤深度(%)
  isPullback: boolean;
}

// ==================== 核心引擎 ====================
export class MultiTimeFrameEngine {
  /**
   * 计算单时间框架趋势
   */
  calculateTrend(data: TimeFrameData): TimeFrameTrend {
    const { timeframe, bars } = data;

    if (bars.length < 20) {
      return {
        timeframe, direction: 'neutral', strength: 0,
        ma20: 0, ma50: 0, maTrend: 'flat', priceVsMA: 0,
        volumeConfirmation: false, momentum: 0, rsi: 50
      };
    }

    const closes = bars.map(b => b.close);
    const currentPrice = closes[closes.length - 1];

    const ma20 = this.calcMA(closes, 20);
    const ma50 = bars.length >= 50 ? this.calcMA(closes, 50) : ma20;

    // MA趋势
    const ma20_5barsAgo = bars.length >= 25 ? this.calcMA(closes.slice(0, -5), 20) : ma20;
    const maSlope = ma20 > 0 ? (ma20 - ma20_5barsAgo) / ma20 : 0;
    const maTrend: TimeFrameTrend['maTrend'] = maSlope > 0.002 ? 'up' : maSlope < -0.002 ? 'down' : 'flat';

    // 价格偏离
    const priceVsMA = ma20 > 0 ? ((currentPrice - ma20) / ma20) * 100 : 0;

    // RSI
    const rsi = this.calcRSI(closes, 14);

    // ROC动量
    const lookback = Math.min(10, closes.length - 1);
    const momentum = lookback > 0 ? ((currentPrice - closes[closes.length - 1 - lookback]) / closes[closes.length - 1 - lookback]) * 100 : 0;

    // 方向判断
    let direction: TimeFrameTrend['direction'];
    const bullishSignals = (currentPrice > ma20 ? 1 : 0) + (currentPrice > ma50 ? 1 : 0) + (maTrend === 'up' ? 1 : 0) + (rsi > 50 ? 1 : 0) + (momentum > 0 ? 1 : 0);
    const bearishSignals = (currentPrice < ma20 ? 1 : 0) + (currentPrice < ma50 ? 1 : 0) + (maTrend === 'down' ? 1 : 0) + (rsi < 50 ? 1 : 0) + (momentum < 0 ? 1 : 0);

    if (bullishSignals >= 4) direction = 'bullish';
    else if (bearishSignals >= 4) direction = 'bearish';
    else direction = 'neutral';

    // 强度
    const strength = Math.abs(bullishSignals - bearishSignals) / 5;

    // 成交量确认
    const recentVolumes = bars.slice(-5).map(b => b.volume);
    const avgVolume = bars.slice(-20, -5).reduce((s, b) => s + b.volume, 0) / Math.min(15, bars.length - 5);
    const currentVolAvg = recentVolumes.reduce((s, v) => s + v, 0) / recentVolumes.length;
    const volumeConfirmation = avgVolume > 0 ? currentVolAvg > avgVolume * 1.2 : false;

    return {
      timeframe,
      direction,
      strength: Math.round(strength * 100) / 100,
      ma20: Math.round(ma20 * 100) / 100,
      ma50: Math.round(ma50 * 100) / 100,
      maTrend,
      priceVsMA: Math.round(priceVsMA * 100) / 100,
      volumeConfirmation,
      momentum: Math.round(momentum * 100) / 100,
      rsi: Math.round(rsi * 100) / 100
    };
  }

  /**
   * 多时间框架对齐分析
   */
  analyzeAlignment(dataSet: TimeFrameData[]): MultiTimeFrameAlignment {
    const timeFrameTrends = dataSet.map(d => this.calculateTrend(d));

    const bullishCount = timeFrameTrends.filter(t => t.direction === 'bullish').length;
    const bearishCount = timeFrameTrends.filter(t => t.direction === 'bearish').length;
    const neutralCount = timeFrameTrends.filter(t => t.direction === 'neutral').length;
    const total = timeFrameTrends.length;

    const alignmentScore = total > 0
      ? Math.round(((Math.max(bullishCount, bearishCount, neutralCount) / total) * 100))
      : 0;

    let overallTrend: MultiTimeFrameAlignment['overallTrend'];
    if (bullishCount > bearishCount * 2 && alignmentScore > 70) overallTrend = 'strong_bullish';
    else if (bullishCount > bearishCount) overallTrend = 'bullish';
    else if (bearishCount > bullishCount * 2 && alignmentScore > 70) overallTrend = 'strong_bearish';
    else if (bearishCount > bullishCount) overallTrend = 'bearish';
    else overallTrend = 'neutral';

    // 主导时间框架
    const trendOrder: TimeFrame[] = ['1w', '1d', '4h', '1h', '30m', '15m', '5m', '1m', '1M'];
    const dominantTimeFrame = timeFrameTrends.find(t => t.direction !== 'neutral')?.timeframe || timeFrameTrends[0]?.timeframe || '1d';

    // 共振信号
    const confluenceSignals = this.detectConfluenceSignals(timeFrameTrends);

    return {
      overallTrend,
      alignmentScore,
      bullishCount,
      bearishCount,
      neutralCount,
      dominantTimeFrame,
      timeFrameTrends,
      confluenceSignals
    };
  }

  /**
   * 多时间框架动量分析
   */
  analyzeMomentum(dataSet: TimeFrameData[]): TimeFrameMomentum[] {
    return dataSet.map(data => {
      const { timeframe, bars } = data;
      const closes = bars.map(b => b.close);
      const currentPrice = closes[closes.length - 1];

      // ROC
      const lookback = Math.min(10, closes.length - 1);
      const roc = lookback > 0 ? ((currentPrice - closes[closes.length - 1 - lookback]) / closes[closes.length - 1 - lookback]) * 100 : 0;

      // MACD简化
      const ema12 = this.calcEMA(closes, 12);
      const ema26 = this.calcEMA(closes, 26);
      const macdLine = ema12 - ema26;
      const signalLine = this.calcEMA(closes.slice(-9).map((_, i) => {
        const slice = closes.slice(0, closes.length - 9 + i + 1);
        return this.calcEMA(slice, 12) - this.calcEMA(slice, 26);
      }), 9);
      const macdHistogram = macdLine - signalLine;

      let macdSignal: TimeFrameMomentum['macdSignal'];
      if (macdHistogram > 0) macdSignal = 'bullish';
      else if (macdHistogram < 0) macdSignal = 'bearish';
      else macdSignal = 'neutral';

      // 成交量动量
      const recentVol = bars.slice(-3).reduce((s, b) => s + b.volume, 0) / 3;
      const avgVol = bars.slice(-20).reduce((s, b) => s + b.volume, 0) / Math.min(20, bars.length);
      const volumeMomentum = avgVol > 0 ? (recentVol - avgVol) / avgVol : 0;

      // 动量加速度
      const rocs = [];
      for (let i = 5; i <= 10; i++) {
        if (closes.length > i) {
          rocs.push(((currentPrice - closes[closes.length - 1 - i]) / closes[closes.length - 1 - i]) * 100);
        }
      }
      const acceleration = rocs.length >= 2 ? rocs[rocs.length - 1] - rocs[rocs.length - 2] : 0;

      return {
        timeframe,
        roc: Math.round(roc * 100) / 100,
        macdSignal,
        macdHistogram: Math.round(macdHistogram * 1000) / 1000,
        volumeMomentum: Math.round(volumeMomentum * 100) / 100,
        acceleration: Math.round(acceleration * 100) / 100
      };
    });
  }

  /**
   * 高时间框架环境判断
   */
  analyzeHigherTimeframe(data: TimeFrameData): HigherTimeframeContext {
    const { bars } = data;
    const closes = bars.map(b => b.close);
    const highs = bars.map(b => b.high);
    const lows = bars.map(b => b.low);

    if (bars.length < 20) {
      return { bias: 'neutral', keyLevels: [], trendAge: 0, pullbackDepth: 0, isPullback: false };
    }

    const currentPrice = closes[closes.length - 1];
    const ma50 = this.calcMA(closes, Math.min(50, closes.length));

    // 偏向
    const bias: HigherTimeframeContext['bias'] = currentPrice > ma50 ? 'long' : currentPrice < ma50 ? 'short' : 'neutral';

    // 关键支撑阻力位
    const keyLevels: HigherTimeframeContext['keyLevels'] = [];
    const recentHighs = highs.slice(-20);
    const recentLows = lows.slice(-20);

    const maxHigh = Math.max(...recentHighs);
    const minLow = Math.min(...recentLows);

    if (maxHigh > currentPrice) {
      keyLevels.push({ price: maxHigh, type: 'resistance', strength: 0.8 });
    }
    if (minLow < currentPrice) {
      keyLevels.push({ price: minLow, type: 'support', strength: 0.8 });
    }

    // 趋势年龄
    let trendAge = 0;
    const direction = currentPrice > ma50 ? 1 : -1;
    for (let i = closes.length - 1; i >= 0; i--) {
      const barMa = this.calcMA(closes.slice(0, i + 1), Math.min(50, i + 1));
      if ((direction > 0 && closes[i] > barMa) || (direction < 0 && closes[i] < barMa)) {
        trendAge++;
      } else {
        break;
      }
    }

    // 回撤分析
    const peak = Math.max(...closes.slice(-trendAge || 0));
    const trough = Math.min(...closes.slice(-trendAge || 0));
    const pullbackDepth = direction > 0
      ? ((peak - currentPrice) / peak) * 100
      : ((currentPrice - trough) / trough) * 100;
    const isPullback = pullbackDepth > 2 && pullbackDepth < 10;

    return {
      bias,
      keyLevels,
      trendAge,
      pullbackDepth: Math.round(pullbackDepth * 100) / 100,
      isPullback
    };
  }

  // ==================== 辅助方法 ====================
  private calcMA(values: number[], period: number): number {
    if (values.length < period) return values.length > 0 ? values[values.length - 1] : 0;
    const slice = values.slice(-period);
    return slice.reduce((s, v) => s + v, 0) / period;
  }

  private calcEMA(values: number[], period: number): number {
    if (values.length === 0) return 0;
    if (values.length < period) return values[values.length - 1];
    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private calcRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;
    let gainSum = 0;
    let lossSum = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gainSum += change;
      else lossSum += Math.abs(change);
    }

    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private detectConfluenceSignals(trends: TimeFrameTrend[]): ConfluenceSignal[] {
    const signals: ConfluenceSignal[] = [];

    // 趋势共振
    const allBullish = trends.every(t => t.direction === 'bullish');
    const allBearish = trends.every(t => t.direction === 'bearish');
    if (allBullish) {
      signals.push({
        type: 'trend_alignment',
        strength: 0.9,
        timeFrames: trends.map(t => t.timeframe),
        description: '所有时间框架看涨共振'
      });
    }
    if (allBearish) {
      signals.push({
        type: 'trend_alignment',
        strength: 0.9,
        timeFrames: trends.map(t => t.timeframe),
        description: '所有时间框架看跌共振'
      });
    }

    // 动量爆发
    const strongMomentum = trends.filter(t => Math.abs(t.momentum) > 3);
    if (strongMomentum.length >= trends.length * 0.6) {
      signals.push({
        type: 'momentum_surge',
        strength: 0.7,
        timeFrames: strongMomentum.map(t => t.timeframe),
        description: '多时间框架动量爆发'
      });
    }

    // 背离检测
    const shortTf = trends.find(t => ['1m', '5m', '15m'].includes(t.timeframe));
    const longTf = trends.find(t => ['1d', '1w'].includes(t.timeframe));
    if (shortTf && longTf) {
      if ((shortTf.direction === 'bullish' && longTf.direction === 'bearish') ||
          (shortTf.direction === 'bearish' && longTf.direction === 'bullish')) {
        signals.push({
          type: 'divergence',
          strength: 0.5,
          timeFrames: [shortTf.timeframe, longTf.timeframe],
          description: `短期${shortTf.direction === 'bullish' ? '看涨' : '看跌'} vs 长期${longTf.direction === 'bullish' ? '看涨' : '看跌'}背离`
        });
      }
    }

    // 突破信号
    const breakouts = trends.filter(t => Math.abs(t.priceVsMA) > 5);
    if (breakouts.length > 0) {
      signals.push({
        type: 'breakout',
        strength: 0.6,
        timeFrames: breakouts.map(t => t.timeframe),
        description: '价格大幅偏离均线，可能突破'
      });
    }

    return signals;
  }
}

export default MultiTimeFrameEngine;
