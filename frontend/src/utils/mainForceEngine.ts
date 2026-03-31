/**
 * 主力资金行为识别引擎
 * 大单追踪/主力吸筹/出货/对倒/锁仓识别/资金流向预测
 */

// ── 类型定义 ──

export interface TradeRecord {
  time: string;              // HH:mm
  price: number;
  volume: number;            // 手
  amount: number;            // 元
  direction: 'buy' | 'sell' | 'neutral';
  isLargeOrder: boolean;     // 是否大单
}

export interface CapitalFlowSnapshot {
  time: string;
  mainInflow: number;        // 主力流入(万)
  mainOutflow: number;       // 主力流出(万)
  retailInflow: number;      // 散户流入
  retailOutflow: number;     // 散户流出
  netMainFlow: number;       // 主力净流入
  netRetailFlow: number;     // 散户净流入
  mainActivity: number;      // 主力活跃度 0-1
}

export type BehaviorType =
  | 'accumulation'           // 吸筹
  | 'distribution'           // 出货
  | 'wash_sale'              // 对倒
  | 'lockup'                 // 锁仓
  | 'test_pressure'          // 试盘(测试上方压力)
  | 'shakeout'               // 洗盘
  | 'limit_up_seal'          // 涨停板封板
  | 'limit_down_seal'        // 跌停板封板
  | 'gap_up'                 // 高开吸货
  | 'silent_accumulation';   // 隐蔽吸筹

export interface MainForceBehavior {
  type: BehaviorType;
  confidence: number;        // 0-1
  startTime: string;
  endTime: string;
  volume: number;
  avgPrice: number;
  description: string;
  implications: string[];    // 对后市的含义
  signal: 'bullish' | 'bearish' | 'neutral';
}

export interface LargeOrderAnalysis {
  totalLargeOrders: number;
  largeBuyOrders: number;
  largeSellOrders: number;
  largeOrderRatio: number;   // 大单占比
  netLargeFlow: number;      // 大单净额
  avgLargeOrderSize: number;
  consecutiveBuyCount: number; // 连续买入大单数
  consecutiveSellCount: number;
  largeOrderPattern: 'accumulating' | 'distributing' | 'mixed' | 'inactive';
}

export interface VolumePriceAnalysis {
  priceChange: number;
  volumeChange: number;
  volumePriceRelation: 'volume_up_price_up' | 'volume_up_price_down' | 'volume_down_price_up' | 'volume_down_price_down' | 'normal';
  abnormality: boolean;
  abnormalityType: string;
  implication: string;
}

export interface ChipDistribution {
  avgCost: number;
  medianCost: number;
  profitableRatio: number;   // 获利比例
  costConcentration: number; // 成本集中度
  highCostZone: { low: number; high: number; ratio: number };
  mainCostZone: { low: number; high: number; ratio: number };
  pressureLevel: number;     // 套牢盘压力 0-1
  supportLevel: number;      // 获利盘支撑 0-1
}

export interface FlowPrediction {
  predictedNetFlow: number;
  direction: 'inflow' | 'outflow' | 'neutral';
  confidence: number;
  timeframe: string;
  factors: string[];
}

// ── 大单分析 ──

const LARGE_ORDER_THRESHOLD = 100000; // 10万元为大单

export function analyzeLargeOrders(trades: TradeRecord[]): LargeOrderAnalysis {
  const largeOrders = trades.filter(t => t.isLargeOrder || t.amount >= LARGE_ORDER_THRESHOLD);
  const largeBuys = largeOrders.filter(t => t.direction === 'buy');
  const largeSells = largeOrders.filter(t => t.direction === 'sell');

  const netLargeFlow = largeBuys.reduce((a, t) => a + t.amount, 0) -
    largeSells.reduce((a, t) => a + t.amount, 0);

  const avgLargeOrderSize = largeOrders.length > 0
    ? largeOrders.reduce((a, t) => a + t.amount, 0) / largeOrders.length
    : 0;

  const largeOrderRatio = trades.length > 0 ? largeOrders.length / trades.length : 0;

  // 连续大单统计
  let consecutiveBuy = 0, maxConsecutiveBuy = 0;
  let consecutiveSell = 0, maxConsecutiveSell = 0;
  for (const t of trades) {
    if (t.isLargeOrder || t.amount >= LARGE_ORDER_THRESHOLD) {
      if (t.direction === 'buy') {
        consecutiveBuy++;
        consecutiveSell = 0;
        maxConsecutiveBuy = Math.max(maxConsecutiveBuy, consecutiveBuy);
      } else if (t.direction === 'sell') {
        consecutiveSell++;
        consecutiveBuy = 0;
        maxConsecutiveSell = Math.max(maxConsecutiveSell, consecutiveSell);
      }
    }
  }

  let pattern: LargeOrderAnalysis['largeOrderPattern'];
  if (largeBuys.length > largeSells.length * 1.5) pattern = 'accumulating';
  else if (largeSells.length > largeBuys.length * 1.5) pattern = 'distributing';
  else if (largeOrders.length < 5) pattern = 'inactive';
  else pattern = 'mixed';

  return {
    totalLargeOrders: largeOrders.length,
    largeBuyOrders: largeBuys.length,
    largeSellOrders: largeSells.length,
    largeOrderRatio: roundTo(largeOrderRatio, 4),
    netLargeFlow: roundTo(netLargeFlow, 0),
    avgLargeOrderSize: roundTo(avgLargeOrderSize, 0),
    consecutiveBuyCount: maxConsecutiveBuy,
    consecutiveSellCount: maxConsecutiveSell,
    largeOrderPattern: pattern,
  };
}

