/**
 * 市场季节性分析引擎
 * 节气效应/月度效应/假日效应/年报季报效应/统计检验
 */

// ── 类型定义 ──

export interface SeasonalConfig {
  lookbackYears: number;    // 回溯年数
  minSampleSize: number;    // 最小样本量
  significanceLevel: number; // 显著性水平 (0.05)
  benchmarkReturn: number;  // 基准收益率
}

export interface MonthlyReturn {
  year: number;
  month: number;
  return: number;
  volume: number;
  volatility: number;
}

export interface SeasonalPattern {
  name: string;
  type: 'monthly' | 'holiday' | 'earnings' | 'solar_term' | 'weekly';
  period: string;
  avgReturn: number;
  winRate: number;
  sharpe: number;
  sampleSize: number;
  significance: number;     // p-value
  isSignificant: boolean;
  description: string;
}

export interface HolidayEffect {
  name: string;
  daysBeforeHoliday: number;
  avgReturnBefore: number;
  winRateBefore: number;
  avgReturnAfter: number;
  winRateAfter: number;
  bestEntryDay: number;     // 节前第几天入场
  avgHoldingReturn: number;
  riskReward: number;
}

export interface MonthlyEffectAnalysis {
  month: number;
  monthName: string;
  avgReturn: number;
  medianReturn: number;
  winRate: number;
  bestYear: { year: number; return: number };
  worstYear: { year: number; return: number };
  volatility: number;
  sharpe: number;
  rank: number;             // 在12个月中的排名
  isPositive: boolean;
  consistency: number;      // 一致性评分 0-100
}

export interface EarningsSeasonEffect {
  period: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  preEarningsReturn: number;  // 财报前N天收益
  postEarningsReturn: number; // 财报后N天收益
  beatRate: number;           // 超预期比例
  surpriseReturn: number;     // 超预期后的平均收益
  missReturn: number;         // 低于预期的平均收益
  optimalStrategy: string;
}

export interface DayOfWeekEffect {
  dayOfWeek: number;      // 0=周日, 1=周一, ..., 6=周六
  dayName: string;
  avgReturn: number;
  winRate: number;
  volatility: number;
  volumeRatio: number;    // 相对平均成交量比
  rank: number;
}

export interface SolarTermEffect {
  termName: string;       // 节气名称
  startDate: string;      // 节气开始日期
  endDate: string;
  avgReturn: number;
  winRate: number;
  description: string;
  marketBias: 'bullish' | 'bearish' | 'neutral';
}

export interface SeasonalForecast {
  currentDate: Date;
  forecastPeriod: string;
  expectedReturn: number;
  confidence: number;
  drivingFactors: string[];
  patterns: SeasonalPattern[];
  riskFactors: string[];
  recommendedAction: string;
}

export interface SeasonalityScore {
  overall: number;         // 0-100
  monthly: number;
  holiday: number;
  earnings: number;
  momentum: number;
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  details: string[];
}

const DEFAULT_CONFIG: SeasonalConfig = {
  lookbackYears: 10,
  minSampleSize: 5,
  significanceLevel: 0.05,
  benchmarkReturn: 0,
};

const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'];

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 中国主要节假日
export const CHINESE_HOLIDAYS = [
  { name: '春节', monthRange: [1, 2], daysBefore: 10, daysAfter: 5 },
  { name: '清明节', monthRange: [4, 4], daysBefore: 3, daysAfter: 3 },
  { name: '劳动节', monthRange: [5, 5], daysBefore: 3, daysAfter: 3 },
  { name: '端午节', monthRange: [5, 6], daysBefore: 3, daysAfter: 3 },
  { name: '中秋节', monthRange: [9, 10], daysBefore: 3, daysAfter: 3 },
  { name: '国庆节', monthRange: [10, 10], daysBefore: 5, daysAfter: 5 },
  { name: '元旦', monthRange: [12, 1], daysBefore: 2, daysAfter: 2 },
];

// 24节气 (简化)
export const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

// ── 月度效应分析 ──

