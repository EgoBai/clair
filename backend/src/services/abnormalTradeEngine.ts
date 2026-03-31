/**
 * 大单/异常交易检测引擎
 * - 大单成交检测
 * - 尾盘异动检测
 * - 集合竞价异动
 * - 异常成交量检测
 * - 内盘外盘分析
 * - 主力行为推断
 */

export interface TradeRecord {
  timestamp: number;
  price: number;
  volume: number;
  amount: number;
  direction: 'buy' | 'sell' | 'neutral';
  isBlockTrade: boolean;
}

export interface TickData {
  timestamp: number;
  price: number;
  volume: number;
  bid: number;
  ask: number;
  bidVolume: number;
  askVolume: number;
}

export interface BlockTrade {
  timestamp: number;
  price: number;
  volume: number;
  amount: number;
  direction: 'buy' | 'sell';
  premium: number; // 溢价率
  buyerCode?: string;
  sellerCode?: string;
}

export interface VolumeAnomaly {
  timestamp: number;
  type: 'surge' | 'spike' | 'drying_up' | 'auction_anomaly';
  actualVolume: number;
  expectedVolume: number;
  zScore: number;
  significance: 'low' | 'medium' | 'high';
}

export interface ClosingAnomaly {
  date: string;
  type: 'painting' | 'window_dressing' | 'auction_manipulation' | 'normal';
  lastMinuteVolume: number;
  lastMinutePriceChange: number;
  auctionVolume: number;
  auctionPrice: number;
  closePrice: number;
  suspicionScore: number; // 0-100
}

export interface InOutFlow {
  innerVolume: number;   // 内盘(主动性卖出)
  outerVolume: number;   // 外盘(主动性买入)
  netInflow: number;
  buySellRatio: number;
  dominance: 'buyers' | 'sellers' | 'balanced';
}

export interface MainForceActivity {
  estimatedInflow: number;
  estimatedOutflow: number;
  netFlow: number;
  accumulationScore: number; // 0-100
  distributionScore: number; // 0-100
  phase: 'accumulating' | 'distributing' | 'absorbing' | 'neutral';
  confidence: number;
}

export interface AbnormalTradeReport {
  blockTrades: BlockTrade[];
  volumeAnomalies: VolumeAnomaly[];
  closingAnomalies: ClosingAnomaly[];
  inOutFlow: InOutFlow;
  mainForce: MainForceActivity;
  alertLevel: 'normal' | 'watch' | 'warning' | 'alert';
}

export class AbnormalTradeEngine {
  private blockTradeThreshold: number;
  private volumeSurgeThreshold: number;

  constructor(blockTradeThreshold: number = 500000, volumeSurgeThreshold: number = 2.0) {
    this.blockTradeThreshold = blockTradeThreshold;
    this.volumeSurgeThreshold = volumeSurgeThreshold;
  }

  /**
   * 检测大单交易
   */
  detectBlockTrades(trades: TradeRecord[]): BlockTrade[] {
    return trades
      .filter(t => t.volume >= this.blockTradeThreshold || t.isBlockTrade)
      .map(t => ({
        timestamp: t.timestamp,
        price: t.price,
        volume: t.volume,
        amount: t.amount,
        direction: t.direction === 'neutral' ? 'buy' : t.direction,
        premium: 0 // Would need VWAP for calculation
      }));
  }