// ── 主力行为识别 ──

export function identifyMainForceBehavior(
  trades: TradeRecord[],
  priceChange: number,
  volumeChange: number,
  isLimitUp: boolean,
  isLimitDown: boolean
): MainForceBehavior[] {
  const behaviors: MainForceBehavior[] = [];
  const largeAnalysis = analyzeLargeOrders(trades);

  const startTime = trades.length > 0 ? trades[0].time : '09:30';
  const endTime = trades.length > 0 ? trades[trades.length - 1].time : '15:00';
  const totalVolume = trades.reduce((a, t) => a + t.volume, 0);
  const avgPrice = trades.reduce((a, t) => a + t.price * t.volume, 0) / Math.max(totalVolume, 1);

  // 吸筹识别: 大单买入为主 + 价格温和上涨 + 放量
  if (largeAnalysis.largeOrderPattern === 'accumulating' &&
      priceChange > 0 && priceChange < 0.03 && volumeChange > 0.2) {
    behaviors.push({
      type: 'accumulation',
      confidence: 0.7,
      startTime,
      endTime,
      volume: totalVolume,
      avgPrice: roundTo(avgPrice, 2),
      description: '主力温和吸筹，大单买入明显，价格未大幅拉升',
      implications: ['后续可能启动拉升行情', '关注放量突破信号'],
      signal: 'bullish',
    });
  }

  // 出货识别: 大单卖出为主 + 高位放量
  if (largeAnalysis.largeOrderPattern === 'distributing' && volumeChange > 0.3) {
    behaviors.push({
      type: 'distribution',
      confidence: 0.65,
      startTime,
      endTime,
      volume: totalVolume,
      avgPrice: roundTo(avgPrice, 2),
      description: '主力出货迹象，大单抛压明显',
      implications: ['短期可能面临调整', '注意止损'],
      signal: 'bearish',
    });
  }

  // 对倒识别: 大单买卖交替出现 + 价格波动小
  if (largeAnalysis.largeBuyOrders > 5 && largeAnalysis.largeSellOrders > 5 &&
      Math.abs(priceChange) < 0.01 && largeAnalysis.totalLargeOrders > 15) {
    behaviors.push({
      type: 'wash_sale',
      confidence: 0.6,
      startTime,
      endTime,
      volume: totalVolume,
      avgPrice: roundTo(avgPrice, 2),
      description: '对倒行为明显，大单买卖频繁但价格波动小',
      implications: ['可能是制造成交量假象', '真实意图需结合K线位置判断'],
      signal: 'neutral',
    });
  }

  // 涨停封板
  if (isLimitUp) {
    const sealStrength = largeAnalysis.netLargeFlow > 0 ? 0.9 : 0.7;
    behaviors.push({
      type: 'limit_up_seal',
      confidence: sealStrength,
      startTime,
      endTime,
      volume: totalVolume,
      avgPrice: roundTo(avgPrice, 2),
      description: '涨停板封板，主力控盘度高',
      implications: ['次日大概率高开', '封板资金越大连续性越强'],
      signal: 'bullish',
    });
  }

  // 跌停封板
  if (isLimitDown) {
    behaviors.push({
      type: 'limit_down_seal',
      confidence: 0.85,
      startTime,
      endTime,
      volume: totalVolume,
      avgPrice: roundTo(avgPrice, 2),
      description: '跌停板封板，抛压沉重',
      implications: ['次日大概率低开', '远离或等待企稳'],
      signal: 'bearish',
    });
  }

  // 洗盘识别: 盘中大幅震荡 + 尾盘拉回 + 缩量
  if (Math.abs(priceChange) < 0.01 && volumeChange < -0.2) {
    behaviors.push({
      type: 'shakeout',
      confidence: 0.55,
      startTime,
      endTime,
      volume: totalVolume,
      avgPrice: roundTo(avgPrice, 2),
      description: '缩量震荡洗盘特征',
      implications: ['清洗浮筹后可能继续上行', '不破支撑位可持有'],
      signal: 'bullish',
    });
  }

  // 试盘: 快速拉升后回落
  if (priceChange > 0.03 && largeAnalysis.consecutiveBuyCount >= 3) {
    behaviors.push({
      type: 'test_pressure',
      confidence: 0.5,
      startTime,
      endTime,
      volume: totalVolume,
      avgPrice: roundTo(avgPrice, 2),
      description: '主力试盘，测试上方压力位',
      implications: ['突破后可能加速上涨', '回落则需等待再次蓄势'],
      signal: 'neutral',
    });
  }

  // 锁仓: 大单极度缩量 + 价格横盘
  if (largeAnalysis.totalLargeOrders < 3 && Math.abs(priceChange) < 0.005 && trades.length > 50) {
    behaviors.push({
      type: 'lockup',
      confidence: 0.5,
      startTime,
      endTime,
      volume: totalVolume,
      avgPrice: roundTo(avgPrice, 2),
      description: '主力锁仓不动，筹码高度锁定',
      implications: ['变盘信号即将出现', '突破方向决定趋势'],
      signal: 'neutral',
    });
  }

  return behaviors;
}

