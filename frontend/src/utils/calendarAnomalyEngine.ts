/**
 * 日历异象引擎
 * A股特有日历效应: 春节效应、两会行情、年末效应、月初月末效应、节前节后效应
 */

export interface DailyReturn {
  date: string; // YYYY-MM-DD
  return: number; // 日收益率
  volume: number;
}

export interface CalendarEffect {
  name: string;
  description: string;
  avgReturn: number;
  winRate: number;
  sharpeRatio: number;
  tStatistic: number;
  sampleSize: number;
  significance: 'high' | 'medium' | 'low' | 'none';
}

export interface MonthEffect {
  month: number;
  monthName: string;
  avgReturn: number;
  medianReturn: number;
  winRate: number;
  bestYear: number;
  worstYear: number;
  consistency: number; // 0-100
}

export interface DayOfWeekEffect {
  dayOfWeek: number; // 0=Monday ... 4=Friday
  dayName: string;
  avgReturn: number;
  winRate: number;
  avgVolume: number;
  volumeRatio: number; // 相对平均
}

export interface TurnOfMonthEffect {
  period: 'start' | 'mid' | 'end';
  days: string;
  avgReturn: number;
  winRate: number;
  excessReturn: number; // 超额收益
}

export interface HolidayEffect {
  holiday: string;
  beforeAvgReturn: number;
  afterAvgReturn: number;
  beforeWinRate: number;
  afterWinRate: number;
  totalEffect: number;
  sampleSize: number;
}

export interface CalendarAnomalyReport {
  monthEffects: MonthEffect[];
  dayOfWeekEffects: DayOfWeekEffect[];
  turnOfMonthEffects: TurnOfMonthEffect[];
  holidayEffects: HolidayEffect[];
  topAnomalies: CalendarEffect[];
  marketPhase: 'bullish' | 'bearish' | 'neutral';
  currentSignal: string;
}

// 中国重要节假日（近似交易日）
const CN_HOLIDAYS: Record<string, { month: number; day: number; name: string }> = {
  spring_festival: { month: 1, day: 20, name: '春节' },
  qingming: { month: 4, day: 5, name: '清明节' },
  labor_day: { month: 5, day: 1, name: '劳动节' },
  dragon_boat: { month: 6, day: 10, name: '端午节' },
  mid_autumn: { month: 9, day: 15, name: '中秋节' },
  national_day: { month: 10, day: 1, name: '国庆节' },
};

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
];

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五'];

/**
 * 分析月份效应
 */
export function analyzeMonthEffect(returns: DailyReturn[]): MonthEffect[] {
  const byMonth = new Map<number, number[]>();
  const byMonthYear = new Map<string, number[]>();

  for (const r of returns) {
    const month = parseInt(r.date.split('-')[1], 10);
    const year = r.date.split('-')[0];
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(r.return);

    const key = `${year}-${month}`;
    if (!byMonthYear.has(key)) byMonthYear.set(key, []);
    byMonthYear.get(key)!.push(r.return);
  }

  // 计算每月年化收益
  const monthlyReturns = new Map<number, number[]>();
  for (const [key, rets] of byMonthYear) {
    const month = parseInt(key.split('-')[1], 10);
    const monthReturn = rets.reduce((a, b) => a + b, 0);
    if (!monthlyReturns.has(month)) monthlyReturns.set(month, []);
    monthlyReturns.get(month)!.push(monthReturn);
  }

  const effects: MonthEffect[] = [];

  for (let m = 1; m <= 12; m++) {
    const monthRets = monthlyReturns.get(m) || [];
    if (monthRets.length === 0) {
      effects.push({
        month: m, monthName: MONTH_NAMES[m - 1],
        avgReturn: 0, medianReturn: 0, winRate: 0,
        bestYear: 0, worstYear: 0, consistency: 0,
      });
      continue;
    }

    const sorted = [...monthRets].sort((a, b) => a - b);
    const avgReturn = monthRets.reduce((a, b) => a + b, 0) / monthRets.length;
    const medianReturn = sorted[Math.floor(sorted.length / 2)];
    const winRate = (monthRets.filter(r => r > 0).length / monthRets.length) * 100;
    const bestYear = Math.max(...monthRets);
    const worstYear = Math.min(...monthRets);

    // 一致性: 正收益比例和标准差
    const std = Math.sqrt(monthRets.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / monthRets.length);
    const consistency = Math.max(0, Math.min(100, winRate - std * 100));

    effects.push({
      month: m,
      monthName: MONTH_NAMES[m - 1],
      avgReturn: Math.round(avgReturn * 10000) / 100,
      medianReturn: Math.round(medianReturn * 10000) / 100,
      winRate: Math.round(winRate * 10) / 10,
      bestYear: Math.round(bestYear * 10000) / 100,
      worstYear: Math.round(worstYear * 10000) / 100,
      consistency: Math.round(consistency * 10) / 10,
    });
  }

  return effects;
}

