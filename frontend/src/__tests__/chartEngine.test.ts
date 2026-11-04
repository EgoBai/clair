import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  aggregateTicksToCandle,
} from '../utils/chartDataProcessing';
import { computeIndicatorSeries, type IndicatorInput } from '../utils/indicatorCalc';
import { detectPatterns, findSupportResistance, type OHLCV } from '../utils/chartPatternEngine';
import {
  createViewport,
  dataToScreen,
  screenToData,
  calculateTooltipPosition,
} from '../utils/chartInteractionEngine';

/**
 * 图表引擎测试（影子测试迁移，批次 41b）
 *
 * 已绑定生产实现（唯一真源）：
 * - frontend/src/utils/chartDataProcessing.ts:73 calculateSMA(data, period): (number|null)[]
 *   契约：前 period-1 位为 null，其后为窗口算术均值，不做四舍五入 —— 覆盖「should calculate SMA」。
 * - frontend/src/utils/chartDataProcessing.ts:89 calculateEMA(data, period): (number|null)[]
 *   契约：index=period-1 用前 period 个值的均值作种子，其后 multiplier=2/(period+1) —— 覆盖「should calculate EMA」。
 * - frontend/src/utils/chartDataProcessing.ts:111 calculateRSI(closes, period=14)
 *   契约：length<period+1 全 null；前 period 位 null；avgLoss===0 固定 100；Wilder 平滑 —— 覆盖「should calculate RSI」。
 * - frontend/src/utils/chartDataProcessing.ts:145 calculateBollingerBands(closes, period=20, stdMultiplier=2)
 *   契约：返回「按点的对象数组」Array<{upper,middle,lower}|null>，标准差用总体方差（除以 period）
 *   —— 覆盖「should calculate Bollinger Bands」。
 *   选型理由：backend/src/services/chartDataEngine.ts:25 也有 calcBollingerBands，但入参是已成型序列、
 *   从 period-1 起不返回 null 预热、字段名是 mid；前端图表域统一用 chartDataProcessing 这一份。
 * - frontend/src/utils/chartDataProcessing.ts:20 aggregateTicksToCandle(ticks, intervalMs)
 *   —— 覆盖「should aggregate ticks to candles」。
 *   选型理由：backend/src/services/chartDataEngine.ts:8 aggregateKlines 是按 factor 合并 K 线（不按时间桶），
 *   按时间桶聚合逐笔成 K 线只有 chartDataProcessing 这一份。
 * - frontend/src/utils/indicatorCalc.ts:321 computeIndicatorSeries(kline)
 *   —— 覆盖「should compute indicator series」。
 *   选型理由：本仓唯一「整段 K 线 → 指标点」的聚合导出（返回类型见 frontend/src/types/charts.ts:8 IndicatorPoint）；
 *   其余指标函数都是单指标、散落在各引擎里，不构成同契约候选。
 * - frontend/src/utils/chartPatternEngine.ts:136 detectPatterns / :151 findSupportResistance
 *   —— 覆盖「should detect doji pattern」「should find support and resistance」。
 *   选型理由：K 线形态识别与支撑/阻力位检测仅此一处导出，无同名多口径。
 * - frontend/src/utils/chartInteractionEngine.ts:86 createViewport / :617 dataToScreen / :633 screenToData
 *   —— 覆盖「should map data coordinates to screen」。
 *   选型理由：视口模型与数据↔屏幕换算只有 chartInteractionEngine 实现（:95 zoomViewport / :126 panViewport 同文件）；
 *   内联的 0..1 归一化 zoomState 是旧规格，不属于生产契约。
 * - frontend/src/utils/chartInteractionEngine.ts:390 calculateTooltipPosition
 *   —— 覆盖「should keep tooltip inside container」。
 *   选型理由：气泡坐标计算只有这一份（:424 buildTooltip 只拼内容，不做定位）。
 *
 * 旧断言错在哪（生产正确）：
 * - 布林带：旧断言读 bands.upper[9] / bands.middle[9] / bands.lower[9]（三条平行数组），
 *   生产返回按点的对象数组 → 正确形状是 bands[9].upper / bands[9].middle / bands[9].lower；
 *   平行数组形状是内联 class 自造的，生产从未提供。
 * - SMA / EMA / RSI：旧断言与生产逐行等价（同一公式），本次改为直接断言生产返回值，
 *   并补上生产语义的精确值（EMA 种子 14.5、RSI 76.19、无亏损时固定 100）。
 *
 * 未迁移（生产无同契约导出，保留内联规格实现）：
 * - ChartEngine 的 series/axis/annotation CRUD、主题、0..1 归一化缩放与平移、render/export/clone：
 *   生产没有「图表示例」聚合类（frontend/src/utils 下无图表实例类导出），这些是 UI 句柄规格，只能内联；
 *   其中 id 生成已由「时间戳 + 随机数」改为递增序号，一是满足本批禁项约束（测试内不得出现时间戳/随机数调用），
 *   二是让 id 断言可复现。
 * - 0..1 归一化缩放/平移：生产 chartInteractionEngine 用 {xMin,xMax,yMin,yMax,zoom} 视口模型，
 *   与这里的 zoomState 不是同一契约，故规格保留内联，另新增用例绑定生产视口与坐标换算。
 */

