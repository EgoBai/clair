/**
 * OrderFlowToxicityEngine - 订单流毒性引擎
 * 
 * 对标 TradingView / Bloomberg 市场微观结构指标:
 * - BVC (Bulk Volume Classification) 订单方向判定
 * - EMA-Smoothed VPIN (Volume-Synchronized Probability of Informed Trading)
 * - Lee-Mykland 统计量 (瞬时信息冲击)
 * - 累计委托单不平衡 (Cumulative Delta)
 * - 滚动 VWAP 与 Amihud 非流动性指标
 * - 交易强度 (Trade Intensity / Arrival Rate)
 * - Kyle's Lambda (价格冲击系数)
 */

export interface Trade {
  price: number;
  volume: number;
  timestamp: number;
  aggressor?: 'BUY' | 'SELL' | 'UNKNOWN';
}

export interface OrderFlowSnapshot {
  timestamp: number;
  vpin: number;
  vpinSmoothed: number;
  cumulativeDelta: number;
  deltaPct: number;
  tradeImbalance: number;
  kyleLambda: number;
  leeMyklandStat: number;
  tradeIntensity: number;
  rollingVwap: number;
  amihudIlliquidity: number;
  toxicityLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
}

export interface LargeOrderEvent {
  timestamp: number;
  side: 'BUY' | 'SELL';
  volume: number;
  price: number;
  notionalValue: number;
  vpinAtTime: number;
}

export interface DepthProfile {
  price: number;
  bidCumulative: number;
  askCumulative: number;
  imbalance: number;
}

// ────────────────────────────────────────────────────────────
// Trade Classification (Tick Rule + BVC hybrid)
// ────────────────────────────────────────────────────────────

/**
 * Tick Rule: price >= prevPrice → BUY, else SELL
 * Bloomberg 标准: 以中间价变化方向推断成交方向
 */
export function classifyTrade(trade: Trade, prevPrice: number): 'BUY' | 'SELL' {
  return trade.price >= prevPrice ? 'BUY' : 'SELL';
}

/**
 * BVC (Bulk Volume Classification)
 * 
 * 使用标准正态分布CDF来概率性分类交易:
 * P(BUY) = Φ(Δp / (σ * √n))
 * 
 * 比简单tick rule更精确, 尤其在高频数据中
 * 
 * @param priceChange 价格变化
 * @param volatility 滚动波动率
 * @param volume 交易量
 * @returns 'BUY' | 'SELL' | 'UNKNOWN'
 */
export function classifyBVC(
  priceChange: number,
  volatility: number,
  volume: number = 1
): 'BUY' | 'SELL' | 'UNKNOWN' {
  if (volatility <= 0) return priceChange >= 0 ? 'BUY' : 'SELL';
  const zScore = priceChange / (volatility * Math.sqrt(volume));
  const probability = normalCDF(zScore);
  if (probability > 0.65) return 'BUY';
  if (probability < 0.35) return 'SELL';
  return 'UNKNOWN';
}

/**
 * 标准正态分布CDF (Abramowitz & Stegun 近似)
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/**
 * 滚动波动率 (对数收益率标准差)
 */
export function calcRollingVolatility(prices: number[], window: number = 20): number {
  if (prices.length < 2) return 0;
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  if (logReturns.length < window) window = logReturns.length;
  if (window < 2) return 0;
  const slice = logReturns.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (slice.length - 1);
  return Math.sqrt(variance);
}

// ────────────────────────────────────────────────────────────
// VPIN (Volume-Synchronized Probability of Informed Trading)
// ────────────────────────────────────────────────────────────

/**
 * 基础 VPIN — 按固定成交量桶分割
 * 
 * VPIN = E[|V_buy - V_sell|] / V_bucket
 * 
 * Easley et al. (2012) 提出, 用于度量知情交易概率
 * 高 VPIN 预示着潜在的价格剧烈波动 (flash crash indicator)
 */
