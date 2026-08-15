import { describe, it, expect, beforeEach } from 'vitest';
import {
  AdaptiveChartThemeEngine,
  type ThemeContext,
  type AccessibilityOptions,
  type MarketCondition,
  type ThemePalette,
} from '../utils/adaptiveChartTheme';

/**
 * Round 201 — Adaptive Chart Theme Engine
 * Dynamically generates chart themes based on market conditions,
 * time of day, user preferences, and accessibility needs.
 * (Rewritten to import the real module instead of an inline re-implementation.)
 */

const defaultContext: ThemeContext = {
  timeOfDay: 'day',
  marketCondition: { trend: 'neutral', volatility: 'medium', sentiment: 0 },
  accessibility: { highContrast: false, colorBlindMode: 'none', reducedMotion: false, fontSize: 'medium' },
  userPreference: 'auto',
};

describe('Round 201: Adaptive Chart Theme Engine', () => {
  let engine: AdaptiveChartThemeEngine;

  beforeEach(() => {
    engine = new AdaptiveChartThemeEngine();
  });

  describe('Base Themes', () => {
    it('has light, dark, midnight themes', () => {
      expect(engine.getAvailableThemes()).toEqual(expect.arrayContaining(['light', 'dark', 'midnight']));
    });

    it('returns a valid theme palette', () => {
      const theme = engine.getBaseTheme('light')!;
      expect(theme.primary).toMatch(/^#/);
      expect(theme.bullish).toBeTruthy();
      expect(theme.bearish).toBeTruthy();
      expect(theme.background).toBeTruthy();
    });
  });

  describe('Theme Generation', () => {
    it('generates light theme for day', () => {
      const theme = engine.generateTheme({ ...defaultContext, timeOfDay: 'day', userPreference: 'auto' });
      expect(theme.background).toBe('#ffffff');
    });

    it('generates dark theme for night', () => {
      const theme = engine.generateTheme({ ...defaultContext, timeOfDay: 'night', userPreference: 'auto' });
      expect(theme.background).toBe('#121212');
    });

    it('generates midnight for evening', () => {
      const theme = engine.generateTheme({ ...defaultContext, timeOfDay: 'evening', userPreference: 'auto' });
      expect(theme.background).toBe('#0a0e27');
    });

    it('respects user preference over auto', () => {
      const theme = engine.generateTheme({ ...defaultContext, timeOfDay: 'day', userPreference: 'dark' });
      expect(theme.background).toBe('#121212');
    });
  });

  describe('Market Condition Adaptation', () => {
    it('adjusts highlight for bullish sentiment', () => {
      const ctx: ThemeContext = {
        ...defaultContext,
        marketCondition: { trend: 'bullish' as const, volatility: 'medium' as const, sentiment: 0.6 },
      };
      const theme = engine.generateTheme(ctx);
      expect(theme.highlight).toBe('#c8e6c9');
    });

    it('adjusts highlight for bearish sentiment', () => {
      const ctx: ThemeContext = {
        ...defaultContext,
        marketCondition: { trend: 'bearish' as const, volatility: 'medium' as const, sentiment: -0.6 },
      };
      const theme = engine.generateTheme(ctx);
      expect(theme.highlight).toBe('#ffcdd2');
    });

    it('adjusts grid for high volatility', () => {
      const ctx: ThemeContext = {
        ...defaultContext,
        marketCondition: { trend: 'neutral' as const, volatility: 'high' as const, sentiment: 0 },
      };
      const theme = engine.generateTheme(ctx);
      expect(theme.grid).toContain('rgba');
    });
  });

  describe('Accessibility', () => {
    it('enforces high contrast', () => {
      const ctx: ThemeContext = {
        ...defaultContext,
        accessibility: { highContrast: true, colorBlindMode: 'none' as const, reducedMotion: false, fontSize: 'medium' as const },
      };
      const theme = engine.generateTheme(ctx);
      expect(theme.text).toBe('#000000');
      expect(theme.background).toBe('#ffffff');
    });

    it('adapts for protanopia', () => {
      const ctx: ThemeContext = {
        ...defaultContext,
        accessibility: { highContrast: false, colorBlindMode: 'protanopia' as const, reducedMotion: false, fontSize: 'medium' as const },
      };
      const theme = engine.generateTheme(ctx);
      expect(theme.bullish).toBe('#0072b2');
      expect(theme.bearish).toBe('#d55e00');
    });

    it('adapts for deuteranopia', () => {
      const ctx: ThemeContext = {
        ...defaultContext,
        accessibility: { highContrast: false, colorBlindMode: 'deuteranopia' as const, reducedMotion: false, fontSize: 'medium' as const },
      };
      const theme = engine.generateTheme(ctx);
      expect(theme.bullish).toBe('#0072b2');
    });

    it('adapts for tritanopia', () => {
      const ctx: ThemeContext = {
        ...defaultContext,
        accessibility: { highContrast: false, colorBlindMode: 'tritanopia' as const, reducedMotion: false, fontSize: 'medium' as const },
      };
      const theme = engine.generateTheme(ctx);
      expect(theme.bullish).toBe('#009e73');
    });
  });

  describe('CSS Export', () => {
    it('exports CSS custom properties', () => {
      const theme = engine.getBaseTheme('light')!;
      const css = engine.exportThemeCSS(theme, 'chart');
      expect(css).toContain('--chart-primary:');
      expect(css).toContain('--chart-bullish:');
      expect(css).toContain('--chart-bearish:');
    });
  });

  describe('Contrast Ratio', () => {
    it('calculates white/black contrast', () => {
      const ratio = engine.contrastRatio('#000000', '#ffffff');
      expect(ratio).toBeGreaterThan(20); // 21:1
    });

    it('calculates same color contrast as 1', () => {
      const ratio = engine.contrastRatio('#1976d2', '#1976d2');
      expect(ratio).toBeCloseTo(1, 0);
    });
  });

  describe('Custom Themes', () => {
    it('registers and retrieves custom theme', () => {
      const custom = engine.getBaseTheme('light')!;
      engine.registerTheme('corporate', { ...custom, primary: '#3f51b5' });
      expect(engine.getAvailableThemes()).toContain('corporate');
      expect(engine.getBaseTheme('corporate')!.primary).toBe('#3f51b5');
    });
  });
});
