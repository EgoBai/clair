/**
 * 资金流深度分析引擎
 * 主力/散户资金流向拆解、大单追踪、资金博弈分析
 */

export interface FundFlowEntry {
  time: string; // HH:MM
  price: number;
  volume: number;
  amount: number;
  direction: 'buy' | 'sell' | 'neutral';
}

export interface FundFlowSummary {
  mainInflow: number;    // 主力净流入
  mainOutflow: number;   // 主力净流出
  mainNet: number;       // 主力净额
  retailInflow: number;  // 散户净流入
  retailOutflow: number; // 散户净流出
  retailNet: number;     // 散户净额
  superLargeNet: number; // 超大单净额
  largeNet: number;      // 大单净额
  mediumNet: number;     // 中单净额
  smallNet: number;      // 小单净额
}

export type OrderSize = 'superLarge' | 'large' | 'medium' | 'small';

export interface OrderSizeThreshold {
  superLarge: number; // 万手
  large: number;
  medium: number;
}

export const DEFAULT_THRESHOLDS: OrderSizeThreshold = {
  superLarge: 100,
  large: 20,
  medium: 4,
};

/**
 * 按单笔量级分类
 */
export function classifyOrderSize(volume: number, thresholds = DEFAULT_THRESHOLDS): OrderSize {
  if (volume >= thresholds.superLarge) return 'superLarge';
  if (volume >= thresholds.large) return 'large';
  if (volume >= thresholds.medium) return 'medium';
  return 'small';
}

/**
 * 资金流汇总分析
 */
export function analyzeFundFlow(entries: FundFlowEntry[]): FundFlowSummary {
  const result: FundFlowSummary = {
    mainInflow: 0,
    mainOutflow: 0,
    mainNet: 0,
    retailInflow: 0,
    retailOutflow: 0,
    retailNet: 0,
    superLargeNet: 0,
    largeNet: 0,
    mediumNet: 0,
    smallNet: 0,
  };

  for (const entry of entries) {
    if (entry.direction === 'neutral') continue;

    const size = classifyOrderSize(entry.volume);
    const isBuy = entry.direction === 'buy';
    const isMain = size === 'superLarge' || size === 'large';

    if (isMain) {
      if (isBuy) result.mainInflow += entry.amount;
      else result.mainOutflow += entry.amount;
    } else {
      if (isBuy) result.retailInflow += entry.amount;
      else result.retailOutflow += entry.amount;
    }

    const netKey = `${size}Net` as keyof Pick<FundFlowSummary, 'superLargeNet' | 'largeNet' | 'mediumNet' | 'smallNet'>;
    result[netKey] += isBuy ? entry.amount : -entry.amount;
  }

  result.mainNet = result.mainInflow - result.mainOutflow;
  result.retailNet = result.retailInflow - result.retailOutflow;

  return {
    mainInflow: Math.round(result.mainInflow * 100) / 100,
    mainOutflow: Math.round(result.mainOutflow * 100) / 100,
    mainNet: Math.round(result.mainNet * 100) / 100,
    retailInflow: Math.round(result.retailInflow * 100) / 100,
    retailOutflow: Math.round(result.retailOutflow * 100) / 100,
    retailNet: Math.round(result.retailNet * 100) / 100,
    superLargeNet: Math.round(result.superLargeNet * 100) / 100,
    largeNet: Math.round(result.largeNet * 100) / 100,
    mediumNet: Math.round(result.mediumNet * 100) / 100,
    smallNet: Math.round(result.smallNet * 100) / 100,
  };
}

/**
 * 分时资金流 (按时间窗口聚合)
 */
