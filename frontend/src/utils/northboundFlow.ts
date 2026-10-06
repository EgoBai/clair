/**
 * 北向资金追踪引擎
 * 沪股通 / 深股通 资金流向分析
 *
 * 诚实红线（与后端 backend/src/api/northBound.ts 对齐）：
 *  交易所自 2024-08-19 起停止披露北向「净买额」口径，`total` / `shConnect` / `szConnect`
 *  的真实取值恒为 `null`。因此这三个字段声明为 `number | null`，汇总结果同样可能为 `null`，
 *  **绝不允许用 0 顶替缺失**（0 会被页面渲染成「今日净流入 0.00 亿」，即零值顶替空态）。
 *  真实可得的口径是「成交额」，见 NorthBoundPage 的 `dealFlows` 消费路径。
 */

export interface NorthboundFlow {
  date: string;
  shConnect: number | null; // 沪股通净流入（亿元）；null = 上游已停止披露
  szConnect: number | null; // 深股通净流入（亿元）；null = 上游已停止披露
  /** 合计净流入（亿元）；null = 上游已停止披露，绝不用成交额或 0 顶替 */
  total: number | null;
  shBuy: number | null;
  shSell: number | null;
  szBuy: number | null;
  szSell: number | null;
}

export interface NorthboundHolding {
  ticker: string;
  name: string;
  shares: number;
  marketValue: number;
  changePercent: number; // 持仓变动%
  freeFloatRatio: number; // 占流通股比例
  sector: string;
}

export interface NorthboundSummary {
  /** 最新交易日净流入（亿元）；null = 上游已停止披露，不得回落 0 */
  todayNet: number | null;
  /** 近 5 日累计净流入（亿元）；窗口内任一天缺披露即整体为 null（不做部分和） */
  weekNet: number | null;
  /** 近 20 日累计净流入（亿元）；同上 */
  monthNet: number | null;
  /** 近 20 日日均净流入（亿元）；null = 不可得 */
  monthDayAvg: number | null;
  trend: 'inflow' | 'outflow' | 'neutral';
  /** 动量（近5日均值 / 近20日均值）；分母不可得或为 0 时为 null */
  momentum: number | null;
  consecutiveDays: number; // 连续流入/流出天数；不可得时为 0
  /**
   * 净流入口径是否真实可得。
   * false = 上游（交易所）已停止披露北向净买额，所有净流入字段均为 null，
   * 此时页面只能展示成交额，不得展示任何净流入数值。
   */
  netInflowDisclosed?: boolean;
}

/** 统一保留 2 位小数 */
const round2 = (x: number): number => Math.round(x * 100) / 100;

export interface TopHoldingsChange {
  topIncreased: NorthboundHolding[];
  topDecreased: NorthboundHolding[];
  topNewPositions: NorthboundHolding[];
  topExited: NorthboundHolding[];
}

/**
 * 计算北向资金汇总
 *
 * 诚实红线：`total` 为 `null` 表示交易所已停止披露该日净买额。
 *  - 单日缺失 → 该日相关聚合为 `null`，**不回落 0**
 *  - 窗口内存在缺失 → 整个窗口聚合为 `null`，不做「部分和」冒充完整值
 *  - 分母为 0 或不可得 → `momentum` 为 `null`，不用 `1` 顶替
 */
