/**
 * EventStudyEngine - 事件研究引擎
 * 分析特定事件对股票收益的影响
 */

export interface EventReturn {
  day: number;       // 相对事件日
  abnormalReturn: number;
  volume: number;
}

export interface EventStudyResult {
  car: number;             // 累计异常收益
  aar: number;             // 平均异常收益
  tStatistic: number;
  isSignificant: boolean;
  peakDay: number;
  peakAR: number;
  volumeEffect: number;
  windowDays: number;
}

export function runEventStudy(returns: EventReturn[], significance: number = 1.96): EventStudyResult | null {
  if (returns.length < 3) return null;
  const sorted = [...returns].sort((a, b) => a.day - b.day);
  const ars = sorted.map(r => r.abnormalReturn);
  const car = ars.reduce((s, v) => s + v, 0);
  const aar = car / ars.length;
  const variance = ars.reduce((s, v) => s + (v - aar) ** 2, 0) / (ars.length - 1);
  const se = Math.sqrt(variance / ars.length);
  const tStatistic = se > 0 ? aar / se : 0;

  let peakDay = sorted[0].day, peakAR = ars[0];
  ars.forEach((ar, i) => { if (Math.abs(ar) > Math.abs(peakAR)) { peakAR = ar; peakDay = sorted[i].day; } });

  const avgVol = sorted.reduce((s, r) => s + r.volume, 0) / sorted.length;
  const volumeEffect = sorted.length > 1 ? (sorted[sorted.length - 1].volume - sorted[0].volume) / avgVol : 0;

  return { car: Math.round(car * 10000) / 10000, aar: Math.round(aar * 10000) / 10000, tStatistic: Math.round(tStatistic * 100) / 100, isSignificant: Math.abs(tStatistic) > significance, peakDay, peakAR: Math.round(peakAR * 10000) / 10000, volumeEffect: Math.round(volumeEffect * 100) / 100, windowDays: sorted.length };
}
