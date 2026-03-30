/**
 * 仪表盘数据聚合测试
 */

import { describe, it, expect } from 'vitest';

// ---- 市场汇总计算 ----
interface MarketSummary {
  totalStocks: number;
  rising: number;
  falling: number;
  unchanged: number;
  suspended: number;
  totalTurnover: number;
  avgChangePercent: number;
  limitUp: number;
  limitDown: number;
}

function calculateMarketSummary(
  stocks: Array<{ changePercent: number; turnover: number; suspended?: boolean }>
): MarketSummary {
  let rising = 0, falling = 0, unchanged = 0, suspended = 0;
  let totalTurnover = 0;
  let totalChange = 0;
  let limitUp = 0, limitDown = 0;

  for (const stock of stocks) {
    if (stock.suspended) {
      suspended++;
      continue;
    }
    totalTurnover += stock.turnover;
    totalChange += stock.changePercent;

    if (stock.changePercent > 0) {
      rising++;
      if (stock.changePercent >= 9.9) limitUp++;
    } else if (stock.changePercent < 0) {
      falling++;
      if (stock.changePercent <= -9.9) limitDown++;
    } else {
      unchanged++;
    }
  }

  const activeCount = stocks.length - suspended;
  return {
    totalStocks: stocks.length,
    rising,
    falling,
    unchanged,
    suspended,
    totalTurnover,
    avgChangePercent: activeCount > 0 ? totalChange / activeCount : 0,
    limitUp,
    limitDown,
  };
}

describe('calculateMarketSummary', () => {
  const mockStocks = [
    { changePercent: 5.0, turnover: 1000000 },
    { changePercent: -3.0, turnover: 800000 },
    { changePercent: 0, turnover: 500000 },
    { changePercent: 10.0, turnover: 2000000 },
    { changePercent: -10.0, turnover: 1500000 },
  ];

  it('正确统计涨跌数量', () => {
    const summary = calculateMarketSummary(mockStocks);
    expect(summary.rising).toBe(2);
    expect(summary.falling).toBe(2);
    expect(summary.unchanged).toBe(1);
  });

  it('正确统计涨跌停', () => {
    const summary = calculateMarketSummary(mockStocks);
    expect(summary.limitUp).toBe(1);
    expect(summary.limitDown).toBe(1);
  });

  it('正确计算总成交额', () => {
    const summary = calculateMarketSummary(mockStocks);
    expect(summary.totalTurnover).toBe(5800000);
  });

  it('正确计算平均涨跌幅', () => {
    const summary = calculateMarketSummary(mockStocks);
    expect(summary.avgChangePercent).toBeCloseTo(0.4, 0);
  });

  it('停牌股票不计入涨跌', () => {
    const stocks = [
      { changePercent: 5, turnover: 100, suspended: true },
      { changePercent: 3, turnover: 200 },
    ];
    const summary = calculateMarketSummary(stocks);
    expect(summary.suspended).toBe(1);
    expect(summary.rising).toBe(1);
    expect(summary.totalStocks).toBe(2);
  });

  it('空数组返回零值', () => {
    const summary = calculateMarketSummary([]);
    expect(summary.totalStocks).toBe(0);
    expect(summary.rising).toBe(0);
    expect(summary.avgChangePercent).toBe(0);
  });

  it('全涨场景', () => {
    const stocks = [
      { changePercent: 1, turnover: 100 },
      { changePercent: 2, turnover: 200 },
    ];
    const summary = calculateMarketSummary(stocks);
    expect(summary.rising).toBe(2);
    expect(summary.falling).toBe(0);
  });

  it('全跌场景', () => {
    const stocks = [
      { changePercent: -1, turnover: 100 },
      { changePercent: -5, turnover: 200 },
    ];
    const summary = calculateMarketSummary(stocks);
    expect(summary.falling).toBe(2);
    expect(summary.rising).toBe(0);
  });
});

// ---- 涨跌分布统计 ----
interface Distribution {
  range: string;
  count: number;
  percentage: number;
}

function calculateChangeDistribution(
  stocks: Array<{ changePercent: number }>,
  ranges: Array<{ label: string; min: number; max: number }>
): Distribution[] {
  const total = stocks.length;
  return ranges.map(r => {
    const count = stocks.filter(s => s.changePercent >= r.min && s.changePercent < r.max).length;
    return {
      range: r.label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    };
  });
}