export function calcVPIN(trades: Trade[], bucketSize: number): number[] {
  if (trades.length < 2) return [];
  const vpin: number[] = [];
  let buyVol = 0, sellVol = 0;
  for (let i = 1; i < trades.length; i++) {
    const side = classifyTrade(trades[i], trades[i - 1].price);
    if (side === 'BUY') buyVol += trades[i].volume;
    else sellVol += trades[i].volume;
    const total = buyVol + sellVol;
    if (total >= bucketSize) {
      vpin.push(Math.abs(buyVol - sellVol) / total);
      buyVol = 0;
      sellVol = 0;
    }
  }
  return vpin;
}

/**
 * EMA-Smoothed VPIN
 * 
 * 对基础 VPIN 做指数移动平均平滑, 降低噪声
 * 更接近 Bloomberg 终端的 VPIN 实现
 * 
 * @param rawVPIN 基础 VPIN 数组
 * @param smoothingFactor EMA 平滑因子 (0-1, 推荐 0.1-0.2)
 */
export function smoothVPIN(rawVPIN: number[], smoothingFactor: number = 0.15): number[] {
  if (rawVPIN.length === 0) return [];
  const smoothed: number[] = [rawVPIN[0]];
  for (let i = 1; i < rawVPIN.length; i++) {
    smoothed.push(smoothingFactor * rawVPIN[i] + (1 - smoothingFactor) * smoothed[i - 1]);
  }
  return smoothed;
}

/**
 * VPIN 毒性等级判定
 * 
 * 参考 Easley et al. (2012) 阈值:
 * - LOW: VPIN < 0.2
 * - MODERATE: 0.2 <= VPIN < 0.4
 * - HIGH: 0.4 <= VPIN < 0.6
 * - EXTREME: VPIN >= 0.6
 */
export function classifyVPINToxicity(vpin: number): 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' {
  if (vpin < 0.2) return 'LOW';
  if (vpin < 0.4) return 'MODERATE';
  if (vpin < 0.6) return 'HIGH';
  return 'EXTREME';
}

// ────────────────────────────────────────────────────────────
// 累计委托单不平衡 (Cumulative Delta)
// ────────────────────────────────────────────────────────────

/**
 * Cumulative Delta — 买方量 - 卖方量 的累计值
 * 
 * 核心订单流指标:
 * - Delta 上升: 买方主导, 看涨信号
 * - Delta 下降: 卖方主导, 看跌信号
 * - Delta 与价格背离: 潜在反转信号
 */
export function calcCumulativeDelta(trades: Trade[]): { delta: number[]; deltaPct: number[] } {
  if (trades.length < 2) return { delta: [], deltaPct: [] };
  const delta: number[] = [];
  const deltaPct: number[] = [];
  let cumulative = 0;
  let totalVolume = 0;

  for (let i = 1; i < trades.length; i++) {
    const side = classifyTrade(trades[i], trades[i - 1].price);
    const signedVol = side === 'BUY' ? trades[i].volume : -trades[i].volume;
    cumulative += signedVol;
    totalVolume += trades[i].volume;
    delta.push(cumulative);
    deltaPct.push(totalVolume > 0 ? cumulative / totalVolume : 0);
  }
  return { delta, deltaPct };
}

// ────────────────────────────────────────────────────────────
// Lee-Mykland 统计量
// ────────────────────────────────────────────────────────────

/**
 * Lee-Mykland 统计量 — 瞬时信息冲击检测
 * 
 * L_i = |r_i| / σ_i
 * 
 * 其中 r_i 是对数收益率, σ_i 是局部波动率估计
 * 高 L_i 表示可能有重大信息事件 (对标 Bloomberg Event Drift)
 * 
 * @param trades 交易序列
 * @param window 局部波动率窗口
 * @returns 每笔交易的 Lee-Mykland 统计量
 */
export function calcLeeMykland(trades: Trade[], window: number = 20): number[] {
  if (trades.length < 3) return [];

  const logReturns: number[] = [];
  for (let i = 1; i < trades.length; i++) {
    if (trades[i].price > 0 && trades[i - 1].price > 0) {
      logReturns.push(Math.log(trades[i].price / trades[i - 1].price));
    } else {
      logReturns.push(0);
    }
  }

  const result: number[] = [];
  for (let i = 0; i < logReturns.length; i++) {
    const start = Math.max(0, i - window);
    const localReturns = logReturns.slice(start, i + 1);
    const n = localReturns.length;
    if (n < 2) { result.push(0); continue; }

    const mean = localReturns.reduce((a, b) => a + b, 0) / n;
    const variance = localReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
    const sigma = Math.sqrt(variance);
    result.push(sigma > 0 ? Math.abs(logReturns[i]) / sigma : 0);
  }
  return result;
}

