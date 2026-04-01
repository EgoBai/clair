/**
 * 盈利预期修正引擎
 * 追踪分析师盈利预期修正趋势，识别盈利上调/下调动量
 */

export interface EarningsRevision {
  stockCode: string;
  stockName: string;
  period: 'FY1' | 'FY2' | 'FY3';
  metric: 'EPS' | 'Revenue' | 'NetProfit';
  currentValue: number;
  previousValue: number;
  revisionDate: string;
  analystCount: number;
  consensusType: 'mean' | 'median';
}

export interface RevisionMomentum {
  stockCode: string;
  period: string;
  upsCount: number;
  downsCount: number;
  netRevision: number;
  revisionRatio: number; // ups / (ups + downs)
  momentum: 'strong_positive' | 'positive' | 'neutral' | 'negative' | 'strong_negative';
  avgRevisionPct: number;
  breadth: number; // % of analysts revising up
}

export interface RevisionTrend {
  stockCode: string;
  dates: string[];
  epsRevisions: number[];
  revenueRevisions: number[];
  trend: 'accelerating_up' | 'decelerating_up' | 'stable' | 'decelerating_down' | 'accelerating_down';
  turningPoint: string | null;
}

export class EarningsRevisionEngine {
  /**
   * 计算修正动量
   */
  calculateMomentum(revisions: EarningsRevision[]): RevisionMomentum {
    if (revisions.length === 0) {
      return {
        stockCode: '',
        period: '',
        upsCount: 0,
        downsCount: 0,
        netRevision: 0,
        revisionRatio: 0.5,
        momentum: 'neutral',
        avgRevisionPct: 0,
        breadth: 0.5
      };
    }

    const ups = revisions.filter(r => r.currentValue > r.previousValue);
    const downs = revisions.filter(r => r.currentValue < r.previousValue);
    const total = ups.length + downs.length;

    const revisionPcts = revisions.map(r => 
      r.previousValue !== 0 ? ((r.currentValue - r.previousValue) / Math.abs(r.previousValue)) * 100 : 0
    );
    const avgRevisionPct = revisionPcts.reduce((a, b) => a + b, 0) / revisionPcts.length;

    const revisionRatio = total > 0 ? ups.length / total : 0.5;
    const breadth = revisions.length > 0 ? ups.length / revisions.length : 0.5;

    let momentum: RevisionMomentum['momentum'] = 'neutral';
    if (revisionRatio >= 0.75 && avgRevisionPct > 5) momentum = 'strong_positive';
    else if (revisionRatio >= 0.6 && avgRevisionPct > 0) momentum = 'positive';
    else if (revisionRatio <= 0.25 && avgRevisionPct < -5) momentum = 'strong_negative';
    else if (revisionRatio <= 0.4 && avgRevisionPct < 0) momentum = 'negative';

    return {
      stockCode: revisions[0].stockCode,
      period: revisions[0].period,
      upsCount: ups.length,
      downsCount: downs.length,
      netRevision: ups.length - downs.length,
      revisionRatio,
      momentum,
      avgRevisionPct,
      breadth
    };
  }

  /**
   * 分析修正趋势
   */
  analyzeTrend(revisionsByDate: Map<string, EarningsRevision[]>): RevisionTrend {
    const dates = Array.from(revisionsByDate.keys()).sort();
    
    const epsRevisions: number[] = [];
    const revenueRevisions: number[] = [];

    for (const date of dates) {
      const revs = revisionsByDate.get(date) || [];
      const epsRev = revs.filter(r => r.metric === 'EPS');
      const revRev = revs.filter(r => r.metric === 'Revenue');

      const epsAvg = epsRev.length > 0 
        ? epsRev.reduce((s, r) => s + (r.currentValue - r.previousValue), 0) / epsRev.length 
        : 0;
      const revAvg = revRev.length > 0 
        ? revRev.reduce((s, r) => s + (r.currentValue - r.previousValue), 0) / revRev.length 
        : 0;

      epsRevisions.push(epsAvg);
      revenueRevisions.push(revAvg);
    }

    let trend: RevisionTrend['trend'] = 'stable';
    let turningPoint: string | null = null;

    if (epsRevisions.length >= 3) {
      const recent = epsRevisions.slice(-3);
      const earlier = epsRevisions.slice(0, 3);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

      if (recentAvg > earlierAvg && recent[2] > recent[0]) trend = 'accelerating_up';
      else if (recentAvg > earlierAvg && recent[2] <= recent[0]) trend = 'decelerating_up';
      else if (recentAvg < earlierAvg && recent[2] < recent[0]) trend = 'accelerating_down';
      else if (recentAvg < earlierAvg && recent[2] >= recent[0]) trend = 'decelerating_down';

      // 查找拐点
      for (let i = 1; i < epsRevisions.length; i++) {
        if ((epsRevisions[i] > 0 && epsRevisions[i - 1] <= 0) ||
            (epsRevisions[i] < 0 && epsRevisions[i - 1] >= 0)) {
          turningPoint = dates[i];
        }
      }
    }

    return {
      stockCode: '',
      dates,
      epsRevisions,
      revenueRevisions,
      trend,
      turningPoint
    };
  }

  /**
   * 行业修正广度分析
   */
  industryRevisionBreadth(
    stockRevisions: Map<string, RevisionMomentum>
  ): { industry: string; breadth: number; momentum: string }[] {
    const industryMap = new Map<string, { ups: number; total: number; momentumSum: number }>();

    for (const [, momentum] of stockRevisions) {
      const isPositive = momentum.momentum === 'positive' || momentum.momentum === 'strong_positive';
      const existing = industryMap.get(momentum.stockCode) || { ups: 0, total: 0, momentumSum: 0 };
      existing.total++;
      if (isPositive) existing.ups++;
      existing.momentumSum += momentum.avgRevisionPct;
      industryMap.set(momentum.stockCode, existing);
    }

    return Array.from(industryMap.entries()).map(([industry, data]) => ({
      industry,
      breadth: data.total > 0 ? data.ups / data.total : 0,
      momentum: data.momentumSum > 0 ? 'positive' : data.momentumSum < 0 ? 'negative' : 'neutral'
    }));
  }

  /**
   * 预测盈利惊喜概率
   */
  estimateSurpriseProbability(
    revisionHistory: EarningsRevision[],
    historicalSurprises: { beat: number; miss: number; meet: number }
  ): { beatProb: number; missProb: number; meetProb: number; confidence: number } {
    const totalHistorical = historicalSurprises.beat + historicalSurprises.miss + historicalSurprises.meet;
    const baseBeat = totalHistorical > 0 ? historicalSurprises.beat / totalHistorical : 0.33;
    const baseMiss = totalHistorical > 0 ? historicalSurprises.miss / totalHistorical : 0.33;

    // 修正方向调整
    const recentRevisions = revisionHistory.slice(-10);
    const upRevisions = recentRevisions.filter(r => r.currentValue > r.previousValue).length;
    const revisionSignal = recentRevisions.length > 0 
      ? (upRevisions / recentRevisions.length - 0.5) * 0.3 
      : 0;

    const beatProb = Math.max(0, Math.min(1, baseBeat + revisionSignal));
    const missProb = Math.max(0, Math.min(1, baseMiss - revisionSignal));
    const meetProb = Math.max(0, Math.min(1, 1 - beatProb - missProb));

    const confidence = Math.min(1, revisionHistory.length / 20);

    return { beatProb, missProb, meetProb, confidence };
  }
}
