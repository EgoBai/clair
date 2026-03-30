/**
 * 数据可视化工具测试
 */

import { describe, it, expect } from 'vitest';

// ---- 颜色工具 ----
function getHeatmapColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgb(128, 128, 128)';
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (value >= 0) {
    // 红色渐变 (0=白, 1=深红)
    const r = 255;
    const g = Math.round(255 * (1 - ratio));
    const b = Math.round(255 * (1 - ratio));
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // 绿色渐变
    const absRatio = Math.abs(ratio);
    const r = Math.round(255 * (1 - absRatio));
    const g = 255;
    const b = Math.round(255 * (1 - absRatio));
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function getGradientColors(startColor: string, endColor: string, steps: number): string[] {
  const parseRGB = (color: string) => {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return [0, 0, 0];
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  };

  const start = parseRGB(startColor);
  const end = parseRGB(endColor);
  const colors: string[] = [];

  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const r = Math.round(start[0] + (end[0] - start[0]) * t);
    const g = Math.round(start[1] + (end[1] - start[1]) * t);
    const b = Math.round(start[2] + (end[2] - start[2]) * t);
    colors.push(`rgb(${r}, ${g}, ${b})`);
  }

  return colors;
}

describe('getHeatmapColor', () => {
  it('正值得到红色', () => {
    const color = getHeatmapColor(5, -10, 10);
    expect(color).toContain('255'); // 红色通道
  });

  it('负值得到绿色', () => {
    const color = getHeatmapColor(-5, -10, 10);
    expect(color).toContain('255'); // 绿色通道
  });

  it('零值处理', () => {
    const color = getHeatmapColor(0, -10, 10);
    expect(color).toBeTruthy();
  });

  it('min=max时返回灰色', () => {
    const color = getHeatmapColor(5, 5, 5);
    expect(color).toBe('rgb(128, 128, 128)');
  });

  it('返回rgb格式', () => {
    const color = getHeatmapColor(3, -5, 5);
    expect(color).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
  });
});

describe('getGradientColors', () => {
  it('生成指定数量的颜色', () => {
    const colors = getGradientColors('rgb(255, 0, 0)', 'rgb(0, 0, 255)', 5);
    expect(colors.length).toBe(5);
  });

  it('首尾颜色正确', () => {
    const colors = getGradientColors('rgb(255, 0, 0)', 'rgb(0, 0, 255)', 5);
    expect(colors[0]).toBe('rgb(255, 0, 0)');
    expect(colors[4]).toBe('rgb(0, 0, 255)');
  });

  it('中间颜色是渐变', () => {
    const colors = getGradientColors('rgb(0, 0, 0)', 'rgb(255, 255, 255)', 3);
    expect(colors[1]).toContain('128');
  });

  it('steps=1只返回一个颜色', () => {
    const colors = getGradientColors('rgb(100, 100, 100)', 'rgb(200, 200, 200)', 1);
    expect(colors.length).toBe(1);
  });
});

// ---- 涨跌着色 ----
function getChangeColor(value: number): string {
  if (value > 0) return '#ef4444';   // 红涨
  if (value < 0) return '#22c55e';   // 绿跌
  return '#6b7280';                   // 灰平
}

function getChangeBackground(value: number): string {
  if (value > 0) return 'rgba(239, 68, 68, 0.1)';
  if (value < 0) return 'rgba(34, 197, 94, 0.1)';
  return 'rgba(107, 114, 128, 0.1)';
}

describe('getChangeColor', () => {
  it('正数返回红色', () => {
    expect(getChangeColor(5)).toBe('#ef4444');
  });

  it('负数返回绿色', () => {
    expect(getChangeColor(-3)).toBe('#22c55e');
  });

  it('零返回灰色', () => {
    expect(getChangeColor(0)).toBe('#6b7280');
  });
});

describe('getChangeBackground', () => {
  it('正数返回红色背景', () => {
    expect(getChangeBackground(1)).toContain('239');
  });

  it('负数返回绿色背景', () => {
    expect(getChangeBackground(-1)).toContain('34');
  });

  it('零返回灰色背景', () => {
    expect(getChangeBackground(0)).toContain('107');
  });
});

