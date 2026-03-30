import { describe, it, expect, beforeEach } from 'vitest';

// Advanced Charting Engine
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
  private panState = { offset: 0 };
  private renderCount = 0;

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
    const id = `series_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
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
    const id = axis.id || `axis_${Date.now()}`;
    const axes = axis.position === 'left' || axis.position === 'right'
      ? this.config.yAxes
      : this.config.xAxes;
    axes.push({ ...axis, id });
    return id;
  }

  addAnnotation(annotation: Omit<ChartAnnotation, 'id'>): string {
    const id = `ann_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
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

  calculateSMA(data: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        result.push(slice.reduce((a, b) => a + b, 0) / period);
      }
    }
    return result;
  }

  calculateEMA(data: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else if (i === period - 1) {
        result.push(ema);
      } else {
        ema = (data[i] - ema) * multiplier + ema;
        result.push(ema);
      }
    }
    return result;
  }

  calculateRSI(data: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    if (data.length < period + 1) return data.map(() => null);

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = data[i] - data[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        result.push(null);
      } else {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
        if (i < data.length - 1) {
          const diff = data[i + 1] - data[i];
          avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
          avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
        }
      }
    }
    return result;
  }

  calculateBollingerBands(data: number[], period: number, stdDev: number): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
    const sma = this.calculateSMA(data, period);
    const upper: (number | null)[] = [];
    const lower: (number | null)[] = [];

    for (let i = 0; i < data.length; i++) {
      if (sma[i] === null) {
        upper.push(null);
        lower.push(null);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = sma[i]!;
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
        const std = Math.sqrt(variance);
        upper.push(mean + stdDev * std);
        lower.push(mean - stdDev * std);
      }
    }
    return { upper, middle: sma, lower };
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
    return `<svg width="${this.config.width}" height="${this.config.height}">...</svg>`;
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

describe('Chart Engine', () => {
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
    expect(id).toBeTruthy();
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
    expect(id).toBeTruthy();
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
    expect(id).toBeTruthy();
    expect(engine.toConfig().annotations).toHaveLength(1);
  });

  it('should remove annotation', () => {
    const id = engine.addAnnotation({ type: 'horizontal', value: { y: 50 }, color: 'blue', style: 'solid' });
    expect(engine.removeAnnotation(id)).toBe(true);
    expect(engine.toConfig().annotations).toHaveLength(0);
  });

  it('should calculate SMA', () => {
    const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const sma = engine.calculateSMA(data, 3);
    expect(sma[0]).toBeNull();
    expect(sma[1]).toBeNull();
    expect(sma[2]).toBeCloseTo(11);
    expect(sma[9]).toBeCloseTo(18);
  });

  it('should calculate EMA', () => {
    const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const ema = engine.calculateEMA(data, 10);
    expect(ema[0]).toBeNull();
    expect(ema[9]).not.toBeNull();
    expect(ema[15]).toBeGreaterThan(0);
  });

  it('should calculate RSI', () => {
    const data = [44, 44.5, 43.5, 44, 45, 46, 45.5, 46, 47, 46.5, 47, 48, 49, 50, 49.5];
    const rsi = engine.calculateRSI(data, 14);
    expect(rsi[0]).toBeNull();
    expect(rsi[13]).toBeNull();
    expect(rsi[14]).toBeGreaterThan(0);
    expect(rsi[14]).toBeLessThanOrEqual(100);
  });

  it('should calculate Bollinger Bands', () => {
    const data = [20, 21, 22, 21, 20, 19, 20, 22, 24, 23, 22, 21, 22, 23, 24, 25, 24, 23, 22, 21];
    const bands = engine.calculateBollingerBands(data, 10, 2);
    expect(bands.upper[9]).toBeGreaterThan(bands.middle[9]!);
    expect(bands.lower[9]).toBeLessThan(bands.middle[9]!);
    expect(bands.upper[0]).toBeNull();
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
    const id = engine.addSeries({
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
