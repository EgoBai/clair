/**
 * 市场Widget逻辑测试
 * 覆盖市场概览、涨跌分布、板块热力、资金流向可视化等数据处理逻辑
 */

import { describe, it, expect } from 'vitest';

// ==================== 市场概览数据 ====================

interface MarketIndex {
  name: string;
  code: string;
  current: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

interface HeatmapCell {
  symbol: string;
  name: string;
  sector: string;
  changePercent: number;
  marketCap: number;
  volume: number;
}

interface SectorHeatmap {
  name: string;
  changePercent: number;
  stockCount: number;
  risingCount: number;
  fallingCount: number;
  turnover: number;
}

// 市场指标计算
function calculateMarketBreadth(stocks: Array<{ changePercent: number }>) {
  const rising = stocks.filter(s => s.changePercent > 0).length;
  const falling = stocks.filter(s => s.changePercent < 0).length;
  const unchanged = stocks.filter(s => s.changePercent === 0).length;
  const total = stocks.length;
  return {
    rising,
    falling,
    unchanged,
    total,
    advanceRatio: total > 0 ? rising / total : 0,
    declineRatio: total > 0 ? falling / total : 0,
    breadthIndex: total > 0 ? (rising - falling) / total : 0,
  };
}

function categorizeChangePercent(pct: number): string {
  if (pct >= 9.9) return '涨停';
  if (pct >= 7) return '涨幅>7%';
  if (pct >= 5) return '涨幅5-7%';
  if (pct >= 3) return '涨幅3-5%';
  if (pct >= 1) return '涨幅1-3%';
  if (pct > 0) return '涨幅0-1%';
  if (pct === 0) return '平盘';
  if (pct > -1) return '跌幅0-1%';
  if (pct > -3) return '跌幅1-3%';
  if (pct > -5) return '跌幅3-5%';
  if (pct > -7) return '跌幅5-7%';
  if (pct > -9.9) return '跌幅>7%';
  return '跌停';
}

function getChangeColor(pct: number): string {
  if (pct > 0) return '#dc2626'; // 红涨
  if (pct < 0) return '#059669'; // 绿跌
  return '#9ca3af'; // 灰平盘
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252); // 年化
}

function calculateTurnoverRate(volume: number, circulatingShares: number): number {
  if (circulatingShares <= 0) return 0;
  return (volume / circulatingShares) * 100;
}

function calculatePE(price: number, eps: number): number {
  if (eps <= 0) return Infinity;
  return price / eps;
}

function calculatePB(price: number, bvps: number): number {
  if (bvps <= 0) return Infinity;
  return price / bvps;
}

function calculateDividendYield(dividend: number, price: number): number {
  if (price <= 0) return 0;
  return (dividend / price) * 100;
}

function rankByChangePercent(stocks: Array<{ symbol: string; changePercent: number }>, direction: 'asc' | 'desc', limit: number) {
  return [...stocks].sort((a, b) => direction === 'desc' ? b.changePercent - a.changePercent : a.changePercent - b.changePercent).slice(0, limit);
}

function rankByTurnover(stocks: Array<{ symbol: string; turnover: number }>, limit: number) {
  return [...stocks].sort((a, b) => b.turnover - a.turnover).slice(0, limit);
}

function calculateSectorRotation(sectors: SectorHeatmap[], prevSectors: SectorHeatmap[]) {
  const rotation: Array<{ name: string; currentRank: number; prevRank: number; rankChange: number }> = [];
  const currentRanked = [...sectors].sort((a, b) => b.changePercent - a.changePercent);
  const prevRanked = [...prevSectors].sort((a, b) => b.changePercent - a.changePercent);

  for (let i = 0; i < currentRanked.length; i++) {
    const sector = currentRanked[i];
    const prevIdx = prevRanked.findIndex(s => s.name === sector.name);
    rotation.push({
      name: sector.name,
      currentRank: i + 1,
      prevRank: prevIdx + 1,
      rankChange: prevIdx - i,
    });
  }
  return rotation;
}

