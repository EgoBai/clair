/**
 * 板块联动分析引擎
 * 板块内部联动强度/龙头效应/板块轮动信号/传导路径
 */

export interface SectorStock {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  volume: number;
  isLeader: boolean;       // 是否龙头
  correlation: number;     // 与板块相关性
}

export interface SectorLinkage {
  sector: string;
  stocks: SectorStock[];
  avgChange: number;
  riseCount: number;
  fallCount: number;
  riseRatio: number;
  linkageStrength: number; // 0-1, 联动强度
  leaderStock: string;
  leaderChange: number;
  leaderEffect: number;    // 龙头带动效应 0-1
  momentum: 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down';
  signal: 'active' | 'watch' | 'weak' | 'avoid';
}

export interface CrossSectorLink {
  source: string;
  target: string;
  leadLag: number;        // 正数=source领先, 负数=target领先 (分钟)
  correlation: number;
  causality: 'upstream' | 'downstream' | 'parallel' | 'independent';
  strength: number;
}

export interface SectorRotationChain {
  chain: string[];
  currentLeader: string;
  expectedNext: string;
  confidence: number;
  historicalAccuracy: number;
}

export interface LeaderFollowerAnalysis {
  leader: SectorStock;
  followers: {
    stock: SectorStock;
    lagMinutes: number;
    correlation: number;
    followStrength: number;
  }[];
  leaderAlpha: number;  // 龙头超额收益
  averageLag: number;
}

/**
 * 分析板块联动
 */
export function analyzeSectorLinkage(stocks: SectorStock[]): SectorLinkage | null {
  if (stocks.length < 3) return null;

  const sector = stocks[0].sector;
  const changes = stocks.map(s => s.change);
  const avgChange = changes.reduce((s, c) => s + c, 0) / changes.length;

  const riseCount = stocks.filter(s => s.change > 0).length;
  const fallCount = stocks.filter(s => s.change < 0).length;
  const riseRatio = riseCount / stocks.length;

  // 联动强度: 涨跌同向的比例
  const sameDirection = stocks.filter(s =>
    (s.change > 0 && avgChange > 0) || (s.change < 0 && avgChange < 0) || s.change === avgChange
  ).length;
  const linkageStrength = sameDirection / stocks.length;

  // 龙头识别: 涨幅最大且成交量最大的
  const sorted = [...stocks].sort((a, b) => {
    const scoreA = Math.abs(a.change) * 0.7 + (a.volume / 1e8) * 0.3;
    const scoreB = Math.abs(b.change) * 0.7 + (b.volume / 1e8) * 0.3;
    return scoreB - scoreA;
  });

  const leader = sorted[0];

  // 龙头效应: 龙头涨跌幅与板块均值的相关性
  const leaderEffect = leader.change !== 0
    ? Math.min(1, Math.abs(avgChange / leader.change))
    : 0.5;

  let momentum: SectorLinkage['momentum'];
  if (avgChange > 3 && riseRatio > 0.7) momentum = 'strong_up';
  else if (avgChange > 0.5) momentum = 'up';
  else if (avgChange < -3 && riseRatio < 0.3) momentum = 'strong_down';
  else if (avgChange < -0.5) momentum = 'down';
  else momentum = 'neutral';

  let signal: SectorLinkage['signal'];
  if (linkageStrength > 0.7 && (momentum === 'strong_up' || momentum === 'up')) signal = 'active';
  else if (linkageStrength > 0.5) signal = 'watch';
  else if (linkageStrength < 0.3) signal = 'avoid';
  else signal = 'weak';

  return {
    sector,
    stocks,
    avgChange,
    riseCount,
    fallCount,
    riseRatio,
    linkageStrength,
    leaderStock: leader.ticker,
    leaderChange: leader.change,
    leaderEffect,
    momentum,
    signal,
  };
}

/**
 * 板块间联动分析
 */