// Advanced Charting Engine（规格句柄：生产无聚合类导出，保留内联）
interface DataPoint {
  x: number | string | Date;
  y: number;
  label?: string;
  metadata?: Record<string, unknown>;
}

interface ChartSeries {
  id: string;
  name: string;
  data: DataPoint[];
  color: string;
  type: 'line' | 'bar' | 'area' | 'candlestick' | 'scatter';
  visible: boolean;
  yAxisId?: string;
  lineWidth?: number;
  dashStyle?: 'solid' | 'dashed' | 'dotted';
  opacity?: number;
}

interface ChartAxis {
  id: string;
  type: 'numeric' | 'category' | 'datetime' | 'logarithmic';
  min?: number;
  max?: number;
  label: string;
  position: 'left' | 'right' | 'top' | 'bottom';
  gridLines: boolean;
  tickCount?: number;
}

interface ChartAnnotation {
  id: string;
  type: 'horizontal' | 'vertical' | 'point' | 'rectangle' | 'label';
  value: { x?: number | string; y?: number };
  color: string;
  text?: string;
  style: 'solid' | 'dashed' | 'dotted';
}

interface ChartTheme {
  name: string;
  backgroundColor: string;
  gridColor: string;
  textColor: string;
  seriesColors: string[];
  fontFamily: string;
  fontSize: number;
}

interface ChartConfig {
  title: string;
  width: number;
  height: number;
  series: ChartSeries[];
  xAxes: ChartAxis[];
  yAxes: ChartAxis[];
  annotations: ChartAnnotation[];
  theme: ChartTheme;
  legend: { visible: boolean; position: 'top' | 'bottom' | 'left' | 'right' };
  tooltip: { enabled: boolean; shared: boolean; format: string };
  zoom: { enabled: boolean; type: 'x' | 'y' | 'xy' };
  animation: { enabled: boolean; duration: number };
}

interface TechnicalIndicator {
  type: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BOLLINGER' | 'VOLUME' | 'ATR' | 'OBV';
  period: number;
  source: string;
  params: Record<string, number>;
}

class ChartEngine {
  private config: ChartConfig;
  private indicators: TechnicalIndicator[] = [];
  private zoomState = { x1: 0, x2: 1 };
  private renderCount = 0;
  // 规格句柄需要可复现的 id：用递增序号替代原先的时间戳 + 随机数组合
  private seq = 0;

  constructor(config?: Partial<ChartConfig>) {
    this.config = {
      title: 'Chart',
      width: 800,
      height: 400,
      series: [],
      xAxes: [{ id: 'x', type: 'numeric', label: 'X', position: 'bottom', gridLines: true }],
      yAxes: [{ id: 'y', type: 'numeric', label: 'Y', position: 'left', gridLines: true }],
      annotations: [],
      theme: this.defaultTheme(),
      legend: { visible: true, position: 'top' },
      tooltip: { enabled: true, shared: false, format: '{series.name}: {point.y}' },
      zoom: { enabled: true, type: 'x' },
      animation: { enabled: true, duration: 300 },
      ...config,
    };
  }

  private defaultTheme(): ChartTheme {
    return {
      name: 'default',
      backgroundColor: '#ffffff',
      gridColor: '#e0e0e0',
      textColor: '#333333',
      seriesColors: ['#2196F3', '#FF5722', '#4CAF50', '#FFC107', '#9C27B0'],
      fontFamily: 'Arial, sans-serif',
      fontSize: 12,
    };
  }

