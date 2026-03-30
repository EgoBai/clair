/**
 * 涨跌停分析引擎
 * 涨跌停监控、连板追踪、炸板分析、情绪指标
 */

export interface LimitData {
  ticker: string;
  name: string;
  price: number;
  limitPrice: number;
  limitType: 'up' | 'down';
  consecutiveDays: number; // 连板天数
  volume: number;
  amount: number;
 封单金额: number; // 封单金额
  开板次数: number; // 炸板次数
  time: string; // 封板时间
  sector: string;
}

export interface LimitSummary {
  upCount: number;      // 涨停数
  downCount: number;    // 跌停数
  upAmount: number;     // 涨停成交额
  downAmount: number;   // 跌停成交额
  maxConsecutive: number; // 最高连板
  avgSealAmount: number;  // 平均封单金额
  openBoardCount: number; // 炸板数
  sealRate: number;       // 封板率
 情绪: '亢奋' | '积极' | '中性' | '谨慎' | '恐慌';
}

export interface ConsecutiveBoard {
  ticker: string;
  name: string;
  days: number;
  totalGain: number;
  sector: string;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export interface LimitSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  message: string;
}

/**
 * 涨跌停汇总分析
 */
export function summarizeLimits(limits: LimitData[]): LimitSummary {
  const upLimits = limits.filter((l) => l.limitType === 'up');
  const downLimits = limits.filter((l) => l.limitType === 'down');

  const upAmount = upLimits.reduce((s, l) => s + l.amount, 0);
  const downAmount = downLimits.reduce((s, l) => s + l.amount, 0);

  const maxConsecutive = limits.reduce((max, l) => Math.max(max, l.consecutiveDays), 0);

  const sealAmounts = upLimits.map((l) => l.封单金额);
  const avgSealAmount =
    sealAmounts.length > 0 ? sealAmounts.reduce((a, b) => a + b, 0) / sealAmounts.length : 0;

  const openBoardCount = upLimits.reduce((s, l) => s + l.开板次数, 0);
  const totalUpAttempts = upLimits.length + openBoardCount;
  const sealRate = totalUpAttempts > 0 ? upLimits.length / totalUpAttempts : 1;

  // 情绪指标
  let 情绪: LimitSummary['情绪'];
  const upRatio = upLimits.length / Math.max(1, limits.length);
  if (upRatio > 0.8 && sealRate > 0.8) 情绪 = '亢奋';
  else if (upRatio > 0.6 && sealRate > 0.6) 情绪 = '积极';
  else if (upRatio > 0.4) 情绪 = '中性';
  else if (upRatio > 0.2) 情绪 = '谨慎';
  else 情绪 = '恐慌';

  return {
    upCount: upLimits.length,
    downCount: downLimits.length,
    upAmount: Math.round(upAmount),
    downAmount: Math.round(downAmount),
    maxConsecutive,
    avgSealAmount: Math.round(avgSealAmount),
    openBoardCount,
    sealRate: Math.round(sealRate * 10000) / 10000,
    情绪,
  };
}

/**
 * 连板股追踪
 */
export function trackConsecutiveBoards(limits: LimitData[]): ConsecutiveBoard[] {
  return limits
    .filter((l) => l.limitType === 'up' && l.consecutiveDays >= 2)
    .map((l) => {
      const totalGain = Math.round(((Math.pow(1.1, l.consecutiveDays) - 1) * 100) * 100) / 100;
      let riskLevel: ConsecutiveBoard['riskLevel'];
      if (l.consecutiveDays >= 7) riskLevel = 'extreme';
      else if (l.consecutiveDays >= 5) riskLevel = 'high';
      else if (l.consecutiveDays >= 3) riskLevel = 'medium';
      else riskLevel = 'low';

      return {
        ticker: l.ticker,
        name: l.name,
        days: l.consecutiveDays,
        totalGain,
        sector: l.sector,
        riskLevel,
      };
    })
    .sort((a, b) => b.days - a.days);
}

/**
 * 涨跌停信号生成
 */
export function generateLimitSignals(summary: LimitSummary): LimitSignal[] {
  const signals: LimitSignal[] = [];

  // 涨停数量信号
  if (summary.upCount > 100) {
    signals.push({
      type: 'bullish',
      strength: Math.min(95, 60 + summary.upCount / 10),
      message: `今日${summary.upCount}只涨停，市场情绪高涨`,
    });
  } else if (summary.upCount < 20) {
    signals.push({
      type: 'bearish',
      strength: 60,
      message: `今日仅${summary.upCount}只涨停，市场情绪低迷`,
    });
  }

  // 跌停数量信号
  if (summary.downCount > 50) {
    signals.push({
      type: 'bearish',
      strength: Math.min(95, 60 + summary.downCount / 5),
      message: `今日${summary.downCount}只跌停，市场恐慌抛售`,
    });
  }

  // 封板率信号
  if (summary.sealRate > 0.85 && summary.upCount > 30) {
    signals.push({
      type: 'bullish',
      strength: 75,
      message: `封板率${(summary.sealRate * 100).toFixed(0)}%，资金封板意愿强烈`,
    });
  } else if (summary.sealRate < 0.5 && summary.upCount > 20) {
    signals.push({
      type: 'bearish',
      strength: 65,
      message: `封板率仅${(summary.sealRate * 100).toFixed(0)}%，炸板频繁资金分歧`,
    });
  }

  // 情绪信号
  if (summary.情绪 === '亢奋') {
    signals.push({
      type: 'warning' as 'bearish',
      strength: 70,
      message: '市场情绪亢奋，注意追高风险',
    });
  } else if (summary.情绪 === '恐慌') {
    signals.push({
      type: 'bearish',
      strength: 80,
      message: '市场恐慌情绪蔓延，跌停潮出现',
    });
  }

  if (signals.length === 0) {
    signals.push({ type: 'neutral', strength: 50, message: '涨跌停表现平稳' });
  }

  return signals;
}

/**
 * 涨跌停板块分布
 */
export function limitSectorDistribution(
  limits: LimitData[]
): { sector: string; upCount: number; downCount: number; netCount: number }[] {
  const sectorMap = new Map<string, { upCount: number; downCount: number }>();

  for (const l of limits) {
    const existing = sectorMap.get(l.sector) ?? { upCount: 0, downCount: 0 };
    if (l.limitType === 'up') existing.upCount++;
    else existing.downCount++;
    sectorMap.set(l.sector, existing);
  }

  return Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      upCount: data.upCount,
      downCount: data.downCount,
      netCount: data.upCount - data.downCount,
    }))
    .sort((a, b) => b.netCount - a.netCount);
}
