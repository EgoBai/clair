import { describe, it, expect } from 'vitest';

// Color & Contrast Utilities
interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

function hexToRgb(hex: string): RGB | null {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function getLuminance(rgb: RGB): number {
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(c1: RGB, c2: RGB): number {
  const l1 = getLuminance(c1);
  const l2 = getLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function meetsWCAG_AA(fg: RGB, bg: RGB, isLargeText = false): boolean {
  const ratio = getContrastRatio(fg, bg);
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

function meetsWCAG_AAA(fg: RGB, bg: RGB, isLargeText = false): boolean {
  const ratio = getContrastRatio(fg, bg);
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

function adjustBrightness(rgb: RGB, percent: number): RGB {
  return {
    r: Math.max(0, Math.min(255, rgb.r + Math.round(rgb.r * percent / 100))),
    g: Math.max(0, Math.min(255, rgb.g + Math.round(rgb.g * percent / 100))),
    b: Math.max(0, Math.min(255, rgb.b + Math.round(rgb.b * percent / 100))),
  };
}

function blendColors(c1: RGB, c2: RGB, ratio: number): RGB {
  return {
    r: Math.round(c1.r * (1 - ratio) + c2.r * ratio),
    g: Math.round(c1.g * (1 - ratio) + c2.g * ratio),
    b: Math.round(c1.b * (1 - ratio) + c2.b * ratio),
  };
}

function isDarkColor(rgb: RGB): boolean {
  return getLuminance(rgb) < 0.5;
}

function getTextColor(bg: RGB): RGB {
  return isDarkColor(bg) ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
}

describe('Color Utilities', () => {
  describe('hexToRgb', () => {
    it('should convert hex to rgb', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('should handle hex without hash', () => {
      expect(hexToRgb('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should return null for invalid hex', () => {
      expect(hexToRgb('xyz')).toBeNull();
      expect(hexToRgb('')).toBeNull();
      expect(hexToRgb('#gg0000')).toBeNull();
    });

    it('should convert black', () => {
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });
  });

  describe('rgbToHex', () => {
    it('should convert rgb to hex', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
      expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe('#00ff00');
    });

    it('should clamp values', () => {
      expect(rgbToHex({ r: 300, g: -10, b: 128 })).toBe('#ff0080');
    });
  });

  describe('rgbToHsl', () => {
    it('should convert red', () => {
      const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it('should convert white', () => {
      const hsl = rgbToHsl({ r: 255, g: 255, b: 255 });
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(100);
    });

    it('should convert black', () => {
      const hsl = rgbToHsl({ r: 0, g: 0, b: 0 });
      expect(hsl.l).toBe(0);
    });
  });

  describe('getLuminance', () => {
    it('should return 1 for white', () => {
      expect(getLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 1);
    });

    it('should return 0 for black', () => {
      expect(getLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 1);
    });

    it('should be between 0 and 1', () => {
      const lum = getLuminance({ r: 128, g: 128, b: 128 });
      expect(lum).toBeGreaterThan(0);
      expect(lum).toBeLessThan(1);
    });
  });

  describe('getContrastRatio', () => {
    it('should return 21 for black and white', () => {
      expect(getContrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
    });

    it('should return 1 for same color', () => {
      expect(getContrastRatio({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 })).toBeCloseTo(1, 0);
    });

    it('should be symmetric', () => {
      const c1 = { r: 100, g: 150, b: 200 };
      const c2 = { r: 200, g: 100, b: 50 };
      expect(getContrastRatio(c1, c2)).toBeCloseTo(getContrastRatio(c2, c1), 5);
    });
  });

  describe('WCAG compliance', () => {
    it('black on white should meet AA for normal text', () => {
      expect(meetsWCAG_AA({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBe(true);
    });

    it('should have lower threshold for large text', () => {
      const fg = { r: 100, g: 100, b: 100 };
      const bg = { r: 200, g: 200, b: 200 };
      expect(meetsWCAG_AA(fg, bg, true)).toBe(true);
    });

    it('should have stricter AAA requirements', () => {
      const fg = { r: 150, g: 150, b: 150 };
      const bg = { r: 200, g: 200, b: 200 };
      expect(meetsWCAG_AAA(fg, bg)).toBe(false);
    });
  });

  describe('adjustBrightness', () => {
    it('should brighten color', () => {
      const result = adjustBrightness({ r: 100, g: 100, b: 100 }, 50);
      expect(result.r).toBeGreaterThan(100);
    });

    it('should darken color', () => {
      const result = adjustBrightness({ r: 200, g: 200, b: 200 }, -50);
      expect(result.r).toBeLessThan(200);
    });

    it('should not exceed 255', () => {
      const result = adjustBrightness({ r: 200, g: 200, b: 200 }, 100);
      expect(result.r).toBe(255);
    });

    it('should not go below 0', () => {
      const result = adjustBrightness({ r: 50, g: 50, b: 50 }, -100);
      expect(result.r).toBe(0);
    });
  });

  describe('blendColors', () => {
    it('should blend 50/50', () => {
      const result = blendColors({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5);
      expect(result.r).toBeCloseTo(128, 0);
    });

    it('should return first color at ratio 0', () => {
      const result = blendColors({ r: 100, g: 100, b: 100 }, { r: 200, g: 200, b: 200 }, 0);
      expect(result.r).toBe(100);
    });

    it('should return second color at ratio 1', () => {
      const result = blendColors({ r: 100, g: 100, b: 100 }, { r: 200, g: 200, b: 200 }, 1);
      expect(result.r).toBe(200);
    });
  });

  describe('isDarkColor', () => {
    it('should identify dark colors', () => {
      expect(isDarkColor({ r: 0, g: 0, b: 0 })).toBe(true);
      expect(isDarkColor({ r: 50, g: 50, b: 50 })).toBe(true);
    });

    it('should identify light colors', () => {
      expect(isDarkColor({ r: 255, g: 255, b: 255 })).toBe(false);
      expect(isDarkColor({ r: 200, g: 200, b: 200 })).toBe(false);
    });
  });

  describe('getTextColor', () => {
    it('should return white text for dark backgrounds', () => {
      const text = getTextColor({ r: 0, g: 0, b: 0 });
      expect(text.r).toBe(255);
    });

    it('should return black text for light backgrounds', () => {
      const text = getTextColor({ r: 255, g: 255, b: 255 });
      expect(text.r).toBe(0);
    });
  });
});