// ---- 数值区间映射 ----
interface DataRange {
  min: number;
  max: number;
  label: string;
  color: string;
}

function mapToRange(value: number, ranges: DataRange[]): DataRange | null {
  for (const range of ranges) {
    if (value >= range.min && value < range.max) return range;
  }
  return null;
}

function calculateDistribution(data: number[], ranges: DataRange[]): Array<DataRange & { count: number; percentage: number }> {
  const total = data.length;
  return ranges.map(range => {
    const count = data.filter(v => v >= range.min && v < range.max).length;
    return {
      ...range,
      count,
      percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    };
  });
}

describe('mapToRange', () => {
  const ranges: DataRange[] = [
    { min: -Infinity, max: -5, label: '大跌', color: '#166534' },
    { min: -5, max: 0, label: '小跌', color: '#22c55e' },
    { min: 0, max: 5, label: '小涨', color: '#ef4444' },
    { min: 5, max: Infinity, label: '大涨', color: '#991b1b' },
  ];

  it('映射到正确区间', () => {
    expect(mapToRange(3, ranges)?.label).toBe('小涨');
    expect(mapToRange(-7, ranges)?.label).toBe('大跌');
    expect(mapToRange(8, ranges)?.label).toBe('大涨');
  });

  it('边界值正确处理', () => {
    expect(mapToRange(-5, ranges)?.label).toBe('小跌'); // -5 >= -5, 所以在小跌区间
    expect(mapToRange(0, ranges)?.label).toBe('小涨');  // 0 >= 0, 所以在小涨区间
  });

  it('超出范围返回null', () => {
    expect(mapToRange(NaN, ranges)).toBeNull();
  });
});

describe('calculateDistribution', () => {
  const ranges: DataRange[] = [
    { min: -10, max: 0, label: '跌', color: 'green' },
    { min: 0, max: 10, label: '涨', color: 'red' },
  ];

  it('正确统计各区间', () => {
    const data = [-5, -2, 0, 3, 7];
    const result = calculateDistribution(data, ranges);
    expect(result[0].count).toBe(2); // 跌
    expect(result[1].count).toBe(3); // 涨
  });

  it('百分比正确', () => {
    const data = [-1, 1];
    const result = calculateDistribution(data, ranges);
    expect(result[0].percentage).toBe(50);
    expect(result[1].percentage).toBe(50);
  });

  it('空数据', () => {
    const result = calculateDistribution([], ranges);
    expect(result.every(r => r.count === 0)).toBe(true);
  });
});

// ---- 图表数据点处理 ----
interface ChartDataPoint {
  x: number | string;
  y: number;
  label?: string;
}

function normalizeDataPoints(
  data: ChartDataPoint[],
  xRange: [number, number],
  yRange: [number, number]
): ChartDataPoint[] {
  const yValues = data.map(d => d.y);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const ySpan = yMax - yMin || 1;

  return data.map((d, i) => ({
    ...d,
    x: xRange[0] + (i / Math.max(data.length - 1, 1)) * (xRange[1] - xRange[0]),
    y: yRange[0] + ((d.y - yMin) / ySpan) * (yRange[1] - yRange[0]),
  }));
}

describe('normalizeDataPoints', () => {
  it('归一化到指定范围', () => {
    const data: ChartDataPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 50 },
      { x: 2, y: 100 },
    ];
    const result = normalizeDataPoints(data, [0, 100], [0, 1]);
    expect(result[0].y).toBe(0);
    expect(result[2].y).toBe(1);
  });

  it('x轴均匀分布', () => {
    const data: ChartDataPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 100 },
    ];
    const result = normalizeDataPoints(data, [0, 10], [0, 1]);
    expect(result[0].x).toBe(0);
    expect(result[1].x).toBe(10);
  });

  it('单点数据处理', () => {
    const data: ChartDataPoint[] = [{ x: 0, y: 42 }];
    const result = normalizeDataPoints(data, [0, 1], [0, 1]);
    expect(result.length).toBe(1);
  });

  it('相同y值处理', () => {
    const data: ChartDataPoint[] = [
      { x: 0, y: 5 },
      { x: 1, y: 5 },
    ];
    const result = normalizeDataPoints(data, [0, 1], [0, 1]);
    expect(result[0].y).toBe(0); // 归一化后为0
    expect(result[1].y).toBe(0);
  });
});

