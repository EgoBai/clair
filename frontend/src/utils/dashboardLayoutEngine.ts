/**
 * User Dashboard Layout Engine
 *
 * 看板布局管理、组件拖拽、保存/恢复
 */

export type WidgetType = 'chart' | 'table' | 'gauge' | 'heatmap' | 'news' | 'portfolio' | 'watchlist' | 'alert';

export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  position: GridPosition;
  config: Record<string, unknown>;
  visible: boolean;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DashboardLayout {
  id: string;
  name: string;
  columns: number;
  rowHeight: number;
  gap: number;
  widgets: DashboardWidget[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LayoutValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证布局
 */
export function validateLayout(layout: DashboardLayout): LayoutValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (layout.columns < 1 || layout.columns > 24) {
    errors.push('Columns must be between 1 and 24');
  }

  const widgetIds = new Set<string>();
  for (const w of layout.widgets) {
    if (widgetIds.has(w.id)) {
      errors.push(`Duplicate widget ID: ${w.id}`);
    }
    widgetIds.add(w.id);

    if (w.position.x < 0 || w.position.y < 0) {
      errors.push(`Widget ${w.id} has negative position`);
    }

    if (w.position.w < 1 || w.position.h < 1) {
      errors.push(`Widget ${w.id} has invalid size`);
    }

    if (w.position.x + w.position.w > layout.columns) {
      warnings.push(`Widget ${w.id} overflows columns`);
    }
  }

  // Check overlaps
  for (let i = 0; i < layout.widgets.length; i++) {
    for (let j = i + 1; j < layout.widgets.length; j++) {
      if (checkOverlap(layout.widgets[i].position, layout.widgets[j].position)) {
        warnings.push(`Widgets ${layout.widgets[i].id} and ${layout.widgets[j].id} overlap`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 检查两个区域是否重叠
 */
export function checkOverlap(a: GridPosition, b: GridPosition): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/**
 * 添加组件到布局
 */
export function addWidget(layout: DashboardLayout, widget: Omit<DashboardWidget, 'id' | 'createdAt' | 'updatedAt'>): DashboardLayout {
  const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();

  const newWidget: DashboardWidget = {
    ...widget,
    id,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...layout,
    widgets: [...layout.widgets, newWidget],
    updatedAt: now,
  };
}

/**
 * 移除组件
 */
export function removeWidget(layout: DashboardLayout, widgetId: string): DashboardLayout {
  return {
    ...layout,
    widgets: layout.widgets.filter(w => w.id !== widgetId),
    updatedAt: Date.now(),
  };
}

/**
 * 移动组件
 */
export function moveWidget(
  layout: DashboardLayout,
  widgetId: string,
  position: Partial<GridPosition>
): DashboardLayout {
  return {
    ...layout,
    widgets: layout.widgets.map(w =>
      w.id === widgetId
        ? { ...w, position: { ...w.position, ...position }, updatedAt: Date.now() }
        : w
    ),
    updatedAt: Date.now(),
  };
}

/**
 * 自动排列组件（避免重叠）
 */
export function autoArrange(layout: DashboardLayout): DashboardLayout {
  const sorted = [...layout.widgets]
    .filter(w => w.visible)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

  const grid: boolean[][] = [];
  const maxRows = Math.ceil(sorted.reduce((s, w) => s + w.position.h, 0) / layout.columns) + 10;

  for (let i = 0; i < maxRows; i++) {
    grid[i] = new Array(layout.columns).fill(false);
  }

  const positioned: DashboardWidget[] = [];

  for (const widget of sorted) {
    let placed = false;

    for (let row = 0; row < maxRows && !placed; row++) {
      for (let col = 0; col <= layout.columns - widget.position.w && !placed; col++) {
        if (canPlace(grid, col, row, widget.position.w, widget.position.h)) {
          markOccupied(grid, col, row, widget.position.w, widget.position.h, true);
          positioned.push({
            ...widget,
            position: { x: col, y: row, w: widget.position.w, h: widget.position.h },
            updatedAt: Date.now(),
          });
          placed = true;
        }
      }
    }

    if (!placed) {
      positioned.push(widget);
    }
  }

  // Add hidden widgets
  const hidden = layout.widgets.filter(w => !w.visible);
  return {
    ...layout,
    widgets: [...positioned, ...hidden],
    updatedAt: Date.now(),
  };
}

function canPlace(grid: boolean[][], x: number, y: number, w: number, h: number): boolean {
  for (let row = y; row < y + h; row++) {
    if (!grid[row]) return false;
    for (let col = x; col < x + w; col++) {
      if (grid[row][col]) return false;
    }
  }
  return true;
}

function markOccupied(grid: boolean[][], x: number, y: number, w: number, h: number, value: boolean): void {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      grid[row][col] = value;
    }
  }
}

/**
 * 序列化布局为JSON
 */
export function serializeLayout(layout: DashboardLayout): string {
  return JSON.stringify(layout, null, 2);
}

/**
 * 反序列化布局
 */
export function deserializeLayout(json: string): DashboardLayout | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.id || !parsed.widgets || !Array.isArray(parsed.widgets)) return null;
    return parsed as DashboardLayout;
  } catch {
    return null;
  }
}

/**
 * 克隆布局
 */
export function cloneLayout(layout: DashboardLayout, newName?: string): DashboardLayout {
  const now = Date.now();
  return {
    ...layout,
    id: `layout-${now}`,
    name: newName || `${layout.name} (copy)`,
    isDefault: false,
    widgets: layout.widgets.map(w => ({
      ...w,
      id: `widget-${now}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 获取布局统计
 */
export function getLayoutStats(layout: DashboardLayout): {
  totalWidgets: number;
  visibleWidgets: number;
  lockedWidgets: number;
  gridUtilization: number;
  byType: Record<WidgetType, number>;
} {
  const visible = layout.widgets.filter(w => w.visible);
  const totalCells = layout.columns * (Math.max(...layout.widgets.map(w => w.position.y + w.position.h), 1));
  const usedCells = visible.reduce((s, w) => s + w.position.w * w.position.h, 0);

  const byType: Record<string, number> = {};
  for (const w of layout.widgets) {
    byType[w.type] = (byType[w.type] || 0) + 1;
  }

  return {
    totalWidgets: layout.widgets.length,
    visibleWidgets: visible.length,
    lockedWidgets: layout.widgets.filter(w => w.locked).length,
    gridUtilization: totalCells > 0 ? Math.round((usedCells / totalCells) * 100) : 0,
    byType: byType as Record<WidgetType, number>,
  };
}
