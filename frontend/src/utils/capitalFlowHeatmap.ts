/**
 * 资金流向热力图引擎
 * 板块/个股资金流可视化、热力矩阵生成、流动力度评分
 */

export interface FlowData {
  ticker: string;
  name: string;
  sector: string;
  mainInflow: number;      // 主力净流入
  retailInflow: number;    // 散户净流入
  totalInflow: number;     // 总净流入
  volume: number;
  price: number;
  priceChange: number;     // 涨跌幅
  turnoverRate: number;    // 换手率
}

export interface HeatmapCell {
  ticker: string;
  name: string;
  sector: string;
  intensity: number;      // -1 到 1
  color: string;
  size: number;           // 市值占比
  label: string;
  flowDirection: 'inflow' | 'outflow' | 'neutral';
  flowStrength: 'strong' | 'moderate' | 'weak';
}

export interface HeatmapConfig {
  layout: 'treemap' | 'grid' | 'bubble';
  colorScheme: 'redGreen' | 'blueRed' | 'gradient';
  sizeMetric: 'volume' | 'marketCap' | 'turnover';
  groupBy: 'sector' | 'none';
  minCells: number;
  maxCells: number;
}

export interface SectorFlowSummary {
  sector: string;
  netFlow: number;
  inflowCount: number;
  outflowCount: number;
  avgChange: number;
  flowTrend: 'accumulating' | 'distributing' | 'mixed';
  topInflow: { ticker: string; amount: number };
  topOutflow: { ticker: string; amount: number };
}

export interface FlowMomentum {
  ticker: string;
  currentFlow: number;
  avgFlow5d: number;
  avgFlow20d: number;
  momentum: number;        // 当前/20日均值
  acceleration: number;    // (当前-5日) / (5日-20日)
  signal: 'accelerating_in' | 'steady_in' | 'decelerating_in' | 'accelerating_out' | 'steady_out' | 'decelerating_out';
}

/**
 * 将资金流强度映射到颜色
 */
export function flowToColor(intensity: number, scheme: HeatmapConfig['colorScheme']): string {
  const abs = Math.min(1, Math.abs(intensity));

  if (scheme === 'redGreen') {
    if (intensity > 0) {
      const r = Math.round(255 - abs * 100);
      const g = Math.round(80 + abs * 175);
      const b = 80;
      return `rgb(${r},${g},${b})`;
    } else {
      const r = Math.round(80 + abs * 175);
      const g = Math.round(255 - abs * 100);
      const b = 80;
      return `rgb(${r},${g},${b})`;
    }
  }

  if (scheme === 'blueRed') {
    if (intensity > 0) {
      return `rgb(${Math.round(abs * 255)},50,${Math.round(200 + (1 - abs) * 55)})`;
    }
    return `rgb(50,${Math.round(abs * 200)},${Math.round(255 - abs * 55)})`;
  }

  // gradient: white → yellow → orange → red
  if (intensity > 0.66) return '#ff0000';
  if (intensity > 0.33) return '#ff8800';
  if (intensity > 0) return '#ffcc00';
  if (intensity > -0.33) return '#cccccc';
  if (intensity > -0.66) return '#888888';
  return '#444444';
}

/**
 * 生成热力图矩阵
 */
export function generateHeatmap(
  data: FlowData[],
  config: Partial<HeatmapConfig> = {}
): HeatmapCell[] {
  const cfg: HeatmapConfig = {
    layout: 'treemap',
    colorScheme: 'redGreen',
    sizeMetric: 'volume',
    groupBy: 'sector',
    minCells: 10,
    maxCells: 100,
    ...config,
  };

  // 按资金流绝对值排序取 top N
  const sorted = [...data]
    .sort((a, b) => Math.abs(b.totalInflow) - Math.abs(a.totalInflow))
    .slice(cfg.minCells, cfg.maxCells);

  // 计算归一化强度
  const maxFlow = Math.max(1, ...sorted.map(d => Math.abs(d.totalInflow)));
  const maxSize = Math.max(1, ...sorted.map(d => {
    if (cfg.sizeMetric === 'volume') return d.volume;
    if (cfg.sizeMetric === 'turnover') return d.turnoverRate * d.volume;
    return d.volume * d.price; // marketCap proxy
  }));

  return sorted.map(d => {
    const intensity = d.totalInflow / maxFlow;
    const size = cfg.sizeMetric === 'volume'
      ? d.volume / maxSize
      : cfg.sizeMetric === 'turnover'
        ? (d.turnoverRate * d.volume) / maxSize
        : (d.volume * d.price) / maxSize;

    let flowDirection: HeatmapCell['flowDirection'];
    if (d.totalInflow > maxFlow * 0.05) flowDirection = 'inflow';
    else if (d.totalInflow < -maxFlow * 0.05) flowDirection = 'outflow';
    else flowDirection = 'neutral';

    let flowStrength: HeatmapCell['flowStrength'];
    const absIntensity = Math.abs(intensity);
    if (absIntensity > 0.6) flowStrength = 'strong';
    else if (absIntensity > 0.3) flowStrength = 'moderate';
    else flowStrength = 'weak';

    return {
      ticker: d.ticker,
      name: d.name,
      sector: d.sector,
      intensity,
      color: flowToColor(intensity, cfg.colorScheme),
      size,
      label: `${d.name}\n${(d.totalInflow / 1e8).toFixed(2)}亿`,
      flowDirection,
      flowStrength,
    };
  });
}

