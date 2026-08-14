/**
 * 真实因子引擎 — 纯函数单测（确定性数据，无 RNG）
 * 验证：pearson/spearman 符号、横截面 IC 方向、五分位多空方向、
 * 相关性矩阵对角=1、合成权重归一化。
 *
 * 注：生产代码横截面 IC 要求每期 ≥10 只个股，故测试每个「月」横截面用 12 只个股。
 */

import {
  pearson,
  spearman,
  mean,
  std,
  meanCrossSectionalIC,
  quintileReturns,
  computeDecay,
  correlationMatrix,
  synthesize,
  type FactorObservation,
} from '../services/factorEngine';

/**
 * 构造 nDates 个月 × nStocks 只个股的横截面面板；sign 控制因子值与前瞻收益的相关性方向。
 * 注：因子值与前瞻收益为「正相关 + 可控噪声」，使每期 IC 在 ~0.9~1.0 间波动——
 * 既保证 IC>0，又让跨期 std(IC)>0 从而 ICIR>0（真实因子研究的常态；完美线性会导致 ICIR=0）。
 */
function buildPanel(sign: 1 | -1, nStocks = 12, nDates = 3): Map<string, FactorObservation[]> {
  const m = new Map<string, FactorObservation[]>();
  for (let d = 0; d < nDates; d++) {
    const month = `2024-${String(d + 1).padStart(2, '0')}`;
    const arr: FactorObservation[] = [];
    for (let s = 0; s < nStocks; s++) {
      const fv = s + 1;
      // 噪声随月份/个股确定性变化（非 RNG），幅度随月份放大，制造跨期 IC 方差
      const noise = ((s % 3) - 1) * (d + 1) * 0.005;
      arr.push({ date: month, ticker: `S${s}`, factorValue: fv, nextReturn: (sign * fv) / 100 + noise });
    }
    m.set(month, arr);
  }
  return m;
}

describe('基础统计', () => {
  it('pearson 同向=1 / 反向=-1 / 无关≈0', () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 6);
    // 正交向量组（dev 点积为 0）→ 相关系数精确为 0；[1,0]/[0,1] 实际是完美负相关，不可用
    expect(pearson([1, 2, 3, 4], [1, -3, 3, -1])).toBeCloseTo(0, 6);
  });

  it('spearman 与 pearson 在单调变换下一致', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 6);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 6);
  });

  it('mean/std 正确', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(std([2, 4, 6])).toBeCloseTo(Math.sqrt((4 + 0 + 4) / 3), 6);
  });
});

describe('横截面 IC', () => {
  it('正相关因子 IC>0 且 ICIR>0、胜率=1', () => {
    const r = meanCrossSectionalIC(buildPanel(1));
    expect(r.icMean).toBeGreaterThan(0);
    expect(r.icir).toBeGreaterThan(0);
    expect(r.positiveRate).toBe(1);
    expect(r.periods).toBe(3);
  });

  it('反相关因子 IC<0', () => {
    const r = meanCrossSectionalIC(buildPanel(-1));
    expect(r.icMean).toBeLessThan(0);
  });

  it('样本过少返回零', () => {
    const r = meanCrossSectionalIC(new Map([['2024-01', [buildPanel(1).get('2024-01')![0]]]]));
    expect(r.periods).toBe(0);
    expect(r.icMean).toBe(0);
  });
});

describe('五分位分层', () => {
  const obs: FactorObservation[] = [];
  for (let i = 0; i < 60; i++) {
    obs.push({ date: '2024-01', ticker: `S${i}`, factorValue: i, nextReturn: i / 100 });
  }
  const q = quintileReturns(obs);
  it('多空收益为正且单调', () => {
    expect(q.longShort).toBeGreaterThan(0);
    expect(q.monotonic).toBe(true);
    expect(q.quintiles.length).toBe(5);
  });
  it('样本不足返回空', () => {
    expect(quintileReturns(obs.slice(0, 10)).quintiles.length).toBe(0);
  });
});

describe('因子衰减', () => {
  it('不同 horizon 返回对应 lag（以月计）且正相关 IC>0', () => {
    const byH = new Map<number, FactorObservation[]>();
    for (const h of [21, 63]) {
      const arr: FactorObservation[] = [];
      for (let d = 0; d < 3; d++) {
        for (let s = 0; s < 12; s++) {
          arr.push({ date: `2024-${String(d + 1).padStart(2, '0')}`, ticker: `S${s}`, factorValue: s + 1, nextReturn: (s + 1) / 100 });
        }
      }
      byH.set(h, arr);
    }
    const d = computeDecay(byH);
    expect(d.length).toBe(2);
    expect(d[0].lag).toBe(1);
    expect(d[1].lag).toBe(3);
    expect(d[0].ic).toBeGreaterThan(0);
  });
});

describe('相关性矩阵', () => {
  // 用非零方差的向量：X 与 Y 完全相同（相关=1），Z 为 X 的逆序（相关=-1）
  const mk = (vals: number[]) => {
    const m = new Map<string, number>();
    vals.forEach((v, i) => m.set(`S${i}`, v));
    return m;
  };
  const X = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const Y = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const Z = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const mtx = correlationMatrix({ X: mk(X), Y: mk(Y), Z: mk(Z) }, ['X', 'Y', 'Z']);
  it('对角为1、X与Y完全正相关、X与Z完全负相关', () => {
    expect(mtx.matrix[0][0]).toBe(1);
    expect(mtx.matrix[1][1]).toBe(1);
    expect(mtx.matrix[0][1]).toBeCloseTo(1, 6);
    expect(mtx.matrix[0][2]).toBeCloseTo(-1, 6);
  });
});

describe('ICIR 加权合成', () => {
  it('权重归一化且高 ICIR 因子权重最高', () => {
    const s = synthesize([
      { key: 'EP', cn: '估值-EP', ic: 0.05, icir: 0.8 },
      { key: 'VOL', cn: '波动率', ic: -0.04, icir: 0.1 },
    ]);
    const sum = s.factors.reduce((a, f) => a + f.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
    const ep = s.factors.find((f) => f.name === '估值-EP')!;
    const vol = s.factors.find((f) => f.name === '波动率')!;
    expect(ep.weight).toBeGreaterThan(vol.weight);
  });
});
