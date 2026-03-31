/**
 * 股票质押风险分析引擎
 * 质押比例/预警线/平仓线计算、风险评级、机构质押追踪
 */

export interface PledgeRecord {
  ticker: string;
  pledgor: string; // 出质人 (大股东/实控人)
  pledgorType: 'majorShareholder' | 'controller' | 'institution' | 'other';
  pledgee: string; // 质权人 (券商/银行/信托)
  pledgeeType: 'broker' | 'bank' | 'trust' | 'other';
  shares: number; // 质押股数
  totalShares: number; // 总股本
  startDate: string;
  endDate: string;
  status: 'active' | 'released' | 'defaulted' | 'forced';
  pledgePrice: number; // 质押价格
  currentPrice: number;
  warningLine: number; // 预警线
  closeLine: number; // 平仓线
  purpose: 'financing' | 'investment' | 'debt' | 'other';
}

export interface PledgeRiskMetrics {
  ticker: string;
  totalPledgedShares: number;
  totalShares: number;
  pledgeRatio: number; // 质押比例
  riskLevel: 'safe' | 'attention' | 'warning' | 'danger' | 'critical';
  riskScore: number; // 0-100, 越高越危险
  marginOfSafety: number; // 距平仓线的安全边际
  largestPledge: {
    pledgor: string;
    ratio: number;
    status: string;
  };
  pledgorConcentration: number; // 质押集中度
  upcomingExpiry: number; // 即将到期的质押数
  forcedSellRisk: number; // 强平风险概率 0-1
}

export interface PledgeMarketOverview {
  totalPledgedCompanies: number;
  totalPledgedValue: number;
  avgPledgeRatio: number;
  highRiskCount: number; // 高风险公司数
  topRiskStocks: { ticker: string; ratio: number; riskLevel: string }[];
  sectorDistribution: { sector: string; count: number; avgRatio: number }[];
  trendDirection: 'increasing' | 'stable' | 'decreasing';
}

export interface PledgeStressTest {
  ticker: string;
  currentPrice: number;
  scenarios: {
    priceDrop: number; // 跌幅
    newPrice: number;
    marginOfSafety: number;
    riskLevel: string;
    sharesAtRisk: number;
  }[];
}

/**
 * 计算质押风险指标
 */
export function calculatePledgeRisk(
  records: PledgeRecord[]
): PledgeRiskMetrics | null {
  if (records.length === 0) return null;

  const ticker = records[0].ticker;
  const totalShares = records[0].totalShares;
  const activeRecords = records.filter(r => r.status === 'active');

  if (totalShares === 0) return null;

  const totalPledgedShares = activeRecords.reduce((s, r) => s + r.shares, 0);
  const pledgeRatio = totalPledgedShares / totalShares;

  // 风险评分
  let riskScore = 0;
  if (pledgeRatio > 0.6) riskScore += 40;
  else if (pledgeRatio > 0.4) riskScore += 30;
  else if (pledgeRatio > 0.2) riskScore += 15;
  else if (pledgeRatio > 0.1) riskScore += 5;

  // 最大质押者
  const byPledgor = new Map<string, number>();
  activeRecords.forEach(r => {
    byPledgor.set(r.pledgor, (byPledgor.get(r.pledgor) ?? 0) + r.shares);
  });
  let largestPledgor = '';
  let largestShares = 0;
  byPledgor.forEach((shares, pledgor) => {
    if (shares > largestShares) {
      largestShares = shares;
      largestPledgor = pledgor;
    }
  });

  // 质押集中度
  const pledgorConcentration = totalPledgedShares > 0
    ? largestShares / totalPledgedShares
    : 0;
  riskScore += pledgorConcentration > 0.7 ? 20 : pledgorConcentration > 0.5 ? 10 : 0;

  // 安全边际计算 (取最接近平仓线的)
  let minMargin = Infinity;
  const now = new Date();
  let upcomingExpiry = 0;

  for (const r of activeRecords) {
    const margin = (r.currentPrice - r.closeLine) / r.currentPrice;
    if (margin < minMargin) minMargin = margin;

    const endDate = new Date(r.endDate);
    const daysUntilExpiry = (endDate.getTime() - now.getTime()) / 86400000;
    if (daysUntilExpiry > 0 && daysUntilExpiry <= 90) upcomingExpiry++;
  }

  if (minMargin < 0.05) riskScore += 30;
  else if (minMargin < 0.1) riskScore += 20;
  else if (minMargin < 0.2) riskScore += 10;

  // 即将到期增加风险
  riskScore += Math.min(10, upcomingExpiry * 3);

  riskScore = Math.min(100, riskScore);

  // 风险等级
  let riskLevel: PledgeRiskMetrics['riskLevel'];
  if (riskScore >= 80) riskLevel = 'critical';
  else if (riskScore >= 60) riskLevel = 'danger';
  else if (riskScore >= 40) riskLevel = 'warning';
  else if (riskScore >= 20) riskLevel = 'attention';
  else riskLevel = 'safe';

  // 强平风险概率
  const forcedSellRisk = minMargin < 0 ? 1 : Math.max(0, 1 - minMargin * 5);

  return {
    ticker,
    totalPledgedShares,
    totalShares,
    pledgeRatio,
    riskLevel,
    riskScore,
    marginOfSafety: minMargin === Infinity ? 1 : minMargin,
    largestPledge: {
      pledgor: largestPledgor,
      ratio: largestShares / totalShares,
      status: activeRecords.find(r => r.pledgor === largestPledgor)?.status ?? 'active',
    },
    pledgorConcentration,
    upcomingExpiry,
    forcedSellRisk,
  };
}

/**
 * 质押压力测试
 */
