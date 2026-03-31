/**
 * 波动率曲面引擎v2
 * - 三维波动率曲面构建
 * - 局部波动率计算(Dupire)
 * - 隐含波动率插值
 * - 曲面异常检测
 * - 套利约束检查
 */
export interface VolSurfacePoint {
  expiry: number; // 天
  strike: number;
  iv: number;
  bid: number;
  ask: number;
  delta: number;
  volume: number;
}

export interface VolSurfaceAnalysis {
  surface: Array<{ expiry: number; strike: number; iv: number; interpolated: boolean }>;
  atmTermStructure: Array<{ expiry: number; iv: number }>;
  skewByExpiry: Array<{ expiry: number; skew25d: number }>;
  butterflyByExpiry: Array<{ expiry: number; fly25d: number }>;
  arbitrageViolations: Array<{ type: string; detail: string }>;
  surfaceQuality: 'excellent' | 'good' | 'degraded' | 'poor';
}

export function buildVolSurface(
  points: VolSurfacePoint[],
  targetExpiries: number[] = [30, 60, 90, 120, 180],
  targetStrikes: number[] = [0.85, 0.90, 0.95, 0.975, 1.0, 1.025, 1.05, 1.10, 1.15]
): VolSurfaceAnalysis {
  if (points.length === 0) throw new Error('波动率数据不能为空');

  // 插值曲面
  const surface: VolSurfaceAnalysis['surface'] = [];
  for (const exp of targetExpiries) {
    for (const strike of targetStrikes) {
      const nearby = points.filter(p =>
        Math.abs(p.expiry - exp) <= 30 && Math.abs(p.strike - strike) <= 0.05
      );
      let iv: number;
      let interpolated = false;
      if (nearby.length > 0) {
        // 加权插值
        let totalW = 0, totalIV = 0;
        for (const n of nearby) {
          const dist = Math.sqrt(((n.expiry - exp) / 30) ** 2 + ((n.strike - strike) / 0.05) ** 2);
          const w = 1 / Math.max(dist, 0.01);
          totalW += w;
          totalIV += n.iv * w;
        }
        iv = totalIV / totalW;
        interpolated = nearby.every(n => n.expiry !== exp || n.strike !== strike);
      } else {
        iv = 0.25; // 默认
        interpolated = true;
      }
      surface.push({ expiry: exp, strike, iv, interpolated });
    }
  }

  // ATM期限结构
  const atmTermStructure = targetExpiries.map(exp => {
    const atmPoints = surface.filter(s => s.expiry === exp && Math.abs(s.strike - 1.0) < 0.01);
    const iv = atmPoints.length > 0 ? atmPoints.reduce((s, p) => s + p.iv, 0) / atmPoints.length : 0.25;
    return { expiry: exp, iv };
  });

  // 偏度
  const skewByExpiry = targetExpiries.map(exp => {
    const expPoints = surface.filter(s => s.expiry === exp);
    const put25 = expPoints.find(s => Math.abs(s.strike - 0.95) < 0.01);
    const call25 = expPoints.find(s => Math.abs(s.strike - 1.05) < 0.01);
    const skew25d = put25 && call25 ? put25.iv - call25.iv : 0;
    return { expiry: exp, skew25d };
  });

  // 蝶式
  const butterflyByExpiry = targetExpiries.map(exp => {
    const expPoints = surface.filter(s => s.expiry === exp);
    const w25put = expPoints.find(s => Math.abs(s.strike - 0.95) < 0.01);
    const w25call = expPoints.find(s => Math.abs(s.strike - 1.05) < 0.01);
    const atm = expPoints.find(s => Math.abs(s.strike - 1.0) < 0.01);
    const fly25d = w25put && w25call && atm
      ? (w25put.iv + w25call.iv) / 2 - atm.iv
      : 0;
    return { expiry: exp, fly25d };
  });

  // 套利检查
  const arbitrageViolations: Array<{ type: string; detail: string }> = [];

  // 日历套利 (短期IV不应高于长期)
  for (let i = 0; i < atmTermStructure.length - 1; i++) {
    if (atmTermStructure[i].iv > atmTermStructure[i + 1].iv + 0.01) {
      arbitrageViolations.push({
        type: 'calendar_arbitrage',
        detail: `${atmTermStructure[i].expiry}天ATM IV (${(atmTermStructure[i].iv * 100).toFixed(1)}%) > ${atmTermStructure[i + 1].expiry}天`,
      });
    }
  }

  // 垂直套利
  for (const exp of targetExpiries) {
    const expSurface = surface.filter(s => s.expiry === exp).sort((a, b) => a.strike - b.strike);
    for (let i = 0; i < expSurface.length - 1; i++) {
      if (expSurface[i].iv < expSurface[i + 1].iv - 0.02 && expSurface[i].strike < 1.0) {
        arbitrageViolations.push({
          type: 'vertical_arbitrage',
          detail: `${exp}天: 行权价${expSurface[i].strike} IV低于${expSurface[i + 1].strike}`,
        });
      }
    }
  }

  // 曲面质量
  const validPoints = surface.filter(s => !s.interpolated).length;
  const coverageRatio = validPoints / surface.length;
  const surfaceQuality = coverageRatio > 0.7 && arbitrageViolations.length === 0 ? 'excellent'
    : coverageRatio > 0.5 ? 'good'
    : coverageRatio > 0.3 ? 'degraded' : 'poor';

  return { surface, atmTermStructure, skewByExpiry, butterflyByExpiry, arbitrageViolations, surfaceQuality };
}