export function analyzeCrossSectorLinkage(
  sectorA: SectorLinkage,
  sectorB: SectorLinkage,
  priceHistory: Map<string, number[]> // sector -> price series
): CrossSectorLink {
  const historyA = priceHistory.get(sectorA.sector) ?? [];
  const historyB = priceHistory.get(sectorB.sector) ?? [];

  // 计算相关性
  const len = Math.min(historyA.length, historyB.length);
  let correlation = 0;
  if (len > 5) {
    const meanA = historyA.slice(0, len).reduce((s, v) => s + v, 0) / len;
    const meanB = historyB.slice(0, len).reduce((s, v) => s + v, 0) / len;
    let cov = 0, varA = 0, varB = 0;
    for (let i = 0; i < len; i++) {
      const da = historyA[i] - meanA;
      const db = historyB[i] - meanB;
      cov += da * db;
      varA += da * da;
      varB += db * db;
    }
    correlation = varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : 0;
  }

  // 领先滞后 (简化: 看当前动量)
  const leadLag = sectorA.avgChange > sectorB.avgChange ? 1 : -1;

  let causality: CrossSectorLink['causality'];
  if (Math.abs(correlation) > 0.7) {
    causality = leadLag > 0 ? 'upstream' : 'downstream';
  } else if (Math.abs(correlation) > 0.4) {
    causality = 'parallel';
  } else {
    causality = 'independent';
  }

  return {
    source: sectorA.sector,
    target: sectorB.sector,
    leadLag,
    correlation,
    causality,
    strength: Math.abs(correlation),
  };
}

/**
 * 龙头跟风分析
 */
export function analyzeLeaderFollower(
  stocks: SectorStock[]
): LeaderFollowerAnalysis | null {
  if (stocks.length < 3) return null;

  // 找龙头
  const leader = stocks.reduce((best, s) => {
    const score = Math.abs(s.change) * 0.6 + (s.volume / 1e7) * 0.4;
    const bestScore = Math.abs(best.change) * 0.6 + (best.volume / 1e7) * 0.4;
    return score > bestScore ? s : best;
  });

  // 跟风分析
  const followers = stocks
    .filter(s => s.ticker !== leader.ticker)
    .map(s => {
      const sameDirection = (leader.change > 0 && s.change > 0) ||
        (leader.change < 0 && s.change < 0);
      const followStrength = sameDirection
        ? Math.min(1, Math.abs(s.change / (leader.change || 1)))
        : 0;

      return {
        stock: s,
        lagMinutes: 0, // 需要时序数据
        correlation: s.correlation,
        followStrength,
      };
    })
    .sort((a, b) => b.followStrength - a.followStrength);

  const leaderAlpha = leader.change - stocks.reduce((s, st) => s + st.change, 0) / stocks.length;

  return {
    leader,
    followers,
    leaderAlpha,
    averageLag: 0,
  };
}

/**
 * 板块轮动链
 */
export function buildRotationChain(
  sectorHistory: Map<string, number[][]> // sector -> [day][return]
): SectorRotationChain[] {
  const sectors = Array.from(sectorHistory.keys());
  const chains: SectorRotationChain[] = [];

  for (let i = 0; i < sectors.length; i++) {
    const histI = sectorHistory.get(sectors[i]) ?? [];
    if (histI.length < 10) continue;

    let bestNext = '';
    let bestCorr = -1;

    for (let j = 0; j < sectors.length; j++) {
      if (i === j) continue;
      const histJ = sectorHistory.get(sectors[j]) ?? [];

      // 检查 I 领先 J 一个周期
      const len = Math.min(histI.length - 1, histJ.length);
      if (len < 5) continue;

      let corr = 0;
      for (let k = 0; k < len; k++) {
        corr += histI[k][0] * histJ[k + 1]?.[0] ?? 0;
      }

      if (corr > bestCorr) {
        bestCorr = corr;
        bestNext = sectors[j];
      }
    }

    if (bestNext && bestCorr > 0) {
      chains.push({
        chain: [sectors[i], bestNext],
        currentLeader: sectors[i],
        expectedNext: bestNext,
        confidence: Math.min(1, bestCorr / 10),
        historicalAccuracy: 0.5,
      });
    }
  }

  return chains.sort((a, b) => b.confidence - a.confidence);
}
