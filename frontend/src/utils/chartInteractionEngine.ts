/**
 * 图表交互增强引擎
 * 提供图表缩放、平移、十字光标、数据点高亮、区间选择等交互功能
 */

// ==================== 类型定义 ====================

export interface ChartViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zoom: number; // 1 = 100%
}

export interface ChartPoint {
  x: number;
  y: number;
  data: Record<string, unknown>;
  index: number;
}

export interface CrosshairPosition {
  x: number;
  y: number;
  dataPoint: ChartPoint | null;
  visible: boolean;
}

export interface SelectionRange {
  startX: number;
  endX: number;
  startIndex: number;
  endIndex: number;
  active: boolean;
}

export interface PanState {
  isPanning: boolean;
  startX: number;
  startY: number;
  startViewport: ChartViewport;
}

export interface ZoomState {
  level: number;
  minZoom: number;
  maxZoom: number;
  center: { x: number; y: number };
}

export interface TooltipData {
  title: string;
  items: Array<{ label: string; value: string; color?: string }>;
  position: { x: number; y: number };
  visible: boolean;
}

export interface ChartInteractionConfig {
  zoomStep: number;
  minZoom: number;
  maxZoom: number;
  panSensitivity: number;
  snapToData: boolean;
  crosshairEnabled: boolean;
  selectionEnabled: boolean;
  tooltipEnabled: boolean;
}

const DEFAULT_CONFIG: ChartInteractionConfig = {
  zoomStep: 0.1,
  minZoom: 0.5,
  maxZoom: 10,
  panSensitivity: 1,
  snapToData: true,
  crosshairEnabled: true,
  selectionEnabled: true,
  tooltipEnabled: true,
};

// ==================== 视口管理 ====================

/**
 * 创建初始视口
 */
export function createViewport(
  xMin: number, xMax: number, yMin: number, yMax: number,
): ChartViewport {
  return { xMin, xMax, yMin, yMax, zoom: 1 };
}

/**
 * 缩放视口
 */
export function zoomViewport(
  viewport: ChartViewport,
  factor: number,
  center: { x: number; y: number },
  config: ChartInteractionConfig = DEFAULT_CONFIG,
): ChartViewport {
  const newZoom = Math.max(config.minZoom, Math.min(config.maxZoom, viewport.zoom * factor));
  const zoomRatio = newZoom / viewport.zoom;

  const xRange = viewport.xMax - viewport.xMin;
  const yRange = viewport.yMax - viewport.yMin;

  const newXRange = xRange / zoomRatio;
  const newYRange = yRange / zoomRatio;

  // 以center为中心缩放
  const xRatio = (center.x - viewport.xMin) / xRange;
  const yRatio = (center.y - viewport.yMin) / yRange;

  return {
    xMin: center.x - newXRange * xRatio,
    xMax: center.x + newXRange * (1 - xRatio),
    yMin: center.y - newYRange * yRatio,
    yMax: center.y + newYRange * (1 - yRatio),
    zoom: Math.round(newZoom * 1000) / 1000,
  };
}

/**
 * 平移视口
 */
export function panViewport(
  viewport: ChartViewport,
  dx: number,
  dy: number,
  config: ChartInteractionConfig = DEFAULT_CONFIG,
): ChartViewport {
  const scaledDx = dx * config.panSensitivity;
  const scaledDy = dy * config.panSensitivity;

  return {
    ...viewport,
    xMin: viewport.xMin + scaledDx,
    xMax: viewport.xMax + scaledDx,
    yMin: viewport.yMin + scaledDy,
    yMax: viewport.yMax + scaledDy,
  };
}

/**
 * 重置视口
 */
export function resetViewport(
  original: ChartViewport,
): ChartViewport {
  return { ...original, zoom: 1 };
}

/**
 * 适配数据到视口
 */
export function fitDataToViewport(
  dataPoints: Array<{ x: number; y: number }>,
  padding: number = 0.05,
): ChartViewport {
  if (dataPoints.length === 0) {
    return createViewport(0, 1, 0, 1);
  }

  const xs = dataPoints.map(p => p.x);
  const ys = dataPoints.map(p => p.y);

  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  const xPad = (xMax - xMin) * padding;
  const yPad = (yMax - yMin) * padding;

  return createViewport(
    xMin - xPad, xMax + xPad,
    yMin - yPad, yMax + yPad,
  );
}

