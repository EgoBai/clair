/**
 * 波动率期限结构引擎
 * - 隐含波动率曲面构建
 * - 期限结构斜率分析
 * - 波动率偏度/微笑
 * - 期限套利信号
 * - 风险中性密度
 */
export interface VolPoint {
  strike: number; // 相对行权价(S/K)
  expiry: number; // 到期天数
  iv: number; // 隐含波动率
  delta: number;
  gamma: number;
  volume: number;
}

export interface TermStructure {
  expiry: number;
  atmIV: number;
  skew: number; // 25delta put-call iv差
  smile: number; // 25delta wings
}

export interface VolTermStructureAnalysis {
  termStructure: TermStructure[];
  slope: number; // 期限斜率
  slopeSignal: 'steepening' | 'flattening' | 'stable';
  contangoBackwardation: 'contango' | 'backwardation';
  arbSignals: Array<{
    type: 'calendar' | 'vertical';
    expiry1?: number;
    expiry2?: number;
    strike1?: number;
    strike2?: number;
    expectedProfit: number;
  }>;
  riskNeutralSkew: number;
  termPremium: number;
  alerts: string[];
}

export function analyzeVolTermStructure(
  points: VolPoint[]
): VolTermStructureAnalysis {
  if (points.length === 0) throw new Error('波动率数据不能为空');

  // 按到期日分组
  const expiryMap = new Map<number, VolPoint[]>();
  for (const p of points) {
    const arr = expiryMap.get(p.expiry) ?? [];
    arr.push(p);
    expiryMap.set(p.expiry, arr);
  }

  // 构建期限结构
  const termStructure: TermStructure[] = [...expiryMap.entries()]
    .map(([expiry, pts]) => {
      const atm = pts.reduce((best, p) =>
        Math.abs(p.strike - 1) < Math.abs(best.strike - 1) ? p : best
      );
      const puts = pts.filter(p => p.delta < -0.15 && p.delta > -0.35);
      const calls = pts.filter(p => p.delta > 0.15 && p.delta < 0.35);
      const put25 = puts.reduce((best, p) => Math.abs(Math.abs(p.delta) - 0.25) < Math.abs(Math.abs(best.delta) - 0.25) ? p : best, puts[0]);
      const call25 = calls.reduce((best, p) => Math.abs(p.delta - 0.25) < Math.abs(best.delta - 0.25) ? p : best, calls[0]);
      
      return {
        expiry,
        atmIV: atm.iv,
        skew: put25 && call25 ? put25.iv - call25.iv : 0,
        smile: put25 && call25 ? (put25.iv + call25.iv) / 2 - atm.iv : 0,
      };
    })
    .sort((a, b) => a.expiry - b.expiry);

  // 期限斜率
  const slope = termStructure.length >= 2
    ? (termStructure[termStructure.length - 1].atmIV - termStructure[0].atmIV)
      / (termStructure[termStructure.length - 1].expiry - termStructure[0].expiry)
    : 0;

  const slopeSignal = slope > 0.001 ? 'steepening' : slope < -0.001 ? 'flattening' : 'stable';
  const contangoBackwardation = slope >= 0 ? 'contango' : 'backwardation';

  // 日历套利
  const arbSignals: VolTermStructureAnalysis['arbSignals'] = [];
  for (let i = 0; i < termStructure.length - 1; i++) {
    const spread = termStructure[i + 1].atmIV - termStructure[i].atmIV;
    if (spread < -0.02) {
      arbSignals.push({
        type: 'calendar',
        expiry1: termStructure[i].expiry,
        expiry2: termStructure[i + 1].expiry,
        expectedProfit: Math.abs(spread),
      });
    }
  }

  // 风险中性偏度
  const riskNeutralSkew = termStructure.reduce((s, t) => s + t.skew, 0) / (termStructure.length || 1);

  // 期限溢价
  const termPremium = termStructure.length >= 2
    ? termStructure[termStructure.length - 1].atmIV - termStructure[0].atmIV
    : 0;

  const alerts: string[] = [];
  if (contangoBackwardation === 'backwardation') alerts.push('波动率期限结构倒挂');
  if (Math.abs(slope) > 0.005) alerts.push('期限斜率异常');
  if (arbSignals.length > 0) alerts.push(`发现${arbSignals.length}个套利机会`);

  return { termStructure, slope, slopeSignal, contangoBackwardation, arbSignals, riskNeutralSkew, termPremium, alerts };
}