  addSeries(series: Omit<ChartSeries, 'id'>): string {
    const id = 'series_' + (++this.seq);
    this.config.series.push({ ...series, id });
    return id;
  }

  removeSeries(id: string): boolean {
    const idx = this.config.series.findIndex(s => s.id === id);
    if (idx >= 0) {
      this.config.series.splice(idx, 1);
      return true;
    }
    return false;
  }

  updateSeries(id: string, updates: Partial<ChartSeries>): boolean {
    const series = this.config.series.find(s => s.id === id);
    if (series) {
      Object.assign(series, updates);
      return true;
    }
    return false;
  }

  toggleSeries(id: string): boolean {
    const series = this.config.series.find(s => s.id === id);
    if (series) {
      series.visible = !series.visible;
      return true;
    }
    return false;
  }

  addAxis(axis: Omit<ChartAxis, 'id'> & { id?: string }): string {
    const id = axis.id || 'axis_' + (++this.seq);
    const axes = axis.position === 'left' || axis.position === 'right'
      ? this.config.yAxes
      : this.config.xAxes;
    axes.push({ ...axis, id });
    return id;
  }

  addAnnotation(annotation: Omit<ChartAnnotation, 'id'>): string {
    const id = 'ann_' + (++this.seq);
    this.config.annotations.push({ ...annotation, id });
    return id;
  }

  removeAnnotation(id: string): boolean {
    const idx = this.config.annotations.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.config.annotations.splice(idx, 1);
      return true;
    }
    return false;
  }

  addIndicator(indicator: TechnicalIndicator): void {
    this.indicators.push(indicator);
  }

  zoomIn(factor = 0.2): void {
    const range = this.zoomState.x2 - this.zoomState.x1;
    const halfRange = range * factor / 2;
    this.zoomState.x1 += halfRange;
    this.zoomState.x2 -= halfRange;
    this.zoomState.x1 = Math.max(0, this.zoomState.x1);
    this.zoomState.x2 = Math.min(1, this.zoomState.x2);
  }

  zoomOut(factor = 0.2): void {
    const range = this.zoomState.x2 - this.zoomState.x1;
    const halfRange = range * factor / 2;
    this.zoomState.x1 = Math.max(0, this.zoomState.x1 - halfRange);
    this.zoomState.x2 = Math.min(1, this.zoomState.x2 + halfRange);
  }

  resetZoom(): void {
    this.zoomState = { x1: 0, x2: 1 };
  }

  pan(offset: number): void {
    const range = this.zoomState.x2 - this.zoomState.x1;
    const shift = offset * range;
    if (this.zoomState.x1 + shift >= 0 && this.zoomState.x2 + shift <= 1) {
      this.zoomState.x1 += shift;
      this.zoomState.x2 += shift;
    }
  }

  getVisibleRange(): { start: number; end: number } {
    return { start: this.zoomState.x1, end: this.zoomState.x2 };
  }

  setTheme(theme: Partial<ChartTheme>): void {
    Object.assign(this.config.theme, theme);
  }

  applyPresetTheme(name: 'dark' | 'light' | 'ocean' | 'forest'): void {
    const presets: Record<string, Partial<ChartTheme>> = {
      dark: { backgroundColor: '#1a1a2e', gridColor: '#333355', textColor: '#e0e0e0' },
      light: { backgroundColor: '#ffffff', gridColor: '#e0e0e0', textColor: '#333333' },
      ocean: { backgroundColor: '#0a2342', gridColor: '#1a4a7a', textColor: '#a0d2db' },
      forest: { backgroundColor: '#1b2d1b', gridColor: '#2d5a2d', textColor: '#b0d4b0' },
    };
    Object.assign(this.config.theme, presets[name]);
  }

  render(): string {
    this.renderCount++;
    return '<svg width="' + this.config.width + '" height="' + this.config.height + '">...</svg>';
  }

  exportPNG(): string {
    return 'data:image/png;base64,...';
  }

  exportSVG(): string {
    return this.render();
  }

  toConfig(): ChartConfig {
    return { ...this.config };
  }

  getIndicators(): TechnicalIndicator[] {
    return [...this.indicators];
  }

  getRenderCount(): number {
    return this.renderCount;
  }

  clone(): ChartEngine {
    return new ChartEngine(JSON.parse(JSON.stringify(this.config)));
  }
}

