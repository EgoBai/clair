/**
 * 图表交互逻辑测试
 * 覆盖缩放、平移、十字光标、tooltip定位、数据点选择、手势交互
 */

import { describe, it, expect } from 'vitest';

// 图表数据点
interface DataPoint {
  x: number;
  y: number;
  value: number;
  label: string;
}

interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface ZoomState {
  scale: number;
  offsetX: number;
  offsetY: number;
  minScale: number;
  maxScale: number;
}

// 缩放
function applyZoom(state: ZoomState, delta: number, centerX: number, centerY: number): ZoomState {
  const newScale = Math.max(state.minScale, Math.min(state.maxScale, state.scale * (1 + delta)));
  const ratio = newScale / state.scale;
  return {
    ...state,
    scale: newScale,
    offsetX: centerX - (centerX - state.offsetX) * ratio,
    offsetY: centerY - (centerY - state.offsetY) * ratio,
  };
}

function resetZoom(state: ZoomState): ZoomState {
  return { ...state, scale: 1, offsetX: 0, offsetY: 0 };
}

// 平移
function applyPan(state: ZoomState, deltaX: number, deltaY: number): ZoomState {
  return {
    ...state,
    offsetX: state.offsetX + deltaX,
    offsetY: state.offsetY + deltaY,
  };
}

// 最近数据点查找
function findNearestPoint(points: DataPoint[], mouseX: number, mouseY: number, threshold: number = 20): DataPoint | null {
  let nearest: DataPoint | null = null;
  let minDist = Infinity;

  for (const p of points) {
    const dist = Math.sqrt((p.x - mouseX) ** 2 + (p.y - mouseY) ** 2);
    if (dist < minDist && dist <= threshold) {
      minDist = dist;
      nearest = p;
    }
  }

  return nearest;
}

// 十字光标位置
function getCrosshairPosition(mouseX: number, mouseY: number, canvasWidth: number, canvasHeight: number): { x: number; y: number; valid: boolean } {
  const valid = mouseX >= 0 && mouseX <= canvasWidth && mouseY >= 0 && mouseY <= canvasHeight;
  return { x: mouseX, y: mouseY, valid };
}

// Tooltip定位
function calculateTooltipPosition(
  pointX: number, pointY: number,
  tooltipWidth: number, tooltipHeight: number,
  canvasWidth: number, canvasHeight: number,
  padding: number = 10
): { left: number; top: number; placement: 'top' | 'bottom' | 'left' | 'right' } {
  let left = pointX + padding;
  let top = pointY - tooltipHeight - padding;
  let placement: 'top' | 'bottom' | 'left' | 'right' = 'top';

  // 右边界
  if (left + tooltipWidth > canvasWidth) {
    left = pointX - tooltipWidth - padding;
    placement = 'left';
  }
  // 上边界
  if (top < 0) {
    top = pointY + padding;
    placement = 'bottom';
  }
  // 左边界
  if (left < 0) {
    left = padding;
  }
  // 下边界
  if (top + tooltipHeight > canvasHeight) {
    top = canvasHeight - tooltipHeight - padding;
  }

  return { left, top, placement };
}

// 视口变换
function transformViewport(viewport: Viewport, zoom: ZoomState): Viewport {
  const xRange = viewport.xMax - viewport.xMin;
  const yRange = viewport.yMax - viewport.yMin;
  return {
    xMin: viewport.xMin + (-zoom.offsetX / zoom.scale) * (xRange / 800),
    xMax: viewport.xMax - (zoom.offsetX / zoom.scale) * (xRange / 800),
    yMin: viewport.yMin + (zoom.offsetY / zoom.scale) * (yRange / 400),
    yMax: viewport.yMax - (zoom.offsetY / zoom.scale) * (yRange / 400),
  };
}

// 数据到屏幕坐标
function dataToScreen(dataX: number, dataY: number, viewport: Viewport, width: number, height: number): { x: number; y: number } {
  const x = ((dataX - viewport.xMin) / (viewport.xMax - viewport.xMin)) * width;
  const y = height - ((dataY - viewport.yMin) / (viewport.yMax - viewport.yMin)) * height;
  return { x, y };
}

// 屏幕到数据坐标
function screenToData(screenX: number, screenY: number, viewport: Viewport, width: number, height: number): { x: number; y: number } {
  const x = viewport.xMin + (screenX / width) * (viewport.xMax - viewport.xMin);
  const y = viewport.yMax - (screenY / height) * (viewport.yMax - viewport.yMin);
  return { x, y };
}

// 框选范围
function getSelectionRange(startX: number, startY: number, endX: number, endY: number): { x: number; y: number; width: number; height: number } {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  return { x, y, width, height };
}

// ==================== 缩放测试 ====================

describe('applyZoom 图表缩放', () => {
  const baseState: ZoomState = { scale: 1, offsetX: 0, offsetY: 0, minScale: 0.5, maxScale: 5 };

  it('放大应增加scale', () => {
    const result = applyZoom(baseState, 0.1, 400, 200);
    expect(result.scale).toBeGreaterThan(1);
  });

  it('缩小应减少scale', () => {
    const result = applyZoom(baseState, -0.1, 400, 200);
    expect(result.scale).toBeLessThan(1);
  });

  it('scale不应超过maxScale', () => {
    const state: ZoomState = { ...baseState, scale: 4.5 };
    const result = applyZoom(state, 0.5, 400, 200);
    expect(result.scale).toBeLessThanOrEqual(5);
  });

  it('scale不应低于minScale', () => {
    const state: ZoomState = { ...baseState, scale: 0.6 };
    const result = applyZoom(state, -0.5, 400, 200);
    expect(result.scale).toBeGreaterThanOrEqual(0.5);
  });

  it('resetZoom应恢复初始状态', () => {
    const zoomed: ZoomState = { scale: 3, offsetX: 100, offsetY: 50, minScale: 0.5, maxScale: 5 };
    const reset = resetZoom(zoomed);
    expect(reset.scale).toBe(1);
    expect(reset.offsetX).toBe(0);
    expect(reset.offsetY).toBe(0);
  });

  it('零缩放应保持不变', () => {
    const result = applyZoom(baseState, 0, 400, 200);
    expect(result.scale).toBe(1);
  });
});

