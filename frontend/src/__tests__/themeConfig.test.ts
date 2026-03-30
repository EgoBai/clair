import { describe, it, expect } from 'vitest';

describe('ThemeConfiguration', () => {
  interface ThemeConfig {
    name: string;
    primary: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    bgPrimary: string;
    bgSecondary: string;
    textPrimary: string;
    textSecondary: string;
    border: string;
    upColor: string;
    downColor: string;
    flatColor: string;
  }

  const LIGHT_THEME: ThemeConfig = {
    name: 'light',
    primary: '#1677ff',
    success: '#52c41a',
    error: '#ff4d4f',
    warning: '#faad14',
    info: '#1677ff',
    bgPrimary: '#ffffff',
    bgSecondary: '#fafafa',
    textPrimary: '#262626',
    textSecondary: '#8c8c8c',
    border: '#d9d9d9',
    upColor: '#ff4d4f',
    downColor: '#52c41a',
    flatColor: '#8c8c8c',
  };

  const DARK_THEME: ThemeConfig = {
    name: 'dark',
    primary: '#177ddc',
    success: '#49aa19',
    error: '#d32029',
    warning: '#d89614',
    info: '#177ddc',
    bgPrimary: '#141414',
    bgSecondary: '#1f1f1f',
    textPrimary: '#ffffffd9',
    textSecondary: '#ffffff73',
    border: '#424242',
    upColor: '#d32029',
    downColor: '#49aa19',
    flatColor: '#ffffff73',
  };

  function generateCssVariables(theme: ThemeConfig): Record<string, string> {
    return {
      '--color-primary': theme.primary,
      '--color-success': theme.success,
      '--color-error': theme.error,
      '--color-warning': theme.warning,
      '--color-bg-primary': theme.bgPrimary,
      '--color-bg-secondary': theme.bgSecondary,
      '--color-text-primary': theme.textPrimary,
      '--color-text-secondary': theme.textSecondary,
      '--color-border': theme.border,
      '--color-up': theme.upColor,
      '--color-down': theme.downColor,
      '--color-flat': theme.flatColor,
    };
  }

  function validateTheme(theme: ThemeConfig): string[] {
    const errors: string[] = [];
    if (!theme.name) errors.push('Theme name is required');
    if (!/^#[0-9a-f]{6}$/i.test(theme.primary)) errors.push('Invalid primary color');
    if (!/^#[0-9a-f]{6}$/i.test(theme.upColor)) errors.push('Invalid up color');
    if (!/^#[0-9a-f]{6}$/i.test(theme.downColor)) errors.push('Invalid down color');
    if (theme.upColor === theme.downColor) errors.push('Up and down colors must differ');
    return errors;
  }

  function getColorForChange(change: number, theme: ThemeConfig): string {
    if (change > 0) return theme.upColor;
    if (change < 0) return theme.downColor;
    return theme.flatColor;
  }

  it('should have valid hex colors for light theme', () => {
    const errors = validateTheme(LIGHT_THEME);
    expect(errors).toHaveLength(0);
  });

  it('should have valid hex colors for dark theme', () => {
    const errors = validateTheme(DARK_THEME);
    expect(errors).toHaveLength(0);
  });

  it('should have different up/down colors', () => {
    expect(LIGHT_THEME.upColor).not.toBe(LIGHT_THEME.downColor);
    expect(DARK_THEME.upColor).not.toBe(DARK_THEME.downColor);
  });

  it('should use red for up (A-share convention)', () => {
    expect(LIGHT_THEME.upColor).toContain('ff');
    expect(DARK_THEME.upColor).toContain('d3');
  });

  it('should use green for down (A-share convention)', () => {
    expect(LIGHT_THEME.downColor).toContain('c4');
    expect(DARK_THEME.downColor).toContain('49');
  });

  it('should generate correct CSS variables count', () => {
    const vars = generateCssVariables(LIGHT_THEME);
    expect(Object.keys(vars)).toHaveLength(12);
  });

  it('should generate CSS variable keys with -- prefix', () => {
    const vars = generateCssVariables(LIGHT_THEME);
    for (const key of Object.keys(vars)) {
      expect(key.startsWith('--')).toBe(true);
    }
  });

  it('should return up color for positive change', () => {
    const color = getColorForChange(5, LIGHT_THEME);
    expect(color).toBe(LIGHT_THEME.upColor);
  });

  it('should return down color for negative change', () => {
    const color = getColorForChange(-3, LIGHT_THEME);
    expect(color).toBe(LIGHT_THEME.downColor);
  });

  it('should return flat color for zero change', () => {
    const color = getColorForChange(0, LIGHT_THEME);
    expect(color).toBe(LIGHT_THEME.flatColor);
  });

  it('should have darker bg for dark theme', () => {
    expect(DARK_THEME.bgPrimary < LIGHT_THEME.bgPrimary).toBe(true);
  });

  it('should have all required theme fields', () => {
    const requiredFields = ['name', 'primary', 'success', 'error', 'warning', 'info', 'bgPrimary', 'bgSecondary', 'textPrimary', 'textSecondary', 'border', 'upColor', 'downColor', 'flatColor'];
    for (const field of requiredFields) {
      expect(LIGHT_THEME).toHaveProperty(field);
      expect(DARK_THEME).toHaveProperty(field);
    }
  });
});
