/**
 * 板块资金流引擎 (Sector Fund Flow Engine)
 * - 主力/散户/北向资金流向
 * - 板块资金净流入排名
 * - 资金流向趋势
 * - 资金聚集/分散信号
 * - 大单追踪
 * - 资金流向背离检测
 */

export interface FundFlowData {
  sector: string;
  code: string;
  mainInflow: number;      // 主力净流入（万元）
  retailInflow: number;    // 散户净流入
  northboundInflow: number; // 北向净流入
  largeOrderRatio: number;  // 大单占比
  superLargeOrder: number;  // 超大单净额
  largeOrder: number;       // 大单净额
  mediumOrder: number;      // 中单净额
  smallOrder: number;       // 小单净额
  turnover: number;         // 换手率
  priceChange: number;      // 涨跌幅
}

export interface FlowRanking {
  sector: string;
  netInflow: number;
  rank: number;
  trend: 'inflow_accelerating' | 'inflow_steady' | 'outflow_accelerating' | 'outflow_steady';
  intensity: number; // 0-100
}

export interface FlowTrend {
  sector: string;
  periods: { time: string; netFlow: number }[];
  direction: 'inflow' | 'outflow' | 'neutral';
  momentum: number;        // 资金流加速度
  consistency: number;     // 一致性 0-1
}

export interface FlowSignal {
  sector: string;
  type: 'smart_money_in' | 'smart_money_out' | 'divergence' | 'whale_activity' | 'retail_panic';
  strength: number;
  description: string;
  recommendation: string;
}

export interface FlowConcentration {
  top3Sectors: string[];
  top3Share: number;       // 前3板块资金占比
  herfindahl: number;
  isConcentrated: boolean;
}

/**
 * 计算净流入
 */
export function calculateNetInflow(flow: FundFlowData): number {
  return flow.mainInflow + flow.retailInflow + flow.northboundInflow;
}

/**
 * 板块资金流排名
 */
export function rankByFundFlow(flows: FundFlowData[]): FlowRanking[] {
  const ranked = flows.map(f => ({
    sector: f.sector,
    netInflow: calculateNetInflow(f),
    rank: 0,
    trend: 'inflow_steady' as const,
    intensity: 0,
  }));

  ranked.sort((a, b) => b.netInflow - a.netInflow);

  ranked.forEach((item, i) => {
    item.rank = i + 1;
    const absFlow = Math.abs(item.netInflow);
    const maxFlow = Math.max(...ranked.map(r => Math.abs(r.netInflow)), 1);
    item.intensity = Math.min(100, Math.round((absFlow / maxFlow) * 100));

    // 趋势判断基于主力资金动向
    const flow = flows.find(f => f.sector === item.sector)!;
    if (flow.mainInflow > 0 && flow.mainInflow > Math.abs(flow.retailInflow)) {
      item.trend = flow.mainInflow > 1000 ? 'inflow_accelerating' : 'inflow_steady';
    } else if (flow.mainInflow < 0) {
      item.trend = flow.mainInflow < -1000 ? 'outflow_accelerating' : 'outflow_steady';
    }
  });

  return ranked;
}

/**
 * 资金流趋势分析
 */
export function analyzeFlowTrend(
  sector: string,
  periods: { time: string; netFlow: number }[]
): FlowTrend {
  if (periods.length === 0) {
    return { sector, periods: [], direction: 'neutral', momentum: 0, consistency: 0 };
  }

  const totalFlow = periods.reduce((s, p) => s + p.netFlow, 0);
  const direction = totalFlow > 0 ? 'inflow' : totalFlow < 0 ? 'outflow' : 'neutral';

  // 动量：近期流速 vs 远期流速
  const half = Math.floor(periods.length / 2);
  const recentAvg = periods.slice(-half).reduce((s, p) => s + p.netFlow, 0) / Math.max(half, 1);
  const earlierAvg = periods.slice(0, half).reduce((s, p) => s + p.netFlow, 0) / Math.max(half, 1);
  const momentum = recentAvg - earlierAvg;

  // 一致性
  const sameDir = periods.filter(p =>
    (totalFlow >= 0 && p.netFlow >= 0) || (totalFlow < 0 && p.netFlow < 0)
  ).length;
  const consistency = periods.length > 0 ? sameDir / periods.length : 0;

  return { sector, periods, direction, momentum, consistency };
}

/**
 * 检测资金流信号
 */
