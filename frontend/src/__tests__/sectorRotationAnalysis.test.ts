import { describe, it, expect } from 'vitest';

// 行业轮动分析引擎测试
describe('行业轮动分析引擎', () => {
  describe('行业动量排名', () => {
    function sectorMomentumRanking(sectors: { name: string; returns: number[] }[], period: number): { name: string; momentum: number; rank: number }[] {
      const scored = sectors.map(s => {
        const recent = s.returns.slice(-period);
        const momentum = recent.reduce((a, b) => a + b, 0) / recent.length;
        return { name: s.name, momentum };
      });
      scored.sort((a, b) => b.momentum - a.momentum);
      return scored.map((s, i) => ({ ...s, rank: i + 1 }));
    }

    it('按动量降序排列', () => {
      const sectors = [
        { name: 'A', returns: [0.02, 0.03, 0.01] },
        { name: 'B', returns: [-0.01, 0.01, 0.02] },
        { name: 'C', returns: [0.01, 0.02, 0.03] },
      ];
      const result = sectorMomentumRanking(sectors, 3);
      expect(result[0].momentum).toBeGreaterThanOrEqual(result[1].momentum);
    });

    it('排名连续', () => {
      const sectors = [
        { name: 'A', returns: [0.01] },
        { name: 'B', returns: [0.02] },
        { name: 'C', returns: [0.03] },
      ];
      const result = sectorMomentumRanking(sectors, 1);
      expect(result.map(s => s.rank)).toEqual([1, 2, 3]);
    });
  });

  describe('行业相对强弱', () => {
    function relativeStrength(sectorReturns: number[], benchmarkReturns: number[]): number[] {
      if (sectorReturns.length !== benchmarkReturns.length) return [];
      const rs: number[] = [1];
      for (let i = 1; i < sectorReturns.length; i++) {
        rs.push(rs[i - 1] * (1 + sectorReturns[i]) / (1 + benchmarkReturns[i]));
      }
      return rs;
    }

    it('同步走势RS=1', () => {
      const returns = [0.01, 0.02, -0.01];
      const rs = relativeStrength(returns, returns);
      rs.forEach(v => expect(v).toBeCloseTo(1, 5));
    });

    it('持续跑赢RS上升', () => {
      const sector = [0.02, 0.03, 0.02];
      const bench = [0.01, 0.01, 0.01];
      const rs = relativeStrength(sector, bench);
      expect(rs[2]).toBeGreaterThan(rs[1]);
    });

    it('长度不匹配返回空', () => {
      expect(relativeStrength([1, 2], [1])).toHaveLength(0);
    });

    it('初始RS为1', () => {
      expect(relativeStrength([0.01, 0.02], [0.02, 0.01])[0]).toBe(1);
    });
  });

  describe('行业估值比较', () => {
    interface SectorVal { name: string; pe: number; pb: number; divYield: number; }

    function valuationRanking(sectors: SectorVal[]): { name: string; score: number; rank: number }[] {
      const maxPE = Math.max(...sectors.map(s => s.pe > 0 ? s.pe : 0));
      const maxPB = Math.max(...sectors.map(s => s.pb > 0 ? s.pb : 0));
      const scored = sectors.map(s => {
        const peScore = s.pe > 0 ? (1 - s.pe / maxPE) * 40 : 0;
        const pbScore = s.pb > 0 ? (1 - s.pb / maxPB) * 40 : 0;
        const divScore = Math.min(s.divYield / 0.05, 1) * 20;
        return { name: s.name, score: peScore + pbScore + divScore };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.map((s, i) => ({ ...s, rank: i + 1 }));
    }

    it('低PE行业评分更高', () => {
      const sectors: SectorVal[] = [
        { name: 'A', pe: 10, pb: 1, divYield: 0.03 },
        { name: 'B', pe: 50, pb: 1, divYield: 0.03 },
      ];
      const result = valuationRanking(sectors);
      expect(result[0].name).toBe('A');
    });

    it('高股息率评分更高', () => {
      const sectors: SectorVal[] = [
        { name: 'A', pe: 15, pb: 1, divYield: 0.05 },
        { name: 'B', pe: 15, pb: 1, divYield: 0.01 },
      ];
      const result = valuationRanking(sectors);
      expect(result[0].name).toBe('A');
    });

    it('评分非负', () => {
      const sectors: SectorVal[] = [{ name: 'A', pe: 20, pb: 2, divYield: 0.02 }];
      valuationRanking(sectors).forEach(s => expect(s.score).toBeGreaterThanOrEqual(0));
    });
  });

  describe('行业集中度', () => {
    function herfindahlIndex(weights: number[]): number {
      if (weights.length === 0) return 0;
      return weights.reduce((s, w) => s + w ** 2, 0);
    }

    function diversificationRatio(weights: number[], volatilities: number[], correlation: number): number {
      if (weights.length === 0) return 0;
      const weightedVol = weights.reduce((s, w, i) => s + w * volatilities[i], 0);
      const portfolioVar = weights.reduce((s, w, i) => s + w * volatilities[i] * weights.reduce((t, v, j) => t + v * volatilities[j] * (i === j ? 1 : correlation), 0), 0);
      const portfolioVol = Math.sqrt(portfolioVar);
      return portfolioVol === 0 ? 0 : weightedVol / portfolioVol;
    }

    it('单一行业HHI=1', () => {
      expect(herfindahlIndex([1])).toBe(1);
    });

    it('等权N行业HHI=1/N', () => {
      expect(herfindahlIndex([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25, 5);
    });

    it('HHI在[1/N, 1]之间', () => {
      const hhi = herfindahlIndex([0.6, 0.3, 0.1]);
      expect(hhi).toBeGreaterThanOrEqual(1 / 3);
      expect(hhi).toBeLessThanOrEqual(1);
    });

    it('空数据返回0', () => {
      expect(herfindahlIndex([])).toBe(0);
    });

    it('分散化比率大于等于1', () => {
      const dr = diversificationRatio([0.5, 0.5], [0.2, 0.3], 0.5);
      expect(dr).toBeGreaterThanOrEqual(1);
    });

    it('负相关分散化比率更高', () => {
      const drNeg = diversificationRatio([0.5, 0.5], [0.2, 0.2], -0.5);
      const drPos = diversificationRatio([0.5, 0.5], [0.2, 0.2], 0.5);
      expect(drNeg).toBeGreaterThan(drPos);
    });
  });

  describe('风格轮动', () => {
    function styleRotation(styleReturns: Record<string, number[]>): { leader: string; laggard: string; trend: string } {
      const avgReturns: Record<string, number> = {};
      for (const [style, returns] of Object.entries(styleReturns)) {
        avgReturns[style] = returns.reduce((a, b) => a + b, 0) / returns.length;
      }
      const sorted = Object.entries(avgReturns).sort((a, b) => b[1] - a[1]);
      return {
        leader: sorted[0][0],
        laggard: sorted[sorted.length - 1][0],
        trend: sorted[0][1] > 0 ? 'risk-on' : 'risk-off',
      };
    }

    it('识别领涨风格', () => {
      const result = styleRotation({
        growth: [0.03, 0.04],
        value: [0.01, 0.02],
        dividend: [0.005, 0.01],
      });
      expect(result.leader).toBe('growth');
    });

    it('识别领跌风格', () => {
      const result = styleRotation({
        growth: [0.03, 0.04],
        value: [-0.02, -0.01],
      });
      expect(result.laggard).toBe('value');
    });

    it('空数据处理', () => {
      expect(() => styleRotation({})).toThrow();
    });
  });
});
