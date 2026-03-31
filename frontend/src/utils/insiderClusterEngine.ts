/**
 * 内部人集群分析引擎
 * - 内部人交易集群检测
 * - 交易时序模式识别
 * - 内部人协同信号
 * - 高管/CFO/董事区分
 * - 集群强度评分
 * - 信号可靠性
 */

export interface InsiderTrade {
  insider: string;
  role: 'ceo' | 'cfo' | 'director' | 'officer' | 'other';
  date: number;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  amount: number;
}

export interface ClusterDetection {
  detected: boolean;
  clusterSize: number;
  timeWindow: number; // 天
  direction: 'buy' | 'sell' | 'mixed';
  avgTradeSize: number;
  significance: number; // 0-100
}

export interface TimingPattern {
  pattern: 'pre_announcement' | 'post_announcement' | 'quarter_end' | 'normal';
  confidence: number;
  daysBeforeEvent: number;
  abnormalReturn: number;
}

export interface RoleAnalysis {
  role: string;
  buyCount: number;
  sellCount: number;
  netShares: number;
  signalStrength: number; // -100到100
  weight: number; // 角色权重
}

export interface ClusterSignal {
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  score: number; // 0-100
  reliability: number; // 0-1
  clusterDetected: boolean;
  timingSuspicion: number; // 0-100
  recommendation: string;
}

export class InsiderClusterEngine {
  private clusterWindow: number; // 集群检测窗口(天)
  private minClusterSize: number;

  constructor(clusterWindow = 30, minClusterSize = 3) {
    this.clusterWindow = clusterWindow;
    this.minClusterSize = minClusterSize;
  }

  /**
   * 检测交易集群
   */
  detectCluster(trades: InsiderTrade[]): ClusterDetection {
    if (trades.length < this.minClusterSize) {
      return { detected: false, clusterSize: 0, timeWindow: 0, direction: 'mixed', avgTradeSize: 0, significance: 0 };
    }

    const sorted = [...trades].sort((a, b) => a.date - b.date);

    // 滑动窗口检测
    let bestCluster: InsiderTrade[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const windowEnd = sorted[i].date + this.clusterWindow * 86400000;
      const cluster = sorted.filter(t => t.date >= sorted[i].date && t.date <= windowEnd);
      if (cluster.length > bestCluster.length) {
        bestCluster = cluster;
      }
    }

    if (bestCluster.length < this.minClusterSize) {
      return { detected: false, clusterSize: bestCluster.length, timeWindow: this.clusterWindow, direction: 'mixed', avgTradeSize: 0, significance: 0 };
    }

    const buyCount = bestCluster.filter(t => t.type === 'buy').length;
    const sellCount = bestCluster.filter(t => t.type === 'sell').length;
    const direction = buyCount > sellCount * 2 ? 'buy' : sellCount > buyCount * 2 ? 'sell' : 'mixed';

    const avgTradeSize = bestCluster.reduce((s, t) => s + t.amount, 0) / bestCluster.length;
    const timeSpan = (bestCluster[bestCluster.length - 1].date - bestCluster[0].date) / 86400000;

    // 显著性: 集群越大、时间越集中越显著
    const significance = Math.min(100, bestCluster.length * 15 + (1 - timeSpan / this.clusterWindow) * 30);

    return {
      detected: true,
      clusterSize: bestCluster.length,
      timeWindow: Math.round(timeSpan * 10) / 10,
      direction,
      avgTradeSize: Math.round(avgTradeSize),
      significance: Math.round(significance * 10) / 10,
    };
  }