export function summarizeNorthboundFlow(flows: NorthboundFlow[]): NorthboundSummary {
  if (flows.length === 0) {
    return {
      todayNet: null,
      weekNet: null,
      monthNet: null,
      monthDayAvg: null,
      trend: 'neutral',
      momentum: null,
      consecutiveDays: 0,
      netInflowDisclosed: false,
    };
  }

  const sorted = [...flows].sort((a, b) => b.date.localeCompare(a.date));

  /** 窗口聚合：任一天缺披露即整体不可得（null），绝不用部分和或 0 顶替 */
  const sumWindow = (win: NorthboundFlow[]): number | null => {
    if (win.length === 0) return null;
    let acc = 0;
    for (const f of win) {
      if (f.total === null || f.total === undefined) return null;
      acc += f.total;
    }
    return round2(acc);
  };

  const today = sorted[0]?.total ?? null;
  const weekFlows = sorted.slice(0, 5);
  const monthFlows = sorted.slice(0, 20);

  const weekNet = sumWindow(weekFlows);
  const monthNet = sumWindow(monthFlows);
  const monthDayAvg =
    monthNet === null || monthFlows.length === 0 ? null : round2(monthNet / monthFlows.length);

  // 趋势判断：日均不可得时一律 neutral（不猜方向）
  let trend: 'inflow' | 'outflow' | 'neutral';
  if (monthDayAvg === null) trend = 'neutral';
  else if (monthDayAvg > 5) trend = 'inflow';
  else if (monthDayAvg < -5) trend = 'outflow';
  else trend = 'neutral';

  // 动量 = 近5日均值 / 近20日均值；任一不可得或分母为 0 → null
  let momentum: number | null = null;
  if (weekNet !== null && monthDayAvg !== null && monthDayAvg !== 0) {
    momentum = round2(weekNet / weekFlows.length / monthDayAvg);
  }

  // 连续天数：从最新一天往回，遇到 null（方向未知）即中断
  let consecutiveDays = 0;
  const latest = sorted[0]?.total ?? null;
  const lastDirection = latest === null ? null : latest > 0 ? 'in' : latest < 0 ? 'out' : 'neutral';
  if (lastDirection !== null && lastDirection !== 'neutral') {
    for (const f of sorted) {
      if (f.total === null || f.total === undefined) break;
      const dir = f.total > 0 ? 'in' : f.total < 0 ? 'out' : 'neutral';
      if (dir === lastDirection) consecutiveDays++;
      else break;
    }
  }

  return {
    todayNet: today === null ? null : round2(today),
    weekNet,
    monthNet,
    monthDayAvg,
    trend,
    momentum,
    consecutiveDays,
    netInflowDisclosed: flows.some((f) => f.total !== null && f.total !== undefined),
  };
}

/**
 * 持仓变动分析
 */
export function analyzeHoldingsChanges(
  current: NorthboundHolding[],
  previous: NorthboundHolding[]
): TopHoldingsChange {
  const prevMap = new Map(previous.map((h) => [h.ticker, h]));

  const topIncreased: NorthboundHolding[] = [];
  const topDecreased: NorthboundHolding[] = [];
  const topNewPositions: NorthboundHolding[] = [];

  for (const holding of current) {
    const prev = prevMap.get(holding.ticker);
    if (!prev) {
      topNewPositions.push({ ...holding, changePercent: 100 });
    } else {
      const changePct =
        prev.shares !== 0 ? ((holding.shares - prev.shares) / prev.shares) * 100 : 100;
      const item = { ...holding, changePercent: Math.round(changePct * 100) / 100 };
      if (changePct > 0) topIncreased.push(item);
      else topDecreased.push(item);
    }
  }

  const currMap = new Map(current.map((h) => [h.ticker, h]));
  const topExited = previous
    .filter((h) => !currMap.has(h.ticker))
    .map((h) => ({ ...h, shares: 0, marketValue: 0, changePercent: -100 }));

  const sortDesc = (a: NorthboundHolding, b: NorthboundHolding) =>
    Math.abs(b.changePercent) - Math.abs(a.changePercent);

  return {
    topIncreased: topIncreased.sort(sortDesc).slice(0, 10),
    topDecreased: topDecreased.sort(sortDesc).slice(0, 10),
    topNewPositions: topNewPositions.sort(sortDesc).slice(0, 10),
    topExited: topExited.sort(sortDesc).slice(0, 10),
  };
}

/**
 * 板块资金流向聚合
 */
