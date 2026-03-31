/**
 * 跨市场联动引擎
 * A股与港股/美股联动分析、传导效应
 */

export interface MarketReturns {
  market: string;
  returns: number[];
  dates: string[];
}

export interface LinkageResult {
  market1: string;
  market2: string;
  correlation: number;
  leadLag: number; // 正值表示market1领先
  beta: number;
  contagionRisk: 'low' | 'moderate' | 'high';
  decouplingScore: number;
}

export interface CrossMarketAnalysis {
  linkages: LinkageResult[];
  strongestLink: LinkageResult | null;
  contagionAlert: boolean;
  diversificationBenefit: number;
  compositeRisk: 'low' | 'moderate' | 'high';
}

/**
 * 跨市场联动分析
 */
export function analyzeCrossMarketLinkage(markets: MarketReturns[]): CrossMarketAnalysis {
  const linkages: LinkageResult[] = [];

  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      linkages.push(computeLinkage(markets[i], markets[j]));
    }
  }

  const strongestLink = linkages.length > 0
    ? linkages.reduce((a, b) => Math.abs(a.correlation) > Math.abs(b.correlation) ? a : b)
    : null;

  const contagionAlert = linkages.some(l => l.contagionRisk === 'high');
  const avgCorr = linkages.length > 0 ? linkages.reduce((s, l) => s + Math.abs(l.correlation), 0) / linkages.length : 0;
  const diversificationBenefit = Math.round((1 - avgCorr) * 100) / 100;

  const highRiskCount = linkages.filter(l => l.contagionRisk === 'high').length;
  const compositeRisk: CrossMarketAnalysis['compositeRisk'] =
    highRiskCount > linkages.length / 2 ? 'high' : highRiskCount > 0 ? 'moderate' : 'low';

  return {
    linkages: linkages.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)),
    strongestLink,
    contagionAlert,
    diversificationBenefit,
    compositeRisk,
  };
}

function computeLinkage(m1: MarketReturns, m2: MarketReturns): LinkageResult {
  const n = Math.min(m1.returns.length, m2.returns.length);
  if (n < 3) {
    return { market1: m1.market, market2: m2.market, correlation: 0, leadLag: 0, beta: 0, contagionRisk: 'low', decouplingScore: 0 };
  }

  const r1 = m1.returns.slice(0, n);
  const r2 = m2.returns.slice(0, n);

  // 相关系数
  const mx = r1.reduce((a, b) => a + b, 0) / n;
  const my = r2.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (r1[i] - mx) * (r2[i] - my);
    dx += (r1[i] - mx) ** 2;
    dy += (r2[i] - my) ** 2;
  }
  const correlation = Math.sqrt(dx * dy) > 0 ? num / Math.sqrt(dx * dy) : 0;

  // Beta
  const beta = dx > 0 ? num / dx : 0;

  // 领先滞后
  let bestLag = 0, bestCorr = -Infinity;
  for (let lag = -3; lag <= 3; lag++) {
    const sn = n - Math.abs(lag);
    if (sn < 3) continue;
    const s1 = lag >= 0 ? r1.slice(lag, lag + sn) : r1.slice(0, sn);
    const s2 = lag >= 0 ? r2.slice(0, sn) : r2.slice(-lag, -lag + sn);
    const smx = s1.reduce((a, b) => a + b, 0) / sn;
    const smy = s2.reduce((a, b) => a + b, 0) / sn;
    let snum = 0, sdx = 0, sdy = 0;
    for (let i = 0; i < sn; i++) {
      snum += (s1[i] - smx) * (s2[i] - smy);
      sdx += (s1[i] - smx) ** 2;
      sdy += (s2[i] - smy) ** 2;
    }
    const sc = Math.sqrt(sdx * sdy) > 0 ? snum / Math.sqrt(sdx * sdy) : 0;
    if (Math.abs(sc) > Math.abs(bestCorr)) { bestCorr = sc; bestLag = lag; }
  }

  const contagionRisk: LinkageResult['contagionRisk'] =
    Math.abs(correlation) > 0.7 ? 'high' : Math.abs(correlation) > 0.4 ? 'moderate' : 'low';

  // 脱钩评分
  const decouplingScore = Math.round((1 - Math.abs(correlation)) * 100) / 100;

  return {
    market1: m1.market,
    market2: m2.market,
    correlation: Math.round(correlation * 1000) / 1000,
    leadLag: bestLag,
    beta: Math.round(beta * 1000) / 1000,
    contagionRisk,
    decouplingScore,
  };
}
