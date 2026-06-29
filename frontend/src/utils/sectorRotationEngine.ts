/**
 * 板块轮动引擎
 * 支持: 行业相对强弱、轮动信号、季节性分析、风格切换检测
 */

export interface SectorData {
  name: string;
  returns: number[];
  prices: number[];
  volume: number[];
}

export interface RotationSignal {
  sector: string;
  momentum: number; // 动量得分
  trend: number; // 趋势强度
  volumeConfirmation: number; // 量能确认
  compositeScore: number; // 综合评分
  recommendation: 'overweight' | 'neutral' | 'underweight';
}

export interface RotationMatrix {
  from: string;
  to: string;
  transitionProbability: number;
  avgLeadLag: number; // 正值表示from领先to
}

export interface SeasonalityResult {
  sector: string;
  monthlyReturns: { [month: number]: number }; // 1-12月
  bestMonth: number;
  worstMonth: number;
  consistency: number; // 季节性一致性 0-1
}

export interface StyleRotation {
  valueVsGrowth: number; // 正=价值占优, 负=成长占优
  largeVsSmall: number; // 正=大盘占优, 负=小盘占优
  highVsLowVol: number; // 正=低波占优, 负=高波占优
  momentumFactor: number;
  style: 'value_large' | 'value_small' | 'growth_large' | 'growth_small';
}

/**
 * 计算板块相对强弱
 */
export function calculateRelativeStrength(
  sectorReturns: number[],
  benchmarkReturns: number[],
  period: number = 20
): number[] {
  const n = Math.min(sectorReturns.length, benchmarkReturns.length);
  if (n < period) return [];

  const rs: number[] = [];
  let _cumSector = 1;
  let _cumBenchmark = 1;

  for (let i = 0; i < n; i++) {
    _cumSector *= (1 + sectorReturns[i]);
    _cumBenchmark *= (1 + benchmarkReturns[i]);

    if (i >= period - 1) {
      // 滚动窗口RS
      let sRet = 1;
      let bRet = 1;
      for (let j = i - period + 1; j <= i; j++) {
        sRet *= (1 + sectorReturns[j]);
        bRet *= (1 + benchmarkReturns[j]);
      }
      rs.push(sRet / bRet);
    }
  }

  return rs;
}

/**
 * 生成板块轮动信号
 */
export function generateRotationSignals(
  sectors: SectorData[],
  benchmarkReturns: number[],
  lookbackPeriods: number[] = [5, 10, 20, 60]
): RotationSignal[] {
  const signals: RotationSignal[] = [];

  for (const sector of sectors) {
    const momentum = calculateMomentumScore(sector.returns, lookbackPeriods);
    const trend = calculateTrendScore(sector.prices, 20);
    const volumeConf = calculateVolumeConfirmation(sector.returns, sector.volume, 20);

    const compositeScore = momentum * 0.4 + trend * 0.35 + volumeConf * 0.25;

    let recommendation: RotationSignal['recommendation'] = 'neutral';
    if (compositeScore > 20) recommendation = 'overweight';
    else if (compositeScore < -20) recommendation = 'underweight';

    signals.push({
      sector: sector.name,
      momentum,
      trend,
      volumeConfirmation: volumeConf,
      compositeScore,
      recommendation
    });
  }

  return signals.sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * 板块轮动转换矩阵
 */
export function calculateRotationMatrix(
  sectors: SectorData[],
  windowSize: number = 20
): RotationMatrix[] {
  const matrices: RotationMatrix[] = [];
  const n = sectors.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const { probability, leadLag } = calculateTransition(
        sectors[i].returns,
        sectors[j].returns,
        windowSize
      );

      matrices.push({
        from: sectors[i].name,
        to: sectors[j].name,
        transitionProbability: probability,
        avgLeadLag: leadLag
      });
    }
  }

  return matrices;
}

/**
 * 季节性分析
 */
export function analyzeSeasonality(
  sector: SectorData,
  dates: Date[]
): SeasonalityResult {
  const monthlyReturns: { [month: number]: number[] } = {};
  for (let m = 1; m <= 12; m++) monthlyReturns[m] = [];

  const n = Math.min(sector.returns.length, dates.length);
  for (let i = 0; i < n; i++) {
    const month = dates[i].getMonth() + 1;
    monthlyReturns[month].push(sector.returns[i]);
  }

  const avgMonthlyReturns: { [month: number]: number } = {};
  let bestMonth = 1, worstMonth = 1;
  let bestReturn = -Infinity, worstReturn = Infinity;

  for (let m = 1; m <= 12; m++) {
    const rets = monthlyReturns[m];
    const avg = rets.length > 0 ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
    avgMonthlyReturns[m] = avg;

    if (avg > bestReturn) { bestReturn = avg; bestMonth = m; }
    if (avg < worstReturn) { worstReturn = avg; worstMonth = m; }
  }

  // 一致性: 最好和最差月份的差值占总range的比例
  const allReturns = Object.values(avgMonthlyReturns);
  const range = Math.max(...allReturns) - Math.min(...allReturns);
  const consistency = range > 0 ? Math.abs(bestReturn - worstReturn) / range : 0;

  return {
    sector: sector.name,
    monthlyReturns: avgMonthlyReturns,
    bestMonth,
    worstMonth,
    consistency
  };
}

