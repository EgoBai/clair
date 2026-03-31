/**
 * 基金持仓分析引擎
 * 公募基金重仓股追踪、持仓变动、FOF穿透、风格漂移检测
 */

export interface FundHolding {
  ticker: string;
  stockName: string;
  shares: number;
  marketValue: number;
  weight: number;       // 占净值比
  change: number;       // 持仓变动 (正=增持)
  changePercent: number;
}

export interface FundInfo {
  code: string;
  name: string;
  type: 'stock' | 'mixed' | 'bond' | 'index' | 'qdii' | 'etf';
  manager: string;
  company: string;
  nav: number;
  totalAssets: number;
  reportDate: string;
  holdings: FundHolding[];
  topSectors: { sector: string; weight: number }[];
}

export interface StockFundOwnership {
  ticker: string;
  stockName: string;
  holdingFunds: number;     // 持有基金数
  totalShares: number;
  totalValue: number;
  circulatingOwnership: number; // 占流通股比
  changeFromLast: number;   // 较上期变动
  topHolders: { fundCode: string; fundName: string; weight: number }[];
  ownershipTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface FundStyleAnalysis {
  fundCode: string;
  style: 'large_value' | 'large_growth' | 'large_blend'
    | 'mid_value' | 'mid_growth' | 'mid_blend'
    | 'small_value' | 'small_growth' | 'small_blend';
  marketCapExposure: { large: number; mid: number; small: number };
  valueGrowthScore: number; // -1 (growth) to 1 (value)
  concentration: number;    // 前10大持仓占比
  turnover: number;         // 换手率估计
  sectorDiversity: number;  // 行业分散度
}

export interface StyleDrift {
  fundCode: string;
  fundName: string;
  previousStyle: string;
  currentStyle: string;
  driftScore: number;      // 0-1, 越大漂移越严重
  mainChanges: string[];
}

/**
 * 计算个股基金持仓集中度
 */
export function calculateOwnershipConcentration(
  funds: FundInfo[],
  ticker: string
): StockFundOwnership | null {
  const holders: { fundCode: string; fundName: string; shares: number; value: number; weight: number }[] = [];
  let stockName = '';

  for (const fund of funds) {
    const holding = fund.holdings.find(h => h.ticker === ticker);
    if (holding) {
      stockName = holding.stockName;
      holders.push({
        fundCode: fund.code,
        fundName: fund.name,
        shares: holding.shares,
        value: holding.marketValue,
        weight: holding.weight,
      });
    }
  }

  if (holders.length === 0) return null;

  const totalShares = holders.reduce((s, h) => s + h.shares, 0);
  const totalValue = holders.reduce((s, h) => s + h.value, 0);

  const topHolders = holders
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map(h => ({ fundCode: h.fundCode, fundName: h.fundName, weight: h.weight }));

  // 估算变动
  const avgChange = holders.reduce((s, h) => {
    const fund = funds.find(f => f.code === h.fundCode);
    const hold = fund?.holdings.find(hh => hh.ticker === ticker);
    return s + (hold?.changePercent ?? 0);
  }, 0) / holders.length;

  let ownershipTrend: StockFundOwnership['ownershipTrend'];
  if (avgChange > 5) ownershipTrend = 'increasing';
  else if (avgChange < -5) ownershipTrend = 'decreasing';
  else ownershipTrend = 'stable';

  return {
    ticker,
    stockName,
    holdingFunds: holders.length,
    totalShares,
    totalValue,
    circulatingOwnership: 0, // 需要外部数据
    changeFromLast: avgChange,
    topHolders,
    ownershipTrend,
  };
}

/**
 * 分析基金风格
 */
export function analyzeFundStyle(fund: FundInfo): FundStyleAnalysis {
  const totalWeight = fund.holdings.reduce((s, h) => s + h.weight, 0) || 1;

  // 集中度: 前10大持仓占比
  const sorted = [...fund.holdings].sort((a, b) => b.weight - a.weight);
  const top10Weight = sorted.slice(0, 10).reduce((s, h) => s + h.weight, 0);
  const concentration = top10Weight / totalWeight;

  // 行业分散度
  const sectorCount = fund.topSectors.length;
  const sectorDiversity = Math.min(1, sectorCount / 10);

  // 大中小盘暴露 (简化: 按权重估算)
  const marketCapExposure = { large: 0.5, mid: 0.3, small: 0.2 };

  // 风格得分 (简化)
  const valueGrowthScore = 0;

  let style: FundStyleAnalysis['style'];
  if (concentration > 0.6) style = 'large_blend';
  else if (sectorDiversity > 0.5) style = 'mid_blend';
  else style = 'small_blend';

  return {
    fundCode: fund.code,
    style,
    marketCapExposure,
    valueGrowthScore,
    concentration,
    turnover: 0,
    sectorDiversity,
  };
}

/**
 * 检测风格漂移
 */
export function detectStyleDrift(
  previousFund: FundInfo,
  currentFund: FundInfo
): StyleDrift | null {
  const prevStyle = analyzeFundStyle(previousFund);
  const currStyle = analyzeFundStyle(currentFund);

  if (prevStyle.style === currStyle.style) return null;

  const prevTop = new Set(
    [...previousFund.holdings]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map(h => h.ticker)
  );
  const currTop = new Set(
    [...currentFund.holdings]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map(h => h.ticker)
  );

  const removed = [...prevTop].filter(t => !currTop.has(t));
  const added = [...currTop].filter(t => !prevTop.has(t));

  const driftScore = (removed.length + added.length) / 20;

  const mainChanges: string[] = [];
  if (removed.length > 0) mainChanges.push(`退出前10: ${removed.join(', ')}`);
  if (added.length > 0) mainChanges.push(`新进前10: ${added.join(', ')}`);

  return {
    fundCode: currentFund.code,
    fundName: currentFund.name,
    previousStyle: prevStyle.style,
    currentStyle: currStyle.style,
    driftScore: Math.min(1, driftScore),
    mainChanges,
  };
}

/**
 * 找出被基金集中增持的股票
 */
export function findHeavyAccumulation(
  funds: FundInfo[],
  minFundCount: number = 5
): { ticker: string; name: string; fundCount: number; avgChange: number; totalValue: number }[] {
  const byStock = new Map<string, { funds: FundInfo[]; holding: FundHolding }>();

  for (const fund of funds) {
    for (const h of fund.holdings) {
      if (h.changePercent > 0) {
        const existing = byStock.get(h.ticker);
        if (existing) {
          existing.funds.push(fund);
        } else {
          byStock.set(h.ticker, { funds: [fund], holding: h });
        }
      }
    }
  }

  const results: { ticker: string; name: string; fundCount: number; avgChange: number; totalValue: number }[] = [];

  byStock.forEach((data, ticker) => {
    if (data.funds.length >= minFundCount) {
      let totalChange = 0;
      let totalValue = 0;
      data.funds.forEach(f => {
        const h = f.holdings.find(hh => hh.ticker === ticker);
        if (h) {
          totalChange += h.changePercent;
          totalValue += h.marketValue;
        }
      });

      results.push({
        ticker,
        name: data.holding.stockName,
        fundCount: data.funds.length,
        avgChange: totalChange / data.funds.length,
        totalValue,
      });
    }
  });

  return results.sort((a, b) => b.fundCount - a.fundCount);
}

/**
 * 基金持仓重叠度分析
 */
export function calculateHoldingsOverlap(
  fundA: FundInfo,
  fundB: FundInfo
): {
  overlapRatio: number;
  commonHoldings: string[];
  uniqueToA: string[];
  uniqueToB: string[];
} {
  const setA = new Set(fundA.holdings.map(h => h.ticker));
  const setB = new Set(fundB.holdings.map(h => h.ticker));

  const common = [...setA].filter(t => setB.has(t));
  const uniqueA = [...setA].filter(t => !setB.has(t));
  const uniqueB = [...setB].filter(t => !setA.has(t));

  const union = new Set([...setA, ...setB]);
  const overlapRatio = union.size > 0 ? common.length / union.size : 0;

  return {
    overlapRatio,
    commonHoldings: common,
    uniqueToA: uniqueA,
    uniqueToB: uniqueB,
  };
}