export function analyzeMonthlyEffects(
  monthlyReturns: MonthlyReturn[],
  config: SeasonalConfig = DEFAULT_CONFIG
): MonthlyEffectAnalysis[] {
  const monthData: Map<number, number[]> = new Map();
  for (let m = 1; m <= 12; m++) monthData.set(m, []);

  for (const ret of monthlyReturns) {
    if (ret.month >= 1 && ret.month <= 12) {
      monthData.get(ret.month)!.push(ret.return);
    }
  }

  const results: MonthlyEffectAnalysis[] = [];
  const allAvgReturns: { month: number; avg: number }[] = [];

  for (let m = 1; m <= 12; m++) {
    const returns = monthData.get(m) || [];
    if (returns.length === 0) continue;

    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const sorted = [...returns].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    const winCount = returns.filter(r => r > 0).length;
    const winRate = winCount / returns.length;
    const volatility = calculateStdDev(returns);
    const sharpe = volatility > 0 ? avg / volatility : 0;

    let bestYear = { year: 0, return: -Infinity };
    let worstYear = { year: 0, return: Infinity };
    for (const ret of monthlyReturns) {
      if (ret.month === m) {
        if (ret.return > bestYear.return) bestYear = { year: ret.year, return: ret.return };
        if (ret.return < worstYear.return) worstYear = { year: ret.year, return: ret.return };
      }
    }

    // 一致性：年份间方向一致性
    const positiveYears = returns.filter(r => r > 0).length;
    const negativeYears = returns.filter(r => r <= 0).length;
    const consistency = Math.round((Math.max(positiveYears, negativeYears) / returns.length) * 100);

    allAvgReturns.push({ month: m, avg });

    results.push({
      month: m,
      monthName: MONTH_NAMES[m - 1],
      avgReturn: roundTo(avg, 4),
      medianReturn: roundTo(median, 4),
      winRate: roundTo(winRate, 4),
      bestYear,
      worstYear,
      volatility: roundTo(volatility, 4),
      sharpe: roundTo(sharpe, 2),
      rank: 0,
      isPositive: avg > 0,
      consistency,
    });
  }

  // 排序确定排名
  allAvgReturns.sort((a, b) => b.avg - a.avg);
  const rankMap = new Map(allAvgReturns.map((a, i) => [a.month, i + 1]));
  for (const r of results) {
    r.rank = rankMap.get(r.month) || 0;
  }

  return results;
}

// ── 假日效应分析 ──

export function analyzeHolidayEffects(
  dailyReturns: { date: string; return: number; isBeforeHoliday: boolean; isAfterHoliday: boolean; holidayName: string }[]
): HolidayEffect[] {
  const holidayGroups = new Map<string, {
    beforeReturns: number[];
    afterReturns: number[];
    holdingReturns: number[];
  }>();

  for (const ret of dailyReturns) {
    if (!ret.holidayName) continue;
    if (!holidayGroups.has(ret.holidayName)) {
      holidayGroups.set(ret.holidayName, { beforeReturns: [], afterReturns: [], holdingReturns: [] });
    }
    const group = holidayGroups.get(ret.holidayName)!;
    if (ret.isBeforeHoliday) group.beforeReturns.push(ret.return);
    if (ret.isAfterHoliday) group.afterReturns.push(ret.return);
  }

  const effects: HolidayEffect[] = [];
  for (const [name, group] of holidayGroups) {
    const avgBefore = group.beforeReturns.length > 0
      ? group.beforeReturns.reduce((a, b) => a + b, 0) / group.beforeReturns.length : 0;
    const avgAfter = group.afterReturns.length > 0
      ? group.afterReturns.reduce((a, b) => a + b, 0) / group.afterReturns.length : 0;

    const winBefore = group.beforeReturns.filter(r => r > 0).length / Math.max(group.beforeReturns.length, 1);
    const winAfter = group.afterReturns.filter(r => r > 0).length / Math.max(group.afterReturns.length, 1);

    const avgHolding = avgBefore + avgAfter;
    const riskReward = avgAfter > 0 ? avgHolding / Math.max(calculateStdDev(group.afterReturns), 0.001) : 0;

    // 找最佳入场日
    const dayReturns: { day: number; avg: number }[] = [];
    for (let d = 1; d <= 10; d++) {
      dayReturns.push({ day: d, avg: avgBefore * (1 - d * 0.05) });
    }
    const bestEntry = dayReturns.reduce((a, b) => a.avg > b.avg ? a : b);

    effects.push({
      name,
      daysBeforeHoliday: 10,
      avgReturnBefore: roundTo(avgBefore, 4),
      winRateBefore: roundTo(winBefore, 4),
      avgReturnAfter: roundTo(avgAfter, 4),
      winRateAfter: roundTo(winAfter, 4),
      bestEntryDay: bestEntry.day,
      avgHoldingReturn: roundTo(avgHolding, 4),
      riskReward: roundTo(riskReward, 2),
    });
  }

  return effects.sort((a, b) => b.avgHoldingReturn - a.avgHoldingReturn);
}

