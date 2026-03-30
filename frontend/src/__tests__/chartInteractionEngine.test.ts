import { describe, it, expect } from 'vitest';

// 图表交互引擎
interface Point { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }
interface ZoomState { scale: number; offsetX: number; offsetY: number; minScale: number; maxScale: number }
interface PanState { isPanning: boolean; startX: number; startY: number; lastX: number; lastY: number }
interface TooltipState { visible: boolean; x: number; y: number; dataIndex: number; content: string }

class ChartInteractionEngine {
  static initZoom(min = 0.5, max = 5): ZoomState {
    return { scale: 1, offsetX: 0, offsetY: 0, minScale: min, maxScale: max };
  }

  static zoom(state: ZoomState, factor: number, centerX: number, centerY: number): ZoomState {
    const newScale = Math.max(state.minScale, Math.min(state.maxScale, state.scale * factor));
    const scaleChange = newScale / state.scale;
    return {
      ...state,
      scale: newScale,
      offsetX: centerX - (centerX - state.offsetX) * scaleChange,
      offsetY: centerY - (centerY - state.offsetY) * scaleChange,
    };
  }

  static zoomIn(state: ZoomState, centerX = 0, centerY = 0): ZoomState {
    return this.zoom(state, 1.2, centerX, centerY);
  }

  static zoomOut(state: ZoomState, centerX = 0, centerY = 0): ZoomState {
    return this.zoom(state, 0.8, centerX, centerY);
  }

  static resetZoom(state: ZoomState): ZoomState {
    return { ...state, scale: 1, offsetX: 0, offsetY: 0 };
  }

  static pan(state: ZoomState, deltaX: number, deltaY: number): ZoomState {
    return { ...state, offsetX: state.offsetX + deltaX, offsetY: state.offsetY + deltaY };
  }

  static screenToData(screenPoint: Point, zoom: ZoomState, chartRect: Rect): Point {
    return {
      x: (screenPoint.x - zoom.offsetX - chartRect.x) / zoom.scale,
      y: (screenPoint.y - zoom.offsetY - chartRect.y) / zoom.scale,
    };
  }

  static dataToScreen(dataPoint: Point, zoom: ZoomState, chartRect: Rect): Point {
    return {
      x: dataPoint.x * zoom.scale + zoom.offsetX + chartRect.x,
      y: dataPoint.y * zoom.scale + zoom.offsetY + chartRect.y,
    };
  }

  static findNearestDataPoint(mouseX: number, dataPoints: { x: number; y: number; index: number }[], chartWidth: number, dataCount: number): number {
    const stepWidth = chartWidth / dataCount;
    const index = Math.round(mouseX / stepWidth);
    return Math.max(0, Math.min(dataCount - 1, index));
  }

  static calcTooltipPosition(mouseX: number, mouseY: number, tooltipWidth: number, tooltipHeight: number, containerWidth: number, containerHeight: number): Point {
    let x = mouseX + 10;
    let y = mouseY - tooltipHeight - 10;
    if (x + tooltipWidth > containerWidth) x = mouseX - tooltipWidth - 10;
    if (y < 0) y = mouseY + 10;
    if (y + tooltipHeight > containerHeight) y = containerHeight - tooltipHeight;
    return { x: Math.max(0, x), y: Math.max(0, y) };
  }

  static isPointInRect(point: Point, rect: Rect): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
           point.y >= rect.y && point.y <= rect.y + rect.height;
  }

  static calcSelectionRect(start: Point, end: Point): Rect {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }

  static clampPan(state: ZoomState, chartWidth: number, containerWidth: number, chartHeight: number, containerHeight: number): ZoomState {
    const maxOffsetX = 0;
    const minOffsetX = containerWidth - chartWidth * state.scale;
    const maxOffsetY = 0;
    const minOffsetY = containerHeight - chartHeight * state.scale;
    return {
      ...state,
      offsetX: Math.min(maxOffsetX, Math.max(minOffsetX, state.offsetX)),
      offsetY: Math.min(maxOffsetY, Math.max(minOffsetY, state.offsetY)),
    };
  }

  static detectCrosshair(mouseX: number, mouseY: number, chartRect: Rect): { show: boolean; x: number; y: number } {
    const inChart = this.isPointInRect({ x: mouseX, y: mouseY }, chartRect);
    return {
      show: inChart,
      x: inChart ? mouseX - chartRect.x : 0,
      y: inChart ? mouseY - chartRect.y : 0,
    };
  }

  static calcAxisLabelPositions(min: number, max: number, count: number): number[] {
    const step = (max - min) / (count - 1);
    return Array(count).fill(0).map((_, i) => min + step * i);
  }

  static formatAxisValue(value: number, type: 'price' | 'volume' | 'percent'): string {
    switch (type) {
      case 'price': return value.toFixed(2);
      case 'volume':
        if (value >= 1e8) return (value / 1e8).toFixed(1) + '亿';
        if (value >= 1e4) return (value / 1e4).toFixed(1) + '万';
        return value.toString();
      case 'percent': return value.toFixed(2) + '%';
    }
  }

  static calcVisibleRange(zoom: ZoomState, chartWidth: number, containerWidth: number): { start: number; end: number } {
    const start = Math.max(0, -zoom.offsetX / zoom.scale);
    const end = (containerWidth - zoom.offsetX) / zoom.scale;
    return { start, end: Math.min(chartWidth, end) };
  }

  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  static easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  static animateZoom(from: ZoomState, to: ZoomState, progress: number): ZoomState {
    const t = this.easeOutCubic(progress);
    return {
      ...from,
      scale: this.lerp(from.scale, to.scale, t),
      offsetX: this.lerp(from.offsetX, to.offsetX, t),
      offsetY: this.lerp(from.offsetY, to.offsetY, t),
    };
  }
}

