/**
 * 订单流不平衡引擎
 * - 主动买卖识别
 * - 订单流不平衡(OFR)
 * - 大单跟踪
 * - 流动性消耗
 * - 价格影响预测
 */
export interface Trade {
  price: number;
  volume: number;
  timestamp: number;
  aggressor: 'buy' | 'sell' | 'unknown';
}

export interface OrderFlowMetrics {
  buyVolume: number;
  sellVolume: number;
  netOrderFlow: number;
  ofrRatio: number; // 买量/卖量
  vwapBuy: number;
  vwapSell: number;
  aggressiveBuy: number;
  aggressiveSell: number;
  largeOrderImbalance: number;
  liquidityConsumption: number;
}

export interface OFRSignal {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1
  persistence: number; // 持续性
  priceImpact: number; // 预期价格影响
  largeOrderSignal: boolean;
  exhaustionSignal: boolean;
}

export function analyzeOrderFlow(trades: Trade[]): { metrics: OrderFlowMetrics; signal: OFRSignal } {
  if (trades.length === 0) throw new Error('交易数据不能为空');

  let buyVolume = 0, sellVolume = 0;
  let buyValue = 0, sellValue = 0;
  let aggressiveBuy = 0, aggressiveSell = 0;
  const largeOrders: Trade[] = [];

  const avgSize = trades.reduce((s, t) => s + t.volume, 0) / trades.length;
  const largeThreshold = avgSize * 3;

  for (const t of trades) {
    if (t.aggressor === 'buy') {
      buyVolume += t.volume;
      buyValue += t.price * t.volume;
      aggressiveBuy += t.volume;
    } else if (t.aggressor === 'sell') {
      sellVolume += t.volume;
      sellValue += t.price * t.volume;
      aggressiveSell += t.volume;
    }

    if (t.volume > largeThreshold) {
      largeOrders.push(t);
    }
  }

  const netOrderFlow = buyVolume - sellVolume;
  const ofrRatio = sellVolume > 0 ? buyVolume / sellVolume : buyVolume > 0 ? Infinity : 1;
  const vwapBuy = buyVolume > 0 ? buyValue / buyVolume : 0;
  const vwapSell = sellVolume > 0 ? sellValue / sellVolume : 0;

  const largeBuyLarge = largeOrders.filter(t => t.aggressor === 'buy').reduce((s, t) => s + t.volume, 0);
  const largeSellLarge = largeOrders.filter(t => t.aggressor === 'sell').reduce((s, t) => s + t.volume, 0);
  const largeOrderImbalance = largeBuyLarge - largeSellLarge;

  const totalVolume = buyVolume + sellVolume;
  const liquidityConsumption = totalVolume > 0
    ? (aggressiveBuy + aggressiveSell) / totalVolume
    : 0;

  const metrics: OrderFlowMetrics = {
    buyVolume, sellVolume, netOrderFlow, ofrRatio,
    vwapBuy, vwapSell, aggressiveBuy, aggressiveSell,
    largeOrderImbalance, liquidityConsumption,
  };

  // 信号
  const flowRatio = totalVolume > 0 ? netOrderFlow / totalVolume : 0;
  const direction = flowRatio > 0.1 ? 'bullish' : flowRatio < -0.1 ? 'bearish' : 'neutral';
  const strength = Math.min(1, Math.abs(flowRatio) * 3);

  // 持续性 (基于窗口分析)
  const windowSize = Math.max(1, Math.floor(trades.length / 5));
  let persistence = 0;
  for (let i = 0; i < trades.length - windowSize; i += windowSize) {
    const window = trades.slice(i, i + windowSize);
    const wBuy = window.filter(t => t.aggressor === 'buy').reduce((s, t) => s + t.volume, 0);
    const wSell = window.filter(t => t.aggressor === 'sell').reduce((s, t) => s + t.volume, 0);
    const wDir = wBuy > wSell ? 1 : -1;
    if ((flowRatio > 0 && wDir > 0) || (flowRatio < 0 && wDir < 0)) {
      persistence++;
    }
  }
  persistence = persistence / Math.max(1, Math.floor(trades.length / windowSize));

  // 预期价格影响
  const priceImpact = Math.abs(flowRatio) * 0.5;

  // 大单信号
  const largeOrderSignal = Math.abs(largeOrderImbalance) > avgSize * 10;

  // 衰竭信号 (反向大单)
  const lastThird = trades.slice(-Math.floor(trades.length / 3));
  const lastBuy = lastThird.filter(t => t.aggressor === 'buy').reduce((s, t) => s + t.volume, 0);
  const lastSell = lastThird.filter(t => t.aggressor === 'sell').reduce((s, t) => s + t.volume, 0);
  const exhaustionSignal = (flowRatio > 0.2 && lastSell > lastBuy) || (flowRatio < -0.2 && lastBuy > lastSell);

  const signal: OFRSignal = { direction, strength, persistence, priceImpact, largeOrderSignal, exhaustionSignal };

  return { metrics, signal };
}
