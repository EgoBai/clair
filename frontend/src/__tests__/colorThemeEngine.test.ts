import { describe, it, expect } from 'vitest';

// ===== 颜色与主题引擎 =====
describe('Color & Theme Engine', () => {
  // Hex转RGB
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return match ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) } : null;
  };

  // RGB转Hex
  const rgbToHex = (r: number, g: number, b: number): string => {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return `#${[r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')}`;
  };

  // RGB转HSL
  const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
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
  };

  // 亮度调整
  const adjustBrightness = (hex: string, percent: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const adjust = (v: number) => Math.max(0, Math.min(255, v + Math.round(255 * percent / 100)));
    return rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
  };

  // 混合颜色
  const mixColors = (color1: string, color2: string, ratio: number = 0.5): string => {
    const c1 = hexToRgb(color1), c2 = hexToRgb(color2);
    if (!c1 || !c2) return color1;
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * ratio);
    return rgbToHex(lerp(c1.r, c2.r), lerp(c1.g, c2.g), lerp(c1.b, c2.b));
  };

  // 对比度计算
  const contrastRatio = (hex1: string, hex2: string): number => {
    const luminance = (hex: string) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return 0;
      const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    const l1 = luminance(hex1), l2 = luminance(hex2);
    const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  // 生成调色板
  const generatePalette = (baseHex: string, count: number = 5): string[] => {
    const hsl = rgbToHsl(...Object.values(hexToRgb(baseHex) || { r: 0, g: 0, b: 0 }));
    const palette: string[] = [];
    for (let i = 0; i < count; i++) {
      const lightness = 20 + (60 / (count - 1)) * i;
      palette.push(baseHex); // Simplified: return base color for each slot
    }
    return palette;
  };

  // 颜色透明度
  const withAlpha = (hex: string, alpha: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  };

  // 是否暗色
  const isDarkColor = (hex: string): boolean => {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 < 128;
  };

  // 互补色
  const complementary = (hex: string): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b);
  };

  describe('Hex转RGB', () => {
    it('标准hex', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('不带#号', () => {
      expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    });

    it('蓝色', () => {
      expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('白色', () => {
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('黑色', () => {
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('无效hex返回null', () => {
      expect(hexToRgb('xyz')).toBeNull();
    });

    it('空字符串返回null', () => {
      expect(hexToRgb('')).toBeNull();
    });

    it('灰色', () => {
      expect(hexToRgb('#808080')).toEqual({ r: 128, g: 128, b: 128 });
    });
  });

  describe('RGB转Hex', () => {
    it('红色', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    });

    it('绿色', () => {
      expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    });

    it('蓝色', () => {
      expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
    });

    it('白色', () => {
      expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
    });

    it('黑色', () => {
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
    });

    it('超过255被钳制', () => {
      expect(rgbToHex(300, -10, 128)).toBe('#ff0080');
    });

    it('小数四舍五入', () => {
      expect(rgbToHex(127.5, 127.4, 127.6)).toBe('#807f80');
    });
  });

  describe('RGB转HSL', () => {
    it('红色', () => {
      const hsl = rgbToHsl(255, 0, 0);
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it('白色', () => {
      const hsl = rgbToHsl(255, 255, 255);
      expect(hsl.l).toBe(100);
      expect(hsl.s).toBe(0);
    });

    it('黑色', () => {
      const hsl = rgbToHsl(0, 0, 0);
      expect(hsl.l).toBe(0);
    });

    it('灰色', () => {
      const hsl = rgbToHsl(128, 128, 128);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(50);
    });

    it('绿色', () => {
      const hsl = rgbToHsl(0, 255, 0);
      expect(hsl.h).toBe(120);
    });

    it('蓝色', () => {
      const hsl = rgbToHsl(0, 0, 255);
      expect(hsl.h).toBe(240);
    });
  });

  describe('亮度调整', () => {
    it('变亮', () => {
      const result = adjustBrightness('#000000', 50);
      expect(hexToRgb(result)!.r).toBeGreaterThan(0);
    });

    it('变暗', () => {
      const result = adjustBrightness('#ffffff', -50);
      expect(hexToRgb(result)!.r).toBeLessThan(255);
    });

    it('无效hex返回原值', () => {
      expect(adjustBrightness('invalid', 50)).toBe('invalid');
    });

    it('零调整不变', () => {
      expect(adjustBrightness('#808080', 0)).toBe('#808080');
    });

    it('上限钳制', () => {
      const result = adjustBrightness('#ff0000', 100);
      expect(result).toBe('#ffffff');
    });

    it('下限钳制', () => {
      const result = adjustBrightness('#000000', -100);
      expect(result).toBe('#000000');
    });
  });

  describe('颜色混合', () => {
    it('50%混合', () => {
      const result = mixColors('#000000', '#ffffff', 0.5);
      expect(hexToRgb(result)!.r).toBe(128);
    });

    it('偏向第一色', () => {
      const result = mixColors('#ff0000', '#0000ff', 0.25);
      expect(hexToRgb(result)!.r).toBeGreaterThan(hexToRgb(result)!.b);
    });

    it('偏向第二色', () => {
      const result = mixColors('#ff0000', '#0000ff', 0.75);
      expect(hexToRgb(result)!.b).toBeGreaterThan(hexToRgb(result)!.r);
    });

    it('ratio=0返回第一色', () => {
      expect(mixColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    });

    it('ratio=1返回第二色', () => {
      expect(mixColors('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    });
  });

  describe('对比度计算', () => {
    it('黑白对比度最高', () => {
      expect(contrastRatio('#000000', '#ffffff')).toBeGreaterThan(20);
    });

    it('相同颜色对比度为1', () => {
      expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1);
    });

    it('对比度对称', () => {
      expect(contrastRatio('#ff0000', '#00ff00')).toBeCloseTo(contrastRatio('#00ff00', '#ff0000'));
    });
  });

  describe('颜色透明度', () => {
    it('rgba格式', () => {
      expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('完全不透明', () => {
      expect(withAlpha('#00ff00', 1)).toBe('rgba(0, 255, 0, 1)');
    });

    it('完全透明', () => {
      expect(withAlpha('#0000ff', 0)).toBe('rgba(0, 0, 255, 0)');
    });

    it('无效hex返回原值', () => {
      expect(withAlpha('bad', 0.5)).toBe('bad');
    });
  });

  describe('暗色判断', () => {
    it('黑色是暗色', () => {
      expect(isDarkColor('#000000')).toBe(true);
    });

    it('白色不是暗色', () => {
      expect(isDarkColor('#ffffff')).toBe(false);
    });

    it('深蓝是暗色', () => {
      expect(isDarkColor('#000080')).toBe(true);
    });

    it('浅黄不是暗色', () => {
      expect(isDarkColor('#ffff00')).toBe(false);
    });
  });

  describe('互补色', () => {
    it('红的互补是青', () => {
      expect(complementary('#ff0000')).toBe('#00ffff');
    });

    it('两次互补回原色', () => {
      expect(complementary(complementary('#123456'))).toBe('#123456');
    });

    it('白色互补是黑色', () => {
      expect(complementary('#ffffff')).toBe('#000000');
    });
  });
});