/**
 * 分析星期效应
 */
export function analyzeDayOfWeekEffect(returns: DailyReturn[]): DayOfWeekEffect[] {
  const byDay = new Map<number, { returns: number[]; volumes: number[] }>();

  for (const r of returns) {
    const date = new Date(r.date);
    const dow = date.getDay(); // 0=Sun
    if (dow === 0 || dow === 6) continue; // 跳过周末
    const dowIdx = dow - 1; // 0=Mon ... 4=Fri

    if (!byDay.has(dowIdx)) byDay.set(dowIdx, { returns: [], volumes: [] });
    byDay.get(dowIdx)!.returns.push(r.return);
    byDay.get(dowIdx)!.volumes.push(r.volume);
  }

  const avgVolume = returns.reduce((a, r) => a + r.volume, 0) / returns.length;

  const effects: DayOfWeekEffect[] = [];
  for (let d = 0; d < 5; d++) {
    const data = byDay.get(d);
    if (!data || data.returns.length === 0) {
      effects.push({
        dayOfWeek: d, dayName: DAY_NAMES[d],
        avgReturn: 0, winRate: 0, avgVolume: 0, volumeRatio: 1,
      });
      continue;
    }

    const avgReturn = data.returns.reduce((a, b) => a + b, 0) / data.returns.length;
    const winRate = (data.returns.filter(r => r > 0).length / data.returns.length) * 100;
    const dayAvgVolume = data.volumes.reduce((a, b) => a + b, 0) / data.volumes.length;

    effects.push({
      dayOfWeek: d,
      dayName: DAY_NAMES[d],
      avgReturn: Math.round(avgReturn * 1000000) / 100,
      winRate: Math.round(winRate * 10) / 10,
      avgVolume: Math.round(dayAvgVolume),
      volumeRatio: Math.round((dayAvgVolume / avgVolume) * 100) / 100,
    });
  }

  return effects;
}

/**
 * 分析月初/月中/月末效应
 */
export function analyzeTurnOfMonthEffect(returns: DailyReturn[]): TurnOfMonthEffect[] {
  const groups: Record<string, number[]> = { start: [], mid: [], end: [] };

  for (const r of returns) {
    const day = parseInt(r.date.split('-')[2], 10);
    if (day <= 5) groups.start.push(r.return);
    else if (day >= 25) groups.end.push(r.return);
    else groups.mid.push(r.return);
  }

  const avgReturn = returns.reduce((a, r) => a + r.return, 0) / returns.length;

  const effects: TurnOfMonthEffect[] = [
    { period: 'start', days: '1-5日', avgReturn: 0, winRate: 0, excessReturn: 0 },
    { period: 'mid', days: '6-24日', avgReturn: 0, winRate: 0, excessReturn: 0 },
    { period: 'end', days: '25-31日', avgReturn: 0, winRate: 0, excessReturn: 0 },
  ];

  for (const effect of effects) {
    const rets = groups[effect.period];
    if (rets.length === 0) continue;

    effect.avgReturn = Math.round((rets.reduce((a, b) => a + b, 0) / rets.length) * 1000000) / 100;
    effect.winRate = Math.round((rets.filter(r => r > 0).length / rets.length) * 1000) / 10;
    effect.excessReturn = Math.round((effect.avgReturn - avgReturn * 100) * 100) / 100;
  }

  return effects;
}

/**
 * 分析节假日效应
 */
export function analyzeHolidayEffect(returns: DailyReturn[]): HolidayEffect[] {
  const effects: HolidayEffect[] = [];

  for (const [key, holiday] of Object.entries(CN_HOLIDAYS)) {
    const beforeReturns: number[] = [];
    const afterReturns: number[] = [];

    for (const r of returns) {
      const [, month, day] = r.date.split('-').map(Number);
      // 节前5个交易日
      if (month === holiday.month && day >= holiday.day - 7 && day < holiday.day) {
        beforeReturns.push(r.return);
      }
      // 节后5个交易日
      if (month === holiday.month && day > holiday.day && day <= holiday.day + 7) {
        afterReturns.push(r.return);
      }
    }

    const beforeAvg = beforeReturns.length > 0
      ? beforeReturns.reduce((a, b) => a + b, 0) / beforeReturns.length
      : 0;
    const afterAvg = afterReturns.length > 0
      ? afterReturns.reduce((a, b) => a + b, 0) / afterReturns.length
      : 0;

    effects.push({
      holiday: holiday.name,
      beforeAvgReturn: Math.round(beforeAvg * 1000000) / 100,
      afterAvgReturn: Math.round(afterAvg * 1000000) / 100,
      beforeWinRate: beforeReturns.length > 0
        ? Math.round((beforeReturns.filter(r => r > 0).length / beforeReturns.length) * 1000) / 10
        : 0,
      afterWinRate: afterReturns.length > 0
        ? Math.round((afterReturns.filter(r => r > 0).length / afterReturns.length) * 1000) / 10
        : 0,
      totalEffect: Math.round((beforeAvg + afterAvg) * 1000000) / 100,
      sampleSize: beforeReturns.length + afterReturns.length,
    });
  }

  return effects;
}

