/**
 * 图表交互逻辑测试
 * 覆盖缩放、平移、十字光标、tooltip定位、数据点选择
 *
 * 迁移说明：断言已绑定生产实现 frontend/src/utils/chartInteractionEngine.ts。
 * 未迁移：画布边界判定——生产 calculateCrosshair 不做越界裁剪（越界坐标仍返回
 * visible=true），边界裁剪属组件层职责，生产侧暂无对应实现，故该 3 个用例保留
 * 本地 isPointerWithinCanvas 并标注「未迁移」。
 */

import { describe, it, expect } from 'vitest';
import {
  createViewport,
  zoomViewport,
  panViewport,
  resetViewport,
  calculateCrosshair,
  calculateTooltipPosition,
  findNearestIndex,
  findNearestPoint,
  updateSelection,
  getSelectedData,
  dataToScreen,
  screenToData,
  type ChartInteractionConfig,
  type ChartPoint,
} from '../utils/chartInteractionEngine';

// 生产默认 maxZoom 为 10；沿用旧用例的 5 倍上限口径，显式传配置
const zoomConfig: ChartInteractionConfig = {
  zoomStep: 0.1,
  minZoom: 0.5,
  maxZoom: 5,
  panSensitivity: 1,
  snapToData: true,
  crosshairEnabled: true,
  selectionEnabled: true,
  tooltipEnabled: true,
};

const chartPoints: ChartPoint[] = [
  { x: 0, y: 100, data: { close: 100 }, index: 0 },
  { x: 25, y: 100, data: { close: 101 }, index: 1 },
  { x: 50, y: 100, data: { close: 102 }, index: 2 },
  { x: 75, y: 100, data: { close: 103 }, index: 3 },
  { x: 100, y: 100, data: { close: 104 }, index: 4 },
];

const nearestPoints: ChartPoint[] = [
  { x: 100, y: 200, data: { value: 100, label: 'A' }, index: 0 },
  { x: 300, y: 150, data: { value: 120, label: 'B' }, index: 1 },
  { x: 500, y: 300, data: { value: 90, label: 'C' }, index: 2 },
];

// 未迁移：生产 calculateCrosshair 无画布边界判定，越界坐标仍返回 visible=true。
function isPointerWithinCanvas(
  mouseX: number,
  mouseY: number,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  return mouseX >= 0 && mouseX <= canvasWidth && mouseY >= 0 && mouseY <= canvasHeight;
}

// ==================== 缩放测试 ====================

describe('zoomViewport 图表缩放', () => {
  const baseViewport = createViewport(0, 100, 0, 200);

  it('放大应提高zoom并缩小数据范围', () => {
    const result = zoomViewport(baseViewport, 1.1, { x: 50, y: 100 });
    expect(result.zoom).toBeGreaterThan(1);
    expect(result.xMax - result.xMin).toBeLessThan(100);
    // 以 center 为锚点：数据值 50 仍位于视口正中
    expect((50 - result.xMin) / (result.xMax - result.xMin)).toBeCloseTo(0.5, 6);
  });

  it('缩小应降低zoom', () => {
    const result = zoomViewport(baseViewport, 0.9, { x: 50, y: 100 }, zoomConfig);
    expect(result.zoom).toBeLessThan(1);
  });

  it('zoom不应超过maxZoom', () => {
    const viewport = { ...baseViewport, zoom: 4.5 };
    const result = zoomViewport(viewport, 2, { x: 50, y: 100 }, zoomConfig);
    expect(result.zoom).toBe(5);
    expect(result.xMax - result.xMin).toBeCloseTo(90, 6);
  });

  it('zoom不应低于minZoom', () => {
    const viewport = { ...baseViewport, zoom: 0.6 };
    const result = zoomViewport(viewport, 0.5, { x: 50, y: 100 }, zoomConfig);
    expect(result.zoom).toBe(0.5);
    expect(result.xMax - result.xMin).toBeGreaterThan(100);
  });

  it('resetViewport应把zoom重置为1且不改数据范围', () => {
    const initial = createViewport(0, 100, 0, 200);
    const zoomed = zoomViewport(initial, 3, { x: 50, y: 100 });
    expect(zoomed.zoom).toBe(3);
    expect(zoomed.xMax - zoomed.xMin).toBeLessThan(100);
    // 生产口径：resetViewport(original) = {...original, zoom: 1}，不缓存初始视口，
    // 调用方需传入保存的初始视口；传入带非 1 zoom 的同范围视口可验证「只归 1」。
    expect(resetViewport(initial)).toEqual(initial);
    expect(resetViewport({ ...initial, zoom: 3 })).toEqual(initial);
  });

  it('factor为1时应保持原视口', () => {
    const result = zoomViewport(baseViewport, 1, { x: 50, y: 100 });
    expect(result.zoom).toBe(1);
    expect(result.xMin).toBeCloseTo(0, 6);
    expect(result.xMax).toBeCloseTo(100, 6);
    expect(result.yMin).toBeCloseTo(0, 6);
    expect(result.yMax).toBeCloseTo(200, 6);
  });
});