export function runPledgeStressTest(
  records: PledgeRecord[],
  priceDrops: number[] = [0.05, 0.1, 0.15, 0.2, 0.3]
): PledgeStressTest | null {
  const activeRecords = records.filter(r => r.status === 'active');
  if (activeRecords.length === 0) return null;

  const ticker = records[0].ticker;
  const currentPrice = activeRecords[0].currentPrice;

  const scenarios = priceDrops.map(drop => {
    const newPrice = currentPrice * (1 - drop);
    let sharesAtRisk = 0;

    for (const r of activeRecords) {
      if (newPrice <= r.closeLine) sharesAtRisk += r.shares;
    }

    // 最小安全边际
    let minMargin = Infinity;
    for (const r of activeRecords) {
      const margin = (newPrice - r.closeLine) / newPrice;
      if (margin < minMargin) minMargin = margin;
    }

    let riskLevel: string;
    if (minMargin < 0) riskLevel = '触碰平仓线';
    else if (minMargin < 0.05) riskLevel = '逼近平仓线';
    else if (minMargin < 0.15) riskLevel = '预警区域';
    else riskLevel = '安全';

    return {
      priceDrop: drop,
      newPrice: Math.round(newPrice * 100) / 100,
      marginOfSafety: Math.round(minMargin * 10000) / 10000,
      riskLevel,
      sharesAtRisk,
    };
  });

  return { ticker, currentPrice, scenarios };
}

/**
 * 质押市场概况
 */
export function generateMarketOverview(
  allRecords: PledgeRecord[]
): PledgeMarketOverview {
  const byTicker = new Map<string, PledgeRecord[]>();
  allRecords.forEach(r => {
    const list = byTicker.get(r.ticker) ?? [];
    list.push(r);
    byTicker.set(r.ticker, list);
  });

  let highRiskCount = 0;
  const riskStocks: { ticker: string; ratio: number; riskLevel: string }[] = [];

  byTicker.forEach((records, ticker) => {
    const risk = calculatePledgeRisk(records);
    if (risk) {
      if (risk.riskLevel === 'danger' || risk.riskLevel === 'critical') {
        highRiskCount++;
      }
      riskStocks.push({
        ticker,
        ratio: risk.pledgeRatio,
        riskLevel: risk.riskLevel,
      });
    }
  });

  riskStocks.sort((a, b) => b.ratio - a.ratio);

  const allActive = allRecords.filter(r => r.status === 'active');
  const totalPledgedValue = allActive.reduce(
    (s, r) => s + r.shares * r.currentPrice,
    0
  );
  const avgPledgeRatio = byTicker.size > 0
    ? allActive.reduce((s, r) => s + r.shares / r.totalShares, 0) / byTicker.size
    : 0;

  // 按质押人类型分布
  const byType = new Map<string, { count: number; totalRatio: number }>();
  allActive.forEach(r => {
    const existing = byType.get(r.pledgorType) ?? { count: 0, totalRatio: 0 };
    existing.count++;
    existing.totalRatio += r.shares / r.totalShares;
    byType.set(r.pledgorType, existing);
  });

  const sectorDistribution = Array.from(byType.entries()).map(([sector, d]) => ({
    sector,
    count: d.count,
    avgRatio: d.totalRatio / d.count,
  }));

  return {
    totalPledgedCompanies: byTicker.size,
    totalPledgedValue,
    avgPledgeRatio,
    highRiskCount,
    topRiskStocks: riskStocks.slice(0, 10),
    sectorDistribution,
    trendDirection: avgPledgeRatio > 0.15 ? 'increasing' : avgPledgeRatio > 0.08 ? 'stable' : 'decreasing',
  };
}

/**
 * 质押到期日分析
 */
export function analyzeExpiryRisk(
  records: PledgeRecord[],
  daysAhead: number = 180
): { soon: PledgeRecord[]; expired: PledgeRecord[] } {
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 86400000);

  const active = records.filter(r => r.status === 'active');
  const soon: PledgeRecord[] = [];
  const expired: PledgeRecord[] = [];

  for (const r of active) {
    const endDate = new Date(r.endDate);
    if (endDate < now) {
      expired.push(r);
    } else if (endDate <= cutoff) {
      soon.push(r);
    }
  }

  soon.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  expired.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

  return { soon, expired };
}

/**
 * 质押人行为分析
 */
export function analyzePledgorBehavior(
  records: PledgeRecord[],
  pledgor: string
): {
  pledgor: string;
  totalPledges: number;
  activeRatio: number;
  avgHoldingDays: number;
  defaultRate: number;
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
} {
  const myRecords = records.filter(r => r.pledgor === pledgor);
  const active = myRecords.filter(r => r.status === 'active');
  const defaulted = myRecords.filter(r => r.status === 'defaulted' || r.status === 'forced');

  const totalDays = myRecords.reduce((s, r) => {
    const start = new Date(r.startDate).getTime();
    const end = new Date(r.endDate).getTime();
    return s + (end - start) / 86400000;
  }, 0);
  const avgHoldingDays = myRecords.length > 0 ? totalDays / myRecords.length : 0;

  const defaultRate = myRecords.length > 0 ? defaulted.length / myRecords.length : 0;
  const activeRatio = myRecords.length > 0 ? active.length / myRecords.length : 0;

  let riskProfile: 'conservative' | 'moderate' | 'aggressive';
  if (defaultRate > 0.1 || activeRatio > 0.8) riskProfile = 'aggressive';
  else if (defaultRate > 0.03 || activeRatio > 0.5) riskProfile = 'moderate';
  else riskProfile = 'conservative';

  return {
    pledgor,
    totalPledges: myRecords.length,
    activeRatio,
    avgHoldingDays,
    defaultRate,
    riskProfile,
  };
}