describe('Chart Engine（规格句柄，内联实现）', () => {
  let engine: ChartEngine;

  beforeEach(() => {
    engine = new ChartEngine();
  });

  it('should create with default config', () => {
    const config = engine.toConfig();
    expect(config.width).toBe(800);
    expect(config.height).toBe(400);
    expect(config.series).toHaveLength(0);
  });

  it('should add series', () => {
    const id = engine.addSeries({
      name: 'Price',
      data: [{ x: 1, y: 100 }, { x: 2, y: 110 }],
      color: '#2196F3',
      type: 'line',
      visible: true,
    });
    expect(id).toBe('series_1');
    expect(engine.toConfig().series).toHaveLength(1);
  });

  it('should remove series', () => {
    const id = engine.addSeries({ name: 'Test', data: [], color: '#000', type: 'line', visible: true });
    expect(engine.removeSeries(id)).toBe(true);
    expect(engine.toConfig().series).toHaveLength(0);
  });

  it('should update series', () => {
    const id = engine.addSeries({ name: 'Old', data: [], color: '#000', type: 'line', visible: true });
    engine.updateSeries(id, { name: 'New' });
    expect(engine.toConfig().series[0].name).toBe('New');
  });

  it('should toggle series visibility', () => {
    const id = engine.addSeries({ name: 'Test', data: [], color: '#000', type: 'line', visible: true });
    engine.toggleSeries(id);
    expect(engine.toConfig().series[0].visible).toBe(false);
    engine.toggleSeries(id);
    expect(engine.toConfig().series[0].visible).toBe(true);
  });

  it('should add axis', () => {
    const id = engine.addAxis({ type: 'numeric', label: 'Volume', position: 'right', gridLines: false });
    expect(id).toBe('axis_1');
    expect(engine.toConfig().yAxes.length).toBeGreaterThan(1);
  });

  it('should add annotation', () => {
    const id = engine.addAnnotation({
      type: 'horizontal',
      value: { y: 100 },
      color: 'red',
      text: 'Support',
      style: 'dashed',
    });
    expect(id).toBe('ann_1');
    expect(engine.toConfig().annotations).toHaveLength(1);
  });

  it('should remove annotation', () => {
    const id = engine.addAnnotation({ type: 'horizontal', value: { y: 50 }, color: 'blue', style: 'solid' });
    expect(engine.removeAnnotation(id)).toBe(true);
    expect(engine.toConfig().annotations).toHaveLength(0);
  });

  it('should zoom in and out', () => {
    engine.zoomIn(0.2);
    const range1 = engine.getVisibleRange();
    expect(range1.start).toBeGreaterThan(0);
    expect(range1.end).toBeLessThan(1);

    engine.zoomOut(0.4);
    const range2 = engine.getVisibleRange();
    expect(range2.start).toBeLessThanOrEqual(range1.start);
  });

  it('should reset zoom', () => {
    engine.zoomIn(0.3);
    engine.resetZoom();
    const range = engine.getVisibleRange();
    expect(range.start).toBe(0);
    expect(range.end).toBe(1);
  });

  it('should pan', () => {
    engine.zoomIn(0.4);
    const before = engine.getVisibleRange();
    engine.pan(0.1);
    const after = engine.getVisibleRange();
    expect(after.start).toBeGreaterThan(before.start);
  });

  it('should add indicator', () => {
    engine.addIndicator({ type: 'RSI', period: 14, source: 'close', params: {} });
    expect(engine.getIndicators()).toHaveLength(1);
  });

  it('should set theme', () => {
    engine.setTheme({ backgroundColor: '#000' });
    expect(engine.toConfig().theme.backgroundColor).toBe('#000');
  });

  it('should apply preset themes', () => {
    engine.applyPresetTheme('dark');
    expect(engine.toConfig().theme.backgroundColor).toBe('#1a1a2e');

    engine.applyPresetTheme('ocean');
    expect(engine.toConfig().theme.backgroundColor).toBe('#0a2342');
  });

  it('should render', () => {
    const svg = engine.render();
    expect(svg).toContain('svg');
    expect(engine.getRenderCount()).toBe(1);
  });

  it('should clone engine', () => {
    engine.addSeries({ name: 'Test', data: [], color: '#000', type: 'line', visible: true });
    const clone = engine.clone();
    clone.addSeries({ name: 'Clone', data: [], color: '#fff', type: 'bar', visible: true });
    expect(engine.toConfig().series).toHaveLength(1);
    expect(clone.toConfig().series).toHaveLength(2);
  });

  it('should support candlestick type', () => {
    engine.addSeries({
      name: 'OHLC',
      data: [{ x: 1, y: 100 }],
      color: '#000',
      type: 'candlestick',
      visible: true,
    });
    expect(engine.toConfig().series[0].type).toBe('candlestick');
  });

  it('should support scatter type', () => {
    engine.addSeries({ name: 'Points', data: [{ x: 1, y: 2 }], color: '#000', type: 'scatter', visible: true });
    expect(engine.toConfig().series[0].type).toBe('scatter');
  });
});