describe('calculateChangeDistribution', () => {
  const ranges = [
    { label: '涨停', min: 9.9, max: 10.1 },
    { label: '涨幅>5%', min: 5, max: 9.9 },
    { label: '涨幅0-5%', min: 0, max: 5 },
    { label: '跌幅0-5%', min: -5, max: 0 },
    { label: '跌幅>5%', min: -10.1, max: -5 },
    { label: '跌停', min: -10.1, max: -9.9 },
  ];

  it('正确分类各区间', () => {
    const stocks = [
      { changePercent: 10.0 },
      { changePercent: 6.0 },
      { changePercent: 2.0 },
      { changePercent: -2.0 },
      { changePercent: -6.0 },
    ];
    const result = calculateChangeDistribution(stocks, ranges);
    expect(result[0].count).toBe(1); // 涨停
    expect(result[1].count).toBe(1); // >5%
    expect(result[2].count).toBe(1); // 0-5%
    expect(result[3].count).toBe(1); // 0~-5%
    expect(result[4].count).toBe(1); // <-5%
  });

  it('百分比总和为100%', () => {
    const stocks = [
      { changePercent: 10.0 },
      { changePercent: 2.0 },
      { changePercent: -2.0 },
    ];
    const result = calculateChangeDistribution(stocks, ranges);
    const total = result.reduce((sum, d) => sum + d.percentage, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it('空数组百分比为0', () => {
    const result = calculateChangeDistribution([], ranges);
    for (const d of result) {
      expect(d.count).toBe(0);
      expect(d.percentage).toBe(0);
    }
  });
});

// ---- 板块热度排名 ----
interface SectorHeat {
  name: string;
  avgChange: number;
  stockCount: number;
  totalTurnover: number;
  leadingStock: string;
  heatScore: number;
}

function calculateSectorHeat(
  sectors: Array<{
    name: string;
    stocks: Array<{ changePercent: number; turnover: number; name: string }>;
  }>
): SectorHeat[] {
  return sectors
    .map(sector => {
      const avgChange =
        sector.stocks.reduce((sum, s) => sum + s.changePercent, 0) / sector.stocks.length;
      const totalTurnover = sector.stocks.reduce((sum, s) => sum + s.turnover, 0);
      const leading = sector.stocks.reduce((max, s) =>
        s.changePercent > max.changePercent ? s : max
      );
      const heatScore = avgChange * 0.5 + (totalTurnover / 1e8) * 0.3 + sector.stocks.length * 0.2;

      return {
        name: sector.name,
        avgChange: Math.round(avgChange * 100) / 100,
        stockCount: sector.stocks.length,
        totalTurnover,
        leadingStock: leading.name,
        heatScore: Math.round(heatScore * 100) / 100,
      };
    })
    .sort((a, b) => b.heatScore - a.heatScore);
}

describe('calculateSectorHeat', () => {
  const sectors = [
    {
      name: '白酒',
      stocks: [
        { changePercent: 5, turnover: 1e9, name: '茅台' },
        { changePercent: 3, turnover: 5e8, name: '五粮液' },
      ],
    },
    {
      name: '银行',
      stocks: [
        { changePercent: 1, turnover: 2e9, name: '工行' },
        { changePercent: -1, turnover: 1e9, name: '建行' },
      ],
    },
  ];

  it('正确计算板块平均涨跌幅', () => {
    const result = calculateSectorHeat(sectors);
    const baijiu = result.find(s => s.name === '白酒');
    expect(baijiu?.avgChange).toBe(4);
  });

  it('正确识别领涨股', () => {
    const result = calculateSectorHeat(sectors);
    const baijiu = result.find(s => s.name === '白酒');
    expect(baijiu?.leadingStock).toBe('茅台');
  });

  it('按热度分数降序排列', () => {
    const result = calculateSectorHeat(sectors);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].heatScore).toBeGreaterThanOrEqual(result[i].heatScore);
    }
  });

  it('正确统计板块股票数', () => {
    const result = calculateSectorHeat(sectors);
    const baijiu = result.find(s => s.name === '白酒');
    expect(baijiu?.stockCount).toBe(2);
  });

  it('空板块数组返回空数组', () => {
    expect(calculateSectorHeat([])).toEqual([]);
  });
});

// ---- 数据聚合时间窗口 ----
interface TimeWindow {
  startTime: string;
  endTime: string;
  avgPrice: number;
  maxPrice: number;
  minPrice: number;
  totalVolume: number;
  tickCount: number;
}

function aggregateByTimeWindow(
  ticks: Array<{ time: string; price: number; volume: number }>,
  windowMinutes: number
): TimeWindow[] {
  const windows: Map<string, typeof ticks> = new Map();

  for (const tick of ticks) {
    const date = new Date(tick.time);
    const windowKey = new Date(
      Math.floor(date.getTime() / (windowMinutes * 60000)) * (windowMinutes * 60000)
    ).toISOString();

    if (!windows.has(windowKey)) windows.set(windowKey, []);
    windows.get(windowKey)!.push(tick);
  }

  return Array.from(windows.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const prices = data.map(d => d.price);
      return {
        startTime: key,
        endTime: new Date(new Date(key).getTime() + windowMinutes * 60000).toISOString(),
        avgPrice: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
        maxPrice: Math.max(...prices),
        minPrice: Math.min(...prices),
        totalVolume: data.reduce((sum, d) => sum + d.volume, 0),
        tickCount: data.length,
      };
    });
}