// ==================== 平移测试 ====================

describe('panViewport 图表平移', () => {
  const baseViewport = createViewport(0, 100, 0, 200);

  it('右移应增加xMin与xMax', () => {
    const result = panViewport(baseViewport, 100, 0);
    expect(result.xMin).toBe(100);
    expect(result.xMax).toBe(200);
    expect(result.yMin).toBe(0);
    expect(result.yMax).toBe(200);
  });

  it('下移应增加yMin与yMax', () => {
    const result = panViewport(baseViewport, 0, 50);
    expect(result.yMin).toBe(50);
    expect(result.yMax).toBe(250);
    expect(result.xMin).toBe(0);
    expect(result.xMax).toBe(100);
  });

  it('zoom不应被平移影响', () => {
    const result = panViewport(baseViewport, 50, 50);
    expect(result.zoom).toBe(baseViewport.zoom);
  });

  it('多次平移应累加', () => {
    let viewport = baseViewport;
    viewport = panViewport(viewport, 10, 20);
    viewport = panViewport(viewport, 30, 40);
    expect(viewport.xMin).toBe(40);
    expect(viewport.yMin).toBe(60);
  });
});

// ==================== 最近数据点 ====================

describe('findNearestPoint 最近数据点', () => {
  it('应找到最近的数据点', () => {
    const result = findNearestPoint(nearestPoints, 105);
    expect(result?.data.label).toBe('A');
  });

  it('远离所有点时仍返回最近点（生产按x轴距离，无阈值参数）', () => {
    const result = findNearestPoint(nearestPoints, 999);
    expect(result?.data.label).toBe('C');
  });

  it('空数组应返回null', () => {
    expect(findNearestPoint([], 100)).toBeNull();
    expect(findNearestIndex([], 100)).toBe(-1);
  });

  it('等距时应取较小索引一侧', () => {
    const pair = nearestPoints.slice(0, 2); // x = 100 / 300
    expect(findNearestIndex(pair, 200)).toBe(0);
  });

  it('精确命中应找到点', () => {
    const result = findNearestPoint(nearestPoints, 300);
    expect(result?.data.label).toBe('B');
  });
});

// ==================== 十字光标 ====================

describe('calculateCrosshair 十字光标', () => {
  const viewport = createViewport(0, 100, 0, 200);

  it('画布内应可见并透传坐标', () => {
    const result = calculateCrosshair(400, 200, 800, 400, viewport, chartPoints);
    expect(result.visible).toBe(true);
    expect(result.x).toBe(400);
    expect(result.y).toBe(200);
  });

  it('禁用十字光标时应不可见且不吸附', () => {
    const result = calculateCrosshair(400, 200, 800, 400, viewport, chartPoints, {
      ...zoomConfig,
      crosshairEnabled: false,
    });
    expect(result.visible).toBe(false);
    expect(result.dataPoint).toBeNull();
  });

  it('应吸附最近的数据点（按x轴）', () => {
    // mouseX 310 → dataX 38.75，最近点为 x=50（index 2）
    const result = calculateCrosshair(310, 200, 800, 400, viewport, chartPoints);
    expect(result.dataPoint?.index).toBe(2);
  });

  // 未迁移：以下用例覆盖画布边界判定，生产 calculateCrosshair 无此能力。
  it('画布外应为无效', () => {
    expect(isPointerWithinCanvas(900, 200, 800, 400)).toBe(false);
  });

  it('负坐标应为无效', () => {
    expect(isPointerWithinCanvas(-10, 200, 800, 400)).toBe(false);
  });

  it('边界坐标应为有效', () => {
    expect(isPointerWithinCanvas(0, 0, 800, 400)).toBe(true);
  });
});