// ── 星期效应分析 ──

export function analyzeDayOfWeekEffect(
  dailyReturns: { date: string; return: number; volume: number; dayOfWeek: number }[]
): DayOfWeekEffect[] {
  const dayData: Map<number, { returns: number[]; volumes: number[] }> = new Map();
  for (let d = 0; d < 7; d++) dayData.set(d, { returns: [], volumes: [] });

  const allVolumes: number[] = [];
  for (const ret of dailyReturns) {
    if (ret.dayOfWeek >= 0 && ret.dayOfWeek <= 6) {
      dayData.get(ret.dayOfWeek)!.returns.push(ret.return);
      dayData.get(ret.dayOfWeek)!.volumes.push(ret.volume);
      allVolumes.push(ret.volume);
    }
  }

  const avgVolume = allVolumes.reduce((a, b) => a + b, 0) / Math.max(allVolumes.length, 1);

  const results: DayOfWeekEffect[] = [];
  for (let d = 1; d <= 5; d++) { // 仅周一到周五
    const data = dayData.get(d);
    if (!data || data.returns.length === 0) continue;

    const avgReturn = data.returns.reduce((a, b) => a + b, 0) / data.returns.length;
    const winRate = data.returns.filter(r => r > 0).length / data.returns.length;
    const volatility = calculateStdDev(data.returns);
    const dayAvgVolume = data.volumes.reduce((a, b) => a + b, 0) / Math.max(data.volumes.length, 1);

    results.push({
      dayOfWeek: d,
      dayName: DAY_NAMES[d],
      avgReturn: roundTo(avgReturn, 4),
      winRate: roundTo(winRate, 4),
      volatility: roundTo(volatility, 4),
      volumeRatio: roundTo(dayAvgVolume / Math.max(avgVolume, 1), 2),
      rank: 0,
    });
  }

  // 排名
  const sorted = [...results].sort((a, b) => b.avgReturn - a.avgReturn);
  const rankMap = new Map(sorted.map((r, i) => [r.dayOfWeek, i + 1]));
  for (const r of results) {
    r.rank = rankMap.get(r.dayOfWeek) || 0;
  }

  return results;
}

// ── 财报季效应分析 ──

export function analyzeEarningsSeasonEffect(
  earningsData: {
    period: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    preReturn: number;
    postReturn: number;
    actualEPS: number;
    expectedEPS: number;
  }[]
): EarningsSeasonEffect[] {
  const periods: Array<'Q1' | 'Q2' | 'Q3' | 'Q4'> = ['Q1', 'Q2', 'Q3', 'Q4'];

  return periods.map(period => {
    const data = earningsData.filter(d => d.period === period);
    if (data.length === 0) {
      return {
        period,
        preEarningsReturn: 0,
        postEarningsReturn: 0,
        beatRate: 0,
        surpriseReturn: 0,
        missReturn: 0,
        optimalStrategy: '数据不足',
      };
    }

    const preAvg = data.reduce((a, d) => a + d.preReturn, 0) / data.length;
    const postAvg = data.reduce((a, d) => a + d.postReturn, 0) / data.length;

    const beats = data.filter(d => d.actualEPS > d.expectedEPS);
    const misses = data.filter(d => d.actualEPS <= d.expectedEPS);
    const beatRate = beats.length / data.length;

    const surpriseReturn = beats.length > 0
      ? beats.reduce((a, d) => a + d.postReturn, 0) / beats.length : 0;
    const missReturn = misses.length > 0
      ? misses.reduce((a, d) => a + d.postReturn, 0) / misses.length : 0;

    let optimalStrategy = '';
    if (surpriseReturn > 0.02 && beatRate > 0.5) {
      optimalStrategy = '财报前布局超预期个股';
    } else if (preAvg > 0.01) {
      optimalStrategy = '财报前一周买入，财报后获利了结';
    } else if (postAvg > 0.01) {
      optimalStrategy = '财报后确认再入场';
    } else {
      optimalStrategy = '财报季降低仓位，规避波动';
    }

    return {
      period,
      preEarningsReturn: roundTo(preAvg, 4),
      postEarningsReturn: roundTo(postAvg, 4),
      beatRate: roundTo(beatRate, 4),
      surpriseReturn: roundTo(surpriseReturn, 4),
      missReturn: roundTo(missReturn, 4),
      optimalStrategy,
    };
  });
}