  /**
   * 识别时序模式
   */
  detectTimingPattern(
    trades: InsiderTrade[],
    announcementDates: number[],
  ): TimingPattern {
    if (trades.length === 0 || announcementDates.length === 0) {
      return { pattern: 'normal', confidence: 0, daysBeforeEvent: 0, abnormalReturn: 0 };
    }

    // 计算交易与最近公告的天数差
    const proximityScores = trades.map(t => {
      const nearestEvent = announcementDates.reduce((best, d) => {
        const diff = Math.abs(t.date - d);
        return diff < best.diff ? { diff, date: d } : best;
      }, { diff: Infinity, date: 0 });

      const daysBefore = (nearestEvent.date - t.date) / 86400000;
      return { trade: t, daysBefore, eventDate: nearestEvent.date };
    });

    const avgDaysBefore = proximityScores.reduce((s, p) => s + p.daysBefore, 0) / proximityScores.length;

    let pattern: TimingPattern['pattern'];
    let confidence: number;

    if (avgDaysBefore > 0 && avgDaysBefore < 30) {
      pattern = 'pre_announcement';
      confidence = Math.min(1, 0.3 + (30 - avgDaysBefore) / 60);
    } else if (avgDaysBefore < 0 && avgDaysBefore > -30) {
      pattern = 'post_announcement';
      confidence = 0.5;
    } else if (proximityScores.some(p => {
      const month = new Date(p.trade.date).getMonth();
      return month === 2 || month === 5 || month === 8 || month === 11;
    })) {
      pattern = 'quarter_end';
      confidence = 0.4;
    } else {
      pattern = 'normal';
      confidence = 0.6;
    }

    return {
      pattern,
      confidence: Math.round(confidence * 100) / 100,
      daysBeforeEvent: Math.round(avgDaysBefore * 10) / 10,
      abnormalReturn: 0,
    };
  }

  /**
   * 按角色分析
   */
  analyzeByRole(trades: InsiderTrade[]): RoleAnalysis[] {
    const roleWeights: Record<string, number> = { ceo: 3, cfo: 2.5, director: 2, officer: 1.5, other: 1 };
    const roleGroups: Record<string, InsiderTrade[]> = {};

    for (const t of trades) {
      if (!roleGroups[t.role]) roleGroups[t.role] = [];
      roleGroups[t.role].push(t);
    }

    return Object.entries(roleGroups).map(([role, roleTrades]) => {
      const buyCount = roleTrades.filter(t => t.type === 'buy').length;
      const sellCount = roleTrades.filter(t => t.type === 'sell').length;
      const netShares = roleTrades.reduce((s, t) => s + (t.type === 'buy' ? t.shares : -t.shares), 0);
      const weight = roleWeights[role] || 1;

      const totalShares = roleTrades.reduce((s, t) => s + t.shares, 0);
      const signalStrength = totalShares > 0 ? ((buyCount - sellCount) / roleTrades.length) * 100 * weight : 0;

      return {
        role,
        buyCount,
        sellCount,
        netShares,
        signalStrength: Math.round(signalStrength * 10) / 10,
        weight,
      };
    });
  }

  /**
   * 生成集群信号
   */
  generateSignal(
    trades: InsiderTrade[],
    announcementDates: number[] = [],
  ): ClusterSignal {
    const cluster = this.detectCluster(trades);
    const timing = this.detectTimingPattern(trades, announcementDates);
    const roleAnalysis = this.analyzeByRole(trades);

    // 综合评分
    const buyWeight = roleAnalysis.reduce((s, r) => s + (r.buyCount > r.sellCount ? r.signalStrength : 0), 0);
    const sellWeight = roleAnalysis.reduce((s, r) => s + (r.sellCount > r.buyCount ? -r.signalStrength : 0), 0);
    const score = Math.max(0, Math.min(100, 50 + buyWeight + sellWeight));

    let signal: ClusterSignal['signal'];
    if (score > 80) signal = 'strong_buy';
    else if (score > 60) signal = 'buy';
    else if (score < 20) signal = 'strong_sell';
    else if (score < 40) signal = 'sell';
    else signal = 'neutral';

    // 时序可疑度
    const timingSuspicion = timing.pattern === 'pre_announcement' ? Math.min(100, timing.confidence * 100) : 0;

    // 可靠性
    const signifFactor = isNaN(cluster.significance) ? 0 : cluster.significance / 100;
    const suspicionFactor = isNaN(timingSuspicion) ? 0 : timingSuspicion / 200;
    const reliability = Math.min(1, signifFactor * (1 - suspicionFactor));

    const recommendation = signal.includes('buy') && reliability > 0.5
      ? '关注买入信号，内部人集群增持'
      : signal.includes('sell')
      ? '关注卖出信号，内部人集群减持'
      : '信号不明确，继续观察';

    return {
      signal,
      score: Math.round(score * 10) / 10,
      reliability: Math.round(reliability * 100) / 100,
      clusterDetected: cluster.detected,
      timingSuspicion: Math.round(timingSuspicion * 10) / 10,
      recommendation,
    };
  }
}

export default new InsiderClusterEngine();