/**
 * Lee-Mykland 检测 — 找出显著的瞬时信息冲击事件
 * 
 * @param lmStats Lee-Mykland 统计量数组
 * @param threshold 显著性阈值 (默认 3.0, 对应约 99.7% 置信度)
 */
export function detectInformationEvents(
  lmStats: number[],
  threshold: number = 3.0
): { index: number; statistic: number; significance: number }[] {
  const events: { index: number; statistic: number; significance: number }[] = [];
  for (let i = 0; i < lmStats.length; i++) {
    if (lmStats[i] > threshold) {
      events.push({
        index: i,
        statistic: lmStats[i],
        significance: Math.min(lmStats[i] / threshold, 5) // 最高5倍阈值
      });
    }
  }
  return events;
}

// ────────────────────────────────────────────────────────────
// 订单不平衡 (Order Imbalance)
// ────────────────────────────────────────────────────────────

/**
 * 订单不平衡比率
 * 
 * OI = (Buy Volume - Sell Volume) / (Buy Volume + Sell Volume)
 * 范围: [-1, 1]
 * -1: 全部卖出, +1: 全部买入
 */
export function orderImbalance(trades: Trade[]): number {
  if (trades.length < 2) return 0;
  let buyVol = 0, sellVol = 0;
  for (let i = 1; i < trades.length; i++) {
    const side = classifyTrade(trades[i], trades[i - 1].price);
    if (side === 'BUY') buyVol += trades[i].volume;
    else sellVol += trades[i].volume;
  }
  const total = buyVol + sellVol;
  return total === 0 ? 0 : (buyVol - sellVol) / total;
}

/**
 * 加权订单不平衡 (按金额加权)
 */
export function calcWeightedImbalance(trades: Trade[]): number {
  if (trades.length < 2) return 0;
  let buyValue = 0, sellValue = 0;
  for (let i = 1; i < trades.length; i++) {
    const side = classifyTrade(trades[i], trades[i - 1].price);
    const value = trades[i].price * trades[i].volume;
    if (side === 'BUY') buyValue += value;
    else sellValue += value;
  }
  const total = buyValue + sellValue;
  return total === 0 ? 0 : (buyValue - sellValue) / total;
}

// ────────────────────────────────────────────────────────────
// 交易强度 (Trade Intensity / Arrival Rate)
// ────────────────────────────────────────────────────────────

/**
 * 交易强度 — 滑动窗口内的成交笔数
 * 
 * 高强度 = 流动性充足或有知情交易
 * 对标 Bloomberg Trade Rate 指标
 */
export function tradeIntensity(trades: Trade[], windowMs: number): number[] {
  if (trades.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i < trades.length; i++) {
    let count = 0;
    for (let j = i; j >= 0; j--) {
      if (trades[i].timestamp - trades[j].timestamp <= windowMs) count++;
      else break;
    }
    result.push(count);
  }
  return result;
}

/**
 * 成交量速率 — 滑动窗口内的成交量
 */
export function calcVolumeRate(trades: Trade[], windowMs: number): number[] {
  if (trades.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i < trades.length; i++) {
    let vol = 0;
    for (let j = i; j >= 0; j--) {
      if (trades[i].timestamp - trades[j].timestamp <= windowMs) vol += trades[j].volume;
      else break;
    }
    result.push(vol);
  }
  return result;
}

// ────────────────────────────────────────────────────────────
// Kyle's Lambda (价格冲击系数)
// ────────────────────────────────────────────────────────────

/**
 * Kyle's Lambda — 价格冲击系数
 * 
 * λ = Cov(Δp, signed_volume) / Var(signed_volume)
 * 
 * 度量单位成交量对价格的影响, 越高说明市场深度越浅
 * 对标 Bloomberg Price Impact 指标
 */
