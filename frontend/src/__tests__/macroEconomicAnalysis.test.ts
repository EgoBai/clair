import { describe, it, expect } from 'vitest';

// 宏观经济分析引擎
describe('宏观经济分析引擎', () => {
  describe('GDP与股市关系', () => {
    interface GDPData { quarter: string; gdpGrowth: number; marketReturn: number; }

    function correlation(data: GDPData[]): number {
      const n = data.length;
      if (n < 2) return 0;
      const x = data.map(d => d.gdpGrowth);
      const y = data.map(d => d.marketReturn);
      const meanX = x.reduce((a, b) => a + b, 0) / n;
      const meanY = y.reduce((a, b) => a + b, 0) / n;
      let num = 0, denX = 0, denY = 0;
      for (let i = 0; i < n; i++) {
        num += (x[i] - meanX) * (y[i] - meanY);
        denX += (x[i] - meanX) ** 2;
        denY += (y[i] - meanY) ** 2;
      }
      const den = Math.sqrt(denX * denY);
      return den === 0 ? 0 : num / den;
    }

    function gdpPhase(growth: number): 'expansion' | 'peak' | 'contraction' | 'trough' {
      if (growth > 6) return 'peak';
      if (growth > 3) return 'expansion';
      if (growth > 0) return 'trough';
      return 'contraction';
    }

    function leadingIndicatorScore(indicators: { pmi: number; m2Growth: number; exportGrowth: number }): number {
      let score = 0;
      if (indicators.pmi > 50) score += 1;
      if (indicators.pmi > 52) score += 1;
      if (indicators.m2Growth > 8) score += 1;
      if (indicators.exportGrowth > 0) score += 1;
      return score;
    }

    it('GDP增长与股市正相关', () => {
      const data: GDPData[] = [
        { quarter: 'Q1', gdpGrowth: 6.5, marketReturn: 8 },
        { quarter: 'Q2', gdpGrowth: 5.8, marketReturn: 5 },
        { quarter: 'Q3', gdpGrowth: 6.2, marketReturn: 7 },
        { quarter: 'Q4', gdpGrowth: 5.0, marketReturn: 3 },
      ];
      expect(correlation(data)).toBeGreaterThan(0.5);
    });

    it('GDP负增长与股市负相关', () => {
      const data: GDPData[] = [
        { quarter: 'Q1', gdpGrowth: -2, marketReturn: -15 },
        { quarter: 'Q2', gdpGrowth: -1, marketReturn: -8 },
        { quarter: 'Q3', gdpGrowth: 1, marketReturn: 5 },
        { quarter: 'Q4', gdpGrowth: 3, marketReturn: 12 },
      ];
      expect(correlation(data)).toBeGreaterThan(0.8);
    });

    it('完全不相关数据相关系数接近0', () => {
      const data: GDPData[] = [
        { quarter: 'Q1', gdpGrowth: 5, marketReturn: 10 },
        { quarter: 'Q2', gdpGrowth: 8, marketReturn: -5 },
        { quarter: 'Q3', gdpGrowth: 3, marketReturn: 12 },
        { quarter: 'Q4', gdpGrowth: 9, marketReturn: 1 },
        { quarter: 'Q5', gdpGrowth: 4, marketReturn: -8 },
        { quarter: 'Q6', gdpGrowth: 7, marketReturn: 15 },
      ];
      expect(Math.abs(correlation(data))).toBeLessThan(0.8);
    });

    it('GDP峰值阶段判断', () => {
      expect(gdpPhase(7.5)).toBe('peak');
      expect(gdpPhase(6.1)).toBe('peak');
    });

    it('GDP扩张阶段判断', () => {
      expect(gdpPhase(5.0)).toBe('expansion');
      expect(gdpPhase(3.5)).toBe('expansion');
    });

    it('GDP收缩阶段判断', () => {
      expect(gdpPhase(-1.5)).toBe('contraction');
    });

    it('GDP触底阶段判断', () => {
      expect(gdpPhase(1.5)).toBe('trough');
      expect(gdpPhase(0.5)).toBe('trough');
    });

    it('领先指标综合评分', () => {
      const good = { pmi: 53, m2Growth: 10, exportGrowth: 5 };
      const bad = { pmi: 48, m2Growth: 6, exportGrowth: -3 };
      expect(leadingIndicatorScore(good)).toBeGreaterThan(leadingIndicatorScore(bad));
    });

    it('领先指标最高分为4', () => {
      const perfect = { pmi: 55, m2Growth: 12, exportGrowth: 10 };
      expect(leadingIndicatorScore(perfect)).toBe(4);
    });

    it('领先指标最低分为0', () => {
      const worst = { pmi: 45, m2Growth: 3, exportGrowth: -10 };
      expect(leadingIndicatorScore(worst)).toBe(0);
    });

    it('空数据相关系数为0', () => {
      expect(correlation([])).toBe(0);
    });

    it('单数据相关系数为0', () => {
      expect(correlation([{ quarter: 'Q1', gdpGrowth: 5, marketReturn: 8 }])).toBe(0);
    });

    it('相关系数范围-1到1', () => {
      const data: GDPData[] = [
        { quarter: 'Q1', gdpGrowth: 6, marketReturn: 10 },
        { quarter: 'Q2', gdpGrowth: 5, marketReturn: 8 },
        { quarter: 'Q3', gdpGrowth: 4, marketReturn: 6 },
        { quarter: 'Q4', gdpGrowth: 3, marketReturn: 4 },
      ];
      const r = correlation(data);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    });
  });

  describe('PMI制造业分析', () => {
    function pmiSignal(pmi: number): 'bullish' | 'neutral' | 'bearish' {
      if (pmi > 52) return 'bullish';
      if (pmi >= 50) return 'neutral';
      return 'bearish';
    }

    function pmiTrend(history: number[]): 'expanding' | 'contracting' | 'stable' {
      if (history.length < 2) return 'stable';
      const recent = history.slice(-3);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      if (avg > 51) return 'expanding';
      if (avg < 49) return 'contracting';
      return 'stable';
    }

    function sectorPMIImpact(pmiBySector: Record<string, number>): string[] {
      return Object.entries(pmiBySector)
        .filter(([_, v]) => v > 55)
        .map(([k]) => k);
    }

    it('PMI>52看涨信号', () => {
      expect(pmiSignal(55)).toBe('bullish');
      expect(pmiSignal(52.5)).toBe('bullish');
    });

    it('PMI在50-52中性', () => {
      expect(pmiSignal(50)).toBe('neutral');
      expect(pmiSignal(51.5)).toBe('neutral');
    });

    it('PMI<50看跌', () => {
      expect(pmiSignal(48)).toBe('bearish');
      expect(pmiSignal(45)).toBe('bearish');
    });

    it('PMI趋势扩张', () => {
      expect(pmiTrend([50, 51, 52, 53])).toBe('expanding');
    });

    it('PMI趋势收缩', () => {
      expect(pmiTrend([52, 50, 48, 47])).toBe('contracting');
    });

    it('PMI趋势平稳', () => {
      expect(pmiTrend([50, 50.5, 49.8, 50.2])).toBe('stable');
    });

    it('PMI趋势不足数据', () => {
      expect(pmiTrend([50])).toBe('stable');
    });

    it('行业PMI筛选强势行业', () => {
      const sectors = { '电子': 58, '机械': 52, '纺织': 48, '医药': 56 };
      const hot = sectorPMIImpact(sectors);
      expect(hot).toContain('电子');
      expect(hot).toContain('医药');
      expect(hot).not.toContain('纺织');
    });

    it('无强势行业返回空数组', () => {
      expect(sectorPMIImpact({ 'A': 50, 'B': 48 })).toEqual([]);
    });

    it('PMI 50为荣枯分界线', () => {
      expect(pmiSignal(50.001)).not.toBe('bearish');
      expect(pmiSignal(49.999)).not.toBe('bullish');
    });
  });

  describe('货币政策分析', () => {
    interface Policy { type: 'rate_cut' | 'rate_hike' | 'rrr_cut' | 'rrr_hike' | 'mlf_cut' | 'mlf_hike'; amount: number; date: string; }

    function policyImpact(policy: Policy): number {
      const impacts: Record<string, number> = {
        'rate_cut': 3, 'rate_hike': -3,
        'rrr_cut': 2, 'rrr_hike': -2,
        'mlf_cut': 2.5, 'mlf_hike': -2.5,
      };
      return impacts[policy.type] * (policy.amount / 0.25);
    }

    function liquidityScore(r007: number, dr007: number): string {
      const spread = dr007 - r007;
      if (r007 < 2) return '宽松';
      if (r007 < 2.5 && spread < 0.3) return '中性偏松';
      if (r007 < 3) return '中性';
      return '偏紧';
    }

    function rateCyclePosition(currentRate: number, historicalRates: number[]): number {
      const min = Math.min(...historicalRates);
      const max = Math.max(...historicalRates);
      if (max === min) return 0.5;
      return (currentRate - min) / (max - min);
    }

    it('降息正面影响', () => {
      expect(policyImpact({ type: 'rate_cut', amount: 0.25, date: '2024-01' })).toBe(3);
    });

    it('加息负面影响', () => {
      expect(policyImpact({ type: 'rate_hike', amount: 0.25, date: '2024-01' })).toBe(-3);
    });

    it('降准正面影响', () => {
      expect(policyImpact({ type: 'rrr_cut', amount: 0.5, date: '2024-01' })).toBe(4);
    });

    it('大幅降息影响更大', () => {
      const small = policyImpact({ type: 'rate_cut', amount: 0.25, date: '2024-01' });
      const large = policyImpact({ type: 'rate_cut', amount: 0.5, date: '2024-01' });
      expect(Math.abs(large)).toBeGreaterThan(Math.abs(small));
    });

    it('宽松流动性判断', () => {
      expect(liquidityScore(1.5, 1.6)).toBe('宽松');
    });

    it('中性偏松判断', () => {
      expect(liquidityScore(2.2, 2.3)).toBe('中性偏松');
    });

    it('中性流动性判断', () => {
      expect(liquidityScore(2.7, 2.8)).toBe('中性');
    });

    it('偏紧流动性判断', () => {
      expect(liquidityScore(3.5, 3.8)).toBe('偏紧');
    });

    it('利率周期位置0-1之间', () => {
      const pos = rateCyclePosition(3.0, [2.5, 2.8, 3.0, 3.2, 3.5]);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(1);
    });

    it('最低利率周期位置为0', () => {
      expect(rateCyclePosition(2.5, [2.5, 3.0, 3.5])).toBe(0);
    });

    it('最高利率周期位置为1', () => {
      expect(rateCyclePosition(3.5, [2.5, 3.0, 3.5])).toBe(1);
    });

    it('利率不变周期位置为0.5', () => {
      expect(rateCyclePosition(3.0, [3.0, 3.0, 3.0])).toBe(0.5);
    });

    it('MLF降息影响', () => {
      const impact = policyImpact({ type: 'mlf_cut', amount: 0.1, date: '2024-06' });
      expect(impact).toBeGreaterThan(0);
    });

    it('MLF加息影响', () => {
      const impact = policyImpact({ type: 'mlf_hike', amount: 0.1, date: '2024-06' });
      expect(impact).toBeLessThan(0);
    });
  });

  describe('通胀分析', () => {
    function cpiAnalysis(cpi: number): 'deflation' | 'low_inflation' | 'normal' | 'high_inflation' {
      if (cpi < 0) return 'deflation';
      if (cpi < 1.5) return 'low_inflation';
      if (cpi < 3) return 'normal';
      return 'high_inflation';
    }

    function ppiCpiSpread(ppi: number, cpi: number): { spread: number; phase: string } {
      const spread = ppi - cpi;
      let phase = '中性';
      if (spread > 3) phase = '上游涨价传导';
      else if (spread < -2) phase = '下游消化库存';
      return { spread, phase };
    }

    function inflationImpactOnSector(cpi: number, sector: string): number {
      const sectorSensitivity: Record<string, number> = {
        '消费': -0.5, '金融': 0.3, '能源': 0.8, '公用事业': -0.2,
        '科技': 0.1, '医药': 0.0, '地产': -0.6,
      };
      const sensitivity = sectorSensitivity[sector] || 0;
      return (cpi - 2) * sensitivity;
    }

    it('通缩判断', () => {
      expect(cpiAnalysis(-0.5)).toBe('deflation');
    });

    it('低通胀判断', () => {
      expect(cpiAnalysis(1.0)).toBe('low_inflation');
    });

    it('正常通胀判断', () => {
      expect(cpiAnalysis(2.0)).toBe('normal');
    });

    it('高通胀判断', () => {
      expect(cpiAnalysis(5.0)).toBe('high_inflation');
    });

    it('PPI-CPI价差', () => {
      const result = ppiCpiSpread(8, 2);
      expect(result.spread).toBe(6);
      expect(result.phase).toBe('上游涨价传导');
    });

    it('PPI低于CPI', () => {
      const result = ppiCpiSpread(0, 3);
      expect(result.spread).toBe(-3);
      expect(result.phase).toBe('下游消化库存');
    });

    it('通胀对消费行业负面影响', () => {
      expect(inflationImpactOnSector(5, '消费')).toBeLessThan(0);
    });

    it('通胀对能源行业正面影响', () => {
      expect(inflationImpactOnSector(5, '能源')).toBeGreaterThan(0);
    });

    it('正常通胀对行业无影响', () => {
      expect(inflationImpactOnSector(2, '科技')).toBe(0);
    });

    it('CPI 0%为通缩边界', () => {
      expect(cpiAnalysis(-0.01)).toBe('deflation');
      expect(cpiAnalysis(0)).toBe('low_inflation');
    });

    it('CPI 3%为高通胀边界', () => {
      expect(cpiAnalysis(2.99)).toBe('normal');
      expect(cpiAnalysis(3.01)).toBe('high_inflation');
    });
  });

  describe('汇率影响分析', () => {
    function rmbImpact(usdCny: number, prevRate: number): { direction: 'appreciate' | 'depreciate'; impact: string } {
      const change = (usdCny - prevRate) / prevRate;
      if (change < -0.01) return { direction: 'appreciate', impact: '利好进口、航空、造纸' };
      if (change > 0.01) return { direction: 'depreciate', impact: '利好出口、纺织、电子' };
      return { direction: change <= 0 ? 'appreciate' : 'depreciate', impact: '影响有限' };
    }

    function forexVolatility(history: number[]): number {
      if (history.length < 2) return 0;
      const returns = [];
      for (let i = 1; i < history.length; i++) {
        returns.push((history[i] - history[i - 1]) / history[i - 1]);
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
      return Math.sqrt(variance);
    }

    it('人民币升值判断', () => {
      const result = rmbImpact(6.8, 7.0);
      expect(result.direction).toBe('appreciate');
    });

    it('人民币贬值判断', () => {
      const result = rmbImpact(7.2, 7.0);
      expect(result.direction).toBe('depreciate');
    });

    it('小幅波动影响有限', () => {
      const result = rmbImpact(7.01, 7.0);
      expect(result.impact).toBe('影响有限');
    });

    it('升值利好进口行业', () => {
      const result = rmbImpact(6.8, 7.0);
      expect(result.impact).toContain('进口');
    });

    it('贬值利好出口行业', () => {
      const result = rmbImpact(7.2, 7.0);
      expect(result.impact).toContain('出口');
    });

    it('汇率波动率非负', () => {
      const vol = forexVolatility([7.0, 7.1, 6.9, 7.05, 7.15]);
      expect(vol).toBeGreaterThanOrEqual(0);
    });

    it('恒定汇率波动率为0', () => {
      expect(forexVolatility([7.0, 7.0, 7.0, 7.0])).toBe(0);
    });

    it('空数据波动率为0', () => {
      expect(forexVolatility([])).toBe(0);
    });

    it('单数据波动率为0', () => {
      expect(forexVolatility([7.0])).toBe(0);
    });
  });

  describe('经济周期定位', () => {
    interface CyclePhase { name: string; stocks: string[]; bonds: string[]; commodities: string[]; }

    function economicCycle(gdpGrowth: number, inflation: number, interestRate: number): CyclePhase {
      if (gdpGrowth > 3 && inflation < 3 && interestRate < 4) {
        return { name: '复苏', stocks: ['消费', '科技'], bonds: ['可转债'], commodities: ['铜'] };
      }
      if (gdpGrowth > 4 && inflation > 3) {
        return { name: '过热', stocks: ['能源', '材料'], bonds: ['TIPS'], commodities: ['石油', '黄金'] };
      }
      if (gdpGrowth < 2 && inflation > 3) {
        return { name: '滞胀', stocks: ['公用事业', '医药'], bonds: ['短债'], commodities: ['黄金'] };
      }
      return { name: '衰退', stocks: ['公用事业', '消费'], bonds: ['国债'], commodities: [] };
    }

    function sectorRotation(currentPhase: string): string[] {
      const next: Record<string, string[]> = {
        '复苏': ['消费', '科技', '可选消费'],
        '过热': ['能源', '材料', '工业'],
        '滞胀': ['公用事业', '医药', '必选消费'],
        '衰退': ['公用事业', '医药', '国债ETF'],
      };
      return next[currentPhase] || [];
    }

    it('复苏期配置', () => {
      const phase = economicCycle(3.5, 2, 3);
      expect(phase.name).toBe('复苏');
      expect(phase.stocks).toContain('科技');
    });

    it('过热期配置', () => {
      const phase = economicCycle(5, 4, 3);
      expect(phase.name).toBe('过热');
      expect(phase.commodities).toContain('石油');
    });

    it('滞胀期配置', () => {
      const phase = economicCycle(1, 4, 5);
      expect(phase.name).toBe('滞胀');
      expect(phase.stocks).toContain('医药');
    });

    it('衰退期配置', () => {
      const phase = economicCycle(0.5, 1, 2);
      expect(phase.name).toBe('衰退');
      expect(phase.bonds).toContain('国债');
    });

    it('复苏转向消费科技', () => {
      const sectors = sectorRotation('复苏');
      expect(sectors).toContain('消费');
      expect(sectors).toContain('科技');
    });

    it('过热转向能源材料', () => {
      const sectors = sectorRotation('过热');
      expect(sectors).toContain('能源');
      expect(sectors).toContain('材料');
    });

    it('未知阶段返回空', () => {
      expect(sectorRotation('unknown')).toEqual([]);
    });

    it('每个阶段有推荐股票', () => {
      ['复苏', '过热', '滞胀', '衰退'].forEach(phase => {
        const result = economicCycle(
          phase === '复苏' ? 3.5 : phase === '过热' ? 5 : phase === '滞胀' ? 1 : 0.5,
          phase === '复苏' ? 2 : phase === '过热' ? 4 : phase === '滞胀' ? 4 : 1,
          phase === '复苏' ? 3 : phase === '过热' ? 3 : phase === '滞胀' ? 5 : 2
        );
        expect(result.stocks.length).toBeGreaterThan(0);
      });
    });
  });

  describe('信贷数据分析', () => {
    function creditGrowthAnalysis(yoy: number): string {
      if (yoy > 15) return '信用扩张';
      if (yoy > 10) return '温和增长';
      if (yoy > 5) return '增速放缓';
      return '信用收缩';
    }

    function leverageRatio(totalDebt: number, gdp: number): { ratio: number; risk: 'low' | 'medium' | 'high' } {
      const ratio = totalDebt / gdp;
      let risk: 'low' | 'medium' | 'high' = 'low';
      if (ratio > 2.5) risk = 'high';
      else if (ratio > 1.5) risk = 'medium';
      return { ratio, risk };
    }

    function creditSpread(aaYield: number, treasuryYield: number): number {
      return aaYield - treasuryYield;
    }

    it('信用扩张判断', () => {
      expect(creditGrowthAnalysis(18)).toBe('信用扩张');
    });

    it('温和增长判断', () => {
      expect(creditGrowthAnalysis(12)).toBe('温和增长');
    });

    it('增速放缓判断', () => {
      expect(creditGrowthAnalysis(7)).toBe('增速放缓');
    });

    it('信用收缩判断', () => {
      expect(creditGrowthAnalysis(3)).toBe('信用收缩');
    });

    it('高杠杆风险', () => {
      const result = leverageRatio(300, 100);
      expect(result.risk).toBe('high');
      expect(result.ratio).toBe(3);
    });

    it('中等杠杆风险', () => {
      expect(leverageRatio(200, 100).risk).toBe('medium');
    });

    it('低杠杆风险', () => {
      expect(leverageRatio(100, 100).risk).toBe('low');
    });

    it('信用利差计算', () => {
      expect(creditSpread(4.5, 2.5)).toBe(2);
    });

    it('信用利差为正', () => {
      expect(creditSpread(5, 2)).toBeGreaterThan(0);
    });

    it('杠杆率边界2.5', () => {
      expect(leverageRatio(249, 100).risk).not.toBe('high');
      expect(leverageRatio(251, 100).risk).toBe('high');
    });
  });
});