describe('技术指标（绑定生产实现）', () => {
  it('should calculate SMA', () => {
    const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const sma = calculateSMA(data, 3);
    expect(sma).toHaveLength(10);
    expect(sma[0]).toBeNull();
    expect(sma[1]).toBeNull();
    expect(sma[2]).toBeCloseTo(11);
    expect(sma[9]).toBeCloseTo(18);
  });

  it('should calculate EMA', () => {
    const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const ema = calculateEMA(data, 10);
    expect(ema[0]).toBeNull();
    // 生产语义：index=period-1 的种子值是前 period 个值的算术均值 14.5
    expect(ema[9]).toBeCloseTo(14.5, 6);
    expect(ema[15]).toBeGreaterThan(0);
    expect(ema).toHaveLength(16);
  });

  it('should calculate RSI', () => {
    const data = [44, 44.5, 43.5, 44, 45, 46, 45.5, 46, 47, 46.5, 47, 48, 49, 50, 49.5];
    const rsi = calculateRSI(data, 14);
    expect(rsi).toHaveLength(15);
    expect(rsi[0]).toBeNull();
    expect(rsi[13]).toBeNull();
    expect(rsi[14]).toBeGreaterThan(0);
    expect(rsi[14]).toBeLessThanOrEqual(100);
    // 生产语义：上涨和 8.0 / 下跌和 2.5 → RS=3.2 → RSI=100-100/4.2=76.1905
    expect(rsi[14]).toBeCloseTo(76.19, 2);
  });

  it('should return RSI 100 when there are no losses', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const rsi = calculateRSI(data, 14);
    expect(rsi[13]).toBeNull();
    // 生产语义：avgLoss===0 时直接返回 100，而不是走 RS 无穷大分支
    expect(rsi[14]).toBe(100);
  });

  it('should calculate Bollinger Bands', () => {
    const data = [20, 21, 22, 21, 20, 19, 20, 22, 24, 23, 22, 21, 22, 23, 24, 25, 24, 23, 22, 21];
    const bands = calculateBollingerBands(data, 10, 2);
    expect(bands).toHaveLength(20);
    // 形状订正：生产返回按点的对象数组，不是三条平行数组
    expect(bands[0]).toBeNull();
    const point = bands[9];
    expect(point).not.toBeNull();
    expect(point!.upper).toBeGreaterThan(point!.middle);
    expect(point!.lower).toBeLessThan(point!.middle);

    const slice = data.slice(0, 10);
    const mean = slice.reduce((a, b) => a + b, 0) / 10;
    const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / 10;
    const std = Math.sqrt(variance);
    expect(point!.middle).toBeCloseTo(mean, 6);
    expect(point!.upper).toBeCloseTo(mean + 2 * std, 6);
  });
});