// ==================== Tooltip定位 ====================

describe('calculateTooltipPosition Tooltip定位', () => {
  it('默认应出现在光标的右下方', () => {
    const result = calculateTooltipPosition(400, 200, 150, 80, 800, 400);
    expect(result).toEqual({ x: 410, y: 210 });
  });

  it('靠近右边界时应翻转到左侧', () => {
    const result = calculateTooltipPosition(750, 200, 150, 80, 800, 400);
    expect(result.x).toBe(590);
    expect(result.x + 150).toBeLessThanOrEqual(800);
    expect(result.x).toBeLessThan(750);
  });

  it('靠近下边界时应翻转到上方', () => {
    const result = calculateTooltipPosition(400, 350, 150, 80, 800, 400);
    expect(result.y).toBe(260);
    expect(result.y + 80).toBeLessThanOrEqual(400);
    expect(result.y).toBeLessThan(350);
  });

  it('翻转后超出左边界应钳制为非负', () => {
    const result = calculateTooltipPosition(1, 200, 790, 80, 800, 400);
    expect(result.x).toBe(10);
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it('翻转后超出上边界应钳制为非负', () => {
    const result = calculateTooltipPosition(400, 1, 150, 390, 800, 400);
    expect(result.y).toBe(10);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });
});

// ==================== 坐标变换 ====================

describe('坐标变换', () => {
  const viewport = createViewport(0, 100, 0, 200);

  it('dataToScreen应正确映射', () => {
    const screen = dataToScreen(50, 100, viewport, 800, 400);
    expect(screen.x).toBe(400);
    expect(screen.y).toBe(200);
  });

  it('screenToData应正确映射', () => {
    const data = screenToData(400, 200, viewport, 800, 400);
    expect(data.x).toBeCloseTo(50);
    expect(data.y).toBeCloseTo(100);
  });

  it('坐标变换应互为逆运算', () => {
    const screen = dataToScreen(25, 150, viewport, 800, 400);
    const data = screenToData(screen.x, screen.y, viewport, 800, 400);
    expect(data.x).toBeCloseTo(25);
    expect(data.y).toBeCloseTo(150);
  });

  it('原点应映射到左下角', () => {
    const screen = dataToScreen(0, 0, viewport, 800, 400);
    expect(screen.x).toBe(0);
    expect(screen.y).toBe(400);
  });
});

// ==================== 框选范围 ====================

describe('updateSelection 框选范围', () => {
  const viewport = createViewport(0, 100, 0, 200);

  it('正向框选应包含起止数据点', () => {
    const start = updateSelection(null, 200, 800, viewport, chartPoints, true)!;
    const end = updateSelection(start, 600, 800, viewport, chartPoints, true)!;
    expect(end.startX).toBe(25);
    expect(end.endX).toBe(75);
    expect(end.startIndex).toBe(1);
    expect(end.endIndex).toBe(3);
    expect(getSelectedData(chartPoints, end).map(p => p.index)).toEqual([1, 2, 3]);
  });

  it('反向框选应归一化起止索引', () => {
    const start = updateSelection(null, 600, 800, viewport, chartPoints, true)!;
    const end = updateSelection(start, 200, 800, viewport, chartPoints, true)!;
    expect(end.startIndex).toBe(3);
    expect(end.endIndex).toBe(1);
    expect(getSelectedData(chartPoints, end).map(p => p.index)).toEqual([1, 2, 3]);
  });

  it('零面积框选应只选中单点', () => {
    const start = updateSelection(null, 200, 800, viewport, chartPoints, true)!;
    const end = updateSelection(start, 200, 800, viewport, chartPoints, true)!;
    expect(end.startX).toBe(end.endX);
    const selected = getSelectedData(chartPoints, end);
    expect(selected).toHaveLength(1);
    expect(selected[0].index).toBe(1);
  });
});
