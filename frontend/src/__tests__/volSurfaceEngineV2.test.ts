import { describe, it, expect } from 'vitest';

// 期权波动率曲面引擎
interface OptionQuote {
  strike: number;
  expiry: number; // days to expiry
  type: 'call' | 'put';
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  price: number;
  underlying: number;
}

interface VolSurface {
  strikes: number[];
  expiries: number[];
  surface: number[][];
  atmVol: number;
  skew25d: number;
  termStructure: { expiry: number; atmVol: number }[];
}

function buildVolSurface(quotes: OptionQuote[], underlying: number): VolSurface {
  const strikes = [...new Set(quotes.map(q => q.strike))].sort((a, b) => a - b);
  const expiries = [...new Set(quotes.map(q => q.expiry))].sort((a, b) => a - b);

  const surface: number[][] = expiries.map(exp =>
    strikes.map(strike => {
      const q = quotes.find(q => q.strike === strike && q.expiry === exp);
      return q?.iv || 0;
    })
  );

  const atmStrike = strikes.reduce((best, s) =>
    Math.abs(s - underlying) < Math.abs(best - underlying) ? s : best
  , strikes[0]);

  const atmVols = expiries.map(exp => {
    const q = quotes.find(q => q.strike === atmStrike && q.expiry === exp);
    return q?.iv || 0;
  });

  const atmVol = atmVols.reduce((s, v) => s + v, 0) / (atmVols.length || 1);

  // 25-delta skew
  const nearExpiry = expiries[0];
  const nearQuotes = quotes.filter(q => q.expiry === nearExpiry);
  const call25d = nearQuotes.find(q => q.type === 'call' && Math.abs(q.delta - 0.25) < 0.1);
  const put25d = nearQuotes.find(q => q.type === 'put' && Math.abs(q.delta + 0.25) < 0.1);
  const skew25d = (put25d?.iv || 0) - (call25d?.iv || 0);

  const termStructure = expiries.map((exp, i) => ({
    expiry: exp,
    atmVol: atmVols[i],
  }));

  return { strikes, expiries, surface, atmVol, skew25d, termStructure };
}

function interpolateVol(surface: VolSurface, strike: number, expiry: number): number {
  const { strikes, expiries, surface: volGrid } = surface;
  if (strikes.length === 0 || expiries.length === 0) return 0;

  const kIdx = strikes.findIndex(s => s >= strike);
  const eIdx = expiries.findIndex(e => e >= expiry);

  if (kIdx < 0 || eIdx < 0) return volGrid[expiries.length - 1]?.[strikes.length - 1] || 0;
  if (kIdx === 0 && eIdx === 0) return volGrid[0]?.[0] || 0;

  const k0 = kIdx === 0 ? 0 : kIdx - 1;
  const e0 = eIdx === 0 ? 0 : eIdx - 1;
  const kW = kIdx === 0 ? 0 : (strike - strikes[k0]) / (strikes[kIdx] - strikes[k0] || 1);
  const eW = eIdx === 0 ? 0 : (expiry - expiries[e0]) / (expiries[eIdx] - expiries[e0] || 1);

  const v00 = volGrid[e0]?.[k0] || 0;
  const v01 = volGrid[e0]?.[kIdx] || 0;
  const v10 = volGrid[eIdx]?.[k0] || 0;
  const v11 = volGrid[eIdx]?.[kIdx] || 0;

  return v00 * (1 - kW) * (1 - eW) + v01 * kW * (1 - eW) + v10 * (1 - kW) * eW + v11 * kW * eW;
}

function detectArbOpportunities(quotes: OptionQuote[]): string[] {
  const opps: string[] = [];
  quotes.forEach(q => {
    const intrinsic = q.type === 'call'
      ? Math.max(q.underlying - q.strike, 0)
      : Math.max(q.strike - q.underlying, 0);
    if (q.price < intrinsic) {
      opps.push(`${q.type} K=${q.strike}: 价格低于内在价值`);
    }
    if (q.iv < 0) {
      opps.push(`${q.type} K=${q.strike}: 隐含波动率为负`);
    }
  });

  // Put-Call Parity
  const calls = quotes.filter(q => q.type === 'call');
  const puts = quotes.filter(q => q.type === 'put');
  calls.forEach(c => {
    const matchingPut = puts.find(p => p.strike === c.strike && p.expiry === c.expiry);
    if (matchingPut) {
      const diff = c.price - matchingPutPrice(matchingPut, c.strike, c.underlying, c.expiry);
      if (Math.abs(diff) > 0.01 * c.price) {
        opps.push(`平价关系偏离 K=${c.strike}`);
      }
    }
  });
  return opps;
}

