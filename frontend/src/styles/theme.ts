/**
 * 澄观统一设计系统
 * 参考富途牛牛/同花顺的深色主题
 */

// ==================== 颜色系统 ====================
export const colors = {
  // 背景层级
  page: '#0a0e1a',        // 最深 - 页面背景
  card: '#111827',        // 卡片背景
  cardHover: '#1a2332',   // 卡片悬停
  surface: '#1e293b',     // 表面/输入框
  border: '#2d3748',      // 边框
  borderLight: '#374151', // 浅边框
  
  // 文字层级
  text: '#f1f5f9',        // 主文字
  textSecondary: '#94a3b8', // 次要文字
  textMuted: '#64748b',   // 弱化文字
  
  // 功能色
  accent: '#3b82f6',      // 主题蓝
  accentLight: '#60a5fa', // 浅蓝
  accentBg: '#1e3a5f',    // 蓝色背景
  success: '#22c55e',     // 成功/上涨
  danger: '#ef4444',      // 危险/下跌
  warning: '#f59e0b',     // 警告
  gold: '#f59e0b',        // 金色
  
  // A股特色
  up: '#ef4444',          // 红涨
  down: '#22c55e',        // 绿跌
  flat: '#6b7280',        // 平盘
};

// ==================== 字体系统 ====================
export const typography = {
  // 数字字体（等宽）
  mono: "'DIN Alternate', 'SF Mono', 'Menlo', monospace",
  // 中文字体
  chinese: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  // 混合
  mixed: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'SF Mono', monospace",
};

// ==================== 尺寸系统 ====================
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// ==================== 圆角 ====================
export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
};

// ==================== 阴影 ====================
export const shadows = {
  card: '0 1px 3px rgba(0, 0, 0, 0.3)',
  cardHover: '0 4px 12px rgba(0, 0, 0, 0.4)',
  dropdown: '0 8px 24px rgba(0, 0, 0, 0.5)',
};

// ==================== 通用样式 ====================
export const commonStyles = {
  // 卡片
  card: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.lg,
    transition: 'all 0.2s ease',
  },
  cardHover: {
    background: colors.cardHover,
    border: `1px solid ${colors.borderLight}`,
    boxShadow: shadows.cardHover,
  },
  
  // 文字
  textPrimary: {
    color: colors.text,
    fontFamily: typography.chinese,
  },
  textSecondary: {
    color: colors.textSecondary,
    fontFamily: typography.chinese,
  },
  textMuted: {
    color: colors.textMuted,
    fontFamily: typography.chinese,
  },
  
  // 数字
  number: {
    fontFamily: typography.mono,
    fontWeight: 600,
  },
  
  // 按钮
  buttonPrimary: {
    background: colors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: borderRadius.md,
    padding: '8px 16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  
  // 输入框
  input: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    color: colors.text,
    padding: '8px 12px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
};

// ==================== 响应式断点 ====================
export const breakpoints = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
};

// ==================== 响应式工具 ====================
export const media = {
  mobile: `@media (max-width: ${breakpoints.mobile}px)`,
  tablet: `@media (max-width: ${breakpoints.tablet}px)`,
  desktop: `@media (min-width: ${breakpoints.desktop}px)`,
};

// ==================== 涨跌色工具 ====================
export const getPriceColor = (change: number): string => {
  if (change > 0) return colors.up;
  if (change < 0) return colors.down;
  return colors.flat;
};

export const getPriceSign = (change: number): string => {
  return change > 0 ? '+' : '';
};

// ==================== 格式化工具 ====================
export const formatNumber = (num: number, decimals = 2): string => {
  if (Math.abs(num) >= 1e8) return (num / 1e8).toFixed(1) + '亿';
  if (Math.abs(num) >= 1e4) return (num / 1e4).toFixed(1) + '万';
  return num.toFixed(decimals);
};

export const formatPercent = (num: number): string => {
  return (num > 0 ? '+' : '') + num.toFixed(2) + '%';
};