describe('图表交互引擎', () => {
  describe('缩放', () => {
    it('应该初始化缩放状态', () => {
      const z = ChartInteractionEngine.initZoom();
      expect(z.scale).toBe(1);
      expect(z.offsetX).toBe(0);
    });

    it('应该放大', () => {
      const z = ChartInteractionEngine.zoomIn(ChartInteractionEngine.initZoom());
      expect(z.scale).toBeCloseTo(1.2, 1);
    });

    it('应该缩小', () => {
      const z = ChartInteractionEngine.zoomOut(ChartInteractionEngine.initZoom());
      expect(z.scale).toBeCloseTo(0.8, 1);
    });

    it('应该限制最大缩放', () => {
      let z = ChartInteractionEngine.initZoom();
      for (let i = 0; i < 20; i++) z = ChartInteractionEngine.zoomIn(z);
      expect(z.scale).toBeLessThanOrEqual(5);
    });

    it('应该限制最小缩放', () => {
      let z = ChartInteractionEngine.initZoom();
      for (let i = 0; i < 20; i++) z = ChartInteractionEngine.zoomOut(z);
      expect(z.scale).toBeGreaterThanOrEqual(0.5);
    });

    it('应该重置缩放', () => {
      let z = ChartInteractionEngine.zoomIn(ChartInteractionEngine.initZoom());
      z = ChartInteractionEngine.resetZoom(z);
      expect(z.scale).toBe(1);
      expect(z.offsetX).toBe(0);
    });
  });

  describe('平移', () => {
    it('应该平移', () => {
      const z = ChartInteractionEngine.pan(ChartInteractionEngine.initZoom(), 100, 50);
      expect(z.offsetX).toBe(100);
      expect(z.offsetY).toBe(50);
    });

    it('应该限制平移范围', () => {
      const z = ChartInteractionEngine.pan(ChartInteractionEngine.initZoom(), -2000, -1000);
      const clamped = ChartInteractionEngine.clampPan(z, 1000, 800, 600, 400);
      expect(clamped.offsetX).toBeLessThanOrEqual(0);
    });
  });

  describe('坐标转换', () => {
    it('屏幕坐标应该转数据坐标', () => {
      const z = ChartInteractionEngine.initZoom();
      const rect: Rect = { x: 50, y: 50, width: 700, height: 400 };
      const data = ChartInteractionEngine.screenToData({ x: 150, y: 150 }, z, rect);
      expect(data.x).toBe(100);
      expect(data.y).toBe(100);
    });

    it('数据坐标应该转屏幕坐标', () => {
      const z = ChartInteractionEngine.initZoom();
      const rect: Rect = { x: 50, y: 50, width: 700, height: 400 };
      const screen = ChartInteractionEngine.dataToScreen({ x: 100, y: 100 }, z, rect);
      expect(screen.x).toBe(150);
      expect(screen.y).toBe(150);
    });

    it('缩放后坐标转换应该一致', () => {
      const z = ChartInteractionEngine.zoomIn(ChartInteractionEngine.initZoom());
      const rect: Rect = { x: 0, y: 0, width: 800, height: 600 };
      const data = { x: 100, y: 200 };
      const screen = ChartInteractionEngine.dataToScreen(data, z, rect);
      const back = ChartInteractionEngine.screenToData(screen, z, rect);
      expect(back.x).toBeCloseTo(data.x, 5);
      expect(back.y).toBeCloseTo(data.y, 5);
    });
  });

  describe('最近数据点', () => {
    it('应该找到最近的数据点', () => {
      const index = ChartInteractionEngine.findNearestDataPoint(500, [], 1000, 10);
      expect(index).toBe(5);
    });

    it('应该限制在有效范围内', () => {
      expect(ChartInteractionEngine.findNearestDataPoint(-100, [], 1000, 10)).toBe(0);
      expect(ChartInteractionEngine.findNearestDataPoint(2000, [], 1000, 10)).toBe(9);
    });
  });

  describe('工具提示定位', () => {
    it('应该定位在鼠标右上方', () => {
      const pos = ChartInteractionEngine.calcTooltipPosition(400, 300, 150, 80, 800, 600);
      expect(pos.x).toBe(410);
      expect(pos.y).toBe(210);
    });

    it('应该翻转到左侧', () => {
      const pos = ChartInteractionEngine.calcTooltipPosition(700, 300, 150, 80, 800, 600);
      expect(pos.x).toBeLessThan(700);
    });

    it('应该翻转到下方', () => {
      const pos = ChartInteractionEngine.calcTooltipPosition(400, 50, 150, 80, 800, 600);
      expect(pos.y).toBe(60);
    });
  });

  describe('矩形操作', () => {
    it('应该判断点在矩形内', () => {
      expect(ChartInteractionEngine.isPointInRect({ x: 50, y: 50 }, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
      expect(ChartInteractionEngine.isPointInRect({ x: 150, y: 50 }, { x: 0, y: 0, width: 100, height: 100 })).toBe(false);
    });

    it('应该计算选择矩形', () => {
      const rect = ChartInteractionEngine.calcSelectionRect({ x: 100, y: 100 }, { x: 50, y: 200 });
      expect(rect.x).toBe(50);
      expect(rect.y).toBe(100);
      expect(rect.width).toBe(50);
      expect(rect.height).toBe(100);
    });
  });

  describe('十字线', () => {
    it('应该显示在图表区域内', () => {
      const cross = ChartInteractionEngine.detectCrosshair(100, 100, { x: 0, y: 0, width: 800, height: 600 });
      expect(cross.show).toBe(true);
    });

    it('不应该显示在图表区域外', () => {
      const cross = ChartInteractionEngine.detectCrosshair(-10, -10, { x: 0, y: 0, width: 800, height: 600 });
      expect(cross.show).toBe(false);
    });
  });

  describe('轴标签', () => {
    it('应该等间距计算标签位置', () => {
      const positions = ChartInteractionEngine.calcAxisLabelPositions(0, 100, 5);
      expect(positions).toHaveLength(5);
      expect(positions[0]).toBe(0);
      expect(positions[4]).toBe(100);
    });

    it('应该格式化价格', () => {
      expect(ChartInteractionEngine.formatAxisValue(123.456, 'price')).toBe('123.46');
    });

    it('应该格式化成交量(亿)', () => {
      expect(ChartInteractionEngine.formatAxisValue(1.5e8, 'volume')).toBe('1.5亿');
    });

    it('应该格式化成交量(万)', () => {
      expect(ChartInteractionEngine.formatAxisValue(5.5e4, 'volume')).toBe('5.5万');
    });

    it('应该格式化百分比', () => {
      expect(ChartInteractionEngine.formatAxisValue(3.45, 'percent')).toBe('3.45%');
    });
  });

  describe('可见范围', () => {
    it('应该计算可见范围', () => {
      const range = ChartInteractionEngine.calcVisibleRange(ChartInteractionEngine.initZoom(), 1000, 800);
      expect(range.start).toBe(0);
      expect(range.end).toBe(800);
    });
  });

  describe('动画', () => {
    it('应该线性插值', () => {
      expect(ChartInteractionEngine.lerp(0, 100, 0.5)).toBe(50);
    });

    it('应该缓出动画', () => {
      expect(ChartInteractionEngine.easeOutCubic(0)).toBe(0);
      expect(ChartInteractionEngine.easeOutCubic(1)).toBe(1);
      expect(ChartInteractionEngine.easeOutCubic(0.5)).toBeGreaterThan(0.5);
    });

    it('应该动画化缩放', () => {
      const from = ChartInteractionEngine.initZoom();
      const to = { ...from, scale: 2 };
      const mid = ChartInteractionEngine.animateZoom(from, to, 0.5);
      expect(mid.scale).toBeGreaterThan(1);
      expect(mid.scale).toBeLessThan(2);
    });
  });
});