// ── 量价关系分析 ──

export function analyzeVolumePrice(
  priceChange: number,
  volumeChange: number,
  avgVolume: number,
  currentVolume: number
): VolumePriceAnalysis {
  let relation: VolumePriceAnalysis['volumePriceRelation'];
  const isVolumeUp = volumeChange > 0.2;
  const isPriceUp = priceChange > 0;

  if (isVolumeUp && isPriceUp) relation = 'volume_up_price_up';
  else if (isVolumeUp && !isPriceUp) relation = 'volume_up_price_down';
  else if (!isVolumeUp && isPriceUp) relation = 'volume_down_price_up';
  else relation = 'volume_down_price_down';

  const volumeRatio = currentVolume / Math.max(avgVolume, 1);
  const abnormality = volumeRatio > 2.5 || volumeRatio < 0.3;

  let abnormalityType = '';
  let implication = '';

  if (volumeRatio > 3) {
    abnormalityType = '天量';
    implication = isPriceUp ? '天量上涨，关注是否主力出货' : '天量下跌，恐慌抛售，可能超跌';
  } else if (volumeRatio > 2) {
    abnormalityType = '显著放量';
    implication = isPriceUp ? '放量上涨，趋势确认' : '放量下跌，加速下跌';
  } else if (volumeRatio < 0.3) {
    abnormalityType = '极度缩量';
    implication = '极度缩量，变盘在即';
  } else if (volumeRatio < 0.5) {
    abnormalityType = '缩量';
    implication = isPriceUp ? '缩量上涨，动力不足' : '缩量下跌，卖压减弱';
  }

  if (!abnormalityType) {
    switch (relation) {
      case 'volume_up_price_up':
        implication = '量价齐升，多头格局';
        break;
      case 'volume_up_price_down':
        implication = '量增价跌，空头占优';
        break;
      case 'volume_down_price_up':
        implication = '量缩价涨，上涨乏力';
        break;
      case 'volume_down_price_down':
        implication = '量缩价跌，观望情绪';
        break;
    }
  }

  return {
    priceChange: roundTo(priceChange, 4),
    volumeChange: roundTo(volumeChange, 4),
    volumePriceRelation: relation,
    abnormality,
    abnormalityType,
    implication,
  };
}

// ── 筹码分布分析 ──

export function analyzeChipDistribution(
  trades: TradeRecord[],
  currentPrice: number
): ChipDistribution {
  if (trades.length === 0) {
    return {
      avgCost: currentPrice, medianCost: currentPrice,
      profitableRatio: 0.5, costConcentration: 0.5,
      highCostZone: { low: currentPrice * 0.9, high: currentPrice * 1.1, ratio: 0.5 },
      mainCostZone: { low: currentPrice * 0.95, high: currentPrice * 1.05, ratio: 0.5 },
      pressureLevel: 0.5, supportLevel: 0.5,
    };
  }

  const prices = trades.map(t => t.price);
  const volumes = trades.map(t => t.volume);
  const totalVolume = volumes.reduce((a, b) => a + b, 0);

  // 加权平均成本
  const avgCost = trades.reduce((a, t) => a + t.price * t.volume, 0) / totalVolume;

  // 中位数成本
  const sortedByPrice = [...trades].sort((a, b) => a.price - b.price);
  let cumVol = 0;
  let medianCost = currentPrice;
  for (const t of sortedByPrice) {
    cumVol += t.volume;
    if (cumVol >= totalVolume / 2) {
      medianCost = t.price;
      break;
    }
  }

  // 获利比例
  const profitVol = trades.filter(t => t.price < currentPrice).reduce((a, t) => a + t.volume, 0);
  const profitableRatio = profitVol / totalVolume;

  // 成本集中度 (90%筹码的价格区间宽度)
  const sorted = [...trades].sort((a, b) => a.price - b.price);
  let p5 = currentPrice, p95 = currentPrice;
  let cum = 0;
  for (const t of sorted) {
    cum += t.volume;
    if (cum / totalVolume >= 0.05 && p5 === currentPrice) p5 = t.price;
    if (cum / totalVolume >= 0.95) { p95 = t.price; break; }
  }
  const costConcentration = 1 - (p95 - p5) / currentPrice;

  // 成本区间
  const highCostZone = { low: avgCost * 0.95, high: avgCost * 1.05, ratio: 0.6 };
  const mainCostZone = { low: medianCost * 0.97, high: medianCost * 1.03, ratio: 0.4 };

  const pressureLevel = roundTo(1 - profitableRatio, 2);
  const supportLevel = roundTo(profitableRatio, 2);

  return {
    avgCost: roundTo(avgCost, 2),
    medianCost: roundTo(medianCost, 2),
    profitableRatio: roundTo(profitableRatio, 4),
    costConcentration: roundTo(costConcentration, 4),
    highCostZone,
    mainCostZone,
    pressureLevel,
    supportLevel,
  };
}

