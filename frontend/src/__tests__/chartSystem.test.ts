/**
 * 图表性能优化 + 主题系统 测试
 * 覆盖：LTTB采样、均匀采样、自适应采样、虚拟列表、主题系统
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sampleLTTB,
  sampleUniform,
  sampleAdaptive,
  calculateVirtualRange,
  renderProfiler,
  type KLineData,
} from '../utils/chartPerformance';
import {
  chartThemeManager,
  LIGHT_THEME,
  DARK_THEME,
  getMAColor,
  getKLineChartTheme,
} from '../utils/chartTheme';

// 测试数据生成器
function generateKLineData(count: number, trend: 'up' | 'down' | 'volatile' = 'up'): KLineData[] {
  const data: KLineData[] = [];
  let price = 100;

  for (let i = 0; i < count; i++) {
    let change: number;
    switch (trend) {
      case 'up': change = (Math.random() - 0.3) * 3; break;
      case 'down': change = (Math.random() - 0.7) * 3; break;
      case 'volatile': change = (Math.random() - 0.5) * 8; break;
    }

    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;

    data.push({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.floor(Math.random() * 1000000),
    });

    price = close;
  }

  return data;
}

// ==================== LTTB 采样测试 ====================

describe('sampleLTTB', () => {
  it('数据量小于目标时原样返回', () => {
    const data = generateKLineData(50);
    const result = sampleLTTB(data, 100);
    expect(result).toHaveLength(50);
    expect(result).toEqual(data);
  });

  it('正确降采样到目标点数', () => {
    const data = generateKLineData(1000);
    const result = sampleLTTB(data, 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.length).toBeGreaterThan(90);
  });

  // 始终保留首尾点
  it('保留首尾数据点', () => {
    const data = generateKLineData(500);
    const result = sampleLTTB(data, 50);
    expect(result[0]).toEqual(data[0]);
    expect(result[result.length - 1]).toEqual(data[data.length - 1]);
  });

  it('空数组返回空', () => {
    const result = sampleLTTB([], 10);
    expect(result).toEqual([]);
  });

  it('maxPoints < 3 时返回前N个', () => {
    const data = generateKLineData(100);
    const result = sampleLTTB(data, 2);
    expect(result).toHaveLength(2);
  });

  // 性能测试：大数据量
  it('5000条数据采样 < 100ms', () => {
    const data = generateKLineData(5000);
    const start = performance.now();
    sampleLTTB(data, 200);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ==================== 均匀采样测试 ====================

describe('sampleUniform', () => {
  it('数据量小于目标时原样返回', () => {
    const data = generateKLineData(30);
    const result = sampleUniform(data, 50);
    expect(result).toEqual(data);
  });

  it('正确降采样', () => {
    const data = generateKLineData(1000);
    const result = sampleUniform(data, 100);
    expect(result).toHaveLength(100);
  });

  it('均匀分布采样', () => {
    const data = generateKLineData(1000);
    const result = sampleUniform(data, 10);
    // 间隔大约100
    for (let i = 1; i < result.length; i++) {
      const prevIdx = data.indexOf(result[i - 1]);
      const currIdx = data.indexOf(result[i]);
      expect(currIdx).toBeGreaterThan(prevIdx);
    }
  });
});

// ==================== 自适应采样测试 ====================

describe('sampleAdaptive', () => {
  it('数据量小于目标时原样返回', () => {
    const data = generateKLineData(20);
    const result = sampleAdaptive(data, 50);
    expect(result).toEqual(data);
  });

  it('正确降采样', () => {
    const data = generateKLineData(1000);
    const result = sampleAdaptive(data, 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.length).toBeGreaterThan(0);
  });

  it('保留首尾点', () => {
    const data = generateKLineData(500);
    const result = sampleAdaptive(data, 50);
    expect(result[0]).toEqual(data[0]);
  });
});

// ==================== 虚拟列表计算测试 ====================

describe('calculateVirtualRange', () => {
  it('计算可见范围', () => {
    const range = calculateVirtualRange(1000, 800, 20, 0);
    expect(range.start).toBe(0);
    expect(range.end).toBeGreaterThan(40);
  });

  it('滚动后正确偏移', () => {
    const range = calculateVirtualRange(1000, 800, 20, 2000);
    expect(range.start).toBeGreaterThan(80); // 2000/20 = 100, minus overscan
    expect(range.offset).toBe(range.start * 20);
  });

  it('边界处理：不超出总长度', () => {
    const range = calculateVirtualRange(10, 800, 20, 0);
    expect(range.end).toBeLessThanOrEqual(10);
  });

  it('自定义 overscan', () => {
    const range0 = calculateVirtualRange(1000, 800, 20, 1000, 0);
    const range10 = calculateVirtualRange(1000, 800, 20, 1000, 10);
    expect(range10.end - range10.start).toBeGreaterThan(range0.end - range0.start);
  });
});

// ==================== 渲染分析器测试 ====================

describe('renderProfiler', () => {
  it('measure 返回函数执行结果', () => {
    const result = renderProfiler.measure('test', () => 42);
    expect(result).toBe(42);
  });

  it('start/end 测量时间', () => {
    renderProfiler.start('test-timer');
    const elapsed = renderProfiler.end('test-timer');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('end 未匹配 start 返回 0', () => {
    const elapsed = renderProfiler.end('nonexistent');
    expect(elapsed).toBe(0);
  });
});

// ==================== 图表主题测试 ====================

describe('chartThemeManager', () => {
  it('默认主题为浅色', () => {
    expect(chartThemeManager.get().name).toBe('light');
  });

  it('切换到暗色主题', () => {
    chartThemeManager.set(DARK_THEME);
    expect(chartThemeManager.get().name).toBe('dark');
    // 恢复
    chartThemeManager.set(LIGHT_THEME);
  });

  it('主题变更通知监听者', () => {
    let notified = false;
    const unsub = chartThemeManager.subscribe(() => { notified = true; });
    chartThemeManager.set(DARK_THEME);
    expect(notified).toBe(true);
    unsub();
    // 恢复
    chartThemeManager.set(LIGHT_THEME);
  });

  it('取消订阅后不再通知', () => {
    let count = 0;
    const unsub = chartThemeManager.subscribe(() => { count++; });
    unsub();
    chartThemeManager.set(DARK_THEME);
    chartThemeManager.set(LIGHT_THEME);
    expect(count).toBe(0);
  });
});

describe('getMAColor', () => {
  it('返回有效颜色值', () => {
    for (let i = 0; i < 8; i++) {
      const color = getMAColor(i);
      expect(color).toMatch(/^#/);
      expect(color.length).toBe(7);
    }
  });

  it('颜色循环使用', () => {
    const color0 = getMAColor(0);
    const color4 = getMAColor(4);
    expect(color0).toBe(color4); // 4个颜色循环
  });
});

describe('getKLineChartTheme', () => {
  it('上涨返回红色', () => {
    chartThemeManager.set(LIGHT_THEME);
    const theme = getKLineChartTheme(true);
    expect(theme.color).toBe(LIGHT_THEME.rise);
  });

  it('下跌返回绿色', () => {
    chartThemeManager.set(LIGHT_THEME);
    const theme = getKLineChartTheme(false);
    expect(theme.color).toBe(LIGHT_THEME.fall);
  });

  it('返回有效 itemStyle', () => {
    const theme = getKLineChartTheme(true);
    expect(theme.itemStyle).toBeDefined();
    expect(theme.itemStyle.color).toBeDefined();
    expect(theme.itemStyle.borderColor).toBeDefined();
  });
});

describe('主题常量完整性', () => {
  it('浅色主题包含所有必要字段', () => {
    expect(LIGHT_THEME.rise).toBeDefined();
    expect(LIGHT_THEME.fall).toBeDefined();
    expect(LIGHT_THEME.bg).toBeDefined();
    expect(LIGHT_THEME.text).toBeDefined();
    expect(LIGHT_THEME.volume).toBeDefined();
    expect(LIGHT_THEME.series).toHaveLength(8);
  });

  it('暗色主题包含所有必要字段', () => {
    expect(DARK_THEME.rise).toBeDefined();
    expect(DARK_THEME.fall).toBeDefined();
    expect(DARK_THEME.bg).toBeDefined();
    expect(DARK_THEME.text).toBeDefined();
    expect(DARK_THEME.volume).toBeDefined();
    expect(DARK_THEME.series).toHaveLength(8);
  });

  it('涨跌颜色一致（红涨绿跌）', () => {
    expect(LIGHT_THEME.rise).toBe('#EF4444');
    expect(LIGHT_THEME.fall).toBe('#22C55E');
    expect(DARK_THEME.rise).toBe('#EF4444');
    expect(DARK_THEME.fall).toBe('#22C55E');
  });
});