/**
 * 生成日历异象报告
 */
export function generateCalendarAnomalyReport(returns: DailyReturn[]): CalendarAnomalyReport {
  const monthEffects = analyzeMonthEffect(returns);
  const dayOfWeekEffects = analyzeDayOfWeekEffect(returns);
  const turnOfMonthEffects = analyzeTurnOfMonthEffect(returns);
  const holidayEffects = analyzeHolidayEffect(returns);

  // 识别 top 异象
  const allAnomalies: CalendarEffect[] = [];

  // 月份异象
  for (const me of monthEffects) {
    const tStat = me.avgReturn / (Math.abs(me.avgReturn) * 0.5 + 0.01) * Math.sqrt(me.consistency / 10);
    allAnomalies.push({
      name: me.monthName,
      description: `${me.monthName}平均收益 ${me.avgReturn}%，胜率 ${me.winRate}%`,
      avgReturn: me.avgReturn,
      winRate: me.winRate,
      sharpeRatio: 0,
      tStatistic: tStat,
      sampleSize: Math.round(me.consistency),
      significance: Math.abs(tStat) > 2 ? 'high' : Math.abs(tStat) > 1.5 ? 'medium' : 'low',
    });
  }

  // 星期异象
  for (const dow of dayOfWeekEffects) {
    const tStat = dow.avgReturn * 10;
    allAnomalies.push({
      name: dow.dayName,
      description: `${dow.dayName}平均收益 ${dow.avgReturn}%，成交量比 ${dow.volumeRatio}`,
      avgReturn: dow.avgReturn,
      winRate: dow.winRate,
      sharpeRatio: 0,
      tStatistic: tStat,
      sampleSize: 0,
      significance: Math.abs(tStat) > 2 ? 'high' : Math.abs(tStat) > 1.5 ? 'medium' : 'low',
    });
  }

  // 排序取 top
  const topAnomalies = allAnomalies
    .sort((a, b) => Math.abs(b.tStatistic) - Math.abs(a.tStatistic))
    .slice(0, 10);

  // 市场阶段
  const recentReturns = returns.slice(-20);
  const recentAvg = recentReturns.length > 0
    ? recentReturns.reduce((a, r) => a + r.return, 0) / recentReturns.length
    : 0;
  const marketPhase: 'bullish' | 'bearish' | 'neutral' =
    recentAvg > 0.001 ? 'bullish' : recentAvg < -0.001 ? 'bearish' : 'neutral';

  // 当前信号
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentMonthEffect = monthEffects.find(m => m.month === currentMonth);
  const currentDow = now.getDay();
  const currentDowEffect = dayOfWeekEffects.find(d => d.dayOfWeek === (currentDow === 0 ? 4 : currentDow - 1));

  let currentSignal = '中性';
  if (currentMonthEffect && currentMonthEffect.avgReturn > 1) {
    currentSignal = `${currentMonthEffect.monthName}历史上偏强，平均收益 ${currentMonthEffect.avgReturn}%`;
  } else if (currentMonthEffect && currentMonthEffect.avgReturn < -1) {
    currentSignal = `${currentMonthEffect.monthName}历史上偏弱，平均收益 ${currentMonthEffect.avgReturn}%`;
  }

  return {
    monthEffects,
    dayOfWeekEffects,
    turnOfMonthEffects,
    holidayEffects,
    topAnomalies,
    marketPhase,
    currentSignal,
  };
}

/**
 * 检测日历效应是否在近期持续
 */
export function checkCalendarPersistence(
  returns: DailyReturn[],
  windowDays: number = 60
): {
  monthPersistence: { month: number; recent: number; historical: number; diverging: boolean }[];
  dowPersistence: { day: number; recent: number; historical: number; diverging: boolean }[];
} {
  const recent = returns.slice(-windowDays);
  const historical = returns.slice(0, -windowDays);

  const recentMonth = analyzeMonthEffect(recent);
  const historicalMonth = analyzeMonthEffect(historical);

  const monthPersistence = recentMonth.map((rm, i) => ({
    month: i + 1,
    recent: rm.avgReturn,
    historical: historicalMonth[i]?.avgReturn || 0,
    diverging: Math.abs(rm.avgReturn - (historicalMonth[i]?.avgReturn || 0)) > 2,
  }));

  const recentDow = analyzeDayOfWeekEffect(recent);
  const historicalDow = analyzeDayOfWeekEffect(historical);

  const dowPersistence = recentDow.map((rd, i) => ({
    day: i,
    recent: rd.avgReturn,
    historical: historicalDow[i]?.avgReturn || 0,
    diverging: Math.abs(rd.avgReturn - (historicalDow[i]?.avgReturn || 0)) > 0.5,
  }));

  return { monthPersistence, dowPersistence };
}