export function detectFlowSignals(flows: FundFlowData[]): FlowSignal[] {
  const signals: FlowSignal[] = [];

  for (const flow of flows) {
    const netInflow = calculateNetInflow(flow);

    // 主力资金流入信号
    if (flow.mainInflow > 5000 && flow.priceChange < 1) {
      signals.push({
        sector: flow.sector,
        type: 'smart_money_in',
        strength: Math.min(100, Math.round(flow.mainInflow / 100)),
        description: `${flow.sector}主力净流入${(flow.mainInflow / 10000).toFixed(2)}亿，股价未充分反应`,
        recommendation: '关注建仓机会',
      });
    }

    // 主力资金流出信号
    if (flow.mainInflow < -5000 && flow.priceChange > 0) {
      signals.push({
        sector: flow.sector,
        type: 'smart_money_out',
        strength: Math.min(100, Math.round(Math.abs(flow.mainInflow) / 100)),
        description: `${flow.sector}主力净流出${(Math.abs(flow.mainInflow) / 10000).toFixed(2)}亿，股价仍在上涨`,
        recommendation: '警惕主力出货',
      });
    }

    // 资金流向背离
    if (flow.mainInflow > 0 && flow.retailInflow < -flow.mainInflow * 0.5 && flow.priceChange > 2) {
      signals.push({
        sector: flow.sector,
        type: 'divergence',
        strength: Math.min(100, Math.round(Math.abs(flow.mainInflow - flow.retailInflow) / 50)),
        description: `${flow.sector}主力买入散户卖出，涨幅${flow.priceChange.toFixed(1)}%`,
        recommendation: '可能为洗盘，关注后续走势',
      });
    }

    // 大单异动
    if (flow.superLargeOrder > 3000 || flow.superLargeOrder < -3000) {
      signals.push({
        sector: flow.sector,
        type: 'whale_activity',
        strength: Math.min(100, Math.round(Math.abs(flow.superLargeOrder) / 50)),
        description: `${flow.sector}超大单${flow.superLargeOrder > 0 ? '净买入' : '净卖出'}${(Math.abs(flow.superLargeOrder) / 10000).toFixed(2)}亿`,
        recommendation: '关注机构动向',
      });
    }

    // 散户恐慌
    if (flow.smallOrder < -2000 && flow.priceChange < -3) {
      signals.push({
        sector: flow.sector,
        type: 'retail_panic',
        strength: Math.min(100, Math.round(Math.abs(flow.smallOrder) / 30)),
        description: `${flow.sector}散户恐慌抛售，小单净流出${(Math.abs(flow.smallOrder) / 10000).toFixed(2)}亿`,
        recommendation: '逆势机会，关注主力动向',
      });
    }
  }

  return signals.sort((a, b) => b.strength - a.strength);
}

/**
 * 资金流集中度分析
 */
export function analyzeFlowConcentration(flows: FundFlowData[]): FlowConcentration {
  if (flows.length === 0) {
    return { top3Sectors: [], top3Share: 0, herfindahl: 0, isConcentrated: false };
  }

  const sorted = [...flows].sort((a, b) => Math.abs(calculateNetInflow(b)) - Math.abs(calculateNetInflow(a)));
  const top3 = sorted.slice(0, 3);
  const top3Sectors = top3.map(f => f.sector);

  const totalAbsFlow = flows.reduce((s, f) => s + Math.abs(calculateNetInflow(f)), 0);
  const top3AbsFlow = top3.reduce((s, f) => s + Math.abs(calculateNetInflow(f)), 0);
  const top3Share = totalAbsFlow > 0 ? top3AbsFlow / totalAbsFlow : 0;

  // HHI
  const herfindahl = totalAbsFlow > 0
    ? flows.reduce((s, f) => {
      const share = Math.abs(calculateNetInflow(f)) / totalAbsFlow;
      return s + share * share;
    }, 0)
    : 0;

  return {
    top3Sectors,
    top3Share,
    herfindahl,
    isConcentrated: top3Share > 0.5,
  };
}

/**
 * 大单追踪
 */
export function trackLargeOrders(flows: FundFlowData[]): {
  sector: string;
  largeOrderPct: number;
  dominantType: 'institution' | 'retail' | 'mixed';
  signal: 'accumulate' | 'distribute' | 'neutral';
}[] {
  return flows.map(flow => {
    const largeOrderPct = flow.largeOrderRatio;
    const totalBig = flow.superLargeOrder + flow.largeOrder;
    const totalSmall = flow.mediumOrder + flow.smallOrder;

    let dominantType: 'institution' | 'retail' | 'mixed';
    if (Math.abs(totalBig) > Math.abs(totalSmall) * 1.5) dominantType = 'institution';
    else if (Math.abs(totalSmall) > Math.abs(totalBig) * 1.5) dominantType = 'retail';
    else dominantType = 'mixed';

    let signal: 'accumulate' | 'distribute' | 'neutral';
    if (totalBig > 2000 && flow.priceChange < 2) signal = 'accumulate';
    else if (totalBig < -2000 && flow.priceChange > -2) signal = 'distribute';
    else signal = 'neutral';

    return { sector: flow.sector, largeOrderPct, dominantType, signal };
  });
}

/**
 * 资金流向背离检测
 */
export function detectFlowDivergence(
  flows: FundFlowData[],
  priceChanges: Map<string, number>
): { sector: string; type: 'bullish' | 'bearish'; confidence: number }[] {
  const divergences: { sector: string; type: 'bullish' | 'bearish'; confidence: number }[] = [];

  for (const flow of flows) {
    const priceChange = priceChanges.get(flow.sector) ?? flow.priceChange;
    const netInflow = calculateNetInflow(flow);

    // 底背离：价格跌但资金流入
    if (priceChange < -2 && netInflow > 0) {
      divergences.push({
        sector: flow.sector,
        type: 'bullish',
        confidence: Math.min(100, Math.round(Math.abs(priceChange) * 10 + netInflow / 100)),
      });
    }

    // 顶背离：价格涨但资金流出
    if (priceChange > 2 && netInflow < 0) {
      divergences.push({
        sector: flow.sector,
        type: 'bearish',
        confidence: Math.min(100, Math.round(Math.abs(priceChange) * 10 + Math.abs(netInflow) / 100)),
      });
    }
  }

  return divergences.sort((a, b) => b.confidence - a.confidence);
}
