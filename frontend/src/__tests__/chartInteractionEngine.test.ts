import { describe, it, expect } from 'vitest';
import {
  createViewport,
  zoomViewport,
  panViewport,
  resetViewport,
  fitDataToViewport,
  calculateCrosshair,
  formatCrosshairData,
  updateSelection,
  getSelectedData,
  calculateSelectionStats,
  findNearestIndex,
  findNearestPoint,
  highlightRange,
  calculateTooltipPosition,
  buildTooltip,
  handleWheelZoom,
  handleDragPan,
  handleDoubleClickReset,
  handleKeyboardZoom,
  handleKeyboardPan,
  sampleDataForViewport,
  calculateViewportSummary,
  dataToScreen,
  screenToData,
  type ChartViewport,
  type ChartPoint,
  type SelectionRange,
  type ChartInteractionConfig,
} from '../utils/chartInteractionEngine';

// ==================== 测试数据 ====================

const mockPoints: ChartPoint[] = Array.from({ length: 100 }, (_, i) => ({
  x: i,
  y: Math.sin(i * 0.1) * 50 + 100,
  data: { open: 100 + i, close: 100 + i + Math.random() * 5, volume: 1000000 + i * 10000 },
  index: i,
}));

const defaultConfig: ChartInteractionConfig = {
  zoomStep: 0.1,
  minZoom: 0.5,
  maxZoom: 10,
  panSensitivity: 1,
  snapToData: true,
  crosshairEnabled: true,
  selectionEnabled: true,
  tooltipEnabled: true,
};

// ==================== 视口管理测试 ====================

describe('createViewport', () => {
  it('应创建正确的初始视口', () => {
    const vp = createViewport(0, 100, 0, 200);
    expect(vp.xMin).toBe(0);
    expect(vp.xMax).toBe(100);
    expect(vp.yMin).toBe(0);
    expect(vp.yMax).toBe(200);
    expect(vp.zoom).toBe(1);
  });
});

describe('zoomViewport', () => {
  it('应以指定中心点缩放', () => {
    const vp = createViewport(0, 100, 0, 100);
    const zoomed = zoomViewport(vp, 2, { x: 50, y: 50 });

    expect(zoomed.zoom).toBe(2);
    expect(zoomed.xMax - zoomed.xMin).toBeLessThan(100);
  });

  it('应限制缩放范围', () => {
    const vp = createViewport(0, 100, 0, 100);
    const overZoom = zoomViewport(vp, 100, { x: 50, y: 50 });
    expect(overZoom.zoom).toBeLessThanOrEqual(defaultConfig.maxZoom);

    const underZoom = zoomViewport(vp, 0.01, { x: 50, y: 50 });
    expect(underZoom.zoom).toBeGreaterThanOrEqual(defaultConfig.minZoom);
  });

  it('放大应缩小数据范围', () => {
    const vp = createViewport(0, 100, 0, 100);
    const zoomed = zoomViewport(vp, 2, { x: 50, y: 50 });
    const origWidth = vp.xMax - vp.xMin;
    const zoomedWidth = zoomed.xMax - zoomed.xMin;
    expect(zoomedWidth).toBeLessThan(origWidth);
  });
});

describe('panViewport', () => {
  it('应平移视口', () => {
    const vp = createViewport(0, 100, 0, 100);
    const panned = panViewport(vp, 10, 20);

    expect(panned.xMin).toBe(10);
    expect(panned.xMax).toBe(110);
    expect(panned.yMin).toBe(20);
    expect(panned.yMax).toBe(120);
  });

  it('负值应反向平移', () => {
    const vp = createViewport(0, 100, 0, 100);
    const panned = panViewport(vp, -10, -20);

    expect(panned.xMin).toBe(-10);
    expect(panned.yMin).toBe(-20);
  });
});

describe('resetViewport', () => {
  it('应重置zoom为1', () => {
    const vp = createViewport(0, 100, 0, 100);
    const zoomed = zoomViewport(vp, 3, { x: 50, y: 50 });
    const reset = resetViewport(zoomed);
    expect(reset.zoom).toBe(1);
  });
});