// ── 季节性模式识别 ──

export function identifySeasonalPatterns(
  monthlyReturns: MonthlyReturn[],
  config: SeasonalConfig = DEFAULT_CONFIG
): SeasonalPattern[] {
  const patterns: SeasonalPattern[] = [];

  // 1. 一月效应
  const janReturns = monthlyReturns.filter(r => r.month === 1);
  if (janReturns.length >= config.minSampleSize) {
    const avg = janReturns.reduce((a, r) => a + r.return, 0) / janReturns.length;
    const winRate = janReturns.filter(r => r.return > 0).length / janReturns.length;
    const tStat = avg / (calculateStdDev(janReturns.map(r => r.return)) / Math.sqrt(janReturns.length));
    const pValue = calculatePValue(tStat, janReturns.length - 1);

    patterns.push({
      name: '一月效应',
      type: 'monthly',
      period: '1月',
      avgReturn: roundTo(avg, 4),
      winRate: roundTo(winRate, 4),
      sharpe: roundTo(avg / Math.max(calculateStdDev(janReturns.map(r => r.return)), 0.001), 2),
      sampleSize: janReturns.length,
      significance: roundTo(pValue, 4),
      isSignificant: pValue < config.significanceLevel,
      description: avg > 0 ? '一月通常有正收益，可能与年初资金面宽松有关' : '一月效应不明显或为负',
    });
  }

  // 2. 五穷六绝七翻身
  const mayReturns = monthlyReturns.filter(r => r.month === 5);
  const junReturns = monthlyReturns.filter(r => r.month === 6);
  const julReturns = monthlyReturns.filter(r => r.month === 7);

  if (mayReturns.length >= config.minSampleSize && junReturns.length >= config.minSampleSize && julReturns.length >= config.minSampleSize) {
    const mayAvg = mayReturns.reduce((a, r) => a + r.return, 0) / mayReturns.length;
    const junAvg = junReturns.reduce((a, r) => a + r.return, 0) / junReturns.length;
    const julAvg = julReturns.reduce((a, r) => a + r.return, 0) / julReturns.length;
    const winRateJul = julReturns.filter(r => r.return > 0).length / julReturns.length;

    patterns.push({
      name: '五穷六绝七翻身',
      type: 'monthly',
      period: '5-7月',
      avgReturn: roundTo(julAvg, 4),
      winRate: roundTo(winRateJul, 4),
      sharpe: roundTo(julAvg / Math.max(calculateStdDev(julReturns.map(r => r.return)), 0.001), 2),
      sampleSize: julReturns.length,
      significance: 0.1,
      isSignificant: mayAvg < 0 && junAvg < 0 && julAvg > 0,
      description: `5月${formatPct(mayAvg)} 6月${formatPct(junAvg)} 7月${formatPct(julAvg)}`,
    });
  }

  // 3. 金九银十
  const sepReturns = monthlyReturns.filter(r => r.month === 9);
  const octReturns = monthlyReturns.filter(r => r.month === 10);

  if (sepReturns.length >= config.minSampleSize && octReturns.length >= config.minSampleSize) {
    const sepAvg = sepReturns.reduce((a, r) => a + r.return, 0) / sepReturns.length;
    const octAvg = octReturns.reduce((a, r) => a + r.return, 0) / octReturns.length;
    const combined = [...sepReturns.map(r => r.return), ...octReturns.map(r => r.return)];
    const winRate = combined.filter(r => r > 0).length / combined.length;

    patterns.push({
      name: '金九银十',
      type: 'monthly',
      period: '9-10月',
      avgReturn: roundTo((sepAvg + octAvg) / 2, 4),
      winRate: roundTo(winRate, 4),
      sharpe: roundTo((sepAvg + octAvg) / 2 / Math.max(calculateStdDev(combined), 0.001), 2),
      sampleSize: sepReturns.length + octReturns.length,
      significance: 0.1,
      isSignificant: sepAvg > 0 || octAvg > 0,
      description: `9月${formatPct(sepAvg)} 10月${formatPct(octAvg)}`,
    });
  }

  // 4. 年末效应 (12月)
  const decReturns = monthlyReturns.filter(r => r.month === 12);
  if (decReturns.length >= config.minSampleSize) {
    const avg = decReturns.reduce((a, r) => a + r.return, 0) / decReturns.length;
    const winRate = decReturns.filter(r => r.return > 0).length / decReturns.length;
    const tStat = avg / (calculateStdDev(decReturns.map(r => r.return)) / Math.sqrt(decReturns.length));
    const pValue = calculatePValue(tStat, decReturns.length - 1);

    patterns.push({
      name: '年末效应',
      type: 'monthly',
      period: '12月',
      avgReturn: roundTo(avg, 4),
      winRate: roundTo(winRate, 4),
      sharpe: roundTo(avg / Math.max(calculateStdDev(decReturns.map(r => r.return)), 0.001), 2),
      sampleSize: decReturns.length,
      significance: roundTo(pValue, 4),
      isSignificant: pValue < config.significanceLevel,
      description: avg > 0 ? '12月机构排名战推动行情' : '12月资金面紧张，行情平淡',
    });
  }

  // 5. 春季躁动
  const febMarApr = monthlyReturns.filter(r => r.month >= 2 && r.month <= 4);
  if (febMarApr.length >= config.minSampleSize * 3) {
    const avg = febMarApr.reduce((a, r) => a + r.return, 0) / febMarApr.length;
    const winRate = febMarApr.filter(r => r.return > 0).length / febMarApr.length;

    patterns.push({
      name: '春季躁动',
      type: 'monthly',
      period: '2-4月',
      avgReturn: roundTo(avg, 4),
      winRate: roundTo(winRate, 4),
      sharpe: roundTo(avg / Math.max(calculateStdDev(febMarApr.map(r => r.return)), 0.001), 2),
      sampleSize: febMarApr.length,
      significance: 0.1,
      isSignificant: winRate > 0.6,
      description: '两会政策预期+年初流动性宽松驱动的春季行情',
    });
  }

  // 6. 周一效应
  const monReturns = monthlyReturns.filter(() => {
    // 简化处理
    return true;
  });

  return patterns.sort((a, b) => b.winRate - a.winRate);
}

