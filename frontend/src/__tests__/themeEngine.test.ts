import { describe, it, expect, vi } from 'vitest';
import { ThemeManager } from '../utils/themeEngine';

describe('ThemeManager', () => {
  it('should have light and dark themes by default', () => {
    const mgr = new ThemeManager();
    const state = mgr.getState();
    expect(state.availableThemes).toContain('light');
    expect(state.availableThemes).toContain('dark');
  });

  it('should start with light theme', () => {
    const mgr = new ThemeManager();
    expect(mgr.getCurrentThemeId()).toBe('light');
  });

  it('should switch to dark theme', () => {
    const mgr = new ThemeManager();
    expect(mgr.setTheme('dark')).toBe(true);
    expect(mgr.getCurrentThemeId()).toBe('dark');
  });

  it('should reject unknown theme', () => {
    const mgr = new ThemeManager();
    expect(mgr.setTheme('nonexistent')).toBe(false);
    expect(mgr.getCurrentThemeId()).toBe('light');
  });

  it('should detect dark theme', () => {
    const mgr = new ThemeManager();
    mgr.setTheme('dark');
    expect(mgr.isDark()).toBe(true);
  });

  it('should detect light theme', () => {
    const mgr = new ThemeManager();
    mgr.setTheme('light');
    expect(mgr.isDark()).toBe(false);
  });

  it('should generate CSS variables', () => {
    const mgr = new ThemeManager();
    const vars = mgr.generateCSSVars();
    expect(vars['--color-primary']).toBe('#3498db');
    expect(vars['--color-background']).toBe('#ffffff');
    expect(vars['--spacing-md']).toBe('16px');
    expect(vars['--radius-md']).toBe('8px');
    expect(vars['--font-size-md']).toBe('16px');
    expect(vars['--font-family']).toBeDefined();
  });

  it('should generate different vars for dark theme', () => {
    const mgr = new ThemeManager();
    mgr.setTheme('light');
    const lightBg = mgr.generateCSSVars()['--color-background'];
    mgr.setTheme('dark');
    const darkBg = mgr.generateCSSVars()['--color-background'];
    expect(lightBg).not.toBe(darkBg);
  });

  it('should register custom theme', () => {
    const mgr = new ThemeManager();
    mgr.registerTheme('custom', {
      name: '自定义',
      colors: {
        primary: '#ff0000', secondary: '#00ff00', success: '#0000ff',
        warning: '#ffff00', danger: '#ff00ff', info: '#00ffff',
        background: '#000000', surface: '#111111', text: '#ffffff',
        textSecondary: '#cccccc', border: '#333333', shadow: 'rgba(0,0,0,0.5)',
      },
      spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
      borderRadius: { sm: '4px', md: '8px', lg: '12px', full: '9999px' },
      fontSize: { xs: '12px', sm: '14px', md: '16px', lg: '20px', xl: '24px', '2xl': '32px' },
      fontFamily: 'monospace',
    });
    expect(mgr.setTheme('custom')).toBe(true);
    expect(mgr.generateCSSVars()['--color-primary']).toBe('#ff0000');
  });

  it('should notify on theme change', () => {
    const mgr = new ThemeManager();
    const cb = vi.fn();
    mgr.onChange(cb);
    mgr.setTheme('dark');
    expect(cb).toHaveBeenCalledWith('dark');
  });

  it('should unsubscribe from change listener', () => {
    const mgr = new ThemeManager();
    const cb = vi.fn();
    const unsub = mgr.onChange(cb);
    unsub();
    mgr.setTheme('dark');
    expect(cb).not.toHaveBeenCalled();
  });

  it('should create custom theme from base', () => {
    const mgr = new ThemeManager();
    mgr.createCustomTheme('dark', 'midnight', {
      name: '午夜蓝',
    });
    mgr.setTheme('midnight');
    expect(mgr.getCurrentTheme()?.name).toBe('午夜蓝');
    expect(mgr.getCurrentTheme()?.colors.background).toBe('#1a1a2e');
  });

  it('should fail creating from nonexistent base', () => {
    const mgr = new ThemeManager();
    expect(mgr.createCustomTheme('nonexistent', 'x', {})).toBe(false);
  });

  it('should export CSS string', () => {
    const mgr = new ThemeManager();
    const css = mgr.exportCSS();
    expect(css).toContain(':root');
    expect(css).toContain('--color-primary');
    expect(css).toContain('#3498db');
  });

  it('should return CSS vars as object', () => {
    const mgr = new ThemeManager();
    mgr.generateCSSVars();
    const vars = mgr.getCSSVars();
    expect(vars['--color-primary']).toBe('#3498db');
  });

  it('should detect system theme returns light on server', () => {
    const mgr = new ThemeManager();
    expect(mgr.detectSystemTheme()).toBe('light');
  });

  it('should return current theme config', () => {
    const mgr = new ThemeManager();
    const theme = mgr.getCurrentTheme();
    expect(theme).toBeDefined();
    expect(theme!.name).toBe('浅色主题');
  });

  it('should return undefined for non-existent theme after setting it', () => {
    const mgr = new ThemeManager();
    // Manually set an invalid theme id
    (mgr as any).currentTheme = 'nonexistent';
    expect(mgr.getCurrentTheme()).toBeUndefined();
  });
});
