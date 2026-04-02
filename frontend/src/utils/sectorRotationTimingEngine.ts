/**
 * 行业轮动择时引擎
 * - 动量/反转信号
 * - 行业相对强弱
 * - 轮动时机判断
 */

export interface SectorData {
  name: string;
  returns: number[];
  momentum: number;
  valuation: number; // PE percentile
  fundFlow: number;  // 资金净流入占比
}

export interface RotationSignal {
  sector: string;
  signal: 'overweight' | 'underweight' | 'neutral';
  compositeScore: number;
  momentumScore: number;
  valueScore: number;
  flowScore: number;
  timing: 'early' | 'mid' | 'late';
}

export class SectorRotationTimingEngine {
  analyze(sectors: SectorData[]): RotationSignal[] {
    if (sectors.length === 0) return [];

    const momScores = this.rankScores(sectors.map(s => s.momentum));
    const valScores = this.rankScores(sectors.map(s => -s.valuation)); // lower PE = higher score
    const flowScores = this.rankScores(sectors.map(s => s.fundFlow));

    return sectors.map((s, i) => {
      const composite = 0.4 * momScores[i] + 0.3 * valScores[i] + 0.3 * flowScores[i];
      let signal: RotationSignal['signal'] = 'neutral';
      if (composite > 0.65) signal = 'overweight';
      else if (composite < 0.35) signal = 'underweight';

      let timing: RotationSignal['timing'] = 'mid';
      if (momScores[i] > 0.7 && flowScores[i] > 0.6) timing = 'early';
      else if (momScores[i] > 0.8 && valScores[i] < 0.3) timing = 'late';

      return {
        sector: s.name,
        signal,
        compositeScore: Math.round(composite * 100) / 100,
        momentumScore: Math.round(momScores[i] * 100) / 100,
        valueScore: Math.round(valScores[i] * 100) / 100,
        flowScore: Math.round(flowScores[i] * 100) / 100,
        timing,
      };
    }).sort((a, b) => b.compositeScore - a.compositeScore);
  }

  getTopRotation(sectors: SectorData[], n: number = 3): { buy: string[]; sell: string[] } {
    const signals = this.analyze(sectors);
    return {
      buy: signals.filter(s => s.signal === 'overweight').slice(0, n).map(s => s.sector),
      sell: signals.filter(s => s.signal === 'underweight').slice(0, n).map(s => s.sector),
    };
  }

  private rankScores(values: number[]): number[] {
    const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const scores = new Array(values.length).fill(0);
    indexed.forEach((item, rank) => { scores[item.i] = rank / Math.max(1, values.length - 1); });
    return scores;
  }
}

export default new SectorRotationTimingEngine();
