/**
 * 主题系统引擎
 * Theme System Engine
 *
 * 动态主题切换、自定义主题、CSS变量注入
 */

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  shadow: string;
}

export interface ThemeConfig {
  name: string;
  colors: ThemeColors;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  fontSize: Record<string, string>;
  fontFamily: string;
}

export interface ThemeState {
  currentTheme: string;
  availableThemes: string[];
  isDark: boolean;
}

const DEFAULT_LIGHT: ThemeColors = {
  primary: '#3498db',
  secondary: '#95a5a6',
  success: '#2ecc71',
  warning: '#f39c12',
  danger: '#e74c3c',
  info: '#17a2b8',
  background: '#ffffff',
  surface: '#f8f9fa',
  text: '#212529',
  textSecondary: '#6c757d',
  border: '#dee2e6',
  shadow: 'rgba(0,0,0,0.1)',
};

const DEFAULT_DARK: ThemeColors = {
  primary: '#3498db',
  secondary: '#95a5a6',
  success: '#2ecc71',
  warning: '#f39c12',
  danger: '#e74c3c',
  info: '#17a2b8',
  background: '#1a1a2e',
  surface: '#16213e',
  text: '#e4e4e4',
  textSecondary: '#a0a0a0',
  border: '#2d2d44',
  shadow: 'rgba(0,0,0,0.3)',
};

const DEFAULT_SPACING = {
  xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px',
};

const DEFAULT_BORDER_RADIUS = {
  sm: '4px', md: '8px', lg: '12px', full: '9999px',
};

const DEFAULT_FONT_SIZE = {
  xs: '12px', sm: '14px', md: '16px', lg: '20px', xl: '24px', '2xl': '32px',
};

/**
 * 主题管理器
 */
export class ThemeManager {
  private themes: Map<string, ThemeConfig> = new Map();
  private currentTheme: string = 'light';
  private onChangeCallbacks: Array<(theme: string) => void> = [];
  private cssRoot: Record<string, string> = {};

  constructor() {
    this.registerTheme('light', {
      name: '浅色主题',
      colors: DEFAULT_LIGHT,
      spacing: DEFAULT_SPACING,
      borderRadius: DEFAULT_BORDER_RADIUS,
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });

    this.registerTheme('dark', {
      name: '深色主题',
      colors: DEFAULT_DARK,
      spacing: DEFAULT_SPACING,
      borderRadius: DEFAULT_BORDER_RADIUS,
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });
  }

  /**
   * 注册主题
   */
  registerTheme(id: string, config: ThemeConfig): void {
    this.themes.set(id, config);
  }

  /**
   * 切换主题
   */
  setTheme(id: string): boolean {
    if (!this.themes.has(id)) return false;
    this.currentTheme = id;
    this.generateCSSVars();
    this.onChangeCallbacks.forEach(cb => cb(id));
    return true;
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): ThemeConfig | undefined {
    return this.themes.get(this.currentTheme);
  }

  /**
   * 获取当前主题ID
   */
  getCurrentThemeId(): string {
    return this.currentTheme;
  }

  /**
   * 是否为暗色主题
   */
  isDark(): boolean {
    const theme = this.getCurrentTheme();
    if (!theme) return false;
    const bg = theme.colors.background;
    // 简单亮度检测
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  /**
   * 获取主题状态
   */
  getState(): ThemeState {
    return {
      currentTheme: this.currentTheme,
      availableThemes: Array.from(this.themes.keys()),
      isDark: this.isDark(),
    };
  }

  /**
   * 监听主题变化
   */
  onChange(callback: (theme: string) => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      const idx = this.onChangeCallbacks.indexOf(callback);
      if (idx >= 0) this.onChangeCallbacks.splice(idx, 1);
    };
  }

  /**
   * 生成CSS变量
   */
  generateCSSVars(): Record<string, string> {
    const theme = this.getCurrentTheme();
    if (!theme) return {};

    const vars: Record<string, string> = {};

    // 颜色变量
    for (const [key, value] of Object.entries(theme.colors)) {
      vars[`--color-${key}`] = value;
    }

    // 间距变量
    for (const [key, value] of Object.entries(theme.spacing)) {
      vars[`--spacing-${key}`] = value;
    }

    // 圆角变量
    for (const [key, value] of Object.entries(theme.borderRadius)) {
      vars[`--radius-${key}`] = value;
    }

    // 字号变量
    for (const [key, value] of Object.entries(theme.fontSize)) {
      vars[`--font-size-${key}`] = value;
    }

    vars['--font-family'] = theme.fontFamily;

    this.cssRoot = vars;
    return vars;
  }

  /**
   * 获取CSS变量（用于SSR）
   */
  getCSSVars(): Record<string, string> {
    return { ...this.cssRoot };
  }

  /**
   * 导出主题为CSS字符串
   */
  exportCSS(): string {
    const vars = this.generateCSSVars();
    const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
    return `:root {\n${lines.join('\n')}\n}`;
  }

  /**
   * 创建自定义主题（基于现有主题修改）
   */
  createCustomTheme(baseThemeId: string, id: string, overrides: Partial<ThemeConfig>): boolean {
    const base = this.themes.get(baseThemeId);
    if (!base) return false;
    this.registerTheme(id, { ...base, ...overrides });
    return true;
  }

  /**
   * 自动检测系统主题偏好
   */
  detectSystemTheme(): 'light' | 'dark' {
    // 在Node环境中默认返回light
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