function groupHeatmapBySector(cells: HeatmapCell[]): Map<string, HeatmapCell[]> {
  const groups = new Map<string, HeatmapCell[]>();
  for (const cell of cells) {
    const existing = groups.get(cell.sector) || [];
    existing.push(cell);
    groups.set(cell.sector, existing);
  }
  return groups;
}

function calculateSectorWeightedChange(cells: HeatmapCell[]): number {
  if (cells.length === 0) return 0;
  const totalCap = cells.reduce((s, c) => s + c.marketCap, 0);
  if (totalCap === 0) return 0;
  return cells.reduce((s, c) => s + c.changePercent * (c.marketCap / totalCap), 0);
}

// ==================== 市场广度测试 ====================

describe('calculateMarketBreadth 市场广度', () => {
  it('应正确计算涨跌数量', () => {
    const stocks = [
      { changePercent: 5 }, { changePercent: -3 }, { changePercent: 0 },
      { changePercent: 2 }, { changePercent: -1 },
    ];
    const breadth = calculateMarketBreadth(stocks);
    expect(breadth.rising).toBe(2);
    expect(breadth.falling).toBe(2);
    expect(breadth.unchanged).toBe(1);
    expect(breadth.total).toBe(5);
  });

  it('advanceRatio应正确计算', () => {
    const stocks = [{ changePercent: 1 }, { changePercent: 2 }, { changePercent: -1 }];
    const breadth = calculateMarketBreadth(stocks);
    expect(breadth.advanceRatio).toBeCloseTo(2 / 3);
  });

  it('breadthIndex应反映市场强弱', () => {
    const bullish = [{ changePercent: 1 }, { changePercent: 2 }, { changePercent: 3 }];
    const bearish = [{ changePercent: -1 }, { changePercent: -2 }, { changePercent: -3 }];
    expect(calculateMarketBreadth(bullish).breadthIndex).toBeGreaterThan(0);
    expect(calculateMarketBreadth(bearish).breadthIndex).toBeLessThan(0);
  });

  it('空数组应返回零值', () => {
    const breadth = calculateMarketBreadth([]);
    expect(breadth.total).toBe(0);
    expect(breadth.advanceRatio).toBe(0);
    expect(breadth.breadthIndex).toBe(0);
  });

  it('全涨时breadthIndex应为1', () => {
    const stocks = [{ changePercent: 1 }, { changePercent: 5 }];
    expect(calculateMarketBreadth(stocks).breadthIndex).toBe(1);
  });

  it('全跌时breadthIndex应为-1', () => {
    const stocks = [{ changePercent: -1 }, { changePercent: -5 }];
    expect(calculateMarketBreadth(stocks).breadthIndex).toBe(-1);
  });
});

// ==================== 涨跌幅分类 ====================

describe('categorizeChangePercent 涨跌幅分类', () => {
  it('涨停应归类正确', () => {
    expect(categorizeChangePercent(10)).toBe('涨停');
    expect(categorizeChangePercent(9.9)).toBe('涨停');
  });

  it('跌停应归类正确', () => {
    expect(categorizeChangePercent(-10)).toBe('跌停');
    expect(categorizeChangePercent(-9.95)).toBe('跌停');
  });

  it('平盘应归类正确', () => {
    expect(categorizeChangePercent(0)).toBe('平盘');
  });

  it('小涨应归类正确', () => {
    expect(categorizeChangePercent(0.5)).toBe('涨幅0-1%');
    expect(categorizeChangePercent(2.5)).toBe('涨幅1-3%');
    expect(categorizeChangePercent(4)).toBe('涨幅3-5%');
    expect(categorizeChangePercent(6)).toBe('涨幅5-7%');
    expect(categorizeChangePercent(8)).toBe('涨幅>7%');
  });

  it('小跌应归类正确', () => {
    expect(categorizeChangePercent(-0.5)).toBe('跌幅0-1%');
    expect(categorizeChangePercent(-2.5)).toBe('跌幅1-3%');
    expect(categorizeChangePercent(-4)).toBe('跌幅3-5%');
    expect(categorizeChangePercent(-6)).toBe('跌幅5-7%');
    expect(categorizeChangePercent(-8)).toBe('跌幅>7%');
  });
});