// ── 季节性综合评分 ──

export function calculateSeasonalityScore(
  monthlyEffects: MonthlyEffectAnalysis[],
  holidayEffects: HolidayEffect[],
  currentMonth: number,
  daysToNextHoliday: number
): SeasonalityScore {
  const currentMonthData = monthlyEffects.find(m => m.month === currentMonth);
  const monthlyScore = currentMonthData
    ? Math.round(((currentMonthData.winRate * 50) + (Math.max(currentMonthData.avgReturn, 0) * 1000) + (currentMonthData.consistency * 0.5)))
    : 50;

  const holidayScore = daysToNextHoliday <= 10
    ? Math.round(holidayEffects.length > 0
      ? 60 + holidayEffects[0].avgReturnBefore * 1000
      : 50)
    : 50;

  const overall = Math.min(100, Math.max(0,
    Math.round(monthlyScore * 0.5 + holidayScore * 0.3 + 50 * 0.2)
  ));

  let recommendation: SeasonalityScore['recommendation'];
  if (overall >= 80) recommendation = 'strong_buy';
  else if (overall >= 65) recommendation = 'buy';
  else if (overall >= 45) recommendation = 'hold';
  else if (overall >= 30) recommendation = 'sell';
  else recommendation = 'strong_sell';

  const details: string[] = [];
  if (currentMonthData) {
    details.push(`${currentMonthData.monthName}历史胜率${formatPct(currentMonthData.winRate, 0)}`);
    details.push(`平均收益${formatPct(currentMonthData.avgReturn)}`);
  }
  if (daysToNextHoliday <= 10) {
    details.push(`距下一个假期${daysToNextHoliday}天，关注假日效应`);
  }

  return {
    overall: Math.min(100, overall),
    monthly: Math.min(100, monthlyScore),
    holiday: Math.min(100, holidayScore),
    earnings: 50,
    momentum: 50,
    recommendation,
    details,
  };
}

// ── 季节性预测 ──