// ── 资金流向快照 ──

export function generateFlowSnapshot(trades: TradeRecord[]): CapitalFlowSnapshot {
  const largeOrders = trades.filter(t => t.isLargeOrder || t.amount >= LARGE_ORDER_THRESHOLD);
  const retailOrders = trades.filter(t => !t.isLargeOrder && t.amount < LARGE_ORDER_THRESHOLD);

  const mainBuyAmount = largeOrders.filter(t => t.direction === 'buy').reduce((a, t) => a + t.amount, 0);
  const mainSellAmount = largeOrders.filter(t => t.direction === 'sell').reduce((a, t) => a + t.amount, 0);
  const retailBuyAmount = retailOrders.filter(t => t.direction === 'buy').reduce((a, t) => a + t.amount, 0);
  const retailSellAmount = retailOrders.filter(t => t.direction === 'sell').reduce((a, t) => a + t.amount, 0);

  const totalAmount = trades.reduce((a, t) => a + t.amount, 0);
  const mainActivity = totalAmount > 0
    ? (mainBuyAmount + mainSellAmount) / totalAmount : 0;

  const time = trades.length > 0 ? trades[trades.length - 1].time : '15:00';

  return {
    time,
    mainInflow: roundTo(mainBuyAmount / 10000, 2),
    mainOutflow: roundTo(mainSellAmount / 10000, 2),
    retailInflow: roundTo(retailBuyAmount / 10000, 2),
    retailOutflow: roundTo(retailSellAmount / 10000, 2),
    netMainFlow: roundTo((mainBuyAmount - mainSellAmount) / 10000, 2),
    netRetailFlow: roundTo((retailBuyAmount - retailSellAmount) / 10000, 2),
    mainActivity: roundTo(mainActivity, 4),
  };
}

// ── 资金流向预测 ──

export function predictFlow(
  snapshots: CapitalFlowSnapshot[],
  behaviors: MainForceBehavior[]
): FlowPrediction {
  if (snapshots.length === 0) {
    return {
      predictedNetFlow: 0,
      direction: 'neutral',
      confidence: 0.3,
      timeframe: '未来1-3日',
      factors: ['数据不足'],
    };
  }

  const recentFlows = snapshots.slice(-5);
  const avgNetFlow = recentFlows.reduce((a, s) => a + s.netMainFlow, 0) / recentFlows.length;
  const trend = recentFlows.length > 1
    ? recentFlows[recentFlows.length - 1].netMainFlow - recentFlows[0].netMainFlow
    : 0;

  const factors: string[] = [];
  let predictedFlow = avgNetFlow;

  // 行为信号调整
  for (const b of behaviors) {
    if (b.signal === 'bullish') {
      predictedFlow += 500;
      factors.push(b.description);
    } else if (b.signal === 'bearish') {
      predictedFlow -= 500;
      factors.push(b.description);
    }
  }

  // 趋势调整
  if (trend > 0) {
    predictedFlow += trend * 0.5;
    factors.push('主力资金呈流入趋势');
  } else {
    predictedFlow += trend * 0.3;
    factors.push('主力资金呈流出趋势');
  }

  const direction = predictedFlow > 100 ? 'inflow' : predictedFlow < -100 ? 'outflow' : 'neutral';
  const confidence = Math.min(0.9, 0.4 + Math.abs(predictedFlow) / 5000);

  return {
    predictedNetFlow: roundTo(predictedFlow, 2),
    direction,
    confidence: roundTo(confidence, 2),
    timeframe: '未来1-3日',
    factors,
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
