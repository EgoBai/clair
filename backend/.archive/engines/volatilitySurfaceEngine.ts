/**
 * 波动率曲面引擎 - Round 721
 * 构建和分析期权波动率曲面
 */
export interface VolPoint {
  strike: number;
  expiry: number; // days to expiry
  iv: number;     // implied volatility
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface VolSurface {
  underlying: string;
  timestamp: Date;
  points: VolPoint[];
  atmVol: number;
  skew25d: number;  // 25-delta put-call skew
  skew10d: number;
  termStructure: { expiry: number; atmVol: number }[];
}

export function buildVolSurface(underlying: string, points: VolPoint[]): VolSurface {
  if (!points.length) throw new Error('No vol points provided');

  const sorted = [...points].sort((a, b) => a.expiry - b.expiry || a.strike - b.strike);

  // ATM vol: closest to delta=0.5
  const atmPoints = sorted.filter(p => Math.abs(Math.abs(p.delta) - 0.5) < 0.05);
  const atmVol = atmPoints.length > 0
    ? atmPoints.reduce((s, p) => s + p.iv, 0) / atmPoints.length
    : sorted.reduce((s, p) => s + p.iv, 0) / sorted.length;

  // 25-delta skew
  const d25Calls = sorted.filter(p => Math.abs(p.delta - 0.25) < 0.05);
  const d25Puts = sorted.filter(p => Math.abs(p.delta + 0.25) < 0.05);
  const skew25d = d25Calls.length > 0 && d25Puts.length > 0
    ? (d25Puts.reduce((s, p) => s + p.iv, 0) / d25Puts.length) -
      (d25Calls.reduce((s, p) => s + p.iv, 0) / d25Calls.length)
    : 0;

  // 10-delta skew
  const d10Calls = sorted.filter(p => Math.abs(p.delta - 0.10) < 0.05);
  const d10Puts = sorted.filter(p => Math.abs(p.delta + 0.10) < 0.05);
  const skew10d = d10Calls.length > 0 && d10Puts.length > 0
    ? (d10Puts.reduce((s, p) => s + p.iv, 0) / d10Puts.length) -
      (d10Calls.reduce((s, p) => s + p.iv, 0) / d10Calls.length)
    : 0;

  // Term structure: ATM vol by expiry
  const expiryGroups = new Map<number, VolPoint[]>();
  for (const p of sorted) {
    const key = p.expiry;
    if (!expiryGroups.has(key)) expiryGroups.set(key, []);
    expiryGroups.get(key)!.push(p);
  }
  const termStructure = Array.from(expiryGroups.entries()).map(([expiry, pts]) => {
    const atm = pts.filter(p => Math.abs(Math.abs(p.delta) - 0.5) < 0.1);
    const vol = atm.length > 0
      ? atm.reduce((s, p) => s + p.iv, 0) / atm.length
      : pts.reduce((s, p) => s + p.iv, 0) / pts.length;
    return { expiry, atmVol: vol };
  }).sort((a, b) => a.expiry - b.expiry);

  return {
    underlying,
    timestamp: new Date(),
    points: sorted,
    atmVol,
    skew25d,
    skew10d,
    termStructure,
  };
}

export function interpolateIV(
  surface: VolSurface,
  strike: number,
  expiry: number
): number {
  // Bilinear interpolation on the vol surface
  const points = surface.points;
  if (points.length === 0) return 0;

  // Find nearest points
  const sameExpiry = points.filter(p => p.expiry === expiry);
  if (sameExpiry.length > 0) {
    const sorted = sameExpiry.sort((a, b) => Math.abs(a.strike - strike) - Math.abs(b.strike - strike));
    if (sorted.length >= 2) {
      const [p1, p2] = sorted;
      if (p1.strike === p2.strike) return p1.iv;
      const w = (strike - p1.strike) / (p2.strike - p1.strike);
      return p1.iv + w * (p2.iv - p1.iv);
    }
    return sorted[0].iv;
  }

  // Fall back to nearest expiry interpolation
  const expiries = [...new Set(points.map(p => p.expiry))].sort((a, b) => a - b);
  const lowerExp = expiries.filter(e => e <= expiry).pop() ?? expiries[0];
  const upperExp = expiries.filter(e => e >= expiry).shift() ?? expiries[expiries.length - 1];

  if (lowerExp === upperExp) {
    const expPts = points.filter(p => p.expiry === lowerExp);
    const nearest = expPts.sort((a, b) => Math.abs(a.strike - strike) - Math.abs(b.strike - strike))[0];
    return nearest?.iv ?? surface.atmVol;
  }

  const lowerIV = interpolateIV({ ...surface, points: points.filter(p => p.expiry === lowerExp) }, strike, lowerExp);
  const upperIV = interpolateIV({ ...surface, points: points.filter(p => p.expiry === upperExp) }, strike, upperExp);
  const w = (expiry - lowerExp) / (upperExp - lowerExp);
  return lowerIV + w * (upperIV - lowerIV);
}

export function detectVolAnomalies(surface: VolSurface): { type: string; description: string; severity: 'low' | 'medium' | 'high' }[] {
  const anomalies: { type: string; description: string; severity: 'low' | 'medium' | 'high' }[] = [];

  // Check for inverted term structure
  if (surface.termStructure.length >= 2) {
    const short = surface.termStructure[0];
    const long = surface.termStructure[surface.termStructure.length - 1];
    if (short.atmVol > long.atmVol * 1.2) {
      anomalies.push({
        type: 'inverted_term_structure',
        description: `短期波动率(${(short.atmVol * 100).toFixed(1)}%)显著高于长期(${(long.atmVol * 100).toFixed(1)}%)`,
        severity: 'high',
      });
    }
  }

  // Extreme skew
  if (Math.abs(surface.skew25d) > 0.1) {
    anomalies.push({
      type: 'extreme_skew',
      description: `25-delta偏度异常: ${(surface.skew25d * 100).toFixed(1)}%`,
      severity: Math.abs(surface.skew25d) > 0.2 ? 'high' : 'medium',
    });
  }

  // IV spike detection
  const avgIV = surface.points.reduce((s, p) => s + p.iv, 0) / surface.points.length;
  const highIV = surface.points.filter(p => p.iv > avgIV * 1.5);
  if (highIV.length > 0) {
    anomalies.push({
      type: 'iv_spike',
      description: `${highIV.length}个行权价的隐含波动率超过均值50%`,
      severity: highIV.length > surface.points.length * 0.2 ? 'high' : 'medium',
    });
  }

  return anomalies;
}

export function calculateVolSmile(points: VolPoint[], expiry: number): { strikes: number[]; ivs: number[]; smile: number[] } {
  const filtered = points.filter(p => p.expiry === expiry).sort((a, b) => a.strike - b.strike);
  const strikes = filtered.map(p => p.strike);
  const ivs = filtered.map(p => p.iv);

  // Calculate smile curvature (second derivative approximation)
  const smile: number[] = [];
  for (let i = 0; i < ivs.length; i++) {
    if (i === 0 || i === ivs.length - 1) {
      smile.push(0);
    } else {
      const d1 = (ivs[i] - ivs[i - 1]) / (strikes[i] - strikes[i - 1]);
      const d2 = (ivs[i + 1] - ivs[i]) / (strikes[i + 1] - strikes[i]);
      smile.push((d2 - d1) / ((strikes[i + 1] - strikes[i - 1]) / 2));
    }
  }

  return { strikes, ivs, smile };
}