export function sectorFlowAggregation(
  holdings: NorthboundHolding[]
): { sector: string; totalValue: number; count: number; avgChange: number }[] {
  const sectorMap = new Map<string, { totalValue: number; count: number; changes: number[] }>();

  for (const h of holdings) {
    const existing = sectorMap.get(h.sector) ?? { totalValue: 0, count: 0, changes: [] };
    existing.totalValue += h.marketValue;
    existing.count++;
    existing.changes.push(h.changePercent);
    sectorMap.set(h.sector, existing);
  }

  return Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      totalValue: Math.round(data.totalValue * 100) / 100,
      count: data.count,
      avgChange:
        Math.round(
          (data.changes.reduce((a, b) => a + b, 0) / data.changes.length) * 100
        ) / 100,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * 北向资金信号生成
 */
export interface NorthboundSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  message: string;
}

/** 可选数值守卫：null / undefined 一律视为「不可得」，绝不参与比较与算术 */
const has = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * 由汇总生成北向资金信号
 *
 * 诚实红线：`summary.netInflowDisclosed === false`（或所有净流入字段均缺失）时，
 * **一条方向性信号都不生成** —— 净买额口径已停披露，无从判断流入/流出。
 * 只返回一条说明性中性信号，避免用「均衡」暗示「有数据但持平」。
 */
export function generateNorthboundSignals(summary: NorthboundSummary): NorthboundSignal[] {
  const signals: NorthboundSignal[] = [];

  const disclosed = summary.netInflowDisclosed !== false && has(summary.monthDayAvg);
  if (!disclosed) {
    return [
      {
        type: 'neutral',
        strength: 0,
        message: '净买额口径已停止披露，无法生成流入/流出方向信号；本页仅展示成交额等真实可得口径',
      },
    ];
  }

  // 连续流入信号
  if (summary.consecutiveDays >= 5 && summary.trend === 'inflow') {
    signals.push({
      type: 'bullish',
      strength: Math.min(90, 50 + summary.consecutiveDays * 5),
      message: `北向资金连续${summary.consecutiveDays}日净流入，外资持续加仓`,
    });
  }

  // 连续流出信号
  if (summary.consecutiveDays >= 5 && summary.trend === 'outflow') {
    signals.push({
      type: 'bearish',
      strength: Math.min(90, 50 + summary.consecutiveDays * 5),
      message: `北向资金连续${summary.consecutiveDays}日净流出，外资持续撤退`,
    });
  }

  // 动量加速（动量不可得时不出信号）
  if (has(summary.momentum) && summary.momentum > 1.5 && summary.trend === 'inflow') {
    signals.push({
      type: 'bullish',
      strength: Math.min(85, 40 + summary.momentum * 20),
      message: `北向资金流入动量加速，周均值为月均值的${summary.momentum.toFixed(1)}倍`,
    });
  }

  // 动量减速（动量不可得时不出信号）
  if (has(summary.momentum) && summary.momentum < 0.5 && summary.trend === 'inflow') {
    signals.push({
      type: 'bearish',
      strength: 55,
      message: '北向资金流入动量减弱，需关注是否转为流出',
    });
  }

  // 大额流入
  if (has(summary.todayNet) && summary.todayNet > 100) {
    signals.push({
      type: 'bullish',
      strength: Math.min(80, 50 + summary.todayNet / 10),
      message: `今日北向资金大幅净流入${summary.todayNet}亿，强势买入`,
    });
  }

  // 大额流出
  if (has(summary.todayNet) && summary.todayNet < -100) {
    signals.push({
      type: 'bearish',
      strength: Math.min(80, 50 + Math.abs(summary.todayNet) / 10),
      message: `今日北向资金大幅净流出${Math.abs(summary.todayNet)}亿，强烈卖出`,
    });
  }

  if (signals.length === 0) {
    signals.push({
      type: 'neutral',
      strength: 50,
      message: '北向资金流入流出均衡，无明显方向性信号',
    });
  }

  return signals;
}
