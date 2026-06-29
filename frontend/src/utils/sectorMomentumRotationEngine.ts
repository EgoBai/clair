/**
 * 板块动量轮动引擎
 * - 板块动量排名 (多周期)
 * - 轮动信号检测 (领先/滞后/跟随)
 * - 资金流向板块分析
 * - 板块动量传导链
 * - 轮动强度评分
 * - 板块聚集效应
 */

export interface SectorData {
  name: string;
  code: string;
  returns: {
    d1: number;   // 1日收益
    d5: number;   // 5日收益
    d10: number;  // 10日收益
    d20: number;  // 20日收益
    d60: number;  // 60日收益
  };
  volume: {
    current: number;
    avg20: number;
    change: number; // 量变百分比
  };
  breadth: number;   // 涨跌比 0-1
  constituents: number;
  advancing: number;
  declining: number;
}

export interface RotationSignal {
  sector: string;
  type: 'leading' | 'lagging' | 'following' | 'reversing';
  strength: number; // 0-100
  momentum: number;
  description: string;
}

export interface MomentumRank {
  sector: string;
  composite: number;
  rank: number;
  trend: 'accelerating' | 'steady' | 'decelerating';
  percentile: number;
}

export interface PropagationLink {
  from: string;
  to: string;
  lag: number;       // 滞后期（交易日）
  correlation: number;
  direction: 'positive' | 'negative';
}

export interface RotationCluster {
  members: string[];
  avgMomentum: number;
  phase: 'early' | 'mid' | 'late';
  coherence: number; // 0-1
}

export interface SectorRotationResult {
  ranks: MomentumRank[];
  signals: RotationSignal[];
  propagation: PropagationLink[];
  clusters: RotationCluster[];
  summary: {
    hotSector: string;
    coldSector: string;
    rotationIntensity: number;
    marketPhase: 'risk_on' | 'risk_off' | 'transition';
  };
}

/**
 * 计算综合动量分数
 */
export function calculateCompositeMomentum(sector: SectorData): number {
  const { d1, d5, d10, d20, d60 } = sector.returns;
  // 加权：近期权重更高
  return d1 * 0.35 + d5 * 0.25 + d10 * 0.2 + d20 * 0.15 + d60 * 0.05;
}

/**
 * 板块动量排名
 */
export function rankSectorsByMomentum(sectors: SectorData[]): MomentumRank[] {
  const scored: MomentumRank[] = sectors.map(s => ({
    sector: s.name,
    composite: calculateCompositeMomentum(s),
    rank: 0,
    trend: 'steady',
    percentile: 0,
  }));

  // 排序
  scored.sort((a, b) => b.composite - a.composite);

  // 分配排名和百分位
  const n = scored.length;
  scored.forEach((item, i) => {
    item.rank = i + 1;
    item.percentile = Math.round(((n - i) / n) * 100);

    // 趋势判断：比较短中期动量
    const sector = sectors.find(s => s.name === item.sector)!;
    const shortMom = sector.returns.d1 * 0.6 + sector.returns.d5 * 0.4;
    const longMom = sector.returns.d20 * 0.6 + sector.returns.d60 * 0.4;
    if (shortMom > longMom * 1.5) item.trend = 'accelerating';
    else if (shortMom < longMom * 0.5) item.trend = 'decelerating';
    else item.trend = 'steady';
  });

  return scored;
}

/**
 * 检测轮动信号
 */
export function detectRotationSignals(sectors: SectorData[]): RotationSignal[] {
  const signals: RotationSignal[] = [];

  for (const sector of sectors) {
    const mom = calculateCompositeMomentum(sector);
    const { d1, d5, d10, d20 } = sector.returns;
    const volRatio = sector.volume.current / Math.max(sector.volume.avg20, 1);

    // 领涨信号：短期动量强 + 量能放大 + 涨跌比好
    if (d5 > 3 && d1 > 0 && volRatio > 1.3 && sector.breadth > 0.6) {
      signals.push({
        sector: sector.name,
        type: 'leading',
        strength: Math.min(100, Math.round(d5 * 10 + volRatio * 20 + sector.breadth * 30)),
        momentum: mom,
        description: `${sector.name}领涨，5日涨${d5.toFixed(1)}%，量比${volRatio.toFixed(2)}`,
      });
    }

    // 滞后信号：长期动量为正但短期疲软
    if (d20 > 5 && d5 < 1 && d1 < 0) {
      signals.push({
        sector: sector.name,
        type: 'lagging',
        strength: Math.min(100, Math.round(d20 * 5 + (d5 < 0 ? 20 : 0))),
        momentum: mom,
        description: `${sector.name}滞涨，20日涨${d20.toFixed(1)}%但近期回调`,
      });
    }

    // 跟随信号：中期动量逐步追赶
    if (d10 > d20 * 0.8 && d5 > 2 && volRatio > 1.0) {
      signals.push({
        sector: sector.name,
        type: 'following',
        strength: Math.min(100, Math.round(d5 * 8 + d10 * 4)),
        momentum: mom,
        description: `${sector.name}跟随上涨，10日涨${d10.toFixed(1)}%`,
      });
    }

    // 反转信号：长期跌但短期急涨
    if (d20 < -5 && d5 > 3 && volRatio > 1.5) {
      signals.push({
        sector: sector.name,
        type: 'reversing',
        strength: Math.min(100, Math.round(d5 * 8 + Math.abs(d20) * 3)),
        momentum: mom,
        description: `${sector.name}反转信号，20日跌${d20.toFixed(1)}%但近5日涨${d5.toFixed(1)}%`,
      });
    }
  }

  return signals.sort((a, b) => b.strength - a.strength);
}

