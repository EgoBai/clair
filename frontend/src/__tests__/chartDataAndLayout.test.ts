/**
 * 图表数据处理与布局计算 — 影子测试迁移（批次 33a）
 *
 * ── 一、绑定真源 ──
 * | 本文件符号 | 生产文件:行 | 契约 |
 * |---|---|---|
 * | VWAP | frontend/src/utils/featureEngineeringEngine.ts:172-190 | calculateVWAP(high[], low[], close[], volume[]): number[]，按 bar 逐根累计 typical=(h+l+c)/3，零累计量回退 close[i]（:186）。 |
 * | 重采样K线 | backend/src/services/chartDataEngine.ts:8-23 | aggregateKlines(data, factor)：按 factor 分块，open/date 取首、high=max、low=min、close=末、volume=sum；factor<=1 返回原数组引用（:9）。 |
 * | 涨跌色 | frontend/src/utils/enhancedFormatters.ts:118-124 | getChangeColor(value, locale)：CJK 红涨 #ef4444 / 绿跌 #22c55e，西文反向，平盘 #6b7280。 |
 * | 颜色混合 | frontend/src/utils/chartAnimation.ts:62-79 | lerpColor(start, end, t)：hex 逐通道 Math.round(lerp(...))，输出小写 6 位 hex。 |
 * | 断点 | frontend/src/utils/responsiveUtils.ts:58-65 | getCurrentBreakpoint(width)：Tailwind 口径 640/768/1024/1280/1536，>=1536 为 '2xl'。 |
 * | 栅格列数 | frontend/src/utils/responsiveUtils.ts:27-34 | GRID_PRESETS[bp].columns：xs1 sm1 md2 lg3 xl4 2xl4。 |
 * | 缓动函数 | frontend/src/utils/chartAnimation.ts:32-43 | easings.linear / easeIn(t²) / easeOut(t(2-t)) / easeInOut（:36 同式）。 |
 * | 数值插值 | frontend/src/utils/chartAnimation.ts:48-50 | lerp(start, end, t) = start + (end-start)*t。 |
 * | 可见范围 | frontend/src/utils/virtualScrollEngine.ts:96-117 | calculateUniformVisibleRange(scrollTop, containerHeight, itemHeight, totalCount, overscan=5)：startIndex=max(0, floor(st/ih)-ov)（:103）、endIndex=min(totalCount-1, startIndex+ceil(ch/ih)+ov*2) 为含端点末索引（:105）、totalHeight=ih*totalCount（:113）、offsetY=startIndex*ih（:114）。 |
 *
 * VWAP 为何选 featureEngineeringEngine：生产三处 VWAP 口径不同 ——
 * highFrequencyEngine.ts:59-93 以 TickData 买卖中间价逐笔加权、返回含 bands 的对象（非按 bar 的序列）；
 * executionAnalyticsEngine.ts:52-64 是成交明细的单一加权均价（单值）；
 * 只有 featureEngineeringEngine.ts:172-190 是「按 bar 逐根累计的 VWAP 序列」，与本文件意图（逐根 OHLCV 序列）一致。
 * 唯一差异为零累计量回退：测试旧内联返回 0，生产返回 close[i]（:186），已在二、7 与新增用例中绑定。
 *
 * ── 二、旧断言订正（旧值 → 生产值 + file:line）──
 * 1. A股涨跌色：#ff4d4f / #52c41a / #8c8c8c → #ef4444 / #22c55e / #6b7280（enhancedFormatters.ts:121-123）。
 * 2. 美股涨跌色：#52c41a 涨 / #ff4d4f 跌 → #22c55e 涨 / #ef4444 跌（enhancedFormatters.ts:121-122；isAStock 布尔改由 locale 参数表达）。
 * 3. 断点 6 值（Tailwind 口径，responsiveUtils.ts:58-65）：375→xs 不变；500 sm→xs；700 md→sm；900 lg→md；1100 xl→lg；1400 xxl→xl（xxl 在生产中为 '2xl'，阈值 1536）。
 * 4. 断点边界：479 xs 不变；480 sm→xs；767 md→sm；768 lg→md（responsiveUtils.ts:59-63，阈值 640/768/1024/1280/1536）；另补 640→sm 证明生产边界。
 * 5. 栅格键名：xxl → 2xl（数值不变，GRID_PRESETS responsiveUtils.ts:27-34）。
 * 6. 虚拟列表终值：end===5 → endIndex===4（5 项列表末索引；virtualScrollEngine.ts:105 的 endIndex 为含端点索引，旧内联为排他终值）。
 * 7. VWAP 零量回退：旧内联 0 → 生产 close[i]（featureEngineeringEngine.ts:186），新增用例「零成交量应回退收盘价」。
 * 8. 重采样 factor<=1：旧内联重建新数组 → 生产直接返回原数组引用（chartDataEngine.ts:9），补断言 toBe(data)。
 *
 * ── 三、未迁移·生产缺口 ──
 * - calculateVolumeProfile：生产 highFrequencyEngine.ts:124-196（TickData + 固定 priceStep）与 backend/src/services/volumeProfileEngine.ts:33-105（VolumeBar + 固定 binSize）都按价格步长分桶、无「bin 数量」参数，且 highFrequency 版本要求 TickData；与本文件「bin 数等宽分桶 + 总量守恒」契约不符，保留内联。
 * - interpolateData：非测试源码无「定长线性插值」导出（rg linearInterpolate 仅命中历史测试；其它 interpolate 命中为 i18n 模板替换/volSurface 双线性等不同契约），保留内联。
 * - hexToRgba：非测试源码无 hex→rgba 导出（rgba 仅出现在组件内联样式中），保留内联。
 * - calcSidebarWidth：生产无 sidebar 宽度导出；ResponsiveChart.tsx:27 的 getBreakpoint 是 window 内部的另一套阈值且未导出，不可绑定，保留内联。
 * - animate：生产无标量 animate 导出（chartAnimation.ts:85 createDataAnimator 为 rAF 版），本文件改为 lerp（生产 :48-50）+ easings（生产 :32-43）组合，只保留进度夹取。
 * - calcAnimationDuration：生产无 distance/speed → duration 公式（ANIMATION_PRESETS chartAnimation.ts:21-27 为固定时长），保留内联。
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateKlines,
  type OHLCV,
} from '../../../backend/src/services/chartDataEngine';
import { calculateVWAP } from '../utils/featureEngineeringEngine';
import { easings, lerp, lerpColor } from '../utils/chartAnimation';
import { getChangeColor } from '../utils/enhancedFormatters';
import { GRID_PRESETS, getCurrentBreakpoint } from '../utils/responsiveUtils';
import { calculateUniformVisibleRange } from '../utils/virtualScrollEngine';

// ===== 图表数据处理 =====
describe('Chart Data Processing', () => {
  // 适配层只拆列，累计加权全部由生产 calculateVWAP 计算
  const vwapSeries = (bars: OHLCV[]): number[] => calculateVWAP(
    bars.map(b => b.high),
    bars.map(b => b.low),
    bars.map(b => b.close),
    bars.map(b => b.volume),
  );

  const calculateVolumeProfile = (bars: OHLCV[], bins: number = 10): { price: number; volume: number }[] => {
    const minPrice = Math.min(...bars.map(b => b.low));
    const maxPrice = Math.max(...bars.map(b => b.high));
    const binWidth = (maxPrice - minPrice) / bins;
    const profile = Array.from({ length: bins }, (_, i) => ({
      price: minPrice + binWidth * (i + 0.5),
      volume: 0,
    }));

    for (const bar of bars) {
      const midPrice = (bar.high + bar.low) / 2;
      const binIndex = Math.min(Math.floor((midPrice - minPrice) / binWidth), bins - 1);
      if (binIndex >= 0) profile[binIndex].volume += bar.volume;
    }
    return profile;
  };

  const interpolateData = (values: number[], targetLength: number): number[] => {
    if (values.length === 0 || targetLength <= 0) return [];
    if (values.length === 1 || targetLength === 1) return [values[0]];
    const result: number[] = [];
    const ratio = (values.length - 1) / (targetLength - 1);
    for (let i = 0; i < targetLength; i++) {
      const idx = i * ratio;
      const floor = Math.floor(idx);
      const ceil = Math.min(floor + 1, values.length - 1);
      const frac = idx - floor;
      result.push(values[floor] * (1 - frac) + values[ceil] * frac);
    }
    return result;
  };

  const data: OHLCV[] = [
    { date: '2026-03-18', open: 100, high: 105, low: 98, close: 103, volume: 1e6 },
    { date: '2026-03-19', open: 103, high: 108, low: 102, close: 106, volume: 1.5e6 },
    { date: '2026-03-20', open: 106, high: 110, low: 104, close: 108, volume: 2e6 },
    { date: '2026-03-21', open: 108, high: 112, low: 106, close: 110, volume: 1.2e6 },
    { date: '2026-03-22', open: 110, high: 115, low: 108, close: 113, volume: 1.8e6 },
    { date: '2026-03-23', open: 113, high: 116, low: 111, close: 114, volume: 1.6e6 },
    { date: '2026-03-24', open: 114, high: 118, low: 112, close: 116, volume: 2.2e6 },
  ];

  it('应该计算VWAP', () => {
    const vwap = vwapSeries(data);
    expect(vwap).toHaveLength(data.length);
    expect(vwap[0]).toBeGreaterThan(0);
    expect(Number.isFinite(vwap[0])).toBe(true);
    // 首根累计量仅有自身：tp=(105+98+103)/3
    expect(vwap[0]).toBeCloseTo((105 + 98 + 103) / 3, 10);
  });

  it('零成交量应回退收盘价', () => {
    const zeroVolume: OHLCV[] = [{ ...data[0], volume: 0 }, data[1]];
    const vwap = vwapSeries(zeroVolume);
    // 生产：cumV=0 时 push(close[i])（featureEngineeringEngine.ts:186）；旧内联为 0
    expect(vwap[0]).toBe(data[0].close);
    expect(vwap[1]).toBeCloseTo((108 + 102 + 106) / 3, 10);
  });

  it('应该重采样K线数据', () => {
    const resampled = aggregateKlines(data, 2);
    expect(resampled.length).toBe(Math.ceil(data.length / 2));
    // 第一根合并了data[0]和data[1]
    expect(resampled[0].open).toBe(data[0].open);
    expect(resampled[0].high).toBe(Math.max(data[0].high, data[1].high));
    expect(resampled[0].close).toBe(data[1].close);
  });

  it('应该计算成交量分布', () => {
    const profile = calculateVolumeProfile(data, 5);
    expect(profile).toHaveLength(5);
    const totalVol = profile.reduce((s, p) => s + p.volume, 0);
    expect(totalVol).toBe(data.reduce((s, b) => s + b.volume, 0));
  });

  it('应该插值数据', () => {
    const result = interpolateData([0, 10, 20], 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(20);
    expect(result[2]).toBe(10);
  });

  it('应该处理空数据插值', () => {
    expect(interpolateData([], 10)).toEqual([]);
  });

  it('应该处理单点插值', () => {
    expect(interpolateData([42], 5)).toEqual([42]); // 单点无法插值，返回原始
  });

  it('应该重采样odd数据', () => {
    const oddData = data.slice(0, 3);
    const resampled = aggregateKlines(oddData, 2);
    expect(resampled).toHaveLength(2);
  });

  it('应该处理factor=1重采样', () => {
    const resampled = aggregateKlines(data, 1);
    expect(resampled).toHaveLength(data.length);
    // 生产约定：factor<=1 直接返回原数组引用（chartDataEngine.ts:9）
    expect(resampled).toBe(data);
  });
});

// ===== 颜色系统 =====
describe('Color System', () => {
  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  it('A股应该红涨绿跌', () => {
    expect(getChangeColor(5, 'zh-CN')).toBe('#ef4444');
    expect(getChangeColor(-5, 'zh-CN')).toBe('#22c55e');
    expect(getChangeColor(0, 'zh-CN')).toBe('#6b7280');
  });

  it('美股应该绿涨红跌', () => {
    expect(getChangeColor(5, 'en-US')).toBe('#22c55e');
    expect(getChangeColor(-5, 'en-US')).toBe('#ef4444');
    expect(getChangeColor(0, 'en-US')).toBe('#6b7280');
  });

  it('应该转换hex到rgba', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(hexToRgba('#00ff00', 1)).toBe('rgba(0, 255, 0, 1)');
  });

  it('应该混合颜色', () => {
    expect(lerpColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(lerpColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    expect(lerpColor('#ff0000', '#0000ff', 0.5)).toBe('#800080');
  });
});

// ===== 响应式布局计算 =====
describe('Responsive Layout Calculations', () => {
  const calcSidebarWidth = (collapsed: boolean, breakpoint: string): number => {
    if (breakpoint === 'xs' || breakpoint === 'sm') return 0;
    return collapsed ? 64 : 240;
  };

  it('应该正确识别断点', () => {
    expect(getCurrentBreakpoint(375)).toBe('xs');
    expect(getCurrentBreakpoint(500)).toBe('xs');
    expect(getCurrentBreakpoint(700)).toBe('sm');
    expect(getCurrentBreakpoint(900)).toBe('md');
    expect(getCurrentBreakpoint(1100)).toBe('lg');
    expect(getCurrentBreakpoint(1400)).toBe('xl');
    expect(getCurrentBreakpoint(1600)).toBe('2xl');
  });

  it('应该根据断点计算列数', () => {
    expect(GRID_PRESETS['xs'].columns).toBe(1);
    expect(GRID_PRESETS['md'].columns).toBe(2);
    expect(GRID_PRESETS['lg'].columns).toBe(3);
    expect(GRID_PRESETS['2xl'].columns).toBe(4);
  });

  it('移动端应该隐藏侧边栏', () => {
    expect(calcSidebarWidth(false, 'xs')).toBe(0);
    expect(calcSidebarWidth(false, 'sm')).toBe(0);
  });

  it('桌面端应该显示侧边栏', () => {
    expect(calcSidebarWidth(false, 'lg')).toBe(240);
    expect(calcSidebarWidth(true, 'lg')).toBe(64);
  });

  it('应该处理边界值', () => {
    expect(getCurrentBreakpoint(479)).toBe('xs');
    expect(getCurrentBreakpoint(480)).toBe('xs');
    expect(getCurrentBreakpoint(639)).toBe('xs');
    expect(getCurrentBreakpoint(640)).toBe('sm');
    expect(getCurrentBreakpoint(767)).toBe('sm');
    expect(getCurrentBreakpoint(768)).toBe('md');
  });
});

// ===== 动画时序计算 =====
describe('Animation Timing', () => {
  const { easeInOut, easeOut, easeIn, linear } = easings;

  const animate = (from: number, to: number, progress: number, easing: (t: number) => number = easeInOut): number => {
    const t = Math.max(0, Math.min(1, progress));
    return lerp(from, to, easing(t));
  };

  const calcAnimationDuration = (distance: number, speed: number = 300): number => {
    return Math.max(100, Math.min(1000, distance / speed * 1000));
  };

  it('应该计算easeInOut', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
  });

  it('应该计算easeOut', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBe(0.75);
  });

  it('应该计算easeIn', () => {
    expect(easeIn(0)).toBe(0);
    expect(easeIn(1)).toBe(1);
    expect(easeIn(0.5)).toBe(0.25);
  });

  it('应该计算动画值', () => {
    expect(animate(0, 100, 0)).toBe(0);
    expect(animate(0, 100, 1)).toBe(100);
    expect(animate(0, 100, 0.5)).toBe(50);
  });

  it('应该钳制进度范围', () => {
    expect(animate(0, 100, -0.5)).toBe(0);
    expect(animate(0, 100, 1.5)).toBe(100);
  });

  it('应该计算动画时长', () => {
    expect(calcAnimationDuration(300)).toBe(1000);
    expect(calcAnimationDuration(100)).toBeCloseTo(333, 0);
    expect(calcAnimationDuration(0)).toBe(100); // 最小时长
  });
});

// ===== 数据表格虚拟化 =====
describe('Virtual List Calculations', () => {
  it('应该计算初始可见范围', () => {
    const range = calculateUniformVisibleRange(0, 500, 40, 1000);
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBeGreaterThan(0);
    expect(range.offsetY).toBe(0);
  });

  it('应该计算滚动后的可见范围', () => {
    const range = calculateUniformVisibleRange(4000, 500, 40, 1000);
    expect(range.startIndex).toBeGreaterThan(0);
    expect(range.offsetY).toBe(range.startIndex * 40);
  });

  it('应该处理边界情况', () => {
    const range = calculateUniformVisibleRange(0, 500, 40, 10);
    expect(range.endIndex).toBeLessThanOrEqual(10);
  });

  it('应该包含overscan项', () => {
    const range = calculateUniformVisibleRange(400, 400, 40, 1000, 3);
    const visibleCount = Math.ceil(400 / 40);
    expect(range.endIndex - range.startIndex).toBeGreaterThanOrEqual(visibleCount);
  });

  it('应该处理总项数小于可见项数', () => {
    const range = calculateUniformVisibleRange(0, 1000, 40, 5);
    // 生产 endIndex 为含端点末索引：5 项列表末索引 4（virtualScrollEngine.ts:105）
    expect(range.endIndex).toBe(4);
  });

  it('应该计算offsetY', () => {
    const range = calculateUniformVisibleRange(800, 400, 40, 1000);
    expect(range.offsetY).toBe(range.startIndex * 40);
  });

  it('可见项数组应与索引区间一致', () => {
    const range = calculateUniformVisibleRange(0, 500, 40, 1000);
    expect(range.visibleItems).toHaveLength(range.endIndex - range.startIndex + 1);
    expect(range.totalHeight).toBe(40 * 1000);
  });
});
