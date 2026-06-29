/**
 * 响应式布局工具 v2
 * 统一管理断点、媒体查询和自适应逻辑
 * 新增: container queries, fluid typography, touch target validation
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

// 流体排版配置
export interface FluidTypographyConfig {
  minSize: number;
  maxSize: number;
  minViewport: number;
  maxViewport: number;
  unit?: 'px' | 'rem';
}

export const TYPOGRAPHY_SCALE: Record<string, FluidTypographyConfig> = {
  h1: { minSize: 20, maxSize: 32, minViewport: 375, maxViewport: 1280, unit: 'px' },
  h2: { minSize: 18, maxSize: 28, minViewport: 375, maxViewport: 1280, unit: 'px' },
  h3: { minSize: 16, maxSize: 22, minViewport: 375, maxViewport: 1280, unit: 'px' },
  body: { minSize: 13, maxSize: 15, minViewport: 375, maxViewport: 1280, unit: 'px' },
  caption: { minSize: 11, maxSize: 13, minViewport: 375, maxViewport: 1280, unit: 'px' },
  price: { minSize: 16, maxSize: 22, minViewport: 375, maxViewport: 1280, unit: 'px' },
  priceSmall: { minSize: 13, maxSize: 15, minViewport: 375, maxViewport: 1280, unit: 'px' },
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
  const _bp = getCurrentBreakpoint(width);

  return columns.filter((col) => {
    if (col.priority === 1) return true;
    if (col.priority === 2) return isAbove(width, 'md');
    if (col.priority === 3) return isAbove(width, 'lg');
    return true;
  });
}

/**
 * 流体排版 CSS 计算
 * 返回 clamp() 字符串，适配任意视口宽度
 */
export function fluidTypography(config: FluidTypographyConfig): string {
  const { minSize, maxSize, minViewport, maxViewport, unit = 'px' } = config;
  const slope = (maxSize - minSize) / (maxViewport - minViewport);
  const yIntercept = minSize - slope * minViewport;

  if (unit === 'rem') {
    const minRem = minSize / 16;
    const maxRem = maxSize / 16;
    const vwVal = slope * 100;
    const interceptRem = yIntercept / 16;
    return `clamp(${minRem}rem, ${interceptRem.toFixed(4)}rem + ${vwVal.toFixed(4)}vw, ${maxRem}rem)`;
  }

  return `clamp(${minSize}px, ${yIntercept.toFixed(2)}px + ${(slope * 100).toFixed(4)}vw, ${maxSize}px)`;
}

/**
 * 生成流体间距 CSS
 */
export function fluidSpacing(min: number, max: number, minVw = 375, maxVw = 1280): string {
  const slope = (max - min) / (maxVw - minVw);
  const yIntercept = min - slope * minVw;
  return `clamp(${min}px, ${yIntercept.toFixed(2)}px + ${(slope * 100).toFixed(4)}vw, ${max}px)`;
}

/**
 * 触摸目标验证 (WCAG 2.1 AA: 44x44px minimum)
 */
export const TOUCH_TARGET_MIN = 44;

export function validateTouchTarget(width: number, height: number): boolean {
  return width >= TOUCH_TARGET_MIN && height >= TOUCH_TARGET_MIN;
}

export interface TouchTargetReport {
  valid: boolean;
  widthDiff: number;
  heightDiff: number;
  suggestion?: string;
}

export function touchTargetReport(width: number, height: number): TouchTargetReport {
  const wDiff = TOUCH_TARGET_MIN - width;
  const hDiff = TOUCH_TARGET_MIN - height;
  return {
    valid: wDiff <= 0 && hDiff <= 0,
    widthDiff: Math.max(0, wDiff),
    heightDiff: Math.max(0, hDiff),
    suggestion: (wDiff > 0 || hDiff > 0)
      ? `增加 padding: ${Math.max(wDiff, hDiff)}px`
      : undefined,
  };
}

/**
 * 断点适配配置生成器
 * 根据当前屏幕宽度返回一系列预设值
 */
export interface AdaptiveConfig {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  columns: number;
  sidebarVisible: boolean;
  fontSize: { h1: string; h2: string; body: string; caption: string };
  spacing: { xs: string; sm: string; md: string; lg: string };
  tableScroll: boolean;
  touchFriendly: boolean;
}

export function getAdaptiveConfig(width: number): AdaptiveConfig {
  const bp = getCurrentBreakpoint(width);
  const isMobile = isBelow(width, 'md');
  const isTablet = isAbove(width, 'md') && isBelow(width, 'lg');

  return {
    breakpoint: bp,
    isMobile,
    isTablet,
    isDesktop: isAbove(width, 'lg'),
    columns: GRID_PRESETS[bp].columns,
    sidebarVisible: !isMobile,
    fontSize: {
      h1: fluidTypography(TYPOGRAPHY_SCALE.h1),
      h2: fluidTypography(TYPOGRAPHY_SCALE.h2),
      body: fluidTypography(TYPOGRAPHY_SCALE.body),
      caption: fluidTypography(TYPOGRAPHY_SCALE.caption),
    },
    spacing: {
      xs: fluidSpacing(4, 8),
      sm: fluidSpacing(8, 12),
      md: fluidSpacing(12, 20),
      lg: fluidSpacing(16, 32),
    },
    tableScroll: isMobile,
    touchFriendly: isMobile,
  };
}

/**
 * 容器查询 CSS 生成
 */
export function containerQuery(name: string, minWidth: number, styles: string): string {
  return `@container ${name} (min-width: ${minWidth}px) { ${styles} }`;
}

/**
 * 视口安全区域 CSS 变量 (iPhone notch support)
 */
export function safeAreaPadding(): { paddingTop: string; paddingBottom: string; paddingLeft: string; paddingRight: string } {
  return {
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    paddingRight: 'env(safe-area-inset-right, 0px)',
  };
}
