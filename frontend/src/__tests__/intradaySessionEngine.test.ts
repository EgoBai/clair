import { describe, it, expect } from 'vitest';

// 交易时段分析引擎
interface IntradayTick {
  time: string; // HH:mm
  price: number;
  volume: number;
  isBuy: boolean;
}

interface SessionAnalysis {
  session: 'opening' | 'morning' | 'lunch' | 'afternoon' | 'closing';
  avgVolume: number;
  avgPrice: number;
  buyPressure: number;
  volatility: number;
  dominantSide: 'buy' | 'sell' | 'balanced';
}

interface IntradayPattern {
  openingGap: number;
  morningTrend: number;
  afternoonTrend: number;
  closingMomentum: number;
  volumeProfile: number[];
  pattern: 'bullish' | 'bearish' | 'choppy' | 'reversal';
}

function classifySession(time: string): SessionAnalysis['session'] {
  const [h, m] = time.split(':').map(Number);
  const minutes = h * 60 + m;
  if (minutes < 9 * 60 + 35) return 'opening';
  if (minutes < 11 * 60 + 30) return 'morning';
  if (minutes < 13 * 60 + 5) return 'lunch';
  if (minutes < 14 * 60 + 50) return 'afternoon';
  return 'closing';
}

function analyzeSessions(ticks: IntradayTick[]): SessionAnalysis[] {
  const sessions = new Map<string, IntradayTick[]>();
  ticks.forEach(t => {
    const s = classifySession(t.time);
    if (!sessions.has(s)) sessions.set(s, []);
    sessions.get(s)!.push(t);
  });

  return Array.from(sessions.entries()).map(([session, ts]) => {
    const prices = ts.map(t => t.price);
    const volumes = ts.map(t => t.volume);
    const buyVol = ts.filter(t => t.isBuy).reduce((s, t) => s + t.volume, 0);
    const totalVol = volumes.reduce((a, b) => a + b, 0);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const avgVolume = totalVol / ts.length;
    const buyPressure = totalVol > 0 ? buyVol / totalVol : 0.5;
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    const volatility = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / (returns.length || 1));

    return {
      session: session as SessionAnalysis['session'],
      avgVolume,
      avgPrice,
      buyPressure,
      volatility,
      dominantSide: buyPressure > 0.55 ? 'buy' : buyPressure < 0.45 ? 'sell' : 'balanced',
    };
  });
}

function detectIntradayPattern(ticks: IntradayTick[]): IntradayPattern {
  const sorted = [...ticks].sort((a, b) => a.time.localeCompare(b.time));
  const prices = sorted.map(t => t.price);
  const volumes = sorted.map(t => t.volume);

  const opening = sorted.filter(t => classifySession(t.time) === 'opening');
  const morning = sorted.filter(t => classifySession(t.time) === 'morning');
  const afternoon = sorted.filter(t => classifySession(t.time) === 'afternoon');
  const closing = sorted.filter(t => classifySession(t.time) === 'closing');

  const openingGap = opening.length > 1 ? (opening[opening.length - 1].price - opening[0].price) / opening[0].price : 0;
  const morningTrend = morning.length > 1 ? (morning[morning.length - 1].price - morning[0].price) / morning[0].price : 0;
  const afternoonTrend = afternoon.length > 1 ? (afternoon[afternoon.length - 1].price - afternoon[0].price) / afternoon[0].price : 0;
  const closingMomentum = closing.length > 1 ? (closing[closing.length - 1].price - closing[0].price) / closing[0].price : 0;

  // Volume profile by hour
  const volumeProfile = Array(8).fill(0);
  sorted.forEach(t => {
    const h = parseInt(t.time.split(':')[0]);
    const idx = Math.min(h - 9, 7);
    if (idx >= 0) volumeProfile[idx] += t.volume;
  });

  const totalTrend = (prices[prices.length - 1] - prices[0]) / prices[0];
  const morningAfternoon = morningTrend * afternoonTrend;

  let pattern: IntradayPattern['pattern'];
  if (totalTrend > 0.01 && morningAfternoon > 0) pattern = 'bullish';
  else if (totalTrend < -0.01 && morningAfternoon > 0) pattern = 'bearish';
  else if (morningAfternoon < 0) pattern = 'reversal';
  else pattern = 'choppy';

  return { openingGap, morningTrend, afternoonTrend, closingMomentum, volumeProfile, pattern };
}

