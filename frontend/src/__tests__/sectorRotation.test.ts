import { describe, it, expect } from 'vitest';

// ==================== 行业轮动分析引擎 ====================

interface SectorData {
  name: string;
  code: string;
  returns1d: number;
  returns5d: number;
  returns20d: number;
  returns60d: number;
  momentum: number;
  volatility: number;
  pe: number;
  pb: number;
  turnover: number;
  fundFlow: number; // 资金净流入(亿)
  leadingStocks: { symbol: string; name: string; return: number }[];
}

interface RotationSignal {
  sector: string;
  signal: 'enter' | 'exit' | 'hold' | 'watch';
  strength: number;
  phase: 'early' | 'mid' | 'late';
  reasoning: string[];
  riskFactors: string[];
}

interface RotationCycle {
  phase: 'recovery' | 'expansion' | 'peak' | 'contraction';
  leadingSectors: string[];
  laggingSectors: string[];
  recommendedAllocation: Record<string, number>;
}

class SectorRotationAnalyzer {
  /** 分析行业动量 */
  analyzeMomentum(sectors: SectorData[]): { sector: string; compositeMomentum: number; rank: number }[] {
    const scored = sectors.map(s => {
      const composite = (s.returns5d * 0.1 + s.returns20d * 0.3 + s.returns60d * 0.4 + s.momentum * 0.2);
      return { sector: s.name, compositeMomentum: Math.round(composite * 100) / 100, rank: 0 };
    });
    scored.sort((a, b) => b.compositeMomentum - a.compositeMomentum);
    scored.forEach((s, i) => s.rank = i + 1);
    return scored;
  }

  /** 生成轮动信号 */
  generateSignals(sectors: SectorData[]): RotationSignal[] {
    return sectors.map(s => {
      const reasoning: string[] = [];
      const riskFactors: string[] = [];
      let signal: RotationSignal['signal'] = 'hold';
      let strength = 50;
      let phase: RotationSignal['phase'] = 'mid';

      // 动量分析
      if (s.returns20d > 10 && s.returns5d > 3) {
        signal = 'watch';
        reasoning.push('短期动量强劲，但注意追高风险');
        phase = 'late';
        strength = 70;
      } else if (s.returns20d > 5 && s.returns5d > 0) {
        signal = 'enter';
        reasoning.push('趋势确立，中期动量向好');
        phase = 'mid';
        strength = 75;
      } else if (s.returns20d < -5 && s.returns5d < -2) {
        signal = 'exit';
        reasoning.push('趋势走弱，动量衰减');
        strength = 65;
      } else if (s.returns60d < -10 && s.returns5d > 2) {
        signal = 'watch';
        reasoning.push('长期超跌后短期反弹，等待确认');
        phase = 'early';
        strength = 55;
      }

      // 资金流分析
      if (s.fundFlow > 50) reasoning.push(`资金大幅净流入${s.fundFlow}亿`);
      else if (s.fundFlow < -30) riskFactors.push(`资金净流出${Math.abs(s.fundFlow)}亿`);

      // 估值风险
      if (s.pe > 40) riskFactors.push(`PE(${s.pe.toFixed(1)})偏高`);
      if (s.volatility > 30) riskFactors.push(`波动率(${s.volatility.toFixed(1)}%)偏高`);

      return { sector: s.name, signal, strength, phase, reasoning, riskFactors };
    });
  }

  /** 识别经济周期 */
  identifyCycle(sectors: SectorData[]): RotationCycle {
    const momentum = this.analyzeMomentum(sectors);
    const avgReturn20d = sectors.reduce((s, sec) => s + sec.returns20d, 0) / sectors.length;
    const avgVolatility = sectors.reduce((s, sec) => s + sec.volatility, 0) / sectors.length;

    let phase: RotationCycle['phase'];
    if (avgReturn20d > 5) phase = 'expansion';
    else if (avgReturn20d > 0) phase = 'recovery';
    else if (avgReturn20d > -5) phase = 'contraction';
    else phase = 'peak';

    const leading = momentum.slice(0, 3).map(m => m.sector);
    const lagging = momentum.slice(-3).map(m => m.sector);

    // 周期性配置建议
    const allocation: Record<string, number> = {};
    if (phase === 'recovery') {
      allocation['金融'] = 0.3; allocation['地产'] = 0.2; allocation['消费'] = 0.2; allocation['科技'] = 0.2; allocation['医药'] = 0.1;
    } else if (phase === 'expansion') {
      allocation['科技'] = 0.3; allocation['消费'] = 0.25; allocation['制造'] = 0.2; allocation['金融'] = 0.15; allocation['医药'] = 0.1;
    } else if (phase === 'peak') {
      allocation['医药'] = 0.25; allocation['消费'] = 0.25; allocation['能源'] = 0.2; allocation['金融'] = 0.15; allocation['科技'] = 0.15;
    } else {
      allocation['医药'] = 0.3; allocation['消费'] = 0.25; allocation['金融'] = 0.2; allocation['公用事业'] = 0.15; allocation['科技'] = 0.1;
    }

    return { phase, leadingSectors: leading, laggingSectors: lagging, recommendedAllocation: allocation };
  }

