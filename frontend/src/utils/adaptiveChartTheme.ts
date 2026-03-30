/**
 * Adaptive Chart Theme Engine
 * Generates dynamic chart themes based on time, market conditions, accessibility.
 */

export interface ThemePalette {
  primary: string; secondary: string; background: string; surface: string;
  text: string; textSecondary: string; bullish: string; bearish: string;
  neutral: string; volume: string; grid: string; crosshair: string;
  annotation: string; highlight: string; border: string;
}

export interface AccessibilityOptions {
  highContrast: boolean;
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  reducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

export interface MarketCondition {
  trend: 'bullish' | 'bearish' | 'neutral';
  volatility: 'low' | 'medium' | 'high';
  sentiment: number;
}

export interface ThemeContext {
  timeOfDay: 'morning' | 'day' | 'evening' | 'night';
  marketCondition: MarketCondition;
  accessibility: AccessibilityOptions;
  userPreference: 'auto' | 'light' | 'dark';
}

export class AdaptiveChartThemeEngine {
  private baseThemes: Map<string, ThemePalette> = new Map();

  constructor() {
    this.baseThemes.set('light', {
      primary: '#1976d2', secondary: '#dc004e', background: '#ffffff', surface: '#f5f5f5',
      text: '#212121', textSecondary: '#757575', bullish: '#2e7d32', bearish: '#c62828',
      neutral: '#757575', volume: '#90a4ae', grid: '#e0e0e0', crosshair: '#616161',
      annotation: '#ff9800', highlight: '#fff59d', border: '#bdbdbd',
    });
    this.baseThemes.set('dark', {
      primary: '#90caf9', secondary: '#f48fb1', background: '#121212', surface: '#1e1e1e',
      text: '#e0e0e0', textSecondary: '#9e9e9e', bullish: '#66bb6a', bearish: '#ef5350',
      neutral: '#9e9e9e', volume: '#546e7a', grid: '#333333', crosshair: '#bdbdbd',
      annotation: '#ffa726', highlight: '#f9a825', border: '#424242',
    });
    this.baseThemes.set('midnight', {
      primary: '#7c4dff', secondary: '#ff4081', background: '#0a0e27', surface: '#141937',
      text: '#e8eaf6', textSecondary: '#9fa8da', bullish: '#00e676', bearish: '#ff1744',
      neutral: '#78909c', volume: '#37474f', grid: '#1a237e', crosshair: '#b388ff',
      annotation: '#ffab40', highlight: '#ffd740', border: '#283593',
    });
  }

  generateTheme(ctx: ThemeContext): ThemePalette {
    const baseName = ctx.userPreference === 'auto'
      ? (ctx.timeOfDay === 'night' ? 'dark' : ctx.timeOfDay === 'evening' ? 'midnight' : 'light')
      : ctx.userPreference;
    let theme = { ...(this.baseThemes.get(baseName) || this.baseThemes.get('light')!) };
    theme = this.applyMarketCondition(theme, ctx.marketCondition);
    theme = this.applyAccessibility(theme, ctx.accessibility);
    return theme;
  }

  private applyMarketCondition(t: ThemePalette, c: MarketCondition): ThemePalette {
    const r = { ...t };
    if (c.trend === 'bullish' && c.sentiment > 0.3) { r.highlight = '#c8e6c9'; r.annotation = '#4caf50'; }
    else if (c.trend === 'bearish' && c.sentiment < -0.3) { r.highlight = '#ffcdd2'; r.annotation = '#f44336'; }
    if (c.volatility === 'high') {
      const [rv, gv, bv] = [parseInt(r.grid.slice(1,3),16), parseInt(r.grid.slice(3,5),16), parseInt(r.grid.slice(5,7),16)];
      r.grid = `rgba(${rv},${gv},${bv},0.6)`;
    }
    return r;
  }

  private applyAccessibility(t: ThemePalette, o: AccessibilityOptions): ThemePalette {
    let r = { ...t };
    if (o.highContrast) r = { ...r, text: '#000000', textSecondary: '#333333', background: '#ffffff', surface: '#f0f0f0', bullish: '#006400', bearish: '#8b0000' };
    if (o.colorBlindMode === 'protanopia') r = { ...r, bullish: '#0072b2', bearish: '#d55e00' };
    else if (o.colorBlindMode === 'deuteranopia') r = { ...r, bullish: '#0072b2', bearish: '#cc79a7' };
    else if (o.colorBlindMode === 'tritanopia') r = { ...r, bullish: '#009e73', bearish: '#d55e00' };
    return r;
  }

  getAvailableThemes(): string[] { return Array.from(this.baseThemes.keys()); }
  registerTheme(name: string, p: ThemePalette): void { this.baseThemes.set(name, p); }
  getBaseTheme(name: string): ThemePalette | undefined { return this.baseThemes.get(name); }

  exportThemeCSS(theme: ThemePalette, prefix = 'ast'): string {
    return Object.entries(theme).map(([k, v]) => `--${prefix}-${k}: ${v};`).join('\n');
  }

  contrastRatio(hex1: string, hex2: string): number {
    const lum = (hex: string) => {
      const [r, g, b] = [parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255];
      const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const [l1, l2] = [lum(hex1), lum(hex2)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
}
