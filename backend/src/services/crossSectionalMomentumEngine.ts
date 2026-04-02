/**
 * CrossSectionalMomentumEngine - 截面动量引擎
 * 在每个时间截面上计算多只股票的相对动量排名
 */

export interface StockReturn { code: string; returns: number[]; }

export function crossSectionalScore(stocks: StockReturn[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (!stocks.length) return scores;
  const means = stocks.map(s => s.returns.reduce((a, b) => a + b, 0) / (s.returns.length || 1));
  const sorted = [...means].sort((a, b) => a - b);
  const n = sorted.length;
  stocks.forEach((s, i) => {
    const rank = sorted.indexOf(means[i]) / (n - 1 || 1);
    scores.set(s.code, rank * 2 - 1);
  });
  return scores;
}

export function momentumDecile(stocks: StockReturn[], decile: number): string[] {
  const scores = crossSectionalScore(stocks);
  const arr = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const size = Math.ceil(arr.length / 10);
  const start = (decile - 1) * size;
  return arr.slice(start, start + size).map(e => e[0]);
}

export function sectorNeutralMomentum(
  stocks: StockReturn[], sectorMap: Map<string, string>
): Map<string, number> {
  const bySector = new Map<string, StockReturn[]>();
  stocks.forEach(s => {
    const sec = sectorMap.get(s.code) || 'UNKNOWN';
    if (!bySector.has(sec)) bySector.set(sec, []);
    bySector.get(sec)!.push(s);
  });
  const result = new Map<string, number>();
  bySector.forEach(group => {
    const scores = crossSectionalScore(group);
    scores.forEach((v, k) => result.set(k, v));
  });
  return result;
}

export function momentumReversalSignal(returns: number[], lookback: number, reversal: number): number {
  if (returns.length < lookback + reversal) return 0;
  const recent = returns.slice(-lookback);
  const older = returns.slice(-lookback - reversal, -lookback);
  const recentMom = recent.reduce((a, b) => a + b, 0);
  const olderMom = older.reduce((a, b) => a + b, 0);
  return recentMom - olderMom * 0.5;
}