/**
 * 动量传导分析
 * 检测板块间动量传导的领先滞后关系
 */
export function analyzePropagation(sectors: SectorData[]): PropagationLink[] {
  const links: PropagationLink[] = [];

  for (let i = 0; i < sectors.length; i++) {
    for (let j = i + 1; j < sectors.length; j++) {
      const a = sectors[i];
      const b = sectors[j];

      // 使用收益差异推断传导关系
      const aLeadB = a.returns.d5 > b.returns.d5 && a.returns.d1 < b.returns.d1;
      const bLeadA = b.returns.d5 > a.returns.d5 && b.returns.d1 < a.returns.d1;

      if (aLeadB || bLeadA) {
        const leader = aLeadB ? a : b;
        const follower = aLeadB ? b : a;

        // 估计滞后期
        const lag = Math.round(Math.abs(leader.returns.d5 - follower.returns.d5) / 2) + 1;

        // 相关性估计
        const correlation = 1 - Math.abs(leader.returns.d20 - follower.returns.d20) / 20;
        const clampedCorr = Math.max(-1, Math.min(1, correlation));

        links.push({
          from: leader.name,
          to: follower.name,
          lag: Math.min(lag, 5),
          correlation: Math.abs(clampedCorr),
          direction: clampedCorr >= 0 ? 'positive' : 'negative',
        });
      }
    }
  }

  return links.sort((a, b) => b.correlation - a.correlation).slice(0, 20);
}

/**
 * 板块聚集分析
 * 将动量相似的板块聚为一组
 */
export function clusterSectors(sectors: SectorData[]): RotationCluster[] {
  if (sectors.length < 3) return [];

  // 按综合动量分组
  const sorted = [...sectors].sort(
    (a, b) => calculateCompositeMomentum(b) - calculateCompositeMomentum(a)
  );

  const clusterSize = Math.max(2, Math.floor(sorted.length / 3));
  const clusters: RotationCluster[] = [];

  for (let i = 0; i < sorted.length; i += clusterSize) {
    const members = sorted.slice(i, i + clusterSize).map(s => s.name);
    const momentums = sorted.slice(i, i + clusterSize).map(s => calculateCompositeMomentum(s));
    const avgMomentum = momentums.reduce((a, b) => a + b, 0) / momentums.length;

    // 相干性：成员动量一致性
    const maxM = Math.max(...momentums);
    const minM = Math.min(...momentums);
    const coherence = maxM === minM ? 1 : 1 - (maxM - minM) / (Math.abs(maxM) + Math.abs(minM) + 0.01);

    // 轮动阶段
    const avgVolRatio = sorted
      .slice(i, i + clusterSize)
      .reduce((sum, s) => sum + s.volume.current / Math.max(s.volume.avg20, 1), 0) / members.length;

    let phase: 'early' | 'mid' | 'late';
    if (avgVolRatio > 1.5 && avgMomentum > 0) phase = 'early';
    else if (avgMomentum > 2) phase = 'late';
    else phase = 'mid';

    clusters.push({ members, avgMomentum, phase, coherence });
  }

  return clusters;
}

/**
 * 综合分析
 */
export function analyzeSectorRotation(sectors: SectorData[]): SectorRotationResult {
  const ranks = rankSectorsByMomentum(sectors);
  const signals = detectRotationSignals(sectors);
  const propagation = analyzePropagation(sectors);
  const clusters = clusterSectors(sectors);

  // 汇总
  const hotSector = ranks[0]?.sector || '';
  const coldSector = ranks[ranks.length - 1]?.sector || '';

  const maxMom = ranks[0]?.composite || 0;
  const minMom = ranks[ranks.length - 1]?.composite || 0;
  const rotationIntensity = Math.min(100, Math.round((maxMom - minMom) * 5));

  // 市场阶段
  const avgMomentum = ranks.reduce((s, r) => s + r.composite, 0) / ranks.length;
  const leadingCount = signals.filter(s => s.type === 'leading').length;
  const _reversingCount = signals.filter(s => s.type === 'reversing').length;

  let marketPhase: 'risk_on' | 'risk_off' | 'transition';
  if (avgMomentum > 1 && leadingCount > 2) marketPhase = 'risk_on';
  else if (avgMomentum < -1) marketPhase = 'risk_off';
  else marketPhase = 'transition';

  return {
    ranks,
    signals,
    propagation,
    clusters,
    summary: { hotSector, coldSector, rotationIntensity, marketPhase },
  };
}
