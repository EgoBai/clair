/**
 * SectorRotationTimingEngine - 板块轮动择时引擎
 * 通过板块动量、资金流向、估值比较判断板块轮动时机
 */

export interface SectorData {
  name: string;
  code: string;
  momentum5d: number;       // 5日动量
  momentum20d: number;      // 20日动量
  momentum60d: number;      // 60日动量
  fundFlow: number;         // 资金净流入 (亿)
  pePercentile: number;     // PE百分位 (0~100)
  turnoverRate: number;     // 换手率
  relativeStrength: number; // 相对强度 (vs大盘)
}

export interface RotationSignal {
  sector: string;
  signal: 'rotate_in' | 'hold' | 'rotate_out';
  score: number;
  reasons: string[];
  momentumRank: number;
  flowRank: number;
  valueRank: number;
}

export interface RotationConfig {
  momentumWeight: number;
  flowWeight: number;
  valueWeight: number;
  topN: number;
  bottomN: number;
}

const DEFAULT_CONFIG: RotationConfig = {
  momentumWeight: 0.4,
  flowWeight: 0.35,
  valueWeight: 0.25,
  topN: 3,
  bottomN: 3,
};

function rankArray(arr: number[], ascending = false): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => ascending ? a.v - b.v : b.v - a.v);
  const ranks = new Array(arr.length);
  indexed.forEach((item, rank) => { ranks[item.i] = rank + 1; });
  return ranks;
}

export function analyzeSectorRotation(
  sectors: SectorData[],
  config: Partial<RotationConfig> = {}
): RotationSignal[] {
  if (sectors.length === 0) return [];
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 计算各维度排名
  const momentumScores = sectors.map(s => s.momentum5d * 0.5 + s.momentum20d * 0.3 + s.momentum60d * 0.2);
  const flowScores = sectors.map(s => s.fundFlow);
  const valueScores = sectors.map(s => 100 - s.pePercentile); // 低估值高分

  const momRanks = rankArray(momentumScores);
  const flowRanks = rankArray(flowScores);
  const valRanks = rankArray(valueScores, true);

  const maxRank = sectors.length;

  return sectors.map((s, i) => {
    const momNorm = 1 - (momRanks[i] - 1) / maxRank;
    const flowNorm = 1 - (flowRanks[i] - 1) / maxRank;
    const valNorm = 1 - (valRanks[i] - 1) / maxRank;

    const score = Math.round(
      (momNorm * cfg.momentumWeight + flowNorm * cfg.flowWeight + valNorm * cfg.valueWeight) * 100
    ) / 100;

    const reasons: string[] = [];
    if (momNorm > 0.7) reasons.push('动量强劲');
    if (flowNorm > 0.7) reasons.push('资金持续流入');
    if (valNorm > 0.7) reasons.push('估值偏低');
    if (momNorm < 0.3) reasons.push('动量疲弱');
    if (flowNorm < 0.3) reasons.push('资金流出');

    let signal: RotationSignal['signal'];
    if (score > 0.7) signal = 'rotate_in';
    else if (score < 0.3) signal = 'rotate_out';
    else signal = 'hold';

    return {
      sector: s.name,
      signal,
      score,
      reasons,
      momentumRank: momRanks[i],
      flowRank: flowRanks[i],
      valueRank: valRanks[i],
    };
  }).sort((a, b) => b.score - a.score);
}

export function getRotationTopBottom(
  sectors: SectorData[],
  config: Partial<RotationConfig> = {}
): { top: RotationSignal[]; bottom: RotationSignal[] } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const signals = analyzeSectorRotation(sectors, config);
  return {
    top: signals.slice(0, cfg.topN),
    bottom: signals.slice(-cfg.bottomN).reverse(),
  };
}

export function detectRotationPair(
  sectors: SectorData[]
): { from: string; to: string; confidence: number } | null {
  if (sectors.length < 2) return null;
  const signals = analyzeSectorRotation(sectors);
  const incoming = signals.find(s => s.signal === 'rotate_in');
  const outgoing = signals.find(s => s.signal === 'rotate_out');
  if (!incoming || !outgoing) return null;

  const confidence = Math.min(1, (incoming.score - outgoing.score) / 0.5);
  return { from: outgoing.sector, to: incoming.sector, confidence: Math.round(confidence * 100) / 100 };
}