  /** 行业强度排名 */
  rankByStrength(sectors: SectorData[]): { sector: string; strength: number; trend: 'up' | 'down' | 'sideways' }[] {
    return sectors.map(s => {
      const strength = (s.returns1d * 0.05 + s.returns5d * 0.15 + s.returns20d * 0.3 + s.returns60d * 0.5) * (1 + s.fundFlow / 1000);
      let trend: 'up' | 'down' | 'sideways' = 'sideways';
      if (s.returns20d > 3 && s.returns5d > 0) trend = 'up';
      else if (s.returns20d < -3 && s.returns5d < 0) trend = 'down';
      return { sector: s.name, strength: Math.round(strength * 100) / 100, trend };
    }).sort((a, b) => b.strength - a.strength);
  }

  /** 行业相关性矩阵 */
  calculateCorrelation(sectors: SectorData[]): { pair: string; correlation: number }[] {
    const pairs: { pair: string; correlation: number }[] = [];
    for (let i = 0; i < sectors.length; i++) {
      for (let j = i + 1; j < sectors.length; j++) {
        // 用收益率差异估算相关性
        const diff = Math.abs(sectors[i].returns20d - sectors[j].returns20d);
        const corr = Math.max(-1, 1 - diff / 20);
        pairs.push({ pair: `${sectors[i].name}-${sectors[j].name}`, correlation: Math.round(corr * 100) / 100 });
      }
    }
    return pairs;
  }

  /** 轮动策略回测 */
  backtestRotation(
    sectors: SectorData[],
    historicalReturns: Record<string, number[]>,
    lookback: number = 20
  ): { period: number; selectedSector: string; return: number; cumulative: number }[] {
    const results: { period: number; selectedSector: string; return: number; cumulative: number }[] = [];
    let cumulative = 1;

    const maxPeriods = Math.min(...Object.values(historicalReturns).map(r => r.length));

    for (let t = lookback; t < maxPeriods; t++) {
      // 计算每个行业过去lookback天的动量
      const momentums = sectors.map(s => {
        const returns = historicalReturns[s.code] || [];
        const window = returns.slice(Math.max(0, t - lookback), t);
        const mom = window.reduce((acc, r) => acc + r, 0);
        return { sector: s.name, code: s.code, momentum: mom };
      });

      momentums.sort((a, b) => b.momentum - a.momentum);
      const selected = momentums[0];
      const periodReturn = (historicalReturns[selected.code] || [])[t] || 0;
      cumulative *= (1 + periodReturn);

      results.push({ period: t, selectedSector: selected.sector, return: Math.round(periodReturn * 10000) / 100, cumulative: Math.round(cumulative * 10000) / 10000 });
    }

    return results;
  }
}

// ==================== 测试数据 ====================

function genSectors(): SectorData[] {
  return [
    { name: '科技', code: 'TECH', returns1d: 1.2, returns5d: 3.5, returns20d: 8.2, returns60d: 15, momentum: 0.7, volatility: 25, pe: 35, pb: 5, turnover: 3.2, fundFlow: 80, leadingStocks: [{ symbol: '001', name: '科技龙头', return: 12 }] },
    { name: '金融', code: 'FIN', returns1d: 0.3, returns5d: 1.2, returns20d: 3.5, returns60d: 8, momentum: 0.3, volatility: 15, pe: 8, pb: 0.9, turnover: 1.5, fundFlow: 30, leadingStocks: [{ symbol: '002', name: '银行龙头', return: 5 }] },
    { name: '消费', code: 'CONS', returns1d: 0.8, returns5d: 2.1, returns20d: 5.5, returns60d: 12, momentum: 0.5, volatility: 18, pe: 28, pb: 4, turnover: 2, fundFlow: 45, leadingStocks: [{ symbol: '003', name: '白酒龙头', return: 8 }] },
    { name: '医药', code: 'MED', returns1d: -1.5, returns5d: -4, returns20d: -8, returns60d: -12, momentum: -0.6, volatility: 20, pe: 30, pb: 4.5, turnover: 1.8, fundFlow: -50, leadingStocks: [{ symbol: '004', name: '医药龙头', return: -5 }] },
    { name: '制造', code: 'MFG', returns1d: 0.5, returns5d: 1.8, returns20d: 4, returns60d: 10, momentum: 0.4, volatility: 22, pe: 20, pb: 2.5, turnover: 2.5, fundFlow: 25, leadingStocks: [{ symbol: '005', name: '制造龙头', return: 6 }] },
  ];
}