// ==================== 平移测试 ====================

describe('applyPan 图表平移', () => {
  const baseState: ZoomState = { scale: 1, offsetX: 0, offsetY: 0, minScale: 0.5, maxScale: 5 };

  it('右移应增加offsetX', () => {
    const result = applyPan(baseState, 100, 0);
    expect(result.offsetX).toBe(100);
  });

  it('下移应增加offsetY', () => {
    const result = applyPan(baseState, 0, 50);
    expect(result.offsetY).toBe(50);
  });

  it('scale不应被平移影响', () => {
    const result = applyPan(baseState, 50, 50);
    expect(result.scale).toBe(baseState.scale);
  });

  it('多次平移应累加', () => {
    let state = baseState;
    state = applyPan(state, 10, 20);
    state = applyPan(state, 30, 40);
    expect(state.offsetX).toBe(40);
    expect(state.offsetY).toBe(60);
  });
});

// ==================== 最近数据点 ====================

describe('findNearestPoint 最近数据点', () => {
  const points: DataPoint[] = [
    { x: 100, y: 200, value: 100, label: 'A' },
    { x: 300, y: 150, value: 120, label: 'B' },
    { x: 500, y: 300, value: 90, label: 'C' },
  ];

  it('应找到最近的数据点', () => {
    const result = findNearestPoint(points, 105, 205);
    expect(result?.label).toBe('A');
  });

  it('超出阈值应返回null', () => {
    expect(findNearestPoint(points, 999, 999)).toBeNull();
  });

  it('空数组应返回null', () => {
    expect(findNearestPoint([], 100, 100)).toBeNull();
  });

  it('应使用自定义阈值', () => {
    const result = findNearestPoint(points, 115, 210, 5);
    expect(result).toBeNull();
  });

  it('精确命中应找到点', () => {
    const result = findNearestPoint(points, 300, 150);
    expect(result?.label).toBe('B');
  });
});

// ==================== 十字光标 ====================

describe('getCrosshairPosition 十字光标', () => {
  it('画布内应为有效', () => {
    const result = getCrosshairPosition(400, 200, 800, 400);
    expect(result.valid).toBe(true);
  });

  it('画布外应为无效', () => {
    const result = getCrosshairPosition(900, 200, 800, 400);
    expect(result.valid).toBe(false);
  });

  it('负坐标应为无效', () => {
    const result = getCrosshairPosition(-10, 200, 800, 400);
    expect(result.valid).toBe(false);
  });

  it('边界应为有效', () => {
    const result = getCrosshairPosition(0, 0, 800, 400);
    expect(result.valid).toBe(true);
  });
});

// ==================== Tooltip定位 ====================

describe('calculateTooltipPosition Tooltip定位', () => {
  it('默认应在点的上方', () => {
    const result = calculateTooltipPosition(400, 200, 150, 80, 800, 400);
    expect(result.placement).toBe('top');
  });

  it('靠近右边界应在左侧', () => {
    const result = calculateTooltipPosition(750, 200, 150, 80, 800, 400);
    expect(result.placement).toBe('left');
  });

  it('靠近上边界应在下方', () => {
    const result = calculateTooltipPosition(400, 20, 150, 80, 800, 400);
    expect(result.placement).toBe('bottom');
  });

  it('left不应为负', () => {
    const result = calculateTooltipPosition(5, 200, 150, 80, 800, 400);
    expect(result.left).toBeGreaterThanOrEqual(0);
  });

  it('top不应为负', () => {
    const result = calculateTooltipPosition(400, 5, 150, 80, 800, 400);
    expect(result.top).toBeGreaterThanOrEqual(0);
  });
});

// ==================== 坐标变换 ====================

describe('坐标变换', () => {
  const viewport: Viewport = { xMin: 0, xMax: 100, yMin: 0, yMax: 200 };

  it('dataToScreen应正确映射', () => {
    const screen = dataToScreen(50, 100, viewport, 800, 400);
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(200);
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
    expect(screen.x).toBeCloseTo(0);
    expect(screen.y).toBeCloseTo(400);
  });
});

// ==================== 框选范围 ====================

describe('getSelectionRange 框选范围', () => {
  it('正向框选应正确', () => {
    const range = getSelectionRange(100, 100, 300, 200);
    expect(range.x).toBe(100);
    expect(range.y).toBe(100);
    expect(range.width).toBe(200);
    expect(range.height).toBe(100);
  });

  it('反向框选应正确', () => {
    const range = getSelectionRange(300, 200, 100, 100);
    expect(range.x).toBe(100);
    expect(range.y).toBe(100);
    expect(range.width).toBe(200);
    expect(range.height).toBe(100);
  });

  it('零面积框选应返回零宽高', () => {
    const range = getSelectionRange(100, 100, 100, 100);
    expect(range.width).toBe(0);
    expect(range.height).toBe(0);
  });
});
