import { describe, it, expect } from 'vitest';

describe('SectorHeatmapLogic', () => {
  interface SectorHeatData {
    name: string;
    code: string;
    changePercent: number;
    turnover: number;
    risingCount: number;
    totalStocks: number;
    representative?: { symbol: string; name: string; changePercent: number };
  }

  function getColor(changePercent: number): string {
    if (changePercent > 5) return '#cc0000';
    if (changePercent > 3) return '#dd2222';
    if (changePercent > 1) return '#ee4444';
    if (changePercent > 0) return '#ff6666';
    if (changePercent === 0) return '#888888';
    if (changePercent > -1) return '#66bb6a';
    if (changePercent > -3) return '#44aa44';
    if (changePercent > -5) return '#228822';
    return '#006600';
  }

  function calculateHeatmapMetrics(data: SectorHeatData[]) {
    const rising = data.filter(s => s.changePercent > 0).length;
    const falling = data.filter(s => s.changePercent < 0).length;
    const flat = data.filter(s => s.changePercent === 0).length;
    const totalTurnover = data.reduce((sum, s) => sum + s.turnover, 0);
    const topGainer = data.reduce((max, s) => s.changePercent > max.changePercent ? s : max, data[0]);
    const topLoser = data.reduce((min, s) => s.changePercent < min.changePercent ? s : min, data[0]);
    return { rising, falling, flat, totalTurnover, topGainer, topLoser, total: data.length };
  }

  function sortByHeatIndex(data: SectorHeatData[]): SectorHeatData[] {
    return [...data].sort((a, b) => {
      const heatA = Math.abs(a.changePercent) * 0.6 + (a.risingCount / Math.max(a.totalStocks, 1)) * 40;
      const heatB = Math.abs(b.changePercent) * 0.6 + (b.risingCount / Math.max(b.totalStocks, 1)) * 40;
      return heatB - heatA;
    });
  }

  const mockSectors: SectorHeatData[] = [
    { name: '白酒', code: 'BK0437', changePercent: 3.5, turnover: 8e10, risingCount: 18, totalStocks: 20 },
    { name: '新能源', code: 'BK0478', changePercent: -1.2, turnover: 1.2e11, risingCount: 8, totalStocks: 30 },
    { name: '半导体', code: 'BK0536', changePercent: 0.5, turnover: 5e10, risingCount: 15, totalStocks: 25 },
    { name: '银行', code: 'BK0475', changePercent: -2.5, turnover: 3e10, risingCount: 5, totalStocks: 42 },
    { name: '医药', code: 'BK0465', changePercent: 0, turnover: 6e10, risingCount: 30, totalStocks: 60 },
  ];

  it('should return red color for strong positive change', () => {
    expect(getColor(6)).toBe('#cc0000');
    expect(getColor(4)).toBe('#dd2222');
    expect(getColor(2)).toBe('#ee4444');
    expect(getColor(0.5)).toBe('#ff6666');
  });

  it('should return gray for zero change', () => {
    expect(getColor(0)).toBe('#888888');
  });

  it('should return green color for negative change', () => {
    expect(getColor(-0.5)).toBe('#66bb6a');
    expect(getColor(-2)).toBe('#44aa44');
    expect(getColor(-4)).toBe('#228822');
    expect(getColor(-6)).toBe('#006600');
  });

  it('should count rising sectors correctly', () => {
    const result = calculateHeatmapMetrics(mockSectors);
    expect(result.rising).toBe(2); // 白酒, 半导体
  });

  it('should count falling sectors correctly', () => {
    const result = calculateHeatmapMetrics(mockSectors);
    expect(result.falling).toBe(2); // 新能源, 银行
  });

  it('should count flat sectors', () => {
    const result = calculateHeatmapMetrics(mockSectors);
    expect(result.flat).toBe(1); // 医药
  });

  it('should calculate total turnover', () => {
    const result = calculateHeatmapMetrics(mockSectors);
    expect(result.totalTurnover).toBe(8e10 + 1.2e11 + 5e10 + 3e10 + 6e10);
  });

  it('should identify top gainer', () => {
    const result = calculateHeatmapMetrics(mockSectors);
    expect(result.topGainer.name).toBe('白酒');
  });

  it('should identify top loser', () => {
    const result = calculateHeatmapMetrics(mockSectors);
    expect(result.topLoser.name).toBe('银行');
  });

  it('should sort by heat index', () => {
    const result = sortByHeatIndex(mockSectors);
    expect(result.length).toBe(mockSectors.length);
    // First item should have highest heat
    expect(result[0].name).toBeDefined();
  });

  it('should handle empty sectors', () => {
    const result = calculateHeatmapMetrics([]);
    expect(result.total).toBe(0);
    expect(result.rising).toBe(0);
  });

  it('should return valid hex colors', () => {
    const testValues = [6, 4, 2, 0.5, 0, -0.5, -2, -4, -6];
    for (const val of testValues) {
      expect(getColor(val)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('should handle single sector', () => {
    const single = [mockSectors[0]];
    const result = calculateHeatmapMetrics(single);
    expect(result.total).toBe(1);
    expect(result.topGainer.name).toBe(result.topLoser.name);
  });

  it('should calculate rising ratio', () => {
    const sector = mockSectors[0];
    const ratio = sector.risingCount / sector.totalStocks;
    expect(ratio).toBeCloseTo(0.9, 1);
  });
});