// ==================== 测试 ====================

describe('SectorRotationAnalyzer 行业轮动分析', () => {
  const analyzer = new SectorRotationAnalyzer();
  const sectors = genSectors();

  describe('动量分析', () => {
    it('应计算综合动量', () => {
      const momentum = analyzer.analyzeMomentum(sectors);
      expect(momentum.length).toBe(5);
      expect(momentum[0].rank).toBe(1);
    });

    it('应按动量排序', () => {
      const momentum = analyzer.analyzeMomentum(sectors);
      for (let i = 1; i < momentum.length; i++) {
        expect(momentum[i - 1].compositeMomentum).toBeGreaterThanOrEqual(momentum[i].compositeMomentum);
      }
    });
  });

  describe('轮动信号', () => {
    it('应生成信号', () => {
      const signals = analyzer.generateSignals(sectors);
      expect(signals.length).toBe(5);
      for (const s of signals) {
        expect(['enter', 'exit', 'hold', 'watch']).toContain(s.signal);
        expect(s.strength).toBeGreaterThan(0);
      }
    });

    it('强动量行业应有enter或watch信号', () => {
      const signals = analyzer.generateSignals(sectors);
      const techSignal = signals.find(s => s.sector === '科技')!;
      expect(['enter', 'watch']).toContain(techSignal.signal);
    });

    it('弱动量行业应有exit信号', () => {
      const signals = analyzer.generateSignals(sectors);
      const medSignal = signals.find(s => s.sector === '医药')!;
      expect(medSignal.signal).toBe('exit');
    });

    it('应包含理由', () => {
      const signals = analyzer.generateSignals(sectors);
      const enterSignals = signals.filter(s => s.signal === 'enter');
      for (const s of enterSignals) {
        expect(s.reasoning.length).toBeGreaterThan(0);
      }
    });
  });

  describe('经济周期', () => {
    it('应识别当前周期', () => {
      const cycle = analyzer.identifyCycle(sectors);
      expect(['recovery', 'expansion', 'peak', 'contraction']).toContain(cycle.phase);
    });

    it('应识别领先行业', () => {
      const cycle = analyzer.identifyCycle(sectors);
      expect(cycle.leadingSectors.length).toBe(3);
    });

    it('应生成配置建议', () => {
      const cycle = analyzer.identifyCycle(sectors);
      const total = Object.values(cycle.recommendedAllocation).reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(1, 0);
    });
  });

  describe('强度排名', () => {
    it('应按强度排序', () => {
      const ranking = analyzer.rankByStrength(sectors);
      expect(ranking.length).toBe(5);
      for (let i = 1; i < ranking.length; i++) {
        expect(ranking[i - 1].strength).toBeGreaterThanOrEqual(ranking[i].strength);
      }
    });

    it('应判断趋势方向', () => {
      const ranking = analyzer.rankByStrength(sectors);
      for (const r of ranking) {
        expect(['up', 'down', 'sideways']).toContain(r.trend);
      }
    });
  });

  describe('行业相关性', () => {
    it('应计算相关性矩阵', () => {
      const corr = analyzer.calculateCorrelation(sectors);
      expect(corr.length).toBe(10); // C(5,2)=10
      for (const c of corr) {
        expect(c.correlation).toBeGreaterThanOrEqual(-1);
        expect(c.correlation).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('轮动回测', () => {
    it('应执行回测', () => {
      const hist: Record<string, number[]> = {};
      for (const s of sectors) {
        hist[s.code] = Array(100).fill(0).map(() => (Math.random() - 0.48) * 0.03);
      }
      const results = analyzer.backtestRotation(sectors, hist, 20);
      expect(results.length).toBe(80);
      for (const r of results) {
        expect(r.selectedSector).toBeDefined();
        expect(typeof r.return).toBe('number');
      }
    });

    it('累计收益应为正数序列', () => {
      const hist: Record<string, number[]> = {};
      for (const s of sectors) {
        hist[s.code] = Array(50).fill(0).map(() => 0.005); // 每天0.5%正收益
      }
      const results = analyzer.backtestRotation(sectors, hist, 10);
      for (const r of results) {
        expect(r.cumulative).toBeGreaterThan(0);
      }
    });
  });
});