export function timeWindowFlow(
  entries: FundFlowEntry[],
  windowMinutes: number
): { time: string; netFlow: number; volume: number; turnover: number }[] {
  const windows = new Map<string, { netFlow: number; volume: number; turnover: number }>();

  for (const entry of entries) {
    const [h, m] = entry.time.split(':').map(Number);
    const windowStart = Math.floor(m / windowMinutes) * windowMinutes;
    const key = `${String(h).padStart(2, '0')}:${String(windowStart).padStart(2, '0')}`;

    const existing = windows.get(key) ?? { netFlow: 0, volume: 0, turnover: 0 };
    const net = entry.direction === 'buy' ? entry.amount : entry.direction === 'sell' ? -entry.amount : 0;
    existing.netFlow += net;
    existing.volume += entry.volume;
    existing.turnover += entry.amount;
    windows.set(key, existing);
  }

  return Array.from(windows.entries())
    .map(([time, data]) => ({
      time,
      netFlow: Math.round(data.netFlow * 100) / 100,
      volume: Math.round(data.volume * 100) / 100,
      turnover: Math.round(data.turnover * 100) / 100,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * 资金博弈指数 (0-100)
 * 衡量主力与散户的博弈激烈程度
 */
export function fundBattlegroundIndex(summary: FundFlowSummary): {
  index: number;
  level: 'dominant' | 'contested' | 'dispersed';
  mainControl: number; // 主力控盘度 0-100
} {
  const totalVolume = Math.abs(summary.mainNet) + Math.abs(summary.retailNet);
  if (totalVolume === 0) {
    return { index: 0, level: 'dispersed', mainControl: 50 };
  }

  // 博弈指数 = |主力净额 - 散户净额| / 总量 * 100
  const divergence = Math.abs(summary.mainNet - summary.retailNet);
  const index = Math.min(100, Math.round((divergence / totalVolume) * 100));

  // 主力控盘度
  const mainRatio = Math.abs(summary.mainNet) / totalVolume;
  const mainControl = Math.round(mainRatio * 100);

  let level: 'dominant' | 'contested' | 'dispersed';
  if (mainControl > 70) level = 'dominant';
  else if (mainControl > 40) level = 'contested';
  else level = 'dispersed';

  return { index, level, mainControl };
}

/**
 * 大单追踪 — 识别异常大单
 */
export interface LargeOrderAlert {
  time: string;
  direction: 'buy' | 'sell';
  amount: number;
  volume: number;
  impact: 'high' | 'medium'; // 影响等级
}

export function trackLargeOrders(
  entries: FundFlowEntry[],
  minAmount: number = 500
): LargeOrderAlert[] {
  return entries
    .filter((e) => e.amount >= minAmount && e.direction !== 'neutral')
    .map((e) => ({
      time: e.time,
      direction: e.direction as 'buy' | 'sell',
      amount: e.amount,
      volume: e.volume,
      impact: e.amount >= minAmount * 3 ? 'high' as const : 'medium' as const,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * 资金流向趋势检测
 */
export type FlowTrend = 'accelerating_inflow' | 'steady_inflow' | 'decelerating_inflow' | 'neutral' | 'decelerating_outflow' | 'steady_outflow' | 'accelerating_outflow';

export function detectFlowTrend(entries: FundFlowEntry[], segmentCount: number = 4): FlowTrend {
  if (entries.length < segmentCount) return 'neutral';

  const segmentSize = Math.floor(entries.length / segmentCount);
  const segments: number[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const start = i * segmentSize;
    const end = start + segmentSize;
    const segment = entries.slice(start, end);
    const net = segment.reduce((s, e) => s + (e.direction === 'buy' ? e.amount : e.direction === 'sell' ? -e.amount : 0), 0);
    segments.push(net);
  }

  // 计算趋势斜率
  const n = segments.length;
  const sumX = (n * (n + 1)) / 2;
  const sumY = segments.reduce((a, b) => a + b, 0);
  const sumXY = segments.reduce((s, y, i) => s + (i + 1) * y, 0);
  const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  const lastNet = segments[n - 1];
  if (slope > 0 && lastNet > 0) {
    return Math.abs(slope) > Math.abs(segments[0]) * 0.2 ? 'accelerating_inflow' : 'steady_inflow';
  } else if (slope < 0 && lastNet < 0) {
    return Math.abs(slope) > Math.abs(segments[0]) * 0.2 ? 'accelerating_outflow' : 'steady_outflow';
  } else if (slope < 0 && lastNet > 0) {
    return 'decelerating_inflow';
  } else if (slope > 0 && lastNet < 0) {
    return 'decelerating_outflow';
  }

  return 'neutral';
}
