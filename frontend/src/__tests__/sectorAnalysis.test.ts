import { describe, it, expect } from 'vitest';

// ===== 行业板块分析 =====
describe('Sector & Industry Analysis', () => {
  interface Stock { code: string; name: string; sector: string; industry: string; price: number; change: number; volume: number; marketCap: number; pe: number; pb: number; }
  interface SectorSummary { sector: string; stockCount: number; avgChange: number; totalVolume: number; totalMarketCap: number; avgPE: number; avgPB: number; topGainer: Stock; topLoser: Stock; }

  const groupBySector = (stocks: Stock[]): Map<string, Stock[]> => {
    const map = new Map<string, Stock[]>();
    for (const s of stocks) {
      if (!map.has(s.sector)) map.set(s.sector, []);
      map.get(s.sector)!.push(s);
    }
    return map;
  };

  const calcSectorSummary = (sector: string, stocks: Stock[]): SectorSummary => {
    const sorted = [...stocks].sort((a, b) => b.change - a.change);
    return {
      sector,
      stockCount: stocks.length,
      avgChange: stocks.reduce((s, st) => s + st.change, 0) / stocks.length,
      totalVolume: stocks.reduce((s, st) => s + st.volume, 0),
      totalMarketCap: stocks.reduce((s, st) => s + st.marketCap, 0),
      avgPE: stocks.reduce((s, st) => s + st.pe, 0) / stocks.length,
      avgPB: stocks.reduce((s, st) => s + st.pb, 0) / stocks.length,
      topGainer: sorted[0],
      topLoser: sorted[sorted.length - 1],
    };
  };

  const rankSectors = (stocks: Stock[]): SectorSummary[] => {
    const grouped = groupBySector(stocks);
    const summaries: SectorSummary[] = [];
    grouped.forEach((sts, sector) => summaries.push(calcSectorSummary(sector, sts)));
    return summaries.sort((a, b) => b.avgChange - a.avgChange);
  };

  const calcSectorRotation = (sectorReturns: Map<string, number[]>): { sector: string; momentum: number; meanReversion: number }[] => {
    const result: { sector: string; momentum: number; meanReversion: number }[] = [];
    sectorReturns.forEach((returns, sector) => {
      if (returns.length < 2) { result.push({ sector, momentum: 0, meanReversion: 0 }); return; }
      const recent = returns.slice(-5);
      const earlier = returns.slice(0, -5);
      const momentum = recent.reduce((a, b) => a + b, 0) / recent.length;
      const earlierMean = earlier.length > 0 ? earlier.reduce((a, b) => a + b, 0) / earlier.length : 0;
      const meanReversion = earlierMean - momentum;
      result.push({ sector, momentum, meanReversion });
    });
    return result;
  };

  const findSectorCorrelation = (returns1: number[], returns2: number[]): number => {
    const n = Math.min(returns1.length, returns2.length);
    if (n < 2) return 0;
    const m1 = returns1.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const m2 = returns2.slice(0, n).reduce((a, b) => a + b, 0) / n;
    let cov = 0, v1 = 0, v2 = 0;
    for (let i = 0; i < n; i++) {
      cov += (returns1[i] - m1) * (returns2[i] - m2);
      v1 += (returns1[i] - m1) ** 2;
      v2 += (returns2[i] - m2) ** 2;
    }
    return Math.sqrt(v1 * v2) > 0 ? cov / Math.sqrt(v1 * v2) : 0;
  };

  const sampleStocks: Stock[] = [
    { code: '000001', name: '平安银行', sector: '金融', industry: '银行', price: 15, change: 2.5, volume: 5000000, marketCap: 300000000000, pe: 6, pb: 0.8 },
    { code: '601318', name: '中国平安', sector: '金融', industry: '保险', price: 50, change: 1.8, volume: 8000000, marketCap: 900000000000, pe: 8, pb: 1.2 },
    { code: '000858', name: '五粮液', sector: '消费', industry: '白酒', price: 180, change: 3.2, volume: 3000000, marketCap: 700000000000, pe: 30, pb: 8 },
    { code: '600519', name: '贵州茅台', sector: '消费', industry: '白酒', price: 1800, change: 1.5, volume: 2000000, marketCap: 2200000000000, pe: 35, pb: 10 },
    { code: '002594', name: '比亚迪', sector: '新能源', industry: '汽车', price: 250, change: 4.5, volume: 10000000, marketCap: 700000000000, pe: 50, pb: 5 },
    { code: '300750', name: '宁德时代', sector: '新能源', industry: '电池', price: 200, change: -1.2, volume: 6000000, marketCap: 900000000000, pe: 40, pb: 6 },
    { code: '002415', name: '海康威视', sector: '科技', industry: '安防', price: 35, change: -0.5, volume: 4000000, marketCap: 350000000000, pe: 20, pb: 4 },
    { code: '688981', name: '中芯国际', sector: '科技', industry: '芯片', price: 55, change: 5.8, volume: 15000000, marketCap: 400000000000, pe: 100, pb: 3 },
  ];

  describe('板块分组', () => {
    it('应正确分组', () => {
      const grouped = groupBySector(sampleStocks);
      expect(grouped.size).toBe(4);
      expect(grouped.get('金融')!.length).toBe(2);
      expect(grouped.get('消费')!.length).toBe(2);
      expect(grouped.get('新能源')!.length).toBe(2);
      expect(grouped.get('科技')!.length).toBe(2);
    });

    it('空数据返回空Map', () => {
      expect(groupBySector([]).size).toBe(0);
    });

    it('单只股票板块', () => {
      const grouped = groupBySector([sampleStocks[0]]);
      expect(grouped.get('金融')!.length).toBe(1);
    });
  });

  describe('板块汇总', () => {
    it('应正确计算平均涨跌', () => {
      const summary = calcSectorSummary('金融', sampleStocks.filter(s => s.sector === '金融'));
      expect(summary.avgChange).toBeCloseTo(2.15);
    });

    it('应找到领涨股', () => {
      const summary = calcSectorSummary('金融', sampleStocks.filter(s => s.sector === '金融'));
      expect(summary.topGainer.name).toBe('平安银行');
    });

    it('应找到领跌股', () => {
      const summary = calcSectorSummary('金融', sampleStocks.filter(s => s.sector === '金融'));
      expect(summary.topLoser.name).toBe('中国平安');
    });

    it('总市值应正确', () => {
      const summary = calcSectorSummary('金融', sampleStocks.filter(s => s.sector === '金融'));
      expect(summary.totalMarketCap).toBe(1200000000000);
    });

    it('平均PE应正确', () => {
      const summary = calcSectorSummary('金融', sampleStocks.filter(s => s.sector === '金融'));
      expect(summary.avgPE).toBe(7);
    });

    it('股票数量', () => {
      const summary = calcSectorSummary('金融', sampleStocks.filter(s => s.sector === '金融'));
      expect(summary.stockCount).toBe(2);
    });
  });

  describe('板块排名', () => {
    it('应按平均涨跌排序', () => {
      const ranked = rankSectors(sampleStocks);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].avgChange).toBeGreaterThanOrEqual(ranked[i].avgChange);
      }
    });

    it('科技板块应排第一(中芯大涨)', () => {
      const ranked = rankSectors(sampleStocks);
      expect(ranked[0].sector).toBe('科技');
    });

    it('排名数量应等于板块数', () => {
      expect(rankSectors(sampleStocks).length).toBe(4);
    });
  });

  describe('板块轮动', () => {
    it('应计算动量', () => {
      const returns = new Map([
        ['金融', Array.from({ length: 20 }, () => Math.random() * 0.02 - 0.01)],
        ['科技', Array.from({ length: 20 }, () => Math.random() * 0.04 - 0.02)],
      ]);
      const rotation = calcSectorRotation(returns);
      expect(rotation.length).toBe(2);
      rotation.forEach(r => expect(isFinite(r.momentum)).toBe(true));
    });

    it('数据不足返回零', () => {
      const returns = new Map([['A', [0.01]]]);
      const rotation = calcSectorRotation(returns);
      expect(rotation[0].momentum).toBe(0);
    });
  });

  describe('板块相关性', () => {
    it('相同序列相关系数为1', () => {
      const r = [0.01, 0.02, -0.01, 0.03, -0.02];
      expect(findSectorCorrelation(r, r)).toBeCloseTo(1);
    });

    it('反向序列相关系数为-1', () => {
      const r1 = [0.01, 0.02, -0.01, 0.03];
      const r2 = [-0.01, -0.02, 0.01, -0.03];
      expect(findSectorCorrelation(r1, r2)).toBeCloseTo(-1);
    });

    it('范围在-1到1', () => {
      const r1 = Array.from({ length: 30 }, () => Math.random() * 0.04 - 0.02);
      const r2 = Array.from({ length: 30 }, () => Math.random() * 0.04 - 0.02);
      const corr = findSectorCorrelation(r1, r2);
      expect(corr).toBeGreaterThanOrEqual(-1);
      expect(corr).toBeLessThanOrEqual(1);
    });

    it('数据不足返回零', () => {
      expect(findSectorCorrelation([0.01], [0.02])).toBe(0);
    });
  });

  describe('估值比较', () => {
    it('消费板块PE应高于金融', () => {
      const consumer = calcSectorSummary('消费', sampleStocks.filter(s => s.sector === '消费'));
      const finance = calcSectorSummary('金融', sampleStocks.filter(s => s.sector === '金融'));
      expect(consumer.avgPE).toBeGreaterThan(finance.avgPE);
    });

    it('科技板块PB应低于消费', () => {
      const tech = calcSectorSummary('科技', sampleStocks.filter(s => s.sector === '科技'));
      const consumer = calcSectorSummary('消费', sampleStocks.filter(s => s.sector === '消费'));
      expect(tech.avgPB).toBeLessThan(consumer.avgPB);
    });
  });

  describe('边界情况', () => {
    it('单只股票板块汇总', () => {
      const summary = calcSectorSummary('独苗', [sampleStocks[0]]);
      expect(summary.topGainer).toBe(summary.topLoser);
    });

    it('全零涨跌板块', () => {
      const stocks = sampleStocks.map(s => ({ ...s, change: 0, sector: 'Z' }));
      const summary = calcSectorSummary('Z', stocks);
      expect(summary.avgChange).toBe(0);
    });

    it('100只股票分组不崩溃', () => {
      const many = Array.from({ length: 100 }, (_, i) => ({
        ...sampleStocks[i % sampleStocks.length],
        code: String(i).padStart(6, '0'),
        change: Math.random() * 10 - 5,
      }));
      const ranked = rankSectors(many);
      expect(ranked.length).toBeGreaterThan(0);
    });
  });
});