describe('图表数据生产工具（新增绑定）', () => {
  it('should aggregate ticks to candles', () => {
    const ticks = [
      { price: 10, volume: 100, timestamp: 1000 },
      { price: 11, volume: 200, timestamp: 1500 },
      { price: 12, volume: 300, timestamp: 2500 },
      { price: 13, volume: 400, timestamp: 3100 },
    ];
    const candles = aggregateTicksToCandle(ticks, 2000);
    expect(candles).toHaveLength(2);
    expect(candles[0].timestamp).toBe(0);
    expect(candles[0].open).toBe(10);
    expect(candles[0].high).toBe(11);
    expect(candles[0].volume).toBe(300);
    expect(candles[1].timestamp).toBe(2000);
    expect(candles[1].close).toBe(13);
    expect(candles[1].volume).toBe(700);
    expect(aggregateTicksToCandle([], 2000)).toEqual([]);
  });

  it('should compute indicator series', () => {
    const kline: IndicatorInput[] = Array.from({ length: 30 }, (_, i) => {
      const open = 10 + i * 0.1;
      return {
        date: '2024-01-' + String(i + 1).padStart(2, '0'),
        open,
        high: open + 0.5,
        low: open - 0.5,
        close: open + 0.2,
        volume: 1000 + i * 10,
      };
    });
    const series = computeIndicatorSeries(kline);
    expect(series).toHaveLength(30);
    expect(series[0].date).toBe('2024-01-01');
    // 生产语义：BOLL(20) 在 i<19 时字段为 undefined（预热不足）
    expect(series[0].bollMiddle).toBeUndefined();
    expect(typeof series[19].bollMiddle).toBe('number');
    expect(typeof series[29].rsi6).toBe('number');
    expect(series[29].bollUpper!).toBeGreaterThan(series[29].bollMiddle!);
    expect(series[29].bollLower!).toBeLessThan(series[29].bollMiddle!);
  });

  it('should detect doji pattern', () => {
    // 生产 detectPatterns 从 i=2 起扫描，故把十字星放在 index 2
    const candles: OHLCV[] = [
      { date: 'd1', open: 10, high: 10.5, low: 9.5, close: 10.2, volume: 100 },
      { date: 'd2', open: 10.2, high: 10.8, low: 10.0, close: 10.4, volume: 100 },
      { date: 'd3', open: 10.4, high: 11, low: 9.9, close: 10.41, volume: 100 },
      { date: 'd4', open: 10.5, high: 11.2, low: 10.4, close: 10.9, volume: 100 },
    ];
    const patterns = detectPatterns(candles);
    const doji = patterns.find(p => p.name === '十字星');
    expect(doji).toBeDefined();
    expect(doji!.type).toBe('neutral');
    expect(doji!.confidence).toBe(0.6);
    expect(doji!.startIndex).toBe(2);
    expect(doji!.endIndex).toBe(2);
  });

  it('should find support and resistance', () => {
    const candles: OHLCV[] = [
      { date: 'd1', open: 9.5, high: 10, low: 9, close: 9.6, volume: 100 },
      { date: 'd2', open: 9.6, high: 10.1, low: 9.1, close: 9.7, volume: 100 },
      { date: 'd3', open: 9.7, high: 12, low: 9, close: 11.5, volume: 100 },
      { date: 'd4', open: 11.5, high: 11, low: 9.2, close: 9.5, volume: 100 },
      { date: 'd5', open: 9.5, high: 10.5, low: 9.3, close: 9.6, volume: 100 },
    ];
    const levels = findSupportResistance(candles, 1);
    expect(levels).toHaveLength(2);
    const resistance = levels.find(l => l.type === 'resistance');
    const support = levels.find(l => l.type === 'support');
    expect(resistance!.level).toBe(12);
    expect(support!.level).toBe(9);
    expect(resistance!.strength).toBe(1);
  });

  it('should map data coordinates to screen', () => {
    const viewport = createViewport(0, 100, 0, 200);
    expect(viewport.zoom).toBe(1);
    expect(dataToScreen(50, 100, viewport, 800, 400)).toEqual({ x: 400, y: 200 });
    expect(dataToScreen(25, 50, viewport, 800, 400)).toEqual({ x: 200, y: 300 });
    expect(screenToData(400, 200, viewport, 800, 400)).toEqual({ x: 50, y: 100 });
  });

  it('should keep tooltip inside container', () => {
    // 右下溢出：x 翻到鼠标左侧，y 翻到鼠标上方
    expect(calculateTooltipPosition(790, 390, 100, 50, 800, 400)).toEqual({ x: 680, y: 330 });
    expect(calculateTooltipPosition(100, 100, 100, 50, 800, 400)).toEqual({ x: 110, y: 110 });
    // 左溢出（x<0）回退到 offset
    expect(calculateTooltipPosition(-20, 390, 100, 50, 800, 400)).toEqual({ x: 10, y: 330 });
  });
});
