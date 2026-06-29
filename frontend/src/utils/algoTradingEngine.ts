/**
 * 算法交易执行引擎 - TWAP/VWAP/冰山指令/狙击策略/PoV
 */

export interface AlgoOrder {
  id: string;
  stockCode: string;
  side: 'buy' | 'sell';
  totalQuantity: number;
  limitPrice?: number;
  startTime: string;
  endTime: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface ExecutionSlice {
  time: string;
  quantity: number;
  price: number;
  filled: boolean;
  orderRef: string;
}

export interface AlgoResult {
  orderId: string;
  strategy: string;
  totalFilled: number;
  avgPrice: number;
  vwap: number;
  arrivalPrice: number;
  implementationShortfall: number;
  participationRate: number;
  executionTime: number; // seconds
  slices: ExecutionSlice[];
  costAnalysis: {
    marketImpact: number;
    timing: number;
    spread: number;
    total: number;
  };
}

export interface IcebergConfig {
  displaySize: number;
  refreshThreshold: number; // percentage
  minDisplaySize: number;
  randomizeSize: boolean;
}

/**
 * TWAP执行计划
 */
export function generateTWAPSchedule(
  order: AlgoOrder,
  numSlices: number = 10,
): Array<{ time: string; quantity: number }> {
  const startTime = new Date(`2025-01-01T${order.startTime}`).getTime();
  const endTime = new Date(`2025-01-01T${order.endTime}`).getTime();
  const duration = endTime - startTime;
  const sliceInterval = duration / numSlices;

  const baseQty = Math.floor(order.totalQuantity / numSlices);
  const remainder = order.totalQuantity - baseQty * numSlices;

  const schedule: Array<{ time: string; quantity: number }> = [];
  for (let i = 0; i < numSlices; i++) {
    const t = new Date(startTime + i * sliceInterval);
    const hours = t.getHours().toString().padStart(2, '0');
    const mins = t.getMinutes().toString().padStart(2, '0');
    const secs = t.getSeconds().toString().padStart(2, '0');
    schedule.push({
      time: `${hours}:${mins}:${secs}`,
      quantity: i < remainder ? baseQty + 1 : baseQty,
    });
  }

  return schedule;
}

/**
 * VWAP执行计划 - 按成交量分布分配
 */
export function generateVWAPSchedule(
  order: AlgoOrder,
  volumeProfile: Array<{ time: string; volumePercent: number }>,
): Array<{ time: string; quantity: number }> {
  const totalPercent = volumeProfile.reduce((s, v) => s + v.volumePercent, 0);
  let remaining = order.totalQuantity;

  return volumeProfile.map((vp, i) => {
    const qty = i < volumeProfile.length - 1
      ? Math.floor(order.totalQuantity * (vp.volumePercent / totalPercent))
      : remaining;
    remaining -= qty;
    return { time: vp.time, quantity: qty };
  });
}

/**
 * 冰山指令切片
 */
export function generateIcebergSlices(
  order: AlgoOrder,
  config: IcebergConfig,
): Array<{ displayQty: number; hiddenQty: number }> {
  const slices: Array<{ displayQty: number; hiddenQty: number }> = [];
  let remaining = order.totalQuantity;

  while (remaining > 0) {
    let displayQty = config.displaySize;
    if (config.randomizeSize) {
      const variance = displayQty * 0.2;
      displayQty = Math.floor(displayQty + (Math.random() - 0.5) * variance);
      displayQty = Math.max(config.minDisplaySize, displayQty);
    }

    displayQty = Math.min(displayQty, remaining);
    const hiddenQty = Math.min(remaining - displayQty, displayQty * 3);
    slices.push({ displayQty, hiddenQty: Math.max(0, hiddenQty) });
    remaining -= displayQty + Math.max(0, hiddenQty);
  }

  return slices;
}

/**
 * 模拟执行并计算绩效
 */
export function simulateExecution(
  order: AlgoOrder,
  marketData: Array<{ time: string; price: number; volume: number }>,
  participationTarget: number = 0.1,
): AlgoResult {
  if (marketData.length === 0) {
    return {
      orderId: order.id,
      strategy: 'simulation',
      totalFilled: 0,
      avgPrice: 0,
      vwap: 0,
      arrivalPrice: 0,
      implementationShortfall: 0,
      participationRate: 0,
      executionTime: 0,
      slices: [],
      costAnalysis: { marketImpact: 0, timing: 0, spread: 0, total: 0 },
    };
  }

  const arrivalPrice = marketData[0].price;
  const slices: ExecutionSlice[] = [];
  let totalFilled = 0;
  let totalCost = 0;
  let remaining = order.totalQuantity;

  for (const tick of marketData) {
    if (remaining <= 0) break;

    const maxParticipation = tick.volume * participationTarget;
    const fillQty = Math.min(remaining, Math.floor(maxParticipation));
    if (fillQty <= 0) continue;

    // Apply slight slippage for urgency
    const slippage = order.urgency === 'high' ? 0.001 : order.urgency === 'medium' ? 0.0005 : 0;
    const fillPrice = order.side === 'buy'
      ? tick.price * (1 + slippage)
      : tick.price * (1 - slippage);

    slices.push({
      time: tick.time,
      quantity: fillQty,
      price: Math.round(fillPrice * 100) / 100,
      filled: true,
      orderRef: `${order.id}-${slices.length}`,
    });

    totalFilled += fillQty;
    totalCost += fillQty * fillPrice;
    remaining -= fillQty;
  }

  const avgPrice = totalFilled > 0 ? Math.round((totalCost / totalFilled) * 100) / 100 : 0;

  // VWAP calculation
  const totalVol = marketData.reduce((s, d) => s + d.volume, 0);
  const vwap = totalVol > 0
    ? Math.round((marketData.reduce((s, d) => s + d.price * d.volume, 0) / totalVol) * 100) / 100
    : avgPrice;

  // Implementation shortfall
  const isValue = order.side === 'buy'
    ? (avgPrice - arrivalPrice) / arrivalPrice
    : (arrivalPrice - avgPrice) / arrivalPrice;

  // Cost breakdown (simplified)
  const spread = 0.0005; // 5bps
  const marketImpact = Math.abs(isValue) * 0.5;
  const timing = Math.abs(isValue) - marketImpact - spread;

  return {
    orderId: order.id,
    strategy: 'pov',
    totalFilled,
    avgPrice,
    vwap,
    arrivalPrice,
    implementationShortfall: Math.round(isValue * 10000) / 10000,
    participationRate: totalFilled / (totalVol || 1),
    executionTime: slices.length > 0
      ? (new Date(`2025-01-01T${slices[slices.length - 1].time}`).getTime() -
         new Date(`2025-01-01T${slices[0].time}`).getTime()) / 1000
      : 0,
    slices,
    costAnalysis: {
      marketImpact: Math.round(marketImpact * 10000) / 10000,
      timing: Math.round(Math.max(0, timing) * 10000) / 10000,
      spread,
      total: Math.round((marketImpact + Math.max(0, timing) + spread) * 10000) / 10000,
    },
  };
}

/**
 * 狙击策略 - 寻找最优执行时机
 */
export function snipeExecution(
  order: AlgoOrder,
  marketData: Array<{ time: string; price: number; volume: number; bid: number; ask: number }>,
  targetSpread: number = 0.001,
): Array<{ time: string; score: number; recommendation: 'execute' | 'wait' }> {
  return marketData.map(tick => {
    const spread = (tick.ask - tick.bid) / ((tick.bid + tick.ask) / 2);
    const liquidity = tick.volume > 10000 ? 1 : tick.volume / 10000;
    const spreadScore = spread <= targetSpread ? 1 : targetSpread / spread;

    const score = Math.round((spreadScore * 0.5 + liquidity * 0.5) * 100) / 100;

    return {
      time: tick.time,
      score,
      recommendation: score > 0.7 ? 'execute' : 'wait',
    };
  });
}

// Helper (unused in actual - midPrice would be computed inline)
function _midPrice(bid: number, ask: number): number {
  return (bid + ask) / 2;
}

/**
 * 选择最优算法
 */
export function selectOptimalAlgo(
  order: AlgoOrder,
  marketConditions: {
    volatility: number;
    liquidity: number;
    spread: number;
    trend: 'up' | 'down' | 'flat';
  },
): {
  strategy: 'twap' | 'vwap' | 'iceberg' | 'pov' | 'snipe';
  reason: string;
  params: Record<string, number>;
} {
  // High urgency + tight spread → snipe
  if (order.urgency === 'high' && marketConditions.spread < 0.001) {
    return {
      strategy: 'snipe',
      reason: '高紧急度+窄价差，适合狙击策略',
      params: { targetSpread: marketConditions.spread },
    };
  }

  // Low volatility + good liquidity → TWAP
  if (marketConditions.volatility < 0.02 && marketConditions.liquidity > 0.7) {
    return {
      strategy: 'twap',
      reason: '低波动+高流动性，适合TWAP均匀执行',
      params: { numSlices: order.urgency === 'low' ? 20 : 10 },
    };
  }

  // High volatility → VWAP (follow volume)
  if (marketConditions.volatility > 0.03) {
    return {
      strategy: 'vwap',
      reason: '高波动环境，跟随成交量分布执行',
      params: { participationRate: 0.15 },
    };
  }

  // Large order → Iceberg
  if (order.totalQuantity > 100000) {
    return {
      strategy: 'iceberg',
      reason: '大单拆分，减少市场冲击',
      params: { displaySize: Math.floor(order.totalQuantity * 0.05) },
    };
  }

  // Default → POV
  return {
    strategy: 'pov',
    reason: '默认参与率策略',
    params: { participationRate: 0.1 },
  };
}