// ==================== 十字光标 ====================

/**
 * 计算十字光标位置
 */
export function calculateCrosshair(
  mouseX: number,
  mouseY: number,
  chartWidth: number,
  chartHeight: number,
  viewport: ChartViewport,
  data: ChartPoint[],
  config: ChartInteractionConfig = DEFAULT_CONFIG,
): CrosshairPosition {
  if (!config.crosshairEnabled) {
    return { x: 0, y: 0, dataPoint: null, visible: false };
  }

  // 将鼠标坐标转换为数据坐标
  const dataX = viewport.xMin + (mouseX / chartWidth) * (viewport.xMax - viewport.xMin);
  const _dataY = viewport.yMax - (mouseY / chartHeight) * (viewport.yMax - viewport.yMin);

  let dataPoint: ChartPoint | null = null;

  if (config.snapToData && data.length > 0) {
    // 找最近的数据点
    let minDist = Infinity;
    for (const point of data) {
      const dist = Math.abs(point.x - dataX);
      if (dist < minDist) {
        minDist = dist;
        dataPoint = point;
      }
    }
  }

  return {
    x: mouseX,
    y: mouseY,
    dataPoint,
    visible: true,
  };
}

/**
 * 格式化十字光标数据
 */
export function formatCrosshairData(
  point: ChartPoint,
  formatters: Record<string, (val: unknown) => string> = {},
): Array<{ key: string; value: string }> {
  return Object.entries(point.data).map(([key, value]) => {
    const formatter = formatters[key];
    return {
      key,
      value: formatter ? formatter(value) : String(value),
    };
  });
}

// ==================== 区间选择 ====================

/**
 * 更新选择区间
 */
export function updateSelection(
  currentSelection: SelectionRange | null,
  mouseX: number,
  chartWidth: number,
  viewport: ChartViewport,
  data: ChartPoint[],
  isSelecting: boolean,
  config: ChartInteractionConfig = DEFAULT_CONFIG,
): SelectionRange | null {
  if (!config.selectionEnabled) return null;

  const dataX = viewport.xMin + (mouseX / chartWidth) * (viewport.xMax - viewport.xMin);

  if (!isSelecting) {
    return currentSelection;
  }

  if (!currentSelection || !currentSelection.active) {
    // 开始新选择
    const nearestIndex = findNearestIndex(data, dataX);
    return {
      startX: dataX,
      endX: dataX,
      startIndex: nearestIndex,
      endIndex: nearestIndex,
      active: true,
    };
  }

  // 更新选择
  const nearestIndex = findNearestIndex(data, dataX);
  return {
    ...currentSelection,
    endX: dataX,
    endIndex: nearestIndex,
  };
}

/**
 * 获取选中区间的数据
 */
export function getSelectedData<T extends ChartPoint>(
  data: T[],
  selection: SelectionRange | null,
): T[] {
  if (!selection || !selection.active) return [];

  const start = Math.min(selection.startIndex, selection.endIndex);
  const end = Math.max(selection.startIndex, selection.endIndex);

  return data.slice(start, end + 1);
}

/**
 * 计算选中区间统计
 */
export function calculateSelectionStats(
  selection: SelectionRange | null,
  data: ChartPoint[],
  valueKey: string = 'close',
): { count: number; min: number; max: number; avg: number; sum: number } | null {
  if (!selection || !selection.active) return null;

  const selected = getSelectedData(data, selection);
  if (selected.length === 0) return null;

  const values = selected.map(p => Number(p.data[valueKey]) || 0);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    count: selected.length,
    min: Math.round(Math.min(...values) * 100) / 100,
    max: Math.round(Math.max(...values) * 100) / 100,
    avg: Math.round((sum / values.length) * 100) / 100,
    sum: Math.round(sum * 100) / 100,
  };
}

// ==================== 数据点高亮 ====================

/**
 * 查找最近的数据点索引
 * 使用二分查找优化，O(log n) 复杂度，对标TradingView十字线精度
 */
