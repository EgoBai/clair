/**
 * 行业轮动信号引擎V2
 * - 经济周期定位(复苏/扩张/滞胀/衰退)
 * - 板块动量排名
 * - 资金流向跟踪
 * - 板块估值对比
 * - 轮动信号生成
 * - 配置建议
 */

export interface EconomicCycle {
  phase: 'recovery' | 'expansion' | 'stagflation' | 'recession';
  confidence: number;
  indicators: string[];
  monthsInPhase: number;
}

export interface SectorRanking {
  sector: string;
  momentum: number;
  valuation: number; // 分位数
  fundFlow: number;
  compositeScore: number;
  rank: number;
  signal: 'overweight' | 'neutral' | 'underweight';
}

export interface RotationSignal {
  fromSector: string;
  toSector: string;
  strength: number; // 0-100
  reasoning: string;
  expectedSpread: number; // 预期收益差(%)
}

export interface SectorAllocation {
  sector: string;
  currentWeight: number;
  suggestedWeight: number;
  change: number;
  reasoning: string;
}

export class SectorRotationEngine {
  private sectors: string[] = [
    '科技', '消费', '医药', '金融', '工业', '能源', '材料', '地产', '公用事业', '通信',
  ];

  /**
   * 判断经济周期
   */
  detectEconomicCycle(
    gdpGrowth: number[],
    inflation: number[],
    pmi: number[],
    yieldCurve: number[],
  ): EconomicCycle {
    const avgGDP = gdpGrowth.length > 0 ? gdpGrowth.slice(-3).reduce((a, b) => a + b, 0) / 3 : 0;
    const avgInflation = inflation.length > 0 ? inflation.slice(-3).reduce((a, b) => a + b, 0) / 3 : 0;
    const avgPMI = pmi.length > 0 ? pmi.slice(-3).reduce((a, b) => a + b, 0) / 3 : 50;
    const slope = yieldCurve.length >= 2 ? yieldCurve[yieldCurve.length - 1] - yieldCurve[yieldCurve.length - 2] : 0;

    let phase: EconomicCycle['phase'];
    const indicators: string[] = [];

    if (avgGDP > 2 && avgPMI > 50 && avgInflation < 4) {
      phase = 'expansion';
      indicators.push('GDP增长', 'PMI>50', '通胀温和');
    } else if (avgGDP > 0 && avgPMI <= 50) {
      phase = 'recovery';
      indicators.push('GDP企稳', 'PMI触底');
    } else if (avgGDP < 2 && avgInflation > 4) {
      phase = 'stagflation';
      indicators.push('GDP放缓', '通胀上升');
    } else {
      phase = 'recession';
      indicators.push('GDP负增长', 'PMI<50');
    }

    const confidence = Math.min(1, 0.4 + indicators.length * 0.15);

    return {
      phase,
      confidence: Math.round(confidence * 100) / 100,
      indicators,
      monthsInPhase: Math.floor(Math.random() * 12) + 1,
    };
  }

  /**
   * 板块排名
   */
  rankSectors(
    momentumMap: Record<string, number>,
    valuationMap: Record<string, number>,
    fundFlowMap: Record<string, number>,
  ): SectorRanking[] {
    const rankings: SectorRanking[] = this.sectors.map(sector => {
      const momentum = momentumMap[sector] || 0;
      const valuation = valuationMap[sector] || 50;
      const fundFlow = fundFlowMap[sector] || 0;

      const compositeScore = momentum * 0.4 + (100 - valuation) * 0.3 + fundFlow * 0.3;

      return {
        sector,
        momentum: Math.round(momentum * 100) / 100,
        valuation: Math.round(valuation * 10) / 10,
        fundFlow: Math.round(fundFlow * 100) / 100,
        compositeScore: Math.round(compositeScore * 10) / 10,
        rank: 0,
        signal: 'neutral',
      };
    });

    rankings.sort((a, b) => b.compositeScore - a.compositeScore);

    rankings.forEach((r, i) => {
      r.rank = i + 1;
      if (i < 3) r.signal = 'overweight';
      else if (i >= rankings.length - 3) r.signal = 'underweight';
      else r.signal = 'neutral';
    });

    return rankings;
  }

  /**
   * 生成轮动信号
   */
  generateRotationSignals(rankings: SectorRanking[]): RotationSignal[] {
    const signals: RotationSignal[] = [];
    const top = rankings.filter(r => r.signal === 'overweight');
    const bottom = rankings.filter(r => r.signal === 'underweight');

    for (const t of top) {
      for (const b of bottom) {
        const spread = t.compositeScore - b.compositeScore;
        if (spread > 20) {
          signals.push({
            fromSector: b.sector,
            toSector: t.sector,
            strength: Math.min(100, spread),
            reasoning: `${t.sector}综合评分${t.compositeScore} vs ${b.sector}${b.compositeScore}`,
            expectedSpread: Math.round(spread * 0.1 * 100) / 100,
          });
        }
      }
    }

    return signals.sort((a, b) => b.strength - a.strength);
  }

  /**
   * 生成配置建议
   */
  suggestAllocation(
    rankings: SectorRanking[],
    currentWeights: Record<string, number>,
  ): SectorAllocation[] {
    const totalSuggested = rankings.reduce((s, r) => s + (r.signal === 'overweight' ? 15 : r.signal === 'underweight' ? 5 : 10), 0);

    return rankings.map(r => {
      const suggestedPct = r.signal === 'overweight' ? 15 : r.signal === 'underweight' ? 5 : 10;
      const suggestedWeight = suggestedPct / totalSuggested;
      const currentWeight = currentWeights[r.sector] || 0;
      const change = suggestedWeight - currentWeight;

      return {
        sector: r.sector,
        currentWeight: Math.round(currentWeight * 10000) / 10000,
        suggestedWeight: Math.round(suggestedWeight * 10000) / 10000,
        change: Math.round(change * 10000) / 10000,
        reasoning: `排名#${r.rank}, ${r.signal}`,
      };
    });
  }
}

export default new SectorRotationEngine();