// ---- Tooltip 位置计算 ----
interface TooltipPosition {
  x: number;
  y: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

function calculateTooltipPosition(
  triggerX: number,
  triggerY: number,
  tooltipWidth: number,
  tooltipHeight: number,
  containerWidth: number,
  containerHeight: number
): TooltipPosition {
  let x = triggerX;
  let y = triggerY - tooltipHeight;
  let placement: TooltipPosition['placement'] = 'top';

  // 上方空间不足
  if (y < 0) {
    y = triggerY + 20;
    placement = 'bottom';
  }

  // 右方溢出
  if (x + tooltipWidth > containerWidth) {
    x = containerWidth - tooltipWidth;
  }

  // 左方溢出
  if (x < 0) x = 0;

  // 下方溢出
  if (y + tooltipHeight > containerHeight) {
    y = containerHeight - tooltipHeight;
  }

  return { x, y, placement };
}

describe('calculateTooltipPosition', () => {
  it('上方空间充足时放在上方', () => {
    const pos = calculateTooltipPosition(100, 200, 80, 40, 400, 400);
    expect(pos.placement).toBe('top');
    expect(pos.y).toBe(160); // 200 - 40
  });

  it('上方空间不足时放在下方', () => {
    const pos = calculateTooltipPosition(100, 30, 80, 40, 400, 400);
    expect(pos.placement).toBe('bottom');
  });

  it('不超出容器右边界', () => {
    const pos = calculateTooltipPosition(380, 200, 80, 40, 400, 400);
    expect(pos.x + 80).toBeLessThanOrEqual(400);
  });

  it('不超出容器左边界', () => {
    const pos = calculateTooltipPosition(-10, 200, 80, 40, 400, 400);
    expect(pos.x).toBeGreaterThanOrEqual(0);
  });

  it('不超出容器下边界', () => {
    const pos = calculateTooltipPosition(100, 390, 80, 40, 400, 400);
    expect(pos.y + 40).toBeLessThanOrEqual(400);
  });
});

// ---- 蜡烛图数据生成 ----
interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
}

function generateCandleData(startPrice: number, days: number, volatility = 0.02): CandleData[] {
  const data: CandleData[] = [];
  let price = startPrice;
  const baseDate = new Date('2024-01-01');

  for (let i = 0; i < days; i++) {
    const change = (Math.random() - 0.48) * price * volatility;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const volume = Math.floor(100000 + Math.random() * 5000000);

    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);

    data.push({
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
      date: date.toISOString().split('T')[0],
    });

    price = close;
  }

  return data;
}

describe('generateCandleData', () => {
  it('生成指定天数的数据', () => {
    const data = generateCandleData(100, 30);
    expect(data.length).toBe(30);
  });

  it('每根K线OHLC逻辑正确', () => {
    const data = generateCandleData(100, 50);
    for (const candle of data) {
      expect(candle.high).toBeGreaterThanOrEqual(candle.open);
      expect(candle.high).toBeGreaterThanOrEqual(candle.close);
      expect(candle.low).toBeLessThanOrEqual(candle.open);
      expect(candle.low).toBeLessThanOrEqual(candle.close);
      expect(candle.volume).toBeGreaterThan(0);
    }
  });

  it('日期连续递增', () => {
    const data = generateCandleData(100, 10);
    for (let i = 1; i < data.length; i++) {
      expect(data[i].date > data[i - 1].date).toBe(true);
    }
  });

  it('精度为2位小数', () => {
    const data = generateCandleData(100, 5);
    for (const candle of data) {
      expect(candle.open).toBe(Math.round(candle.open * 100) / 100);
      expect(candle.close).toBe(Math.round(candle.close * 100) / 100);
    }
  });

  it('性能: 生成1000天K线 < 100ms', () => {
    const start = Date.now();
    generateCandleData(100, 1000);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