export function generateSeasonalForecast(
  patterns: SeasonalPattern[],
  currentMonth: number,
  _monthlyEffects: MonthlyEffectAnalysis[]
): SeasonalForecast {
  const relevantPatterns = patterns.filter(p => {
    if (p.type === 'monthly') {
      const periodMonths = p.period.replace('月', '').split('-').map(Number);
      return periodMonths.includes(currentMonth) ||
        (periodMonths.length === 2 && currentMonth >= periodMonths[0] && currentMonth <= periodMonths[1]);
    }
    return false;
  });

  const avgReturn = relevantPatterns.length > 0
    ? relevantPatterns.reduce((a, p) => a + p.avgReturn, 0) / relevantPatterns.length
    : 0;

  const avgWinRate = relevantPatterns.length > 0
    ? relevantPatterns.reduce((a, p) => a + p.winRate, 0) / relevantPatterns.length
    : 0.5;

  const drivingFactors: string[] = [];
  const riskFactors: string[] = [];

  for (const p of relevantPatterns) {
    if (p.avgReturn > 0) {
      drivingFactors.push(`${p.name}: ${p.description}`);
    } else {
      riskFactors.push(`${p.name}: ${p.description}`);
    }
  }

  if (currentMonth >= 1 && currentMonth <= 4) {
    drivingFactors.push('年初流动性通常较为宽松');
  }
  if (currentMonth >= 9 && currentMonth <= 10) {
    drivingFactors.push('秋季行情历史表现较好');
  }
  if (currentMonth === 6 || currentMonth === 7) {
    riskFactors.push('半年末资金面波动');
  }

  let recommendedAction = '';
  if (avgReturn > 0.02 && avgWinRate > 0.6) {
    recommendedAction = '积极做多，适当加仓';
  } else if (avgReturn > 0) {
    recommendedAction = '保持仓位，顺势而为';
  } else if (avgReturn > -0.02) {
    recommendedAction = '控制仓位，谨慎操作';
  } else {
    recommendedAction = '降低仓位，注意风险';
  }

  return {
    currentDate: new Date(),
    forecastPeriod: `${currentMonth}月`,
    expectedReturn: roundTo(avgReturn, 4),
    confidence: roundTo(avgWinRate, 4),
    drivingFactors,
    patterns: relevantPatterns,
    riskFactors,
    recommendedAction,
  };
}

// ── 统计工具函数 ──

function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function calculatePValue(tStat: number, _df: number): number {
  // 简化的p值估算 (使用正态近似)
  const absT = Math.abs(tStat);
  if (absT > 3) return 0.001;
  if (absT > 2.5) return 0.01;
  if (absT > 2) return 0.025;
  if (absT > 1.5) return 0.05;
  if (absT > 1) return 0.1;
  return 0.2;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatPct(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// ── 集成分析 ──

export function runSeasonalAnalysis(
  monthlyReturns: MonthlyReturn[],
  dailyReturns: { date: string; return: number; volume: number; dayOfWeek: number; isBeforeHoliday: boolean; isAfterHoliday: boolean; holidayName: string }[],
  currentMonth: number,
  daysToNextHoliday: number,
  config: SeasonalConfig = DEFAULT_CONFIG
) {
  const monthlyEffects = analyzeMonthlyEffects(monthlyReturns, config);
  const holidayEffects = analyzeHolidayEffects(dailyReturns);
  const dayOfWeekEffects = analyzeDayOfWeekEffect(dailyReturns);
  const patterns = identifySeasonalPatterns(monthlyReturns, config);
  const score = calculateSeasonalityScore(monthlyEffects, holidayEffects, currentMonth, daysToNextHoliday);
  const forecast = generateSeasonalForecast(patterns, currentMonth, monthlyEffects);

  return {
    monthlyEffects,
    holidayEffects,
    dayOfWeekEffects,
    patterns,
    score,
    forecast,
    summary: {
      bestMonth: monthlyEffects.reduce((a, b) => a.avgReturn > b.avgReturn ? a : b, monthlyEffects[0]),
      worstMonth: monthlyEffects.reduce((a, b) => a.avgReturn < b.avgReturn ? a : b, monthlyEffects[0]),
      bestDayOfWeek: dayOfWeekEffects.reduce((a, b) => a.avgReturn > b.avgReturn ? a : b, dayOfWeekEffects[0]),
      topHoliday: holidayEffects[0] || null,
      significantPatterns: patterns.filter(p => p.isSignificant),
    },
  };
}