/**
 * 风格轮动检测
 */
export function detectStyleRotation(
  valueReturns: number[],
  growthReturns: number[],
  largeReturns: number[],
  smallReturns: number[],
  highVolReturns: number[],
  lowVolReturns: number[],
  momentumReturns: number[],
  lookback: number = 60
): StyleRotation {
  const n = lookback;

  const avgValue = avgLastN(valueReturns, n);
  const avgGrowth = avgLastN(growthReturns, n);
  const avgLarge = avgLastN(largeReturns, n);
  const avgSmall = avgLastN(smallReturns, n);
  const avgHighVol = avgLastN(highVolReturns, n);
  const avgLowVol = avgLastN(lowVolReturns, n);
  const avgMomentum = avgLastN(momentumReturns, n);

  const valueVsGrowth = avgValue - avgGrowth;
  const largeVsSmall = avgLarge - avgSmall;
  const highVsLowVol = avgLowVol - avgHighVol;

  let style: StyleRotation['style'] = 'growth_large';
  if (valueVsGrowth > 0 && largeVsSmall > 0) style = 'value_large';
  else if (valueVsGrowth > 0 && largeVsSmall <= 0) style = 'value_small';
  else if (valueVsGrowth <= 0 && largeVsSmall > 0) style = 'growth_large';
  else style = 'growth_small';

  return {
    valueVsGrowth,
    largeVsSmall,
    highVsLowVol,
    momentumFactor: avgMomentum,
    style
  };
}

/**
 * 板块动量排序
 */
export function rankSectorMomentum(
  sectors: SectorData[],
  periods: number[] = [5, 10, 20, 60]
): { sector: string; score: number; rank: number }[] {
  const scores = sectors.map(s => ({
    sector: s.name,
    score: calculateMomentumScore(s.returns, periods)
  }));

  scores.sort((a, b) => b.score - a.score);
  return scores.map((s, i) => ({ ...s, rank: i + 1 }));
}

// ===== Internal Functions =====

function calculateMomentumScore(returns: number[], periods: number[]): number {
  let score = 0;
  let weight = 0;

  for (const period of periods) {
    if (returns.length >= period) {
      const recent = returns.slice(-period);
      const totalReturn = recent.reduce((acc, r) => acc * (1 + r), 1) - 1;
      const w = 1 / period; // 短期权重更高
      score += totalReturn * w * 252; // 年化
      weight += w;
    }
  }

  return weight > 0 ? (score / weight) * 100 : 0;
}

function calculateTrendScore(prices: number[], period: number): number {
  if (prices.length < period) return 0;

  const recent = prices.slice(-period);
  const sma = recent.reduce((a, b) => a + b, 0) / period;
  const currentPrice = recent[recent.length - 1];

  // 价格相对均线位置
  const position = (currentPrice - sma) / sma;

  // 均线斜率
  const halfPeriod = Math.floor(period / 2);
  const firstHalf = recent.slice(0, halfPeriod).reduce((a, b) => a + b, 0) / halfPeriod;
  const secondHalf = recent.slice(halfPeriod).reduce((a, b) => a + b, 0) / (period - halfPeriod);
  const slope = (secondHalf - firstHalf) / firstHalf;

  return (position * 50 + slope * 100);
}

function calculateVolumeConfirmation(
  returns: number[],
  volumes: number[],
  period: number
): number {
  const n = Math.min(returns.length, volumes.length);
  if (n < period) return 0;

  const recentReturns = returns.slice(-period);
  const recentVolumes = volumes.slice(-period);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / period;

  let confirmCount = 0;
  for (let i = 0; i < period; i++) {
    if (recentReturns[i] > 0 && recentVolumes[i] > avgVolume) confirmCount++;
    if (recentReturns[i] < 0 && recentVolumes[i] > avgVolume) confirmCount++;
  }

  return (confirmCount / period) * 100 - 50; // -50 to 50
}

function calculateTransition(
  returnsA: number[],
  returnsB: number[],
  windowSize: number
): { probability: number; leadLag: number } {
  const n = Math.min(returnsA.length, returnsB.length);
  if (n < windowSize * 2) return { probability: 0.5, leadLag: 0 };

  let aLeadsB = 0;
  let transitions = 0;

  for (let i = windowSize; i < n - 1; i++) {
    const aWindow = returnsA.slice(i - windowSize, i);
    const bWindow = returnsB.slice(i - windowSize, i);

    const aMom = aWindow.reduce((a, b) => a + b, 0);
    const bMom = bWindow.reduce((a, b) => a + b, 0);

    // 检查A领先B的情况
    if (aMom > 0 && returnsB[i] > 0) aLeadsB++;
    if (bMom > 0 && returnsA[i] > 0) aLeadsB--;
    transitions++;
  }

  const probability = transitions > 0 ? 0.5 + aLeadsB / (transitions * 2) : 0.5;
  return { probability: Math.max(0, Math.min(1, probability)), leadLag: aLeadsB };
}

function avgLastN(arr: number[], n: number): number {
  const slice = arr.slice(-n);
  return slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
}