  /**
   * 检测成交量异常
   */
  detectVolumeAnomalies(trades: TradeRecord[], lookback: number = 20): VolumeAnomaly[] {
    if (trades.length < lookback) return [];

    const anomalies: VolumeAnomaly[] = [];

    // Aggregate by time windows (e.g., 5-min)
    const windowSize = 5 * 60 * 1000; // 5 minutes
    const windows: Map<number, number[]> = new Map();

    for (const trade of trades) {
      const windowKey = Math.floor(trade.timestamp / windowSize) * windowSize;
      if (!windows.has(windowKey)) windows.set(windowKey, []);
      windows.get(windowKey)!.push(trade.volume);
    }

    const windowVolumes = Array.from(windows.entries())
      .map(([ts, vols]) => ({ timestamp: ts, volume: vols.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (windowVolumes.length < lookback) return [];

    for (let i = lookback; i < windowVolumes.length; i++) {
      const history = windowVolumes.slice(i - lookback, i);
      const mean = history.reduce((sum, w) => sum + w.volume, 0) / lookback;
      const variance = history.reduce((sum, w) => sum + (w.volume - mean) ** 2, 0) / lookback;
      const std = Math.sqrt(variance);

      if (std === 0 || mean === 0) continue;

      const current = windowVolumes[i];
      const zScore = (current.volume - mean) / std;

      if (zScore > this.volumeSurgeThreshold) {
        let type: 'surge' | 'spike';
        if (zScore > 4) type = 'spike';
        else type = 'surge';

        let significance: 'low' | 'medium' | 'high';
        if (zScore > 4) significance = 'high';
        else if (zScore > 3) significance = 'medium';
        else significance = 'low';

        anomalies.push({
          timestamp: current.timestamp,
          type,
          actualVolume: current.volume,
          expectedVolume: mean,
          zScore,
          significance
        });
      }
    }

    return anomalies;
  }

  /**
   * 检测尾盘异动
   */
  detectClosingAnomalies(tickData: TickData[], date: string): ClosingAnomaly {
    // Last 15 minutes of trading (14:45 - 15:00)
    const closingTicks = tickData.filter(t => {
      const hour = new Date(t.timestamp).getHours();
      const minute = new Date(t.timestamp).getMinutes();
      return (hour === 14 && minute >= 45) || hour === 15;
    });

    const lastMinuteTicks = tickData.filter(t => {
      const d = new Date(t.timestamp);
      return d.getHours() === 14 && d.getMinutes() >= 59;
    });

    const lastMinuteVolume = lastMinuteTicks.reduce((sum, t) => sum + t.volume, 0);
    const firstPrice = closingTicks.length > 0 ? closingTicks[0].price : 0;
    const lastPrice = closingTicks.length > 0 ? closingTicks[closingTicks.length - 1].price : 0;
    const lastMinutePriceChange = firstPrice !== 0 ? (lastPrice - firstPrice) / firstPrice : 0;

    const totalVolume = tickData.reduce((sum, t) => sum + t.volume, 0);
    const closingVolumeRatio = totalVolume > 0 ? lastMinuteVolume / totalVolume : 0;

    // Suspicion scoring
    let suspicionScore = 0;

    // Large last-minute volume
    if (closingVolumeRatio > 0.1) suspicionScore += 30;
    else if (closingVolumeRatio > 0.05) suspicionScore += 15;

    // Unusual price movement in last minute
    if (Math.abs(lastMinutePriceChange) > 0.01) suspicionScore += 25;
    else if (Math.abs(lastMinutePriceChange) > 0.005) suspicionScore += 10;

    // Volume spike in closing
    const avgWindowVolume = totalVolume / Math.max(1, tickData.length / 10);
    if (lastMinuteVolume > avgWindowVolume * 3) suspicionScore += 20;

    let type: 'painting' | 'window_dressing' | 'auction_manipulation' | 'normal' = 'normal';
    if (suspicionScore >= 50) {
      if (closingVolumeRatio > 0.15) type = 'painting';
      else type = 'window_dressing';
    }

    return {
      date,
      type,
      lastMinuteVolume,
      lastMinutePriceChange,
      auctionVolume: 0,
      auctionPrice: 0,
      closePrice: lastPrice,
      suspicionScore: Math.min(100, suspicionScore)
    };
  }

  /**
   * 内盘外盘分析
   */
  analyzeInOutFlow(trades: TradeRecord[]): InOutFlow {
    let innerVolume = 0;  // 卖出(以买价成交)
    let outerVolume = 0;  // 买入(以卖价成交)

    for (const trade of trades) {
      if (trade.direction === 'sell') {
        innerVolume += trade.volume;
      } else if (trade.direction === 'buy') {
        outerVolume += trade.volume;
      }
    }

    const totalVolume = innerVolume + outerVolume;
    const netInflow = outerVolume - innerVolume;
    const buySellRatio = innerVolume > 0 ? outerVolume / innerVolume : outerVolume > 0 ? Infinity : 1;

    let dominance: 'buyers' | 'sellers' | 'balanced';
    if (buySellRatio > 1.2) dominance = 'buyers';
    else if (buySellRatio < 0.8) dominance = 'sellers';
    else dominance = 'balanced';

    return { innerVolume, outerVolume, netInflow, buySellRatio, dominance };
  }

  /**
   * 主力行为推断
   */
  inferMainForce(trades: TradeRecord[], avgDailyVolume: number): MainForceActivity {
    const largeOrders = trades.filter(t => t.volume >= avgDailyVolume * 0.01); // >1% daily volume

    let estimatedInflow = 0;
    let estimatedOutflow = 0;

    for (const order of largeOrders) {
      if (order.direction === 'buy') {
        estimatedInflow += order.amount;
      } else if (order.direction === 'sell') {
        estimatedOutflow += order.amount;
      }
    }

    const netFlow = estimatedInflow - estimatedOutflow;
    const totalFlow = estimatedInflow + estimatedOutflow;

    const accumulationScore = totalFlow > 0 ? Math.min(100, (estimatedInflow / totalFlow) * 100) : 50;
    const distributionScore = totalFlow > 0 ? Math.min(100, (estimatedOutflow / totalFlow) * 100) : 50;

    let phase: 'accumulating' | 'distributing' | 'absorbing' | 'neutral';
    if (accumulationScore > 70) phase = 'accumulating';
    else if (distributionScore > 70) phase = 'distributing';
    else if (Math.abs(accumulationScore - distributionScore) < 10) phase = 'absorbing';
    else phase = 'neutral';

    const confidence = Math.min(1, largeOrders.length / 20);

    return {
      estimatedInflow,
      estimatedOutflow,
      netFlow,
      accumulationScore,
      distributionScore,
      phase,
      confidence
    };
  }

  /**
   * 生成异常交易报告
   */
  generateReport(trades: TradeRecord[], tickData: TickData[], date: string, avgDailyVolume: number = 1e7): AbnormalTradeReport {
    const blockTrades = this.detectBlockTrades(trades);
    const volumeAnomalies = this.detectVolumeAnomalies(trades);
    const closingAnomaly = this.detectClosingAnomalies(tickData, date);
    const inOutFlow = this.analyzeInOutFlow(trades);
    const mainForce = this.inferMainForce(trades, avgDailyVolume);

    let alertLevel: 'normal' | 'watch' | 'warning' | 'alert' = 'normal';

    if (blockTrades.length > 10 || volumeAnomalies.filter(v => v.significance === 'high').length > 3) {
      alertLevel = 'alert';
    } else if (blockTrades.length > 5 || volumeAnomalies.length > 5 || closingAnomaly.suspicionScore > 50) {
      alertLevel = 'warning';
    } else if (blockTrades.length > 2 || volumeAnomalies.length > 2) {
      alertLevel = 'watch';
    }

    return {
      blockTrades,
      volumeAnomalies,
      closingAnomalies: [closingAnomaly],
      inOutFlow,
      mainForce,
      alertLevel
    };
  }
}

export default new AbnormalTradeEngine();