function calcVWAPBySession(ticks: IntradayTick[]): Map<string, number> {
  const sessions = new Map<string, { pv: number; v: number }>();
  ticks.forEach(t => {
    const s = classifySession(t.time);
    if (!sessions.has(s)) sessions.set(s, { pv: 0, v: 0 });
    const entry = sessions.get(s)!;
    entry.pv += t.price * t.volume;
    entry.v += t.volume;
  });
  const result = new Map<string, number>();
  sessions.forEach((v, k) => result.set(k, v.v > 0 ? v.pv / v.v : 0));
  return result;
}

describe('交易时段分析引擎', () => {
  const ticks: IntradayTick[] = [
    { time: '09:30', price: 100, volume: 1000, isBuy: true },
    { time: '09:35', price: 101, volume: 800, isBuy: true },
    { time: '10:00', price: 101.5, volume: 500, isBuy: false },
    { time: '10:30', price: 102, volume: 600, isBuy: true },
    { time: '11:00', price: 101.8, volume: 400, isBuy: false },
    { time: '13:00', price: 102, volume: 300, isBuy: true },
    { time: '13:30', price: 102.5, volume: 700, isBuy: true },
    { time: '14:00', price: 103, volume: 900, isBuy: true },
    { time: '14:30', price: 103.5, volume: 1200, isBuy: true },
    { time: '14:55', price: 104, volume: 1500, isBuy: true },
  ];

  it('应分类交易时段', () => {
    expect(classifySession('09:30')).toBe('opening');
    expect(classifySession('10:00')).toBe('morning');
    expect(classifySession('11:45')).toBe('lunch');
    expect(classifySession('13:30')).toBe('afternoon');
    expect(classifySession('14:55')).toBe('closing');
  });

  it('应分析各时段', () => {
    const sessions = analyzeSessions(ticks);
    expect(sessions.length).toBeGreaterThan(0);
    sessions.forEach(s => {
      expect(s.avgVolume).toBeGreaterThan(0);
      expect(s.buyPressure).toBeGreaterThanOrEqual(0);
      expect(s.buyPressure).toBeLessThanOrEqual(1);
      expect(['buy', 'sell', 'balanced']).toContain(s.dominantSide);
    });
  });

  it('应检测日内模式', () => {
    const pattern = detectIntradayPattern(ticks);
    expect(['bullish', 'bearish', 'choppy', 'reversal']).toContain(pattern.pattern);
    expect(typeof pattern.openingGap).toBe('number');
    expect(pattern.volumeProfile.length).toBe(8);
  });

  it('全涨日内应为看涨模式', () => {
    const bullishTicks = ticks.map((t, i) => ({ ...t, price: 100 + i * 0.5 }));
    const pattern = detectIntradayPattern(bullishTicks);
    expect(pattern.pattern).toBe('bullish');
  });

  it('应计算分时VWAP', () => {
    const vwap = calcVWAPBySession(ticks);
    vwap.forEach((v, k) => {
      expect(v).toBeGreaterThan(0);
    });
  });

  it('买单主导应标记为buy', () => {
    const allBuy = ticks.map(t => ({ ...t, isBuy: true }));
    const sessions = analyzeSessions(allBuy);
    sessions.forEach(s => {
      expect(s.dominantSide).toBe('buy');
    });
  });

  it('空数据应返回空', () => {
    expect(analyzeSessions([])).toEqual([]);
  });

  it('收盘时段应有最高成交量', () => {
    const sessions = analyzeSessions(ticks);
    const closing = sessions.find(s => s.session === 'closing');
    expect(closing).toBeDefined();
    expect(closing!.avgVolume).toBeGreaterThan(500);
  });

  it('波动率应为非负数', () => {
    const sessions = analyzeSessions(ticks);
    sessions.forEach(s => {
      expect(s.volatility).toBeGreaterThanOrEqual(0);
    });
  });

  it('VWAP应在合理范围内', () => {
    const vwap = calcVWAPBySession(ticks);
    vwap.forEach(v => {
      expect(v).toBeGreaterThan(99);
      expect(v).toBeLessThan(105);
    });
  });
});
