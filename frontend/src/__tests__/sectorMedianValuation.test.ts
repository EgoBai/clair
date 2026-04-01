import { describe, it, expect } from 'vitest';

// 行业估值中位数引擎
interface StockValuation {
  symbol: string;
  sector: string;
  pe: number;
  pb: number;
  ps: number;
  pcf: number;
  evEbitda: number;
  dividendYield: number;
  marketCap: number;
}

interface SectorValuation {
  sector: string;
  medianPE: number;
  medianPB: number;
  medianPS: number;
  medianPCF: number;
  medianEVEBITDA: number;
  avgDividendYield: number;
  stockCount: number;
  percentiles: {
    pe25: number; pe75: number;
    pb25: number; pb75: number;
  };
  valuation: 'undervalued' | 'fair' | 'overvalued';
}

function calcMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].filter(v => isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calcPercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].filter(v => isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

function analyzeSectorValuation(stocks: StockValuation[]): SectorValuation[] {
  const sectors = new Map<string, StockValuation[]>();
  stocks.forEach(s => {
    if (!sectors.has(s.sector)) sectors.set(s.sector, []);
    sectors.get(s.sector)!.push(s);
  });

  return Array.from(sectors.entries()).map(([sector, stks]) => {
    const pes = stks.map(s => s.pe);
    const pbs = stks.map(s => s.pb);
    const pss = stks.map(s => s.ps);
    const pcfs = stks.map(s => s.pcf);
    const evs = stks.map(s => s.evEbitda);
    const dys = stks.map(s => s.dividendYield);

    const medianPE = calcMedian(pes);
    const medianPB = calcMedian(pbs);

    // 行业估值判断
    const allPEs = stocks.map(s => s.pe);
    const globalMedianPE = calcMedian(allPEs);
    const valuation = medianPE < globalMedianPE * 0.8 ? 'undervalued' :
      medianPE > globalMedianPE * 1.2 ? 'overvalued' : 'fair';

    return {
      sector,
      medianPE,
      medianPB,
      medianPS: calcMedian(pss),
      medianPCF: calcMedian(pcfs),
      medianEVEBITDA: calcMedian(evs),
      avgDividendYield: dys.reduce((a, b) => a + b, 0) / (dys.length || 1),
      stockCount: stks.length,
      percentiles: {
        pe25: calcPercentile(pes, 25),
        pe75: calcPercentile(pes, 75),
        pb25: calcPercentile(pbs, 25),
        pb75: calcPercentile(pbs, 75),
      },
      valuation,
    };
  });
}

function compareStockToSector(stock: StockValuation, sectorVal: SectorValuation): {
  pePercentile: string;
  pbPercentile: string;
  signal: 'cheap' | 'fair' | 'expensive';
} {
  const peRank = stock.pe <= sectorVal.percentiles.pe25 ? '25th' :
    stock.pe >= sectorVal.percentiles.pe75 ? '75th+' : '25-75th';
  const pbRank = stock.pb <= sectorVal.percentiles.pb25 ? '25th' :
    stock.pb >= sectorVal.percentiles.pb75 ? '75th+' : '25-75th';
  const signal = stock.pe < sectorVal.medianPE * 0.7 && stock.pb < sectorVal.medianPB * 0.7 ? 'cheap' :
    stock.pe > sectorVal.medianPE * 1.3 && stock.pb > sectorVal.medianPB * 1.3 ? 'expensive' : 'fair';
  return { pePercentile: peRank, pbPercentile: pbRank, signal };
}

describe('行业估值中位数引擎', () => {
  const stocks: StockValuation[] = [
    { symbol: '600519', sector: '消费', pe: 35, pb: 12, ps: 15, pcf: 30, evEbitda: 25, dividendYield: 1.5, marketCap: 25000 },
    { symbol: '000858', sector: '消费', pe: 25, pb: 6, ps: 8, pcf: 20, evEbitda: 18, dividendYield: 2.0, marketCap: 8000 },
    { symbol: '000568', sector: '消费', pe: 30, pb: 10, ps: 12, pcf: 25, evEbitda: 22, dividendYield: 1.8, marketCap: 5000 },
    { symbol: '000001', sector: '金融', pe: 8, pb: 1.2, ps: 2, pcf: 5, evEbitda: 6, dividendYield: 3.5, marketCap: 3000 },
    { symbol: '601318', sector: '金融', pe: 10, pb: 1.5, ps: 3, pcf: 7, evEbitda: 8, dividendYield: 3.0, marketCap: 15000 },
    { symbol: '601166', sector: '金融', pe: 6, pb: 0.8, ps: 1.5, pcf: 4, evEbitda: 5, dividendYield: 4.0, marketCap: 4000 },
    { symbol: '300750', sector: '新能源', pe: 60, pb: 8, ps: 10, pcf: 50, evEbitda: 40, dividendYield: 0.3, marketCap: 12000 },
    { symbol: '002594', sector: '新能源', pe: 45, pb: 6, ps: 5, pcf: 35, evEbitda: 30, dividendYield: 0.5, marketCap: 8000 },
  ];

  it('应计算中位数', () => {
    expect(calcMedian([1, 2, 3, 4, 5])).toBe(3);
    expect(calcMedian([1, 2, 3, 4])).toBe(2.5);
    expect(calcMedian([])).toBe(0);
  });

  it('应计算百分位数', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(calcPercentile(values, 25)).toBeLessThanOrEqual(3);
    expect(calcPercentile(values, 75)).toBeGreaterThanOrEqual(8);
  });

  it('应分析行业估值', () => {
    const sectors = analyzeSectorValuation(stocks);
    expect(sectors.length).toBe(3);
    sectors.forEach(s => {
      expect(s.medianPE).toBeGreaterThan(0);
      expect(s.stockCount).toBeGreaterThan(0);
      expect(['undervalued', 'fair', 'overvalued']).toContain(s.valuation);
    });
  });

  it('金融板块PE中位数应低', () => {
    const sectors = analyzeSectorValuation(stocks);
    const finance = sectors.find(s => s.sector === '金融');
    expect(finance).toBeDefined();
    expect(finance!.medianPE).toBeLessThan(15);
  });

  it('新能源板块PE中位数应高', () => {
    const sectors = analyzeSectorValuation(stocks);
    const newEnergy = sectors.find(s => s.sector === '新能源');
    expect(newEnergy!.medianPE).toBeGreaterThan(40);
  });

  it('应比较个股与行业估值', () => {
    const sectors = analyzeSectorValuation(stocks);
    const consumption = sectors.find(s => s.sector === '消费')!;
    const result = compareStockToSector(stocks[0], consumption);
    expect(['cheap', 'fair', 'expensive']).toContain(result.signal);
  });

  it('低PE股应被标记为便宜或公允', () => {
    const sectors = analyzeSectorValuation(stocks);
    const finance = sectors.find(s => s.sector === '金融')!;
    const result = compareStockToSector(stocks[5], finance); // PE=6, PB=0.8
    expect(['cheap', 'fair']).toContain(result.signal);
  });

  it('应计算百分位区间', () => {
    const sectors = analyzeSectorValuation(stocks);
    sectors.forEach(s => {
      expect(s.percentiles.pe25).toBeLessThanOrEqual(s.percentiles.pe75);
      expect(s.percentiles.pb25).toBeLessThanOrEqual(s.percentiles.pb75);
    });
  });

  it('空数据应返回空', () => {
    expect(analyzeSectorValuation([])).toEqual([]);
  });

  it('单股行业应能分析', () => {
    const single: StockValuation[] = [stocks[0]];
    const sectors = analyzeSectorValuation(single);
    expect(sectors.length).toBe(1);
    expect(sectors[0].stockCount).toBe(1);
  });
});