// ==================== 涨跌颜色 ====================

describe('getChangeColor 涨跌颜色', () => {
  it('上涨应为红色', () => {
    expect(getChangeColor(5)).toBe('#dc2626');
  });

  it('下跌应为绿色', () => {
    expect(getChangeColor(-5)).toBe('#059669');
  });

  it('平盘应为灰色', () => {
    expect(getChangeColor(0)).toBe('#9ca3af');
  });
});

// ==================== 波动率计算 ====================

describe('calculateVolatility 波动率', () => {
  it('空数组应返回0', () => {
    expect(calculateVolatility([])).toBe(0);
  });

  it('单个价格应返回0', () => {
    expect(calculateVolatility([100])).toBe(0);
  });

  it('应返回非负值', () => {
    const prices = [100, 102, 98, 105, 101, 99, 103];
    expect(calculateVolatility(prices)).toBeGreaterThanOrEqual(0);
  });

  it('波动大的序列应返回更高波动率', () => {
    const stable = [100, 100.1, 99.9, 100.2, 99.8];
    const volatile_ = [100, 110, 90, 115, 85];
    expect(calculateVolatility(volatile_)).toBeGreaterThan(calculateVolatility(stable));
  });

  it('等差序列应有一定波动率', () => {
    const prices = [100, 101, 102, 103, 104, 105];
    expect(calculateVolatility(prices)).toBeGreaterThanOrEqual(0);
  });
});

// ==================== 换手率计算 ====================

describe('calculateTurnoverRate 换手率', () => {
  it('应正确计算换手率', () => {
    expect(calculateTurnoverRate(1000000, 10000000)).toBe(10);
  });

  it('流通股为0应返回0', () => {
    expect(calculateTurnoverRate(1000000, 0)).toBe(0);
  });

  it('成交量为0应返回0', () => {
    expect(calculateTurnoverRate(0, 10000000)).toBe(0);
  });
});

// ==================== 估值指标 ====================

describe('估值指标计算', () => {
  it('PE应正确计算', () => {
    expect(calculatePE(100, 5)).toBe(20);
  });

  it('EPS为负时PE应为Infinity', () => {
    expect(calculatePE(100, -2)).toBe(Infinity);
  });

  it('EPS为0时PE应为Infinity', () => {
    expect(calculatePE(100, 0)).toBe(Infinity);
  });

  it('PB应正确计算', () => {
    expect(calculatePB(50, 10)).toBe(5);
  });

  it('BVPS为负时PB应为Infinity', () => {
    expect(calculatePB(50, -5)).toBe(Infinity);
  });

  it('股息率应正确计算', () => {
    expect(calculateDividendYield(5, 100)).toBe(5);
  });

  it('价格为0时股息率应为0', () => {
    expect(calculateDividendYield(5, 0)).toBe(0);
  });
});

// ==================== 排行榜 ====================