/**
 * 板块资金流汇总
 */
export function summarizeSectorFlows(data: FlowData[]): SectorFlowSummary[] {
  const bySector = new Map<string, FlowData[]>();
  data.forEach(d => {
    const list = bySector.get(d.sector) ?? [];
    list.push(d);
    bySector.set(d.sector, list);
  });

  return Array.from(bySector.entries()).map(([sector, items]) => {
    const netFlow = items.reduce((s, d) => s + d.totalInflow, 0);
    const inflowCount = items.filter(d => d.totalInflow > 0).length;
    const outflowCount = items.filter(d => d.totalInflow < 0).length;
    const avgChange = items.reduce((s, d) => s + d.priceChange, 0) / items.length;

    let topInflowItem = items[0];
    let topOutflowItem = items[0];
    items.forEach(d => {
      if (d.totalInflow > topInflowItem.totalInflow) topInflowItem = d;
      if (d.totalInflow < topOutflowItem.totalInflow) topOutflowItem = d;
    });

    let flowTrend: SectorFlowSummary['flowTrend'];
    if (inflowCount > outflowCount * 1.5) flowTrend = 'accumulating';
    else if (outflowCount > inflowCount * 1.5) flowTrend = 'distributing';
    else flowTrend = 'mixed';

    return {
      sector,
      netFlow,
      inflowCount,
      outflowCount,
      avgChange,
      flowTrend,
      topInflow: { ticker: topInflowItem.ticker, amount: topInflowItem.totalInflow },
      topOutflow: { ticker: topOutflowItem.ticker, amount: topOutflowItem.totalInflow },
    };
  }).sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow));
}

/**
 * 资金流动力分析
 */
export function analyzeFlowMomentum(
  ticker: string,
  currentFlow: number,
  flows5d: number[],
  flows20d: number[]
): FlowMomentum {
  const avg5d = flows5d.length > 0
    ? flows5d.reduce((s, v) => s + v, 0) / flows5d.length
    : currentFlow;
  const avg20d = flows20d.length > 0
    ? flows20d.reduce((s, v) => s + v, 0) / flows20d.length
    : currentFlow;

  const momentum = avg20d !== 0 ? currentFlow / avg20d : 1;

  // 加速度: 当前相对5日的偏离 / 5日相对20日的偏离
  const diff5 = avg5d - avg20d;
  const diffCurrent = currentFlow - avg5d;
  const acceleration = diff5 !== 0 ? diffCurrent / diff5 : 0;

  let signal: FlowMomentum['signal'];
  const isInflow = currentFlow > 0;
  if (isInflow) {
    if (acceleration > 0.2) signal = 'accelerating_in';
    else if (acceleration < -0.2) signal = 'decelerating_in';
    else signal = 'steady_in';
  } else {
    if (acceleration < -0.2) signal = 'accelerating_out';
    else if (acceleration > 0.2) signal = 'decelerating_out';
    else signal = 'steady_out';
  }

  return { ticker, currentFlow, avgFlow5d: avg5d, avgFlow20d: avg20d, momentum, acceleration, signal };
}

/**
 * 异常资金流检测
 */
export function detectAnomalousFlows(
  data: FlowData[],
  threshold: number = 2
): { ticker: string; anomaly: string; severity: 'high' | 'medium' | 'low' }[] {
  if (data.length < 3) return [];

  const mean = data.reduce((s, d) => s + d.totalInflow, 0) / data.length;
  const std = Math.sqrt(
    data.reduce((s, d) => s + (d.totalInflow - mean) ** 2, 0) / data.length
  );

  if (std === 0) return [];

  const anomalies: { ticker: string; anomaly: string; severity: 'high' | 'medium' | 'low' }[] = [];

  for (const d of data) {
    const zScore = (d.totalInflow - mean) / std;

    if (Math.abs(zScore) > threshold * 2) {
      anomalies.push({
        ticker: d.ticker,
        anomaly: zScore > 0
          ? `异常大额净流入 ${(d.totalInflow / 1e8).toFixed(2)}亿 (z=${zScore.toFixed(1)})`
          : `异常大额净流出 ${(Math.abs(d.totalInflow) / 1e8).toFixed(2)}亿 (z=${zScore.toFixed(1)})`,
        severity: 'high',
      });
    } else if (Math.abs(zScore) > threshold) {
      anomalies.push({
        ticker: d.ticker,
        anomaly: zScore > 0
          ? `显著净流入 ${(d.totalInflow / 1e8).toFixed(2)}亿`
          : `显著净流出 ${(Math.abs(d.totalInflow) / 1e8).toFixed(2)}亿`,
        severity: Math.abs(zScore) > threshold * 1.5 ? 'medium' : 'low',
      });
    }
  }

  return anomalies.sort((a, b) => {
    const sev = { high: 3, medium: 2, low: 1 };
    return sev[b.severity] - sev[a.severity];
  });
}
