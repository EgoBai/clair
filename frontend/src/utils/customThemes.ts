/**
 * 自定义主题系统
 * 支持多主题、用户自定义配色、暗色/亮色模式
 */

export interface ThemeColors {
  primary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  up: string;     // 涨
  down: string;   // 跌
  flat: string;   // 平盘
}

export interface ChartTheme {
  backgroundColor: string;
  gridColor: string;
  textColor: string;
  tooltipBg: string;
  tooltipBorder: string;
  ma5: string;
  ma10: string;
  ma20: string;
  volume: string;
  volumeUp: string;
  volumeDown: string;
}

export interface AppTheme {
  id: string;
  name: string;
  description: string;
  isDark: boolean;
  colors: ThemeColors;
  chart: ChartTheme;
  borderRadius: number;
  fontSize: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

// 预设主题
export const PRESET_THEMES: AppTheme[] = [
  {
    id: 'light',
    name: '默认亮色',
    description: '经典白色背景主题',
    isDark: false,
    colors: {
      primary: '#1890ff', success: '#52c41a', warning: '#faad14',
      error: '#ff4d4f', info: '#1890ff', background: '#f0f2f5',
      surface: '#ffffff', text: '#262626', textSecondary: '#8c8c8c',
      border: '#d9d9d9', up: '#cf1322', down: '#3f8600', flat: '#999999',
    },
    chart: {
      backgroundColor: '#ffffff', gridColor: '#f0f0f0', textColor: '#595959',
      tooltipBg: '#ffffff', tooltipBorder: '#d9d9d9',
      ma5: '#faad14', ma10: '#1890ff', ma20: '#722ed1',
      volume: '#1890ff', volumeUp: '#cf132260', volumeDown: '#3f860060',
    },
    borderRadius: 6,
    fontSize: { xs: '10px', sm: '12px', md: '14px', lg: '16px', xl: '20px' },
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  },
  {
    id: 'dark',
    name: '暗夜模式',
    description: '深色背景护眼主题',
    isDark: true,
    colors: {
      primary: '#177ddc', success: '#49aa19', warning: '#d89614',
      error: '#a61d24', info: '#177ddc', background: '#141414',
      surface: '#1f1f1f', text: '#ffffffd9', textSecondary: '#ffffff73',
      border: '#434343', up: '#cf1322', down: '#3f8600', flat: '#595959',
    },
    chart: {
      backgroundColor: '#1f1f1f', gridColor: '#303030', textColor: '#ffffffb3',
      tooltipBg: '#2a2a2a', tooltipBorder: '#434343',
      ma5: '#d89614', ma10: '#177ddc', ma20: '#8b4fbc',
      volume: '#177ddc', volumeUp: '#cf132260', volumeDown: '#3f860060',
    },
    borderRadius: 6,
    fontSize: { xs: '10px', sm: '12px', md: '14px', lg: '16px', xl: '20px' },
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  },
  {
    id: 'trading',
    name: '交易终端',
    description: '专业交易风格，高对比度',
    isDark: true,
    colors: {
      primary: '#00bcd4', success: '#00e676', warning: '#ffab00',
      error: '#ff1744', info: '#00bcd4', background: '#0a0e14',
      surface: '#111820', text: '#e0e0e0', textSecondary: '#78909c',
      border: '#263238', up: '#ff1744', down: '#00e676', flat: '#546e7a',
    },
    chart: {
      backgroundColor: '#111820', gridColor: '#1e2730', textColor: '#90a4ae',
      tooltipBg: '#1a2332', tooltipBorder: '#263238',
      ma5: '#ffab00', ma10: '#00bcd4', ma20: '#ab47bc',
      volume: '#00bcd4', volumeUp: '#ff174460', volumeDown: '#00e67660',
    },
    borderRadius: 2,
    fontSize: { xs: '10px', sm: '11px', md: '13px', lg: '15px', xl: '18px' },
    spacing: { xs: '2px', sm: '6px', md: '12px', lg: '20px', xl: '28px' },
  },
  {
    id: 'nature',
    name: '自然绿',
    description: '清新自然的绿色主题',
    isDark: false,
    colors: {
      primary: '#52c41a', success: '#73d13d', warning: '#fadb14',
      error: '#ff4d4f', info: '#1890ff', background: '#f6ffed',
      surface: '#ffffff', text: '#135200', textSecondary: '#73d13d',
      border: '#b7eb8f', up: '#cf1322', down: '#3f8600', flat: '#8c8c8c',
    },
    chart: {
      backgroundColor: '#ffffff', gridColor: '#f0ffe0', textColor: '#135200',
      tooltipBg: '#ffffff', tooltipBorder: '#b7eb8f',
      ma5: '#fadb14', ma10: '#52c41a', ma20: '#1890ff',
      volume: '#52c41a', volumeUp: '#cf132260', volumeDown: '#3f860060',
    },
    borderRadius: 8,
    fontSize: { xs: '10px', sm: '12px', md: '14px', lg: '16px', xl: '20px' },
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  },
  {
    id: 'warm',
    name: '暖色调',
    description: '温馨舒适的暖色主题',
    isDark: false,
    colors: {
      primary: '#fa8c16', success: '#52c41a', warning: '#faad14',
      error: '#f5222d', info: '#1890ff', background: '#fff7e6',
      surface: '#ffffff', text: '#5c3400', textSecondary: '#8c6d3f',
      border: '#ffd591', up: '#cf1322', down: '#3f8600', flat: '#8c8c8c',
    },
    chart: {
      backgroundColor: '#ffffff', gridColor: '#fff1d0', textColor: '#5c3400',
      tooltipBg: '#ffffff', tooltipBorder: '#ffd591',
      ma5: '#faad14', ma10: '#fa8c16', ma20: '#eb2f96',
      volume: '#fa8c16', volumeUp: '#cf132260', volumeDown: '#3f860060',
    },
    borderRadius: 10,
    fontSize: { xs: '10px', sm: '12px', md: '14px', lg: '16px', xl: '20px' },
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  },
];

/**
 * 根据ID获取主题
 */
export function getThemeById(id: string): AppTheme {
  return PRESET_THEMES.find(t => t.id === id) || PRESET_THEMES[0];
}

/**
 * 合并自定义主题覆盖
 */
export function mergeTheme(base: AppTheme, overrides: Partial<AppTheme>): AppTheme {
  return {
    ...base,
    ...overrides,
    colors: { ...base.colors, ...(overrides.colors || {}) },
    chart: { ...base.chart, ...(overrides.chart || {}) },
    fontSize: { ...base.fontSize, ...(overrides.fontSize || {}) },
    spacing: { ...base.spacing, ...(overrides.spacing || {}) },
  };
}

/**
 * 生成CSS变量字符串
 */
export function themeToCssVars(theme: AppTheme): string {
  const vars: string[] = [];
  const { colors, chart, fontSize, spacing } = theme;

  Object.entries(colors).forEach(([key, val]) => {
    vars.push(`--color-${key}: ${val};`);
  });
  Object.entries(chart).forEach(([key, val]) => {
    vars.push(`--chart-${key}: ${val};`);
  });
  Object.entries(fontSize).forEach(([key, val]) => {
    vars.push(`--font-${key}: ${val};`);
  });
  Object.entries(spacing).forEach(([key, val]) => {
    vars.push(`--space-${key}: ${val};`);
  });
  vars.push(`--border-radius: ${theme.borderRadius}px;`);

  return `:root {\n  ${vars.join('\n  ')}\n}`;
}

/**
 * 验证主题配置
 */
export function validateTheme(theme: Partial<AppTheme>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!theme.id) errors.push('主题ID不能为空');
  if (!theme.name) errors.push('主题名称不能为空');
  if (!theme.colors?.primary) errors.push('必须指定主色调');

  if (theme.colors) {
    const hexRegex = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
    Object.entries(theme.colors).forEach(([key, val]) => {
      if (val && !hexRegex.test(val)) {
        errors.push(`颜色 ${key} 格式无效: ${val}`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 检测系统暗色模式偏好
 */
export function getSystemDarkPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * 自动选择主题
 */
export function autoSelectTheme(): AppTheme {
  return getSystemDarkPreference() ? getThemeById('dark') : getThemeById('light');
}