describe('fitDataToViewport', () => {
  it('应适配数据范围', () => {
    const points = [{ x: 10, y: 20 }, { x: 50, y: 80 }, { x: 30, y: 50 }];
    const vp = fitDataToViewport(points);

    expect(vp.xMin).toBeLessThan(10);
    expect(vp.xMax).toBeGreaterThan(50);
    expect(vp.yMin).toBeLessThan(20);
    expect(vp.yMax).toBeGreaterThan(80);
  });

  it('空数据应返回默认视口', () => {
    const vp = fitDataToViewport([]);
    expect(vp.xMin).toBe(0);
    expect(vp.xMax).toBe(1);
  });
});

// ==================== 十字光标测试 ====================

describe('calculateCrosshair', () => {
  it('应计算十字光标位置', () => {
    const vp = createViewport(0, 100, 0, 100);
    const ch = calculateCrosshair(50, 50, 100, 100, vp, mockPoints);

    expect(ch.visible).toBe(true);
    expect(ch.x).toBe(50);
    expect(ch.y).toBe(50);
  });

  it('禁用时应不可见', () => {
    const vp = createViewport(0, 100, 0, 100);
    const config = { ...defaultConfig, crosshairEnabled: false };
    const ch = calculateCrosshair(50, 50, 100, 100, vp, mockPoints, config);

    expect(ch.visible).toBe(false);
  });

  it('snapToData应找到最近的数据点', () => {
    const vp = createViewport(0, 100, 0, 200);
    const ch = calculateCrosshair(25, 50, 100, 100, vp, mockPoints);

    expect(ch.dataPoint).not.toBeNull();
    if (ch.dataPoint) {
      expect(ch.dataPoint.index).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('formatCrosshairData', () => {
  it('应格式化数据点的所有字段', () => {
    const point = mockPoints[0];
    const formatted = formatCrosshairData(point);

    expect(formatted.length).toBe(Object.keys(point.data).length);
    expect(formatted.every(f => typeof f.key === 'string')).toBe(true);
    expect(formatted.every(f => typeof f.value === 'string')).toBe(true);
  });

  it('应使用自定义格式化器', () => {
    const point = mockPoints[0];
    const formatted = formatCrosshairData(point, {
      volume: (v) => `${(Number(v) / 1e6).toFixed(1)}M`,
    });

    const volumeField = formatted.find(f => f.key === 'volume');
    expect(volumeField?.value).toContain('M');
  });
});

// ==================== 区间选择测试 ====================

describe('updateSelection', () => {
  it('禁用选择时应返回null', () => {
    const vp = createViewport(0, 100, 0, 100);
    const config = { ...defaultConfig, selectionEnabled: false };
    const result = updateSelection(null, 50, 100, vp, mockPoints, true, config);
    expect(result).toBeNull();
  });

  it('应开始新的选择', () => {
    const vp = createViewport(0, 100, 0, 100);
    const result = updateSelection(null, 50, 100, vp, mockPoints, true);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.active).toBe(true);
      expect(result.startIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('非选择状态应保持当前选择', () => {
    const vp = createViewport(0, 100, 0, 100);
    const existing: SelectionRange = { startX: 10, endX: 30, startIndex: 10, endIndex: 30, active: true };
    const result = updateSelection(existing, 50, 100, vp, mockPoints, false);
    expect(result).toEqual(existing);
  });
});

describe('getSelectedData', () => {
  it('应返回选中区间的数据', () => {
    const selection: SelectionRange = { startX: 10, endX: 30, startIndex: 10, endIndex: 30, active: true };
    const selected = getSelectedData(mockPoints, selection);
    expect(selected.length).toBe(21); // 10-30 inclusive
  });

  it('无选择应返回空数组', () => {
    expect(getSelectedData(mockPoints, null)).toEqual([]);
  });

  it('反向选择应正常工作', () => {
    const selection: SelectionRange = { startX: 30, endX: 10, startIndex: 30, endIndex: 10, active: true };
    const selected = getSelectedData(mockPoints, selection);
    expect(selected.length).toBe(21);
  });
});

describe('calculateSelectionStats', () => {
  it('应计算选区统计', () => {
    const selection: SelectionRange = { startX: 0, endX: 10, startIndex: 0, endIndex: 10, active: true };
    const stats = calculateSelectionStats(selection, mockPoints, 'close');

    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.count).toBe(11);
      expect(stats.min).toBeLessThanOrEqual(stats.max);
      expect(stats.avg).toBeGreaterThanOrEqual(stats.min);
      expect(stats.avg).toBeLessThanOrEqual(stats.max);
    }
  });

  it('无选择应返回null', () => {
    expect(calculateSelectionStats(null, mockPoints)).toBeNull();
  });
});

// ==================== 数据点查找测试 ====================

describe('findNearestIndex', () => {
  it('应找到最近的数据点索引', () => {
    expect(findNearestIndex(mockPoints, 25)).toBe(25);
    expect(findNearestIndex(mockPoints, 24.6)).toBe(25);
    expect(findNearestIndex(mockPoints, 0)).toBe(0);
  });

  it('空数据应返回-1', () => {
    expect(findNearestIndex([], 10)).toBe(-1);
  });
});

describe('findNearestPoint', () => {
  it('应找到最近的数据点', () => {
    const point = findNearestPoint(mockPoints, 50);
    expect(point).not.toBeNull();
    expect(point?.x).toBe(50);
  });

  it('空数据应返回null', () => {
    expect(findNearestPoint([], 10)).toBeNull();
  });
});

describe('highlightRange', () => {
  it('应返回高亮索引数组', () => {
    const indices = highlightRange(mockPoints, 5, 10);
    expect(indices).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it('反向范围应正常工作', () => {
    const indices = highlightRange(mockPoints, 10, 5);
    expect(indices).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it('应限制在数据范围内', () => {
    const indices = highlightRange(mockPoints, -5, 105);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(99);
  });
});

// ==================== 工具提示测试 ====================

describe('calculateTooltipPosition', () => {
  it('应避免右溢出', () => {
    const pos = calculateTooltipPosition(150, 50, 100, 50, 200, 200);
    expect(pos.x + 100).toBeLessThanOrEqual(200);
  });

  it('应避免下溢出', () => {
    const pos = calculateTooltipPosition(50, 180, 100, 50, 200, 200);
    expect(pos.y).toBeLessThan(180); // 应在上方
  });

  it('正常位置应偏移', () => {
    const pos = calculateTooltipPosition(50, 50, 50, 30, 200, 200);
    expect(pos.x).toBeGreaterThan(50);
    expect(pos.y).toBeGreaterThan(50);
  });

  it('应限制不小于0', () => {
    const pos = calculateTooltipPosition(0, 0, 100, 100, 50, 50);
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });
});

describe('buildTooltip', () => {
  it('应构建工具提示数据', () => {
    const point = mockPoints[0];
    const tooltip = buildTooltip(point, {
      title: '股价',
      fields: [
        { key: 'close', label: '收盘价' },
        { key: 'volume', label: '成交量' },
      ],
    });

    expect(tooltip.title).toBe('股价');
    expect(tooltip.items.length).toBe(2);
    expect(tooltip.visible).toBe(true);
  });

  it('应使用默认标题', () => {
    const point = mockPoints[0];
    const tooltip = buildTooltip(point, { fields: [{ key: 'close', label: '收' }] });
    expect(tooltip.title).toContain('#0');
  });
});

// ==================== 手势处理测试 ====================

describe('handleWheelZoom', () => {
  it('正delta应缩小', () => {
    const vp = createViewport(0, 100, 0, 100);
    const result = handleWheelZoom(1, vp, 50, 50, 100, 100);
    expect(result.zoom).toBeLessThan(1);
  });

  it('负delta应放大', () => {
    const vp = createViewport(0, 100, 0, 100);
    const result = handleWheelZoom(-1, vp, 50, 50, 100, 100);
    expect(result.zoom).toBeGreaterThan(1);
  });
});

describe('handleDragPan', () => {
  it('应根据拖拽距离平移', () => {
    const vp = createViewport(0, 100, 0, 100);
    const panned = handleDragPan(0, 0, 10, 10, vp, 100, 100);
    // 拖拽向右应使数据向左移动
    expect(panned.xMax).not.toBe(100);
  });
});

describe('handleDoubleClickReset', () => {
  it('应重置zoom', () => {
    const vp = { xMin: 10, xMax: 50, yMin: 20, yMax: 80, zoom: 3 };
    const reset = handleDoubleClickReset(vp);
    expect(reset.zoom).toBe(1);
    expect(reset.xMin).toBe(10); // 保持位置
  });
});

// ==================== 键盘处理测试 ====================

describe('handleKeyboardZoom', () => {
  it('+ 应放大', () => {
    const vp = createViewport(0, 100, 0, 100);
    const result = handleKeyboardZoom('+', vp);
    expect(result.zoom).toBeGreaterThan(1);
  });

  it('- 应缩小', () => {
    const vp = createViewport(0, 100, 0, 100);
    const result = handleKeyboardZoom('-', vp);
    expect(result.zoom).toBeLessThan(1);
  });

  it('0 应重置', () => {
    const vp = { ...createViewport(0, 100, 0, 100), zoom: 5 };
    const result = handleKeyboardZoom('0', vp);
    expect(result.zoom).toBe(1);
  });
});

describe('handleKeyboardPan', () => {
  it('ArrowLeft应左移', () => {
    const vp = createViewport(0, 100, 0, 100);
    const result = handleKeyboardPan('ArrowLeft', vp);
    expect(result.xMin).toBeGreaterThan(0);
  });

  it('ArrowRight应右移', () => {
    const vp = createViewport(0, 100, 0, 100);
    const result = handleKeyboardPan('ArrowRight', vp);
    expect(result.xMin).toBeLessThan(0);
  });

  it('ArrowUp应上移（y减小）', () => {
    const vp = createViewport(0, 100, 0, 100);
    const result = handleKeyboardPan('ArrowUp', vp);
    expect(result.yMin).toBeLessThan(0);
  });

  it('ArrowDown应下移（y增大）', () => {
    const vp = createViewport(0, 100, 0, 100);
    const result = handleKeyboardPan('ArrowDown', vp);
    expect(result.yMin).toBeGreaterThan(0);
  });
});

// ==================== 数据采样测试 ====================

describe('sampleDataForViewport', () => {
  it('小数据集不应采样', () => {
    const small = mockPoints.slice(0, 10);
    const vp = createViewport(0, 100, 0, 200);
    const result = sampleDataForViewport(small, vp, 500);
    expect(result.length).toBe(10);
  });

  it('大数据集应采样', () => {
    const large = Array.from({ length: 2000 }, (_, i) => ({
      x: i, y: i, data: {}, index: i,
    }));
    const vp = createViewport(0, 2000, 0, 2000);
    const result = sampleDataForViewport(large, vp, 500);
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('窄视口应只保留可见+上下文', () => {
    // 需要数据量超过maxPoints才触发采样逻辑
    const largeData = Array.from({ length: 1000 }, (_, i) => ({
      x: i, y: i, data: {}, index: i,
    }));
    const vp = createViewport(20, 30, 0, 1000);
    const result = sampleDataForViewport(largeData, vp, 500);
    // 可见11个 + 上下文最多20个 = 31
    expect(result.length).toBeLessThanOrEqual(35);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('calculateViewportSummary', () => {
  it('应计算视口内数据摘要', () => {
    const vp = createViewport(0, 50, 0, 200);
    const summary = calculateViewportSummary(mockPoints, vp, 'close');

    expect(summary.count).toBe(100);
    expect(summary.visible).toBeGreaterThan(0);
    expect(summary.min).toBeLessThanOrEqual(summary.max);
  });

  it('视口外应返回零值', () => {
    const vp = createViewport(200, 300, 0, 200);
    const summary = calculateViewportSummary(mockPoints, vp);
    expect(summary.visible).toBe(0);
  });
});

// ==================== 坐标转换测试 ====================

describe('dataToScreen', () => {
  it('应正确转换数据坐标到屏幕坐标', () => {
    const vp = createViewport(0, 100, 0, 100);
    const screen = dataToScreen(50, 50, vp, 200, 200);
    expect(screen.x).toBe(100);
    expect(screen.y).toBe(100);
  });

  it('原点应正确', () => {
    const vp = createViewport(0, 100, 0, 100);
    const screen = dataToScreen(0, 100, vp, 100, 100);
    expect(screen.x).toBe(0);
    expect(screen.y).toBe(0);
  });
});

describe('screenToData', () => {
  it('应正确转换屏幕坐标到数据坐标', () => {
    const vp = createViewport(0, 100, 0, 100);
    const data = screenToData(100, 100, vp, 200, 200);
    expect(data.x).toBe(50);
    expect(data.y).toBe(50);
  });

  it('与dataToScreen应互逆（近似）', () => {
    const vp = createViewport(0, 100, 0, 100);
    const screen = dataToScreen(37, 63, vp, 200, 200);
    const data = screenToData(screen.x, screen.y, vp, 200, 200);
    expect(data.x).toBeCloseTo(37, 0);
    expect(data.y).toBeCloseTo(63, 0);
  });
});
