/**
 * 流动性风险引擎
 * Amihud非流动性指标/换手率分析/买卖价差/流动性分层/流动性危机预警
 */

export interface LiquidityData {
  ticker: string;
  date: string;
  volume: number;
  turnover: number;
  amount: number;
  price: number;
  return: number;
  bidAskSpread: number;
  marketCap: number;
}

export interface LiquidityMetrics {
  ticker: string;
  amihud: number;           // Amihud非流动性指标
  avgTurnover: number;      // 平均换手率
  avgVolume: number;        // 平均成交量
  avgSpread: number;        // 平均买卖价差
  volumeVolatility: number; // 成交量波动率
  liquidityScore: number;   // 0-100
  tier: 'excellent' | 'good' | 'moderate' | 'poor' | 'illiquid';
  dailyCapacity: number;    // 日可交易容量(万元)
  liquidationDays: number;  // 清仓所需天数(10%持仓)
}

export interface LiquidityRisk {
  ticker: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  factors: {
    name: string;
    value: number;
    threshold: number;
    breached: boolean;
  }[];
  recommendation: string;
}

export interface LiquidityTier {
  tier: string;
  tickers: string[];
  avgMetrics: {
    turnover: number;
    spread: number;
    capacity: number;
  };
  tradingAdvice: string;
}

export interface LiquidityCrisisSignal {
  ticker: string;
  date: string;
  signal: 'volume_surge' | 'volume_collapse' | 'spread_widening' | 'price_impact_spike';
  severity: 'warning' | 'alert' | 'critical';
  details: string;
}

/**
 * 计算Amihud非流动性指标
 */
export function calculateAmihud(data: LiquidityData[]): number {
  if (data.length === 0) return 0;

  const ratios = data
    .filter(d => d.amount > 0 && d.return !== 0)
    .map(d => Math.abs(d.return) / (d.amount / 1e8)); // 每亿成交额的价格影响

  return ratios.length > 0
    ? ratios.reduce((s, r) => s + r, 0) / ratios.length
    : 0;
}

/**
 * 计算流动性指标
 */
export function calculateLiquidityMetrics(
  data: LiquidityData[]
): LiquidityMetrics | null {
  if (data.length === 0) return null;

  const ticker = data[0].ticker;
  const amihud = calculateAmihud(data);

  const turnovers = data.map(d => d.turnover);
  const volumes = data.map(d => d.volume);
  const spreads = data.map(d => d.bidAskSpread);

  const avgTurnover = turnovers.reduce((s, v) => s + v, 0) / turnovers.length;
  const avgVolume = volumes.reduce((s, v) => s + v, 0) / volumes.length;
  const avgSpread = spreads.reduce((s, v) => s + v, 0) / spreads.length;

  const volumeMean = avgVolume;
  const volumeVolatility = Math.sqrt(
    volumes.reduce((s, v) => s + (v - volumeMean) ** 2, 0) / volumes.length
  ) / volumeMean;

  // 流动性评分
  let score = 50;
  score += avgTurnover > 0.03 ? 15 : avgTurnover > 0.01 ? 5 : -10;
  score += avgSpread < 0.001 ? 15 : avgSpread < 0.005 ? 5 : -10;
  score += amihud < 0.001 ? 10 : amihud < 0.01 ? 0 : -15;
  score += volumeVolatility < 0.5 ? 10 : volumeVolatility < 1 ? 0 : -10;

  score = Math.max(0, Math.min(100, score));

  let tier: LiquidityMetrics['tier'];
  if (score >= 80) tier = 'excellent';
  else if (score >= 65) tier = 'good';
  else if (score >= 50) tier = 'moderate';
  else if (score >= 30) tier = 'poor';
  else tier = 'illiquid';

  const avgAmount = data.reduce((s, d) => s + d.amount, 0) / data.length;
  const dailyCapacity = avgAmount / 1e4; // 万元
  const liquidationDays = avgAmount > 0
    ? Math.ceil((data[0].marketCap * 0.1) / avgAmount)
    : 999;

  return {
    ticker,
    amihud,
    avgTurnover,
    avgVolume,
    avgSpread,
    volumeVolatility,
    liquidityScore: score,
    tier,
    dailyCapacity,
    liquidationDays,
  };
}

/**
 * 流动性风险评估
 */