export function calcKyleLambda(trades: Trade[]): number {
  if (trades.length < 3) return 0;
  const priceChanges: number[] = [];
  const signedVolumes: number[] = [];

  for (let i = 1; i < trades.length; i++) {
    priceChanges.push(trades[i].price - trades[i - 1].price);
    const side = classifyTrade(trades[i], trades[i - 1].price);
    signedVolumes.push(side === 'BUY' ? trades[i].volume : -trades[i].volume);
  }

  const n = priceChanges.length;
  if (n < 2) return 0;

  const meanP = priceChanges.reduce((a, b) => a + b, 0) / n;
  const meanV = signedVolumes.reduce((a, b) => a + b, 0) / n;

  let cov = 0, varV = 0;
  for (let i = 0; i < n; i++) {
    cov += (priceChanges[i] - meanP) * (signedVolumes[i] - meanV);
    varV += (signedVolumes[i] - meanV) ** 2;
  }
  return varV === 0 ? 0 : Math.abs(cov / varV);
}

// ────────────────────────────────────────────────────────────
// 滚动 VWAP & Amihud 非流动性
// ────────────────────────────────────────────────────────────

/**
 * 滚动 VWAP (Volume Weighted Average Price)
 */
export function calcRollingVwap(trades: Trade[], window: number = 50): number[] {
  if (trades.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i < trades.length; i++) {
    const start = Math.max(0, i - window + 1);
    let totalValue = 0, totalVolume = 0;
    for (let j = start; j <= i; j++) {
      totalValue += trades[j].price * trades[j].volume;
      totalVolume += trades[j].volume;
    }
    result.push(totalVolume > 0 ? totalValue / totalVolume : trades[i].price);
  }
  return result;
}

/**
 * Amihud 非流动性指标
 * 
 * ILLIQ = |r| / (price * volume)
 * 
 * 度量单位成交额引起的价格变动, 越高说明市场越不流动
 * 对标 Bloomberg Amihud Ratio
 */
export function calcAmihudIlliquidity(trades: Trade[], window: number = 20): number[] {
  if (trades.length < 2) return [];
  const result: number[] = [0]; // first trade has no return
  for (let i = 1; i < trades.length; i++) {
    const start = Math.max(1, i - window + 1);
    let totalIlliq = 0, count = 0;
    for (let j = start; j <= i; j++) {
      const ret = Math.abs(trades[j].price - trades[j - 1].price) / trades[j - 1].price;
      const dollarVol = trades[j].price * trades[j].volume;
      if (dollarVol > 0) {
        totalIlliq += ret / dollarVol;
        count++;
      }
    }
    result.push(count > 0 ? totalIlliq / count : 0);
  }
  return result;
}

// ────────────────────────────────────────────────────────────
// 大单追踪 (Large Order Tracking)
// ────────────────────────────────────────────────────────────

/**
 * 检测大单事件
 * 
 * @param trades 交易序列
 * @param thresholdVolume 大单阈值 (默认 10000 股)
 * @param thresholdNotional 大单金额阈值 (默认 1000000 元)
 */
export function detectLargeOrders(
  trades: Trade[],
  thresholdVolume: number = 10000,
  thresholdNotional: number = 1000000
): LargeOrderEvent[] {
  if (trades.length < 2) return [];
  const vpinArr = calcVPIN(trades, 50000);
  const events: LargeOrderEvent[] = [];

  for (let i = 1; i < trades.length; i++) {
    const t = trades[i];
    const notional = t.price * t.volume;
    if (t.volume >= thresholdVolume || notional >= thresholdNotional) {
      const side = classifyTrade(t, trades[i - 1].price);
      const vpinIdx = Math.min(events.length, vpinArr.length - 1);
      events.push({
        timestamp: t.timestamp,
        side,
        volume: t.volume,
        price: t.price,
        notionalValue: notional,
        vpinAtTime: vpinArr.length > 0 ? vpinArr[Math.max(0, vpinIdx)] : 0
      });
    }
  }
  return events;
}

/**
 * 冰山订单检测 — 识别持续在同价位出现的大额隐藏订单
 * 
 * 算法: 在滑动窗口内, 某价位出现频率和总量显著高于平均
 */