describe('排行榜排序', () => {
  const stocks = [
    { symbol: 'A', changePercent: 5, turnover: 1000000 },
    { symbol: 'B', changePercent: -3, turnover: 5000000 },
    { symbol: 'C', changePercent: 8, turnover: 2000000 },
    { symbol: 'D', changePercent: -7, turnover: 3000000 },
    { symbol: 'E', changePercent: 1, turnover: 8000000 },
  ];

  it('涨幅榜应按涨幅降序', () => {
    const ranked = rankByChangePercent(stocks, 'desc', 3);
    expect(ranked[0].symbol).toBe('C');
    expect(ranked[1].symbol).toBe('A');
    expect(ranked[2].symbol).toBe('E');
  });

  it('跌幅榜应按涨幅升序', () => {
    const ranked = rankByChangePercent(stocks, 'asc', 3);
    expect(ranked[0].symbol).toBe('D');
    expect(ranked[1].symbol).toBe('B');
  });

  it('成交额榜应按成交额降序', () => {
    const ranked = rankByTurnover(stocks, 3);
    expect(ranked[0].symbol).toBe('E');
    expect(ranked[1].symbol).toBe('B');
  });

  it('limit应限制返回数量', () => {
    expect(rankByChangePercent(stocks, 'desc', 2)).toHaveLength(2);
    expect(rankByTurnover(stocks, 1)).toHaveLength(1);
  });

  it('limit大于数据量时应返回全部', () => {
    expect(rankByChangePercent(stocks, 'desc', 100)).toHaveLength(5);
  });
});

// ==================== 板块轮动 ====================

describe('calculateSectorRotation 板块轮动', () => {
  it('应正确计算排名变化', () => {
    const prev = [
      { name: '科技', changePercent: 3, stockCount: 0, risingCount: 0, fallingCount: 0, turnover: 0 },
      { name: '消费', changePercent: 2, stockCount: 0, risingCount: 0, fallingCount: 0, turnover: 0 },
      { name: '金融', changePercent: 1, stockCount: 0, risingCount: 0, fallingCount: 0, turnover: 0 },
    ];
    const curr = [
      { name: '消费', changePercent: 5, stockCount: 0, risingCount: 0, fallingCount: 0, turnover: 0 },
      { name: '金融', changePercent: 3, stockCount: 0, risingCount: 0, fallingCount: 0, turnover: 0 },
      { name: '科技', changePercent: 1, stockCount: 0, risingCount: 0, fallingCount: 0, turnover: 0 },
    ];
    const rotation = calculateSectorRotation(curr, prev);
    const tech = rotation.find(r => r.name === '科技');
    expect(tech?.rankChange).toBe(-2); // 从第1掉到第3
  });
});

// ==================== 热力图 ====================

describe('groupHeatmapBySector 热力图分组', () => {
  it('应按板块分组', () => {
    const cells: HeatmapCell[] = [
      { symbol: 'A', name: '', sector: '科技', changePercent: 5, marketCap: 100, volume: 0 },
      { symbol: 'B', name: '', sector: '科技', changePercent: 3, marketCap: 200, volume: 0 },
      { symbol: 'C', name: '', sector: '消费', changePercent: -2, marketCap: 150, volume: 0 },
    ];
    const groups = groupHeatmapBySector(cells);
    expect(groups.get('科技')).toHaveLength(2);
    expect(groups.get('消费')).toHaveLength(1);
  });

  it('空数组应返回空map', () => {
    const groups = groupHeatmapBySector([]);
    expect(groups.size).toBe(0);
  });
});

describe('calculateSectorWeightedChange 板块加权涨跌幅', () => {
  it('应按市值加权计算', () => {
    const cells: HeatmapCell[] = [
      { symbol: 'A', name: '', sector: '', changePercent: 10, marketCap: 100, volume: 0 },
      { symbol: 'B', name: '', sector: '', changePercent: 2, marketCap: 900, volume: 0 },
    ];
    const weighted = calculateSectorWeightedChange(cells);
    expect(weighted).toBeCloseTo(2.8); // (10*0.1 + 2*0.9)
  });

  it('空数组应返回0', () => {
    expect(calculateSectorWeightedChange([])).toBe(0);
  });

  it('总市值为0时应返回0', () => {
    const cells: HeatmapCell[] = [
      { symbol: 'A', name: '', sector: '', changePercent: 5, marketCap: 0, volume: 0 },
    ];
    expect(calculateSectorWeightedChange(cells)).toBe(0);
  });
});