export function assessLiquidityRisk(
  metrics: LiquidityMetrics
): LiquidityRisk {
  const factors: LiquidityRisk['factors'] = [];

  factors.push({
    name: 'Amihud非流动性',
    value: metrics.amihud,
    threshold: 0.01,
    breached: metrics.amihud > 0.01,
  });

  factors.push({
    name: '换手率',
    value: metrics.avgTurnover,
    threshold: 0.005,
    breached: metrics.avgTurnover < 0.005,
  });

  factors.push({
    name: '买卖价差',
    value: metrics.avgSpread,
    threshold: 0.01,
    breached: metrics.avgSpread > 0.01,
  });

  factors.push({
    name: '成交量波动',
    value: metrics.volumeVolatility,
    threshold: 1.5,
    breached: metrics.volumeVolatility > 1.5,
  });

  factors.push({
    name: '清仓天数',
    value: metrics.liquidationDays,
    threshold: 20,
    breached: metrics.liquidationDays > 20,
  });

  const breachedCount = factors.filter(f => f.breached).length;
  const riskScore = Math.min(100, breachedCount * 20 + (100 - metrics.liquidityScore) * 0.3);

  let riskLevel: LiquidityRisk['riskLevel'];
  if (riskScore >= 80) riskLevel = 'critical';
  else if (riskScore >= 60) riskLevel = 'high';
  else if (riskScore >= 30) riskLevel = 'medium';
  else riskLevel = 'low';

  const recommendations: string[] = [];
  if (metrics.liquidationDays > 10) recommendations.push('大单需分批减持');
  if (metrics.avgSpread > 0.005) recommendations.push('注意滑点成本');
  if (metrics.tier === 'poor' || metrics.tier === 'illiquid') recommendations.push('建议降低仓位或回避');

  return {
    ticker: metrics.ticker,
    riskLevel,
    riskScore,
    factors,
    recommendation: recommendations.join('; ') || '流动性良好',
  };
}

/**
 * 流动性分层
 */
export function tierByLiquidity(
  metricsList: LiquidityMetrics[]
): LiquidityTier[] {
  const tiers = new Map<string, LiquidityMetrics[]>();

  metricsList.forEach(m => {
    const list = tiers.get(m.tier) ?? [];
    list.push(m);
    tiers.set(m.tier, list);
  });

  const tierAdvice: Record<string, string> = {
    excellent: '可大额交易，执行成本低',
    good: '正常交易，偶有大单注意拆分',
    moderate: '注意仓位控制，避免冲击成本',
    poor: '仅适合小仓位，严格拆单执行',
    illiquid: '建议回避或极小仓位试探',
  };

  return Array.from(tiers.entries()).map(([tier, items]) => ({
    tier,
    tickers: items.map(m => m.ticker),
    avgMetrics: {
      turnover: items.reduce((s, m) => s + m.avgTurnover, 0) / items.length,
      spread: items.reduce((s, m) => s + m.avgSpread, 0) / items.length,
      capacity: items.reduce((s, m) => s + m.dailyCapacity, 0) / items.length,
    },
    tradingAdvice: tierAdvice[tier] ?? '',
  }));
}

/**
 * 流动性危机预警
 */
export function detectLiquidityCrisis(
  data: LiquidityData[],
  lookbackDays: number = 20
): LiquidityCrisisSignal[] {
  if (data.length < lookbackDays) return [];

  const signals: LiquidityCrisisSignal[] = [];
  const recent = data.slice(-lookbackDays);
  const volumes = recent.map(d => d.volume);
  const spreads = recent.map(d => d.bidAskSpread);

  const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;
  const stdVol = Math.sqrt(volumes.reduce((s, v) => s + (v - avgVol) ** 2, 0) / volumes.length);

  // 检查最新一天
  const latest = data[data.length - 1];

  // 成交量突增
  if (latest.volume > avgVol + 3 * stdVol) {
    signals.push({
      ticker: latest.ticker,
      date: latest.date,
      signal: 'volume_surge',
      severity: 'alert',
      details: `成交量 ${(latest.volume / avgVol).toFixed(1)}x 均值`,
    });
  }

  // 成交量骤降
  if (latest.volume < avgVol * 0.2) {
    signals.push({
      ticker: latest.ticker,
      date: latest.date,
      signal: 'volume_collapse',
      severity: 'critical',
      details: `成交量仅为均值的 ${(latest.volume / avgVol * 100).toFixed(0)}%`,
    });
  }

  // 价差扩大
  const avgSpread = spreads.reduce((s, v) => s + v, 0) / spreads.length;
  if (latest.bidAskSpread > avgSpread * 3) {
    signals.push({
      ticker: latest.ticker,
      date: latest.date,
      signal: 'spread_widening',
      severity: 'warning',
      details: `买卖价差扩大至均值的 ${(latest.bidAskSpread / avgSpread).toFixed(1)}x`,
    });
  }

  return signals;
}