export function detectIcebergOrders(
  trades: Trade[],
  windowSize: number = 20,
  volumeThreshold: number = 0.7
): { price: number; estimatedHiddenVolume: number; confidence: number }[] {
  if (trades.length < windowSize) return [];

  const priceVolMap = new Map<number, { count: number; totalVol: number }>();

  for (let i = 0; i < trades.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowTrades = trades.slice(windowStart, i + 1);

    // 清空并重建
    priceVolMap.clear();
    for (const t of windowTrades) {
      const key = Math.round(t.price * 100) / 100; // 保留2位小数
      const entry = priceVolMap.get(key) || { count: 0, totalVol: 0 };
      entry.count++;
      entry.totalVol += t.volume;
      priceVolMap.set(key, entry);
    }

    const totalVol = windowTrades.reduce((s, t) => s + t.volume, 0);
    if (totalVol === 0) continue;
  }

  // 基于最后窗口的最终检测
  const finalWindow = trades.slice(-windowSize);
  const finalMap = new Map<number, { count: number; totalVol: number }>();
  let totalWindowVol = 0;

  for (const t of finalWindow) {
    const key = Math.round(t.price * 100) / 100;
    const entry = finalMap.get(key) || { count: 0, totalVol: 0 };
    entry.count++;
    entry.totalVol += t.volume;
    finalMap.set(key, entry);
    totalWindowVol += t.volume;
  }

  const results: { price: number; estimatedHiddenVolume: number; confidence: number }[] = [];
  for (const [price, data] of finalMap) {
    const volumeRatio = totalWindowVol > 0 ? data.totalVol / totalWindowVol : 0;
    if (volumeRatio > volumeThreshold && data.count >= 3) {
      results.push({
        price,
        estimatedHiddenVolume: data.totalVol * 2, // 估计隐藏量是可见量的2倍
        confidence: Math.min(volumeRatio * data.count / windowSize, 1)
      });
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}

// ────────────────────────────────────────────────────────────
// 综合快照 (Full Snapshot)
// ────────────────────────────────────────────────────────────

/**
 * 生成完整的订单流快照
 * 
 * 包含所有核心指标, 用于 dashboard 展示
 * 对标 TradingView Order Flow 图表 + Bloomberg TCA 面板
 */
export function generateOrderFlowSnapshot(trades: Trade[], vpinBucketSize: number = 50000): OrderFlowSnapshot | null {
  if (trades.length < 2) return null;

  const latestTrade = trades[trades.length - 1];
  const imbalance = orderImbalance(trades);
  const rawVPIN = calcVPIN(trades, vpinBucketSize);
  const smoothedVPIN = smoothVPIN(rawVPIN);
  const latestVPIN = rawVPIN.length > 0 ? rawVPIN[rawVPIN.length - 1] : 0;
  const latestSmoothedVPIN = smoothedVPIN.length > 0 ? smoothedVPIN[smoothedVPIN.length - 1] : 0;

  const { delta, deltaPct } = calcCumulativeDelta(trades);
  const latestDelta = delta.length > 0 ? delta[delta.length - 1] : 0;
  const latestDeltaPct = deltaPct.length > 0 ? deltaPct[deltaPct.length - 1] : 0;

  const lmStats = calcLeeMykland(trades);
  const latestLM = lmStats.length > 0 ? lmStats[lmStats.length - 1] : 0;

  const intensity = tradeIntensity(trades, 60000); // 1分钟窗口
  const latestIntensity = intensity.length > 0 ? intensity[intensity.length - 1] : 0;

  const vwap = calcRollingVwap(trades);
  const latestVwap = vwap.length > 0 ? vwap[vwap.length - 1] : 0;

  const amihud = calcAmihudIlliquidity(trades);
  const latestAmihud = amihud.length > 0 ? amihud[amihud.length - 1] : 0;

  const kyleLambda = calcKyleLambda(trades);

  return {
    timestamp: latestTrade.timestamp,
    vpin: latestVPIN,
    vpinSmoothed: latestSmoothedVPIN,
    cumulativeDelta: latestDelta,
    deltaPct: latestDeltaPct,
    tradeImbalance: imbalance,
    kyleLambda,
    leeMyklandStat: latestLM,
    tradeIntensity: latestIntensity,
    rollingVwap: latestVwap,
    amihudIlliquidity: latestAmihud,
    toxicityLevel: classifyVPINToxicity(latestSmoothedVPIN)
  };
}
