/**
 * 响应式布局工具
 * 统一管理断点、媒体查询和自适应逻辑
 */

// 断点定义（与 Tailwind 对齐）
export const BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

// 栅格配置
export interface GridConfig {
  columns: number;
  gap: number;
  padding: number;
}

// 响应式栅格预设
export const GRID_PRESETS: Record<Breakpoint, GridConfig> = {
  xs: { columns: 1, gap: 8, padding: 12 },
  sm: { columns: 1, gap: 12, padding: 16 },
  md: { columns: 2, gap: 16, padding: 20 },
  lg: { columns: 3, gap: 16, padding: 24 },
  xl: { columns: 4, gap: 20, padding: 24 },
  '2xl': { columns: 4, gap: 24, padding: 32 },
};

/**
 * 获取当前断点
 */
export function getCurrentBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

/**
 * 检查是否小于断点
 */
export function isBelow(width: number, breakpoint: Breakpoint): boolean {
  return width < BREAKPOINTS[breakpoint];
}

/**
 * 检查是否大于等于断点
 */
export function isAbove(width: number, breakpoint: Breakpoint): boolean {
  return width >= BREAKPOINTS[breakpoint];
}

/**
 * 响应式值选择器
 */
export function responsiveValue<T>(width: number, values: Partial<Record<Breakpoint, T>>): T | undefined {
  const bp = getCurrentBreakpoint(width);
  const ordered: Breakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];

  for (const key of ordered) {
    if (BREAKPOINTS[key] <= BREAKPOINTS[bp] && values[key] !== undefined) {
      return values[key];
    }
  }
  return undefined;
}

/**
 * 获取栅格配置
 */
export function getGridConfig(width: number): GridConfig {
  const bp = getCurrentBreakpoint(width);
  return GRID_PRESETS[bp];
}

/**
 * 计算虚拟列表尺寸
 */
export function calculateVirtualList(
  containerHeight: number,
  itemHeight: number,
  totalCount: number,
  scrollTop: number,
  overscan = 3
): { startIndex: number; endIndex: number; offsetY: number; totalHeight: number } {
  const totalHeight = totalCount * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(totalCount - 1, startIndex + visibleCount + overscan * 2);

  return {
    startIndex,
    endIndex,
    offsetY: startIndex * itemHeight,
    totalHeight,
  };
}

/**
 * 自适应列数计算
 */
export function calculateColumns(
  containerWidth: number,
  minItemWidth: number,
  gap: number,
  maxColumns = 6
): number {
  const availableWidth = containerWidth;
  const columns = Math.floor((availableWidth + gap) / (minItemWidth + gap));
  return Math.max(1, Math.min(columns, maxColumns));
}

/**
 * 生成媒体查询字符串
 */
export function mediaQuery(breakpoint: Breakpoint, direction: 'up' | 'down' = 'up'): string {
  const px = BREAKPOINTS[breakpoint];
  if (direction === 'up') {
    return `@media (min-width: ${px}px)`;
  }
  return `@media (max-width: ${px - 1}px)`;
}

/**
 * 表格响应式列配置
 */
export interface TableColumn<T = unknown> {
  key: string;
  title: string;
  dataIndex: string;
  render?: (value: unknown, record: T) => React.ReactNode;
  priority: number; // 1=always, 2=tablet+, 3=desktop+
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
}

/**
 * 根据屏幕宽度过滤表格列
 */
export function filterColumnsByBreakpoint<T>(
  columns: TableColumn<T>[],
  width: number
): TableColumn<T>[] {
  const bp = getCurrentBreakpoint(width);

  return columns.filter((col) => {
    if (col.priority === 1) return true;
    if (col.priority === 2) return isAbove(width, 'md');
    if (col.priority === 3) return isAbove(width, 'lg');
    return true;
  });
}