export function findNearestIndex(
  data: ChartPoint[],
  targetX: number,
): number {
  if (data.length === 0) return -1;
  if (data.length === 1) return 0;

  // 二分查找：找到第一个 x >= targetX 的位置
  let lo = 0;
  let hi = data.length - 1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (data[mid].x < targetX) {
      lo = mid + 1;
    } else if (data[mid].x > targetX) {
      hi = mid - 1;
    } else {
      return mid; // 精确匹配
    }
  }

  // lo 是第一个 >= targetX 的位置，hi 是最后一个 < targetX 的位置
  // 比较 lo 和 hi 哪个更近
  if (lo >= data.length) return hi;
  if (hi < 0) return lo;

  return (targetX - data[hi].x) <= (data[lo].x - targetX) ? hi : lo;
}

/**
 * 查找最近的数据点
 */
export function findNearestPoint(
  data: ChartPoint[],
  targetX: number,
): ChartPoint | null {
  const index = findNearestIndex(data, targetX);
  return index >= 0 ? data[index] : null;
}

/**
 * 高亮指定索引范围的数据点
 */
export function highlightRange(
  data: ChartPoint[],
  startIndex: number,
  endIndex: number,
): number[] {
  const start = Math.max(0, Math.min(startIndex, endIndex));
  const end = Math.min(data.length - 1, Math.max(startIndex, endIndex));

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// ==================== 工具提示 ====================

/**
 * 计算工具提示位置（避免溢出）
 */
export function calculateTooltipPosition(
  mouseX: number,
  mouseY: number,
  tooltipWidth: number,
  tooltipHeight: number,
  containerWidth: number,
  containerHeight: number,
  offset: number = 10,
): { x: number; y: number } {
  let x = mouseX + offset;
  let y = mouseY + offset;

  // 右边界检测
  if (x + tooltipWidth > containerWidth) {
    x = mouseX - tooltipWidth - offset;
  }

  // 下边界检测
  if (y + tooltipHeight > containerHeight) {
    y = mouseY - tooltipHeight - offset;
  }

  // 左边界检测
  if (x < 0) x = offset;

  // 上边界检测
  if (y < 0) y = offset;

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * 构建工具提示数据
 */
export function buildTooltip(
  point: ChartPoint,
  config: {
    title?: string;
    fields: Array<{ key: string; label: string; format?: (v: unknown) => string; color?: string }>;
  },
): TooltipData {
  const items = config.fields.map(field => {
    const value = point.data[field.key];
    const formatted = field.format ? field.format(value) : String(value ?? '-');
    return {
      label: field.label,
      value: formatted,
      color: field.color,
    };
  });

  return {
    title: config.title || `数据点 #${point.index}`,
    items,
    position: { x: 0, y: 0 },
    visible: true,
  };
}

// ==================== 手势处理 ====================

/**
 * 处理鼠标滚轮缩放
 */
export function handleWheelZoom(
  delta: number,
  viewport: ChartViewport,
  mouseX: number,
  mouseY: number,
  chartWidth: number,
  chartHeight: number,
  config: ChartInteractionConfig = DEFAULT_CONFIG,
): ChartViewport {
  const factor = delta > 0 ? (1 - config.zoomStep) : (1 + config.zoomStep);

  const center = {
    x: viewport.xMin + (mouseX / chartWidth) * (viewport.xMax - viewport.xMin),
    y: viewport.yMax - (mouseY / chartHeight) * (viewport.yMax - viewport.yMin),
  };

  return zoomViewport(viewport, factor, center, config);
}

/**
 * 处理拖拽平移
 */
export function handleDragPan(
  startMouseX: number,
  startMouseY: number,
  currentMouseX: number,
  currentMouseY: number,
  startViewport: ChartViewport,
  chartWidth: number,
  chartHeight: number,
  config: ChartInteractionConfig = DEFAULT_CONFIG,
): ChartViewport {
  const xRange = startViewport.xMax - startViewport.xMin;
  const yRange = startViewport.yMax - startViewport.yMin;

  const dx = ((currentMouseX - startMouseX) / chartWidth) * xRange;
  const dy = ((currentMouseY - startMouseY) / chartHeight) * yRange;

  return panViewport(startViewport, -dx, dy, config);
}

/**
 * 双击重置视图
 */
export function handleDoubleClickReset(
  viewport: ChartViewport,
): ChartViewport {
  return { ...viewport, zoom: 1 };
}

// ==================== 键盘快捷键 ====================

/**
 * 处理键盘缩放
 */
export function handleKeyboardZoom(
  key: '+' | '-' | '0',
  viewport: ChartViewport,
  config: ChartInteractionConfig = DEFAULT_CONFIG,
): ChartViewport {
  const center = {
    x: (viewport.xMin + viewport.xMax) / 2,
    y: (viewport.yMin + viewport.yMax) / 2,
  };

  switch (key) {
    case '+':
      return zoomViewport(viewport, 1 + config.zoomStep, center, config);
    case '-':
      return zoomViewport(viewport, 1 - config.zoomStep, center, config);
    case '0':
      return { ...viewport, zoom: 1 };
    default:
      return viewport;
  }
}

/**
 * 处理键盘平移
 */
export function handleKeyboardPan(
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
  viewport: ChartViewport,
  step: number = 0.1,
): ChartViewport {
  const xRange = (viewport.xMax - viewport.xMin) * step;
  const yRange = (viewport.yMax - viewport.yMin) * step;

  switch (key) {
    case 'ArrowLeft': return panViewport(viewport, xRange, 0);
    case 'ArrowRight': return panViewport(viewport, -xRange, 0);
    case 'ArrowUp': return panViewport(viewport, 0, -yRange);
    case 'ArrowDown': return panViewport(viewport, 0, yRange);
    default: return viewport;
  }
}

// ==================== 数据采样 ====================

/**
 * LOD（Level of Detail）数据采样
 * 根据当前视口范围减少显示的数据点数量
 */
export function sampleDataForViewport<T extends ChartPoint>(
  data: T[],
  viewport: ChartViewport,
  maxPoints: number = 500,
): T[] {
  if (data.length <= maxPoints) return data;

  // 过滤视口内的数据
  const visible = data.filter(p => p.x >= viewport.xMin && p.x <= viewport.xMax);

  if (visible.length <= maxPoints) {
    // 加上视口外的一小部分上下文
    const before = data.filter(p => p.x < viewport.xMin).slice(-10);
    const after = data.filter(p => p.x > viewport.xMax).slice(0, 10);
    return [...before, ...visible, ...after] as T[];
  }

  // 简单均匀采样
  const step = visible.length / maxPoints;
  const sampled: T[] = [];

  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.floor(i * step);
    sampled.push(visible[idx]);
  }

  return sampled;
}

/**
 * 计算可见范围的数据统计摘要
 */
export function calculateViewportSummary<T extends ChartPoint>(
  data: T[],
  viewport: ChartViewport,
  valueKey: string = 'close',
): { count: number; min: number; max: number; avg: number; visible: number } {
  const visible = data.filter(p => p.x >= viewport.xMin && p.x <= viewport.xMax);

  if (visible.length === 0) {
    return { count: data.length, min: 0, max: 0, avg: 0, visible: 0 };
  }

  const values = visible.map(p => Number(p.data[valueKey]) || 0);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    count: data.length,
    min: Math.round(Math.min(...values) * 100) / 100,
    max: Math.round(Math.max(...values) * 100) / 100,
    avg: Math.round((sum / values.length) * 100) / 100,
    visible: visible.length,
  };
}

// ==================== 坐标转换 ====================

/**
 * 数据坐标转屏幕坐标
 */
export function dataToScreen(
  dataX: number,
  dataY: number,
  viewport: ChartViewport,
  chartWidth: number,
  chartHeight: number,
): { x: number; y: number } {
  const x = ((dataX - viewport.xMin) / (viewport.xMax - viewport.xMin)) * chartWidth;
  const y = ((viewport.yMax - dataY) / (viewport.yMax - viewport.yMin)) * chartHeight;

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * 屏幕坐标转数据坐标
 */
export function screenToData(
  screenX: number,
  screenY: number,
  viewport: ChartViewport,
  chartWidth: number,
  chartHeight: number,
): { x: number; y: number } {
  const x = viewport.xMin + (screenX / chartWidth) * (viewport.xMax - viewport.xMin);
  const y = viewport.yMax - (screenY / chartHeight) * (viewport.yMax - viewport.yMin);

  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}