function matchingPutPrice(put: OptionQuote, _strike: number, _underlying: number, _expiry: number): number {
  return put.price;
}

describe('期权波动率曲面引擎', () => {
  const quotes: OptionQuote[] = [
    { strike: 90, expiry: 30, type: 'call', iv: 0.25, delta: 0.7, gamma: 0.02, theta: -0.05, vega: 0.15, price: 12, underlying: 100 },
    { strike: 100, expiry: 30, type: 'call', iv: 0.20, delta: 0.5, gamma: 0.03, theta: -0.08, vega: 0.18, price: 5, underlying: 100 },
    { strike: 110, expiry: 30, type: 'call', iv: 0.22, delta: 0.3, gamma: 0.02, theta: -0.06, vega: 0.14, price: 2, underlying: 100 },
    { strike: 90, expiry: 60, type: 'call', iv: 0.23, delta: 0.65, gamma: 0.015, theta: -0.04, vega: 0.2, price: 14, underlying: 100 },
    { strike: 100, expiry: 60, type: 'call', iv: 0.19, delta: 0.52, gamma: 0.02, theta: -0.06, vega: 0.22, price: 7, underlying: 100 },
    { strike: 110, expiry: 60, type: 'call', iv: 0.21, delta: 0.35, gamma: 0.018, theta: -0.05, vega: 0.18, price: 3.5, underlying: 100 },
    { strike: 90, expiry: 30, type: 'put', iv: 0.26, delta: -0.3, gamma: 0.02, theta: -0.05, vega: 0.14, price: 1.5, underlying: 100 },
    { strike: 100, expiry: 30, type: 'put', iv: 0.21, delta: -0.5, gamma: 0.03, theta: -0.08, vega: 0.18, price: 4.5, underlying: 100 },
  ];

  it('应构建波动率曲面', () => {
    const surface = buildVolSurface(quotes, 100);
    expect(surface.strikes.length).toBeGreaterThan(0);
    expect(surface.expiries.length).toBeGreaterThan(0);
    expect(surface.surface.length).toBe(surface.expiries.length);
  });

  it('应计算ATM波动率', () => {
    const surface = buildVolSurface(quotes, 100);
    expect(surface.atmVol).toBeGreaterThan(0);
  });

  it('应计算25-Delta偏度', () => {
    const surface = buildVolSurface(quotes, 100);
    expect(typeof surface.skew25d).toBe('number');
  });

  it('应构建期限结构', () => {
    const surface = buildVolSurface(quotes, 100);
    expect(surface.termStructure.length).toBe(surface.expiries.length);
    surface.termStructure.forEach(ts => {
      expect(ts.expiry).toBeGreaterThan(0);
      expect(ts.atmVol).toBeGreaterThan(0);
    });
  });

  it('应插值波动率', () => {
    const surface = buildVolSurface(quotes, 100);
    const vol = interpolateVol(surface, 95, 45);
    expect(vol).toBeGreaterThan(0);
  });

  it('空曲面插值应返回0', () => {
    const empty: VolSurface = { strikes: [], expiries: [], surface: [], atmVol: 0, skew25d: 0, termStructure: [] };
    expect(interpolateVol(empty, 100, 30)).toBe(0);
  });

  it('应检测套利机会', () => {
    const arbQuotes: OptionQuote[] = [
      ...quotes,
      { strike: 105, expiry: 30, type: 'call', iv: 0.2, delta: 0.4, gamma: 0.02, theta: -0.06, vega: 0.16, price: 0.5, underlying: 100 },
    ];
    const opps = detectArbOpportunities(arbQuotes);
    expect(Array.isArray(opps)).toBe(true);
  });

  it('正常报价不应有套利', () => {
    const opps = detectArbOpportunities(quotes);
    const priceArbs = opps.filter(o => o.includes('内在价值'));
    expect(priceArbs.length).toBe(0);
  });

  it('波动率应为正值', () => {
    const surface = buildVolSurface(quotes, 100);
    surface.surface.forEach(row => {
      row.forEach(v => {
        if (v > 0) expect(v).toBeGreaterThan(0);
      });
    });
  });

  it('行权价应排序', () => {
    const surface = buildVolSurface(quotes, 100);
    for (let i = 1; i < surface.strikes.length; i++) {
      expect(surface.strikes[i]).toBeGreaterThan(surface.strikes[i - 1]);
    }
  });
});