describe('aggregateByTimeWindow', () => {
  const ticks = [
    { time: '2024-01-01T09:30:00Z', price: 100, volume: 1000 },
    { time: '2024-01-01T09:31:00Z', price: 101, volume: 2000 },
    { time: '2024-01-01T09:32:00Z', price: 99, volume: 1500 },
    { time: '2024-01-01T09:35:00Z', price: 102, volume: 3000 },
  ];

  it('5分钟窗口正确聚合', () => {
    const result = aggregateByTimeWindow(ticks, 5);
    expect(result.length).toBe(2);
  });

  it('正确计算窗口内平均价格', () => {
    const result = aggregateByTimeWindow(ticks, 5);
    expect(result[0].avgPrice).toBeCloseTo(100, 0);
  });

  it('正确计算窗口内最高价', () => {
    const result = aggregateByTimeWindow(ticks, 5);
    expect(result[0].maxPrice).toBe(101);
  });

  it('正确计算窗口内最低价', () => {
    const result = aggregateByTimeWindow(ticks, 5);
    expect(result[0].minPrice).toBe(99);
  });

  it('正确累加成交量', () => {
    const result = aggregateByTimeWindow(ticks, 5);
    expect(result[0].totalVolume).toBe(4500);
  });

  it('正确统计tick数量', () => {
    const result = aggregateByTimeWindow(ticks, 5);
    expect(result[0].tickCount).toBe(3);
  });

  it('空数据返回空数组', () => {
    expect(aggregateByTimeWindow([], 5)).toEqual([]);
  });

  it('单个tick的窗口', () => {
    const result = aggregateByTimeWindow([ticks[0]], 5);
    expect(result.length).toBe(1);
    expect(result[0].avgPrice).toBe(100);
  });
});

// ---- 市场宽度指标 ----
interface MarketBreadth {
  advanceDeclineRatio: number;
  newHighs: number;
  newLows: number;
  mcclellanOscillator: number;
  armsIndex: number;
}

function calculateMarketBreadth(
  stocks: Array<{
    changePercent: number;
    advanceVolume: number;
    declineVolume: number;
    advanceCount: number;
    declineCount: number;
    isNewHigh: boolean;
    isNewLow: boolean;
  }>
): MarketBreadth {
  const advancing = stocks.filter(s => s.changePercent > 0).length;
  const declining = stocks.filter(s => s.changePercent < 0).length;
  const newHighs = stocks.filter(s => s.isNewHigh).length;
  const newLows = stocks.filter(s => s.isNewLow).length;

  const totalAdvanceVol = stocks.reduce((sum, s) => sum + s.advanceVolume, 0);
  const totalDeclineVol = stocks.reduce((sum, s) => sum + s.declineVolume, 0);
  const totalAdvanceCount = stocks.reduce((sum, s) => sum + s.advanceCount, 0);
  const totalDeclineCount = stocks.reduce((sum, s) => sum + s.declineCount, 0);

  return {
    advanceDeclineRatio: declining > 0 ? Math.round((advancing / declining) * 100) / 100 : Infinity,
    newHighs,
    newLows,
    mcclellanOscillator: advancing - declining,
    armsIndex:
      totalDeclineCount > 0 && totalAdvanceCount > 0
        ? Math.round(
            (totalDeclineVol / totalDeclineCount / (totalAdvanceVol / totalAdvanceCount)) * 100
          ) / 100
        : 0,
  };
}

describe('calculateMarketBreadth', () => {
  const stocks = [
    {
      changePercent: 2,
      advanceVolume: 1e9,
      declineVolume: 5e8,
      advanceCount: 2000,
      declineCount: 1000,
      isNewHigh: true,
      isNewLow: false,
    },
    {
      changePercent: -1,
      advanceVolume: 1e9,
      declineVolume: 5e8,
      advanceCount: 2000,
      declineCount: 1000,
      isNewHigh: false,
      isNewLow: true,
    },
  ];

  it('涨跌比正确计算', () => {
    const result = calculateMarketBreadth(stocks);
    expect(result.advanceDeclineRatio).toBe(1);
  });

  it('新高新低正确统计', () => {
    const result = calculateMarketBreadth(stocks);
    expect(result.newHighs).toBe(1);
    expect(result.newLows).toBe(1);
  });

  it('McClellan振荡器正确计算', () => {
    const result = calculateMarketBreadth(stocks);
    expect(result.mcclellanOscillator).toBe(0);
  });

  it('全涨时涨跌比为Infinity', () => {
    const stocks = [{ changePercent: 1, advanceVolume: 1e9, declineVolume: 0, advanceCount: 100, declineCount: 0, isNewHigh: false, isNewLow: false }];
    const result = calculateMarketBreadth(stocks);
    expect(result.advanceDeclineRatio).toBe(Infinity);
  });

  it('空数据返回零值', () => {
    const result = calculateMarketBreadth([]);
    expect(result.newHighs).toBe(0);
    expect(result.newLows).toBe(0);
  });
});
